import { randomBytes, randomUUID } from 'node:crypto';
import {COLORS,DIRS,createSeed,generatePuzzle,replay,samePoint,type Move} from '../src/engine';
import {COUNTDOWN_MILLISECONDS,MATCH_MILLISECONDS,MAX_PLAYERS,type PublicPuzzle,type RoomSnapshot,type Seat,type SubmitResult,type Stage} from '../src/multiplayer';

const CHARACTERS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_EMPTY_TTL=15*60_000;
const DISCONNECTED_LOBBY_SEAT_TTL=90_000;

type Player={
  id:string;token:string;name:string;socketId:string|null;
  disconnectedAt:number|null;bestMoves:number|null;submittedAt:number|null;
};
type Room={
  code:string;stage:Stage;hostId:string;players:Player[];puzzle:PublicPuzzle|null;
  round:number;startsAt:number|null;endsAt:number|null;lastOccupiedAt:number;
};

export class RoomError extends Error {}

export function sanitizeName(name:unknown) {
  if(typeof name!=='string') throw new RoomError('닉네임을 입력해 줘.');
  const value=name.trim().replace(/\s+/g,' ');
  if(value.length<1||value.length>16) throw new RoomError('닉네임은 1~16자로 입력해 줘.');
  if(/[<>\u0000-\u001f\u007f]/.test(value)) throw new RoomError('닉네임에 사용할 수 없는 문자가 있어.');
  return value;
}

function roomCode(){
  const bytes=randomBytes(6);
  return [...bytes].map(byte=>CHARACTERS[byte%CHARACTERS.length]).join('');
}

/** Room state is memory-only: a deployment or sleeping server clears all rooms. */
export class RoomManager {
  constructor(private readonly nextSeed:()=>number=createSeed){}
  private rooms=new Map<string,Room>();
  private sockets=new Map<string,{code:string;playerId:string}>();

  snapshot(code:string,now=Date.now()):RoomSnapshot|null {
    const room=this.rooms.get(code);
    if(!room) return null;
    return {
      code:room.code,stage:room.stage,round:room.round,
      players:room.players.map(p=>({id:p.id,name:p.name,connected:p.socketId!==null,isHost:room.hostId===p.id,bestMoves:p.bestMoves,submittedAt:p.submittedAt})),
      puzzle:room.puzzle ? {robots:room.puzzle.robots,target:room.puzzle.target,goal:room.puzzle.goal}:null,
      startsAt:room.startsAt,endsAt:room.endsAt,serverTime:now,
    };
  }

  create(name:unknown,socketId:string,now=Date.now()):Seat {
    if(this.sockets.has(socketId)) throw new RoomError('먼저 현재 방에서 나가 줘.');
    const cleanName=sanitizeName(name);
    let code=roomCode();
    while(this.rooms.has(code)) code=roomCode();
    const player=this.newPlayer(cleanName,socketId);
    this.rooms.set(code,{code,stage:'lobby',hostId:player.id,players:[player],puzzle:null,round:0,startsAt:null,endsAt:null,lastOccupiedAt:now});
    this.sockets.set(socketId,{code,playerId:player.id});
    return {room:this.snapshot(code,now)!,playerId:player.id,token:player.token};
  }

  join(codeInput:unknown,name:unknown,socketId:string,token?:unknown,now=Date.now()):Seat & {replacedSocketId?:string} {
    if(this.sockets.has(socketId)) throw new RoomError('먼저 현재 방에서 나가 줘.');
    const code=typeof codeInput==='string'?codeInput.toUpperCase().trim():'';
    const room=this.rooms.get(code);
    if(!room) throw new RoomError('방을 찾지 못했어. 초대 코드와 서버 상태를 확인해 줘.');
    const cleanName=sanitizeName(name);
    let player=typeof token==='string'?room.players.find(p=>p.token===token):undefined;
    let replacedSocketId:string|undefined;
    if(player){
      replacedSocketId=player.socketId??undefined;
      if(replacedSocketId) this.sockets.delete(replacedSocketId);
      player.name=cleanName;
      player.socketId=socketId;
      player.disconnectedAt=null;
    }else {
      if(room.stage!=='lobby') throw new RoomError('이미 경기가 시작됐어. 다음 경기를 기다려 줘.');
      if(room.players.length>=MAX_PLAYERS) throw new RoomError('방이 가득 찼어. (최대 8명)');
      player=this.newPlayer(cleanName,socketId);
      room.players.push(player);
    }
    room.lastOccupiedAt=now;
    this.sockets.set(socketId,{code,playerId:player.id});
    this.ensureConnectedHost(room);
    return {room:this.snapshot(code,now)!,playerId:player.id,token:player.token,replacedSocketId};
  }

  leave(socketId:string,now=Date.now()):string|null {
    const seat=this.sockets.get(socketId);
    if(!seat) return null;
    this.sockets.delete(socketId);
    const room=this.rooms.get(seat.code);
    if(!room) return seat.code;
    room.players=room.players.filter(p=>p.id!==seat.playerId);
    if(!room.players.length) this.rooms.delete(seat.code);
    else {
      this.ensureConnectedHost(room);
      if(room.players.some(p=>p.socketId!==null)) room.lastOccupiedAt=now;
    }
    return seat.code;
  }

  disconnect(socketId:string,now=Date.now()):string|null {
    const seat=this.sockets.get(socketId);
    if(!seat) return null;
    this.sockets.delete(socketId);
    const room=this.rooms.get(seat.code);
    if(!room) return null;
    const player=room.players.find(p=>p.id===seat.playerId);
    if(player && player.socketId===socketId){player.socketId=null;player.disconnectedAt=now;}
    this.ensureConnectedHost(room);
    if(room.players.every(p=>p.socketId===null))room.lastOccupiedAt=now;
    return room.code;
  }

  start(socketId:string,now=Date.now()):string {
    const {room,player}=this.getSeat(socketId);
    if(room.hostId!==player.id) throw new RoomError('방장만 경기를 시작할 수 있어.');
    if(room.stage!=='lobby') throw new RoomError('이미 시작한 경기야.');
    if(room.players.filter(p=>p.socketId!==null).length<2) throw new RoomError('최소 2명이 모여야 시작할 수 있어.');
    // Offline lobby seats cannot compete in a round.
    room.players=room.players.filter(p=>p.socketId!==null);
    const puzzle=generatePuzzle(this.nextSeed());
    room.puzzle={robots:puzzle.robots,target:puzzle.target,goal:puzzle.goal};
    room.stage='playing';room.round+=1;
    room.startsAt=now+COUNTDOWN_MILLISECONDS;
    room.endsAt=room.startsAt+MATCH_MILLISECONDS;
    for(const p of room.players){p.bestMoves=null;p.submittedAt=null;}
    return room.code;
  }

  submit(socketId:string,moves:unknown,now=Date.now()):{code:string;result:SubmitResult} {
    const {room,player}=this.getSeat(socketId);
    if(room.stage!=='playing'||!room.puzzle||room.startsAt===null||room.endsAt===null) throw new RoomError('진행 중인 경기가 아니야.');
    if(now<room.startsAt) throw new RoomError('시작 카운트다운이 끝난 뒤 이동해 줘.');
    if(now>=room.endsAt) throw new RoomError('제한시간이 끝났어.');
    if(!Array.isArray(moves)||moves.length<1||moves.length>512 ||
       !moves.every(m=>m && typeof m==='object' && COLORS.includes(m.robot) && DIRS.includes(m.direction)))
      throw new RoomError('유효한 이동 기록이 아니야.');
    const end=replay(room.puzzle.robots,moves as Move[]);
    if(!end||!samePoint(end[room.puzzle.target],room.puzzle.goal)) throw new RoomError('이동 기록이 목표에 도달하지 않았어.');
    const improved=player.bestMoves===null||moves.length<player.bestMoves;
    if(improved){player.bestMoves=moves.length;player.submittedAt=now;}
    return {code:room.code,result:{bestMoves:player.bestMoves!,improved}};
  }

  rematch(socketId:string,now=Date.now()):string {
    const {room,player}=this.getSeat(socketId);
    if(room.hostId!==player.id)throw new RoomError('방장만 다음 경기를 준비할 수 있어.');
    if(room.stage!=='finished')throw new RoomError('현재 경기가 끝난 뒤 다시 시작할 수 있어.');
    room.players=room.players.filter(p=>p.socketId!==null);
    room.stage='lobby';room.puzzle=null;room.startsAt=null;room.endsAt=null;
    for(const p of room.players){p.bestMoves=null;p.submittedAt=null;}
    room.lastOccupiedAt=now;
    return room.code;
  }

  /** Caller broadcasts snapshots for returned room codes. */
  tick(now=Date.now()):string[] {
    const changed:string[]=[];
    for(const room of this.rooms.values()){
      if(room.stage==='playing'&&room.endsAt!==null&&now>=room.endsAt){room.stage='finished';changed.push(room.code);}
      if(room.stage==='lobby'){
        const count=room.players.length;
        room.players=room.players.filter(p=>p.socketId!==null||p.disconnectedAt===null||now-p.disconnectedAt<DISCONNECTED_LOBBY_SEAT_TTL);
        if(room.players.length!==count){this.ensureConnectedHost(room);changed.push(room.code);}
      }
      if(!room.players.some(p=>p.socketId!==null)&&now-room.lastOccupiedAt>=ROOM_EMPTY_TTL)this.rooms.delete(room.code);
    }
    return changed.filter(code=>this.rooms.has(code));
  }

  private newPlayer(name:string,socketId:string):Player {
    return {id:randomUUID(),token:randomBytes(24).toString('hex'),name,socketId,disconnectedAt:null,bestMoves:null,submittedAt:null};
  }
  private getSeat(socketId:string):{room:Room;player:Player} {
    const seat=this.sockets.get(socketId);
    const room=seat?this.rooms.get(seat.code):undefined;
    const player=room?.players.find(p=>p.id===seat!.playerId);
    if(!room||!player||player.socketId!==socketId)throw new RoomError('방에 다시 입장해 줘.');
    return {room,player};
  }
  private ensureConnectedHost(room:Room){
    const host=room.players.find(p=>p.id===room.hostId);
    if(host?.socketId)return;
    room.hostId=room.players.find(p=>p.socketId!==null)?.id??room.players[0]?.id??'';
  }
}
