import {beforeEach,describe,expect,it} from 'vitest';
import {generatePuzzle} from '../src/engine';
import {RoomError,RoomManager} from './rooms';

let manager:RoomManager;
beforeEach(()=>{manager=new RoomManager(()=>123456);});
function makeRoom(){
  const host=manager.create('방장','socket-host',1_000);
  const friend=manager.join(host.room.code,'친구','socket-friend',undefined,1_100);
  return {host,friend,code:host.room.code};
}

describe('room lobby',()=>{
  it('makes a six-character code and gives the creator the host seat',()=>{
    const seat=manager.create('주현','socket-host',1_000);
    expect(seat.room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(seat.room.players).toHaveLength(1);
    expect(seat.room.players[0].isHost).toBe(true);
    expect(seat.room.stage).toBe('lobby');
    expect(seat.token).toHaveLength(48);
  });
  it('rejects a 9th participant, and starting with only one person',()=>{
    const host=manager.create('방장','host',1_000);
    expect(()=>manager.start('host',2_000)).toThrow(RoomError);
    for(let i=0;i<7;i++)manager.join(host.room.code,`친구${i}`,`friend${i}`);
    expect(manager.snapshot(host.room.code)?.players).toHaveLength(8);
    expect(()=>manager.join(host.room.code,'아홉째','extra')).toThrow(/가득/);
  });
  it('transfers host on disconnect and restores an authenticated seat',()=>{
    const {host,friend,code}=makeRoom();
    manager.disconnect('socket-host',2_000);
    expect(manager.snapshot(code)?.players.find(p=>p.id===friend.playerId)?.isHost).toBe(true);
    const returned=manager.join(code,'방장 복귀','socket-host-new',host.token,2_100);
    expect(returned.playerId).toBe(host.playerId);
    expect(returned.room.players).toHaveLength(2);
  });
  it('does not let a stranger join after the match starts',()=>{
    const {code}=makeRoom();manager.start('socket-host',2_000);
    expect(()=>manager.join(code,'늦은 사람','late')).toThrow(/시작/);
  });
});

describe('live round & authoritative submissions',()=>{
  it('starts only by host, with a 3-second countdown and a shared puzzle',()=>{
    const {code}=makeRoom();
    expect(()=>manager.start('socket-friend',3_000)).toThrow(/방장/);
    manager.start('socket-host',3_000);
    const state=manager.snapshot(code,3_000)!;
    expect(state.stage).toBe('playing');
    expect(state.startsAt).toBe(6_000);
    expect(state.endsAt).toBe(126_000);
    expect(state.puzzle?.target).toBeTruthy();
    expect(state.puzzle).not.toHaveProperty('solution');
    expect(state.puzzle).not.toHaveProperty('seed');
  });
  it('replays submitted moves, rejects forged paths, and keeps the best score',()=>{
    const {code}=makeRoom();manager.start('socket-host',5_000);
    const solution=generatePuzzle(123456).solution;
    expect(()=>manager.submit('socket-host',solution,5_100)).toThrow(/카운트다운/);
    expect(()=>manager.submit('socket-host',[{robot:'blue',direction:'invalid'}],9_000)).toThrow(/이동 기록/);
    expect(()=>manager.submit('socket-host',[],9_000)).toThrow(/이동 기록/);
    const first=manager.submit('socket-host',solution,9_000);
    expect(first.result.bestMoves).toBe(solution.length);
    expect(first.result.improved).toBe(true);
    const duplicate=manager.submit('socket-host',solution,9_100);
    expect(duplicate.result.improved).toBe(false);
    expect(()=>manager.submit('socket-host',solution,128_000)).toThrow(/제한시간/);
    expect(manager.tick(128_000)).toContain(code);
    expect(manager.snapshot(code)?.stage).toBe('finished');
    manager.rematch('socket-host',129_000);
    expect(manager.snapshot(code)?.stage).toBe('lobby');
    expect(manager.snapshot(code)?.players.every(p=>p.bestMoves===null)).toBe(true);
  });
});

