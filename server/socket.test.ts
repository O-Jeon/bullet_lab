import {afterEach,describe,expect,it} from 'vitest';
import type {AddressInfo} from 'node:net';
import {io as socketClient,type Socket} from 'socket.io-client';
import {generatePuzzle} from '../src/engine';
import type {Result,RoomSnapshot,Seat,SubmitResult} from '../src/multiplayer';
import {createGameServer} from './index';
import {RoomManager} from './rooms';

const clients:Socket[]=[];
let stopServer:(()=>Promise<void>)|null=null;

afterEach(async()=>{
  for(const socket of clients)socket.disconnect();
  clients.length=0;
  if(stopServer)await stopServer();
  stopServer=null;
});

describe('Socket.IO multiplayer integration',()=>{
  it('shares a waiting room, starts one puzzle and broadcasts an authenticated result',async()=>{
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
    const a=await connect();
    const b=await connect();
    const make=await a.timeout(5_000).emitWithAck('room:create',{name:'A'}) as Result<Seat>;
    expect(make.ok).toBe(true);
    if(!make.ok)return;
    const join=await b.timeout(5_000).emitWithAck('room:join',{name:'B',code:make.data.room.code}) as Result<Seat>;
    expect(join.ok).toBe(true);
    if(!join.ok)return;
    expect(join.data.room.players).toHaveLength(2);
    const started=await a.timeout(5_000).emitWithAck('room:start',{}) as Result<object>;
    expect(started.ok).toBe(true);
    const state=server.rooms.snapshot(make.data.room.code)!;
    expect(state.stage).toBe('playing');
    expect(state.puzzle).not.toHaveProperty('solution');
    // Only the authenticated participant's own socket can submit their path.
    // Wait for the actual 3-second countdown rather than faking a client clock.
    await new Promise(resolve=>setTimeout(resolve,3_050));
    const path=generatePuzzle(123456).solution;
    const score=await b.timeout(5_000).emitWithAck('room:submit',{moves:path}) as Result<SubmitResult>;
    expect(score.ok).toBe(true);
    if(!score.ok)return;
    expect(score.data.bestMoves).toBe(path.length);
    const updated=server.rooms.snapshot(make.data.room.code) as RoomSnapshot;
    expect(updated.players.find(p=>p.id===join.data.playerId)?.bestMoves).toBe(path.length);
  },12_000);
});
