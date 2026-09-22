import {afterEach,describe,expect,it} from 'vitest';
import type {AddressInfo} from 'node:net';
import {io as socketClient,type Socket} from 'socket.io-client';
import {generatePuzzle} from '../src/engine';
import type {QueueStatus,Result,RoomSnapshot,Seat,SubmitResult} from '../src/multiplayer';
import {createGameServer} from './index';
import {RoomManager} from './rooms';
const clients:Socket[]=[];
let stopServer:(()=>Promise<void>)|null=null;
afterEach(async()=>{
  for(const socket of clients)socket.disconnect();clients.length=0;
  if(stopServer)await stopServer();stopServer=null;
});
async function setup(){
  const server=createGameServer(new RoomManager(()=>123456));
  stopServer=server.close;
  await new Promise<void>(resolve=>server.httpServer.listen(0,'127.0.0.1',resolve));
  const port=(server.httpServer.address() as AddressInfo).port;
  async function connect(){
    const socket=socketClient(`http://127.0.0.1:${port}`,{reconnection:false,timeout:5_000});
    clients.push(socket);
    await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
    return socket;
  }
  return {server,connect};
}
describe('Socket.IO live match',()=>{
  it('broadcasts first-win finish, waits for rematch votes, then starts a new round',async()=>{
    const {server,connect}=await setup();const a=await connect();const b=await connect();
    const create=await a.timeout(5_000).emitWithAck('room:create',{name:'A'}) as Result<Seat>;
    if(!create.ok)throw new Error(create.error);
    const join=await b.timeout(5_000).emitWithAck('room:join',{name:'B',code:create.data.room.code}) as Result<Seat>;
    expect(join.ok).toBe(true);
    const start=await a.timeout(5_000).emitWithAck('room:start',{}) as Result<object>;
    expect(start.ok).toBe(true);
    await new Promise(resolve=>setTimeout(resolve,3_050));
    const path=generatePuzzle(123456).solution;
    const score=await b.timeout(5_000).emitWithAck('room:submit',{moves:path}) as Result<SubmitResult>;
    expect(score.ok).toBe(true);
    const state=server.rooms.snapshot(create.data.room.code) as RoomSnapshot;
    expect(state.stage).toBe('finished');
    expect(state.winnerId).toBe(join.ok?join.data.playerId:null);
    const tooLate=await a.timeout(5_000).emitWithAck('room:submit',{moves:path}) as Result<SubmitResult>;
    expect(tooLate.ok).toBe(false);
    const first=await a.timeout(5_000).emitWithAck('room:rematch',{}) as Result<object>;
    expect(first.ok).toBe(true);
    expect(server.rooms.snapshot(state.code)?.stage).toBe('finished');
    const second=await b.timeout(5_000).emitWithAck('room:rematch',{}) as Result<object>;
    expect(second.ok).toBe(true);
    expect(server.rooms.snapshot(state.code)?.round).toBe(2);
  },12_000);
  it('pairs players who requested the same random match size',async()=>{
    const {connect}=await setup();const a=await connect();const b=await connect();
    const foundA=new Promise<Seat>(resolve=>a.once('match:found',resolve));
    const foundB=new Promise<Seat>(resolve=>b.once('match:found',resolve));
    const queue=await a.timeout(5_000).emitWithAck('match:queue',{name:'A',size:2}) as Result<QueueStatus>;
    expect(queue.ok).toBe(true);
    if(queue.ok)expect(queue.data.waiting).toBe(1);
    await b.timeout(5_000).emitWithAck('match:queue',{name:'B',size:2});
    const [one,two]=await Promise.all([foundA,foundB]);
    expect(one.room.code).toBe(two.room.code);
    expect(one.room.stage).toBe('playing');
    expect(one.room.mode).toBe('random');
    expect(one.room.players).toHaveLength(2);
  },8_000);
});
