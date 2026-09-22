import {beforeEach,describe,expect,it} from 'vitest';
import {generatePuzzle} from '../src/engine';
import {RoomError,RoomManager} from './rooms';
let manager:RoomManager;
beforeEach(()=>{manager=new RoomManager(()=>123456);});
function makeRoom(){
  const host=manager.create('방장','host',1_000);
  const friend=manager.join(host.room.code,'친구','friend',undefined,1_100);
  return {host,friend,code:host.room.code};
}

describe('friend rooms',()=>{
  it('uses six-digit invite codes and limits friend rooms to eight',()=>{
    const host=manager.create('주현','host',1_000);
    expect(host.room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(host.room.players[0].isHost).toBe(true);
    expect(()=>manager.start('host',2_000)).toThrow(RoomError);
    for(let i=0;i<7;i++)manager.join(host.room.code,`친구${i}`,`f${i}`);
    expect(()=>manager.join(host.room.code,'아홉째','extra')).toThrow(/가득/);
  });
  it('transfers host and permits token-based reconnection',()=>{
    const {host,friend,code}=makeRoom();
    manager.disconnect('host',2_000);
    expect(manager.snapshot(code)?.players.find(p=>p.id===friend.playerId)?.isHost).toBe(true);
    const seat=manager.join(code,'복귀','host2',host.token,2_100);
    expect(seat.playerId).toBe(host.playerId);
  });
});

describe('instant finish and rematch',()=>{
  it('locks the round as soon as the first verified solution arrives',()=>{
    const {code,friend}=makeRoom();manager.start('host',5_000);
    const moves=generatePuzzle(123456).solution;
    expect(()=>manager.submit('host',moves,5_100)).toThrow(/카운트다운/);
    expect(()=>manager.submit('host',[{robot:'blue',direction:'invalid'}],9_000)).toThrow(/이동 기록/);
    const answer=manager.submit('friend',moves,9_000);
    expect(answer.result.bestMoves).toBe(moves.length);
    const state=manager.snapshot(code)!;
    expect(state.stage).toBe('finished');
    expect(state.finishReason).toBe('solved');
    expect(state.winnerId).toBe(friend.playerId);
    expect(state.players.find(p=>p.id!==friend.playerId)?.bestMoves).toBeNull();
    expect(()=>manager.submit('host',moves,9_000)).toThrow(/종료/);
    expect(manager.tick(10_000)).not.toContain(code);
  });
  it('accepts rematch requests from all connected players and starts automatically',()=>{
    const {code}=makeRoom();manager.start('host',5_000);
    manager.submit('host',generatePuzzle(123456).solution,9_000);
    manager.requestRematch('friend',10_000);
    expect(manager.snapshot(code)?.stage).toBe('finished');
    expect(manager.snapshot(code)?.players.find(p=>p.name==='친구')?.readyForRematch).toBe(true);
    manager.requestRematch('host',10_100);
    const restarted=manager.snapshot(code)!;
    expect(restarted.stage).toBe('playing');
    expect(restarted.round).toBe(2);
    expect(restarted.startsAt).toBe(13_100);
    expect(restarted.players.every(p=>p.bestMoves===null&&!p.readyForRematch)).toBe(true);
    expect(restarted.winnerId).toBeNull();
  });
  it('does not force a rematch with only one connected participant',()=>{
    const {code,friend}=makeRoom();manager.start('host',5_000);
    manager.submit('host',generatePuzzle(123456).solution,9_000);
    manager.requestRematch('host',10_000);
    manager.leave('friend',10_100);
    expect(manager.snapshot(code)?.stage).toBe('finished');
    expect(manager.snapshot(code)?.players.find(p=>p.id===friend.playerId)?.connected).toBe(false);
    expect(manager.snapshot(code)?.players).toHaveLength(2); // final results remain visible
  });
  it('finishes at two minutes with no winner',()=>{
    const {code}=makeRoom();manager.start('host',5_000);
    expect(manager.tick(128_000)).toContain(code);
    expect(manager.snapshot(code)?.finishReason).toBe('timeout');
    expect(manager.snapshot(code)?.winnerId).toBeNull();
  });
});

describe('random matchmaking',()=>{
  it.each([2,3,4] as const)('matches only after %i real players request the same size',size=>{
    const friends=Array.from({length:size},(_,i)=>`s${i}`);
    for(const [i,id] of friends.entries()){
      const result=manager.enqueueRandom(`친구${i}`,id,size,1_000+i);
      if(i<size-1){
        expect(result.status).toBe('queued');
        expect(manager.queueStatus(size).waiting).toBe(i+1);
      }else{
        expect(result.status).toBe('matched');
        if(result.status!=='matched')return;
        expect(result.seats).toHaveLength(size);
        expect(result.seats[0].seat.room.mode).toBe('random');
        expect(result.seats[0].seat.room.stage).toBe('playing');
        expect(result.seats.map(s=>s.seat.room.puzzle)).toEqual(Array(size).fill(result.seats[0].seat.room.puzzle));
      }
    }
    expect(manager.queueStatus(size).waiting).toBe(0);
  });
  it('isolates queues by size and removes canceled and disconnected players',()=>{
    expect(manager.enqueueRandom('A','a',2).status).toBe('queued');
    expect(manager.enqueueRandom('B','b',3).status).toBe('queued');
    expect(()=>manager.create('A','a')).toThrow(/매칭/);
    expect(manager.cancelQueue('a')).toBe(2);
    expect(manager.queueStatus(2).waiting).toBe(0);
    manager.disconnect('b');
    expect(manager.queueStatus(3).waiting).toBe(0);
    expect(()=>manager.enqueueRandom('C','c',5)).toThrow(/2명/);
  });
  it('does not accept direct invitations to random rooms',()=>{
    manager.enqueueRandom('A','a',2);
    const found=manager.enqueueRandom('B','b',2);
    if(found.status!=='matched')throw new Error('Expected match');
    expect(()=>manager.join(found.seats[0].seat.room.code,'stranger','c')).toThrow(/랜덤/);
  });
});
