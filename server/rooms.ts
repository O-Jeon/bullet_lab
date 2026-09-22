import {randomBytes,randomUUID} from 'node:crypto';
import {COLORS,DIRS,createSeed,replay,samePoint,type Move} from '../src/engine';
import {getCompetitivePuzzle,MAX_COMPETITIVE_MOVES} from '../src/catalog';
import {
  COUNTDOWN_MILLISECONDS,MATCH_MILLISECONDS,MAX_PLAYERS,
  type FinishReason,type MatchRule,type PublicPuzzle,type QueueStatus,type RandomSize,
  type RoomMode,type RoomSnapshot,type Seat,type Stage,type SubmitResult,
} from '../src/multiplayer';

const CHARACTERS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_EMPTY_TTL=15*60_000;
const DISCONNECTED_LOBBY_SEAT_TTL=90_000;

type Player={
  id:string;token:string;name:string;socketId:string|null;disconnectedAt:number|null;
  bestMoves:number|null;submittedAt:number|null;readyForRematch:boolean;
};
type Room={
  code:string;mode:RoomMode;rule:MatchRule;stage:Stage;hostId:string;players:Player[];puzzle:PublicPuzzle|null;
  round:number;startsAt:number|null;endsAt:number|null;winnerId:string|null;
  finishReason:FinishReason;lastOccupiedAt:number;
};
type QueueEntry={socketId:string;name:string};
export type QueueOutcome={status:'queued';queue:QueueStatus}|{
  status:'matched';size:RandomSize;rule:MatchRule;seats:Array<{socketId:string;seat:Seat}>;
};
export class RoomError extends Error{}

export function sanitizeName(name:unknown){
  if(typeof name!=='string')throw new RoomError('닉네임을 입력해 줘.');
  const value=name.trim().replace(/\s+/g,' ');
  if(value.length<1||value.length>16)throw new RoomError('닉네임은 1~16자로 입력해 줘.');
  if(/[<>\u0000-\u001f\u007f]/.test(value))throw new RoomError('닉네임에 사용할 수 없는 문자가 있어.');
  return value;
}
function roomCode(){
  return [...randomBytes(6)].map(byte=>CHARACTERS[byte%CHARACTERS.length]).join('');
}
function isRandomSize(size:unknown):size is RandomSize{return size===2||size===3||size===4;}
function isRule(rule:unknown):rule is MatchRule{return rule==='race'||rule==='fewest';}
const QUEUE_SIZES=[2,3,4] as const;
const RULES=['race','fewest'] as const;
const queueKey=(size:RandomSize,rule:MatchRule)=>`${size}:${rule}`;

/** In-memory rooms and queues. A server restart intentionally discards both. */
export class RoomManager{
  constructor(private readonly nextSeed:()=>number=createSeed){}
  private rooms=new Map<string,Room>();
  private sockets=new Map<string,{code:string;playerId:string}>();
  private waiting=new Map<string,QueueEntry[]>(QUEUE_SIZES.flatMap(size=>RULES.map(rule=>[queueKey(size,rule),[]] as [string,QueueEntry[]])));

  snapshot(code:string,now=Date.now()):RoomSnapshot|null{
    const room=this.rooms.get(code);
    if(!room)return null;
    return {
      code:room.code,mode:room.mode,rule:room.rule,stage:room.stage,round:room.round,
      players:room.players.map(p=>({id:p.id,name:p.name,connected:p.socketId!==null,
        isHost:room.hostId===p.id,bestMoves:p.bestMoves,submittedAt:p.submittedAt,
        readyForRematch:p.readyForRematch})),
      puzzle:room.puzzle?{robots:room.puzzle.robots,target:room.puzzle.target,goal:room.puzzle.goal}:null,
      startsAt:room.startsAt,endsAt:room.endsAt,winnerId:room.winnerId,
      finishReason:room.finishReason,serverTime:now,
    };
  }
  private ensureAvailable(socketId:string){
    if(this.sockets.has(socketId))throw new RoomError('먼저 현재 방에서 나가 줘.');
    if([...this.waiting.values()].some(queue=>queue.some(e=>e.socketId===socketId)))
      throw new RoomError('이미 랜덤 매칭을 기다리고 있어.');
  }
  private makeRoom(name:string,socketId:string,mode:RoomMode,now:number,rule:MatchRule):Seat{
    let code=roomCode();while(this.rooms.has(code))code=roomCode();
    const player=this.newPlayer(name,socketId);
    this.rooms.set(code,{code,mode,rule,stage:'lobby',hostId:player.id,players:[player],
      puzzle:null,round:0,startsAt:null,endsAt:null,winnerId:null,finishReason:null,lastOccupiedAt:now});
    this.sockets.set(socketId,{code,playerId:player.id});
    return {room:this.snapshot(code,now)!,playerId:player.id,token:player.token};
  }
  create(name:unknown,socketId:string,now=Date.now(),rule:MatchRule='race'):Seat{
    this.ensureAvailable(socketId);
    if(!isRule(rule))throw new RoomError('대전 방식을 선택해 줘.');
    return this.makeRoom(sanitizeName(name),socketId,'friends',now,rule);
  }
  join(codeInput:unknown,name:unknown,socketId:string,token?:unknown,now=Date.now()):Seat&{replacedSocketId?:string}{
    this.ensureAvailable(socketId);
    const code=typeof codeInput==='string'?codeInput.toUpperCase().trim():'';
    const room=this.rooms.get(code);
    if(!room)throw new RoomError('방을 찾지 못했어. 서버가 재시작됐을 수도 있어.');
    const cleanName=sanitizeName(name);
    let player=typeof token==='string'?room.players.find(p=>p.token===token):undefined;
    let replacedSocketId:string|undefined;
    if(player){
      replacedSocketId=player.socketId??undefined;
      if(replacedSocketId)this.sockets.delete(replacedSocketId);
      player.name=cleanName;player.socketId=socketId;player.disconnectedAt=null;
    }else{
      if(room.mode==='random')throw new RoomError('랜덤 매칭 방에는 초대 코드로 입장할 수 없어.');
      if(room.stage!=='lobby')throw new RoomError('이미 경기가 시작됐어.');
      if(room.players.length>=MAX_PLAYERS)throw new RoomError('방이 가득 찼어. (최대 8명)');
      player=this.newPlayer(cleanName,socketId);room.players.push(player);
    }
    room.lastOccupiedAt=now;this.sockets.set(socketId,{code,playerId:player.id});
    this.ensureConnectedHost(room);
    return {room:this.snapshot(code,now)!,playerId:player.id,token:player.token,replacedSocketId};
  }

  /** FIFO matchmaking is isolated by BOTH player count and match rule. */
  enqueueRandom(name:unknown,socketId:string,size:unknown,now=Date.now(),rule:MatchRule='race'):QueueOutcome{
    this.ensureAvailable(socketId);
    if(!isRandomSize(size))throw new RoomError('랜덤 대전은 2명, 3명 또는 4명으로 선택해 줘.');
    if(!isRule(rule))throw new RoomError('대전 방식을 선택해 줘.');
    const queue=this.waiting.get(queueKey(size,rule))!;
    queue.push({name:sanitizeName(name),socketId});
    if(queue.length<size)return {status:'queued',queue:{size,rule,waiting:queue.length}};
    const group=queue.splice(0,size);
    const host=this.makeRoom(group[0].name,group[0].socketId,'random',now,rule);
    const seats=[{socketId:group[0].socketId,playerId:host.playerId,token:host.token}];
    for(const participant of group.slice(1)){
      const p=this.newPlayer(participant.name,participant.socketId);
      this.rooms.get(host.room.code)!.players.push(p);
      this.sockets.set(participant.socketId,{code:host.room.code,playerId:p.id});
      seats.push({socketId:participant.socketId,playerId:p.id,token:p.token});
    }
    this.beginRound(this.rooms.get(host.room.code)!,now);
    return {status:'matched',size,rule,seats:seats.map(p=>({socketId:p.socketId,
      seat:{room:this.snapshot(host.room.code,now)!,playerId:p.playerId,token:p.token}}))};
  }
  queueSockets(size:RandomSize,rule:MatchRule='race'){
    return this.waiting.get(queueKey(size,rule))!.map(p=>p.socketId);
  }
  queueStatus(size:RandomSize,rule:MatchRule='race'):QueueStatus{
    return {size,rule,waiting:this.waiting.get(queueKey(size,rule))!.length};
  }
  cancelQueue(socketId:string):{size:RandomSize;rule:MatchRule}|null{
    for(const size of QUEUE_SIZES)for(const rule of RULES){
      const queue=this.waiting.get(queueKey(size,rule))!;
      const index=queue.findIndex(e=>e.socketId===socketId);
      if(index>=0){queue.splice(index,1);return {size,rule};}
    }
    return null;
  }

  leave(socketId:string,now=Date.now()):string|null{
    const seat=this.sockets.get(socketId);if(!seat)return null;
    this.sockets.delete(socketId);
    const room=this.rooms.get(seat.code);if(!room)return seat.code;
    if(room.stage==='finished'){
      // Preserve the finished scoreboard when someone leaves, but revoke their reconnect token.
      const p=room.players.find(p=>p.id===seat.playerId);
      if(p){p.socketId=null;p.token=randomBytes(24).toString('hex');p.disconnectedAt=now;p.readyForRematch=false;}
    }else room.players=room.players.filter(p=>p.id!==seat.playerId);
    if(!room.players.length)this.rooms.delete(seat.code);
    else{
      this.ensureConnectedHost(room);
      if(room.players.some(p=>p.socketId!==null))room.lastOccupiedAt=now;
      this.maybeBeginRematch(room,now);
    }
    return seat.code;
  }
  disconnect(socketId:string,now=Date.now()):string|null{
    const queuedQueue=this.cancelQueue(socketId);
    if(queuedQueue!==null)return null;
    const seat=this.sockets.get(socketId);if(!seat)return null;
    this.sockets.delete(socketId);
    const room=this.rooms.get(seat.code);if(!room)return null;
    const p=room.players.find(p=>p.id===seat.playerId);
    if(p&&p.socketId===socketId){p.socketId=null;p.disconnectedAt=now;p.readyForRematch=false;}
    this.ensureConnectedHost(room);
    if(room.players.every(p=>p.socketId===null))room.lastOccupiedAt=now;
    this.maybeBeginRematch(room,now);
    return room.code;
  }
  start(socketId:string,now=Date.now()):string{
    const {room,player}=this.getSeat(socketId);
    if(room.mode!=='friends')throw new RoomError('랜덤 대전은 인원이 모이면 자동으로 시작돼.');
    if(room.hostId!==player.id)throw new RoomError('방장만 경기를 시작할 수 있어.');
    if(room.stage!=='lobby')throw new RoomError('이미 시작한 경기야.');
    if(room.players.filter(p=>p.socketId!==null).length<2)throw new RoomError('최소 2명이 모여야 시작할 수 있어.');
    room.players=room.players.filter(p=>p.socketId!==null);
    this.beginRound(room,now);
    return room.code;
  }
  private beginRound(room:Room,now:number){
    room.players=room.players.filter(p=>p.socketId!==null);
    const puzzle=getCompetitivePuzzle(this.nextSeed());
    room.puzzle={robots:puzzle.robots,target:puzzle.target,goal:puzzle.goal};
    room.stage='playing';room.round++;room.startsAt=now+COUNTDOWN_MILLISECONDS;
    room.endsAt=room.startsAt+MATCH_MILLISECONDS;room.winnerId=null;room.finishReason=null;
    for(const p of room.players){p.bestMoves=null;p.submittedAt=null;p.readyForRematch=false;}
  }
  submit(socketId:string,moves:unknown,now=Date.now()):{code:string;result:SubmitResult}{
    const {room,player}=this.getSeat(socketId);
    if(room.stage!=='playing'||!room.puzzle||room.startsAt===null||room.endsAt===null)
      throw new RoomError('이미 종료됐거나 진행 중인 경기가 아니야.');
    if(now<room.startsAt)throw new RoomError('카운트다운이 끝난 뒤 이동해 줘.');
    if(now>=room.endsAt)throw new RoomError('제한시간이 끝났어.');
    if(!Array.isArray(moves)||moves.length<1||moves.length>MAX_COMPETITIVE_MOVES||
       !moves.every(m=>m&&typeof m==='object'&&COLORS.includes(m.robot)&&DIRS.includes(m.direction)))
      throw new RoomError('유효한 이동 기록이 아니야.');
    const end=replay(room.puzzle.robots,moves as Move[]);
    if(!end||!samePoint(end[room.puzzle.target],room.puzzle.goal))throw new RoomError('이동 기록이 목표에 도달하지 않았어.');
    const improved=player.bestMoves===null || moves.length<player.bestMoves;
    if(improved){player.bestMoves=moves.length;player.submittedAt=now;}
    if(room.rule==='race'){
      // Server-authoritative: the first verified answer ends the round atomically.
      room.winnerId=player.id;room.finishReason='solved';room.stage='finished';
    }
    return {code:room.code,result:{bestMoves:player.bestMoves!,improved}};
  }
  requestRematch(socketId:string,now=Date.now()):string{
    const {room,player}=this.getSeat(socketId);
    if(room.stage!=='finished')throw new RoomError('경기가 끝난 뒤 재대결을 요청할 수 있어.');
    player.readyForRematch=true;
    this.maybeBeginRematch(room,now);
    return room.code;
  }
  private maybeBeginRematch(room:Room,now:number){
    if(room.stage!=='finished')return;
    const connected=room.players.filter(p=>p.socketId!==null);
    if(connected.length>=2&&connected.every(p=>p.readyForRematch))this.beginRound(room,now);
  }
  /** Caller broadcasts snapshots for returned room codes. */
  tick(now=Date.now()):string[]{
    const changed:string[]=[];
    for(const room of this.rooms.values()){
      if(room.stage==='playing'&&room.endsAt!==null&&now>=room.endsAt){
        room.stage='finished';room.finishReason='timeout';
        if(room.rule==='fewest'){
          const completed=room.players.filter(p=>p.bestMoves!==null).sort((a,b)=>
            a.bestMoves!-b.bestMoves! || (a.submittedAt??0)-(b.submittedAt??0));
          room.winnerId=completed[0]?.id??null;
        }
        changed.push(room.code);
      }
      if(room.stage==='lobby'){
        const count=room.players.length;
        room.players=room.players.filter(p=>p.socketId!==null||p.disconnectedAt===null||now-p.disconnectedAt<DISCONNECTED_LOBBY_SEAT_TTL);
        if(room.players.length!==count){this.ensureConnectedHost(room);changed.push(room.code);}
      }
      if(!room.players.some(p=>p.socketId!==null)&&now-room.lastOccupiedAt>=ROOM_EMPTY_TTL)this.rooms.delete(room.code);
    }
    return changed.filter(code=>this.rooms.has(code));
  }
  private newPlayer(name:string,socketId:string):Player{
    return {id:randomUUID(),token:randomBytes(24).toString('hex'),name,socketId,disconnectedAt:null,
      bestMoves:null,submittedAt:null,readyForRematch:false};
  }
  private getSeat(socketId:string):{room:Room;player:Player}{
    const seat=this.sockets.get(socketId);
    const room=seat?this.rooms.get(seat.code):undefined;
    const player=room?.players.find(p=>p.id===seat!.playerId);
    if(!room||!player||player.socketId!==socketId)throw new RoomError('방에 다시 입장해 줘.');
    return {room,player};
  }
  private ensureConnectedHost(room:Room){
    if(room.players.find(p=>p.id===room.hostId)?.socketId)return;
    room.hostId=room.players.find(p=>p.socketId!==null)?.id??room.players[0]?.id??'';
  }
}
