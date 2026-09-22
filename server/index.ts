import express from 'express';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Server,type Socket} from 'socket.io';
import {RoomError,RoomManager} from './rooms';
import type {
  CreateRequest,Empty,JoinRequest,QueueRequest,QueueStatus,RandomSize,MatchRule,
  Result,Seat,SubmitRequest,SubmitResult,
} from '../src/multiplayer';

export function createGameServer(rooms=new RoomManager()){
  const app=express();app.disable('x-powered-by');
  const httpServer=createServer(app);
  const io=new Server(httpServer,{cors:{origin:false},maxHttpBufferSize:65_536,perMessageDeflate:false});
  app.get('/api/health',(_req,res)=>res.json({ok:true,service:'bullet-lab'}));
  const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
  app.use(express.static(dist));
  app.get(/.*/,(_req,res)=>res.sendFile(path.join(dist,'index.html')));
  function broadcast(code:string){const snapshot=rooms.snapshot(code);if(snapshot)io.to(code).emit('room:state',snapshot);}
  function broadcastQueue(size:RandomSize,rule:MatchRule){
    const status=rooms.queueStatus(size,rule);
    for(const id of rooms.queueSockets(size,rule))io.to(id).emit('match:status',status);
  }
  io.on('connection',(socket:Socket)=>{
    const handle=<T>(ack:((r:Result<T>)=>void)|undefined,fn:()=>T)=>{
      if(typeof ack!=='function')return;
      try{ack({ok:true,data:fn()});}
      catch(error){ack({ok:false,error:error instanceof RoomError?error.message:'요청을 처리하지 못했어. 잠시 후 다시 시도해 줘.'});}
    };
    socket.on('room:create',(payload:CreateRequest,ack:(r:Result<Seat>)=>void)=>handle(ack,()=>{
      const seat=rooms.create(payload?.name,socket.id,Date.now(),payload?.rule);socket.join(seat.room.code);
      broadcast(seat.room.code);return seat;
    }));
    socket.on('room:join',(payload:JoinRequest,ack:(r:Result<Seat>)=>void)=>handle(ack,()=>{
      const seat=rooms.join(payload?.code,payload?.name,socket.id,payload?.token);
      if(seat.replacedSocketId){const old=io.sockets.sockets.get(seat.replacedSocketId);if(old)old.disconnect(true);}
      socket.join(seat.room.code);broadcast(seat.room.code);
      return {room:seat.room,playerId:seat.playerId,token:seat.token};
    }));
    socket.on('match:queue',(payload:QueueRequest,ack:(r:Result<QueueStatus>)=>void)=>handle(ack,()=>{
      const result=rooms.enqueueRandom(payload?.name,socket.id,payload?.size,Date.now(),payload?.rule);
      if(result.status==='matched'){
        for(const entry of result.seats){
          const participant=io.sockets.sockets.get(entry.socketId);
          if(participant){participant.join(entry.seat.room.code);participant.emit('match:found',entry.seat);}
        }
        broadcast(result.seats[0].seat.room.code);
      }
      broadcastQueue(result.status==='matched'?result.size:result.queue.size,result.status==='matched'?result.rule:result.queue.rule);
      return result.status==='matched'?{size:result.size,rule:result.rule,waiting:0}:result.queue;
    }));
    socket.on('match:cancel',(_payload:Empty,ack:(r:Result<Empty>)=>void)=>handle(ack,()=>{
      const queue=rooms.cancelQueue(socket.id);if(queue)broadcastQueue(queue.size,queue.rule);return {};
    }));
    socket.on('room:leave',(_payload:Empty,ack:(r:Result<Empty>)=>void)=>handle(ack,()=>{
      const code=rooms.leave(socket.id);if(code){socket.leave(code);broadcast(code);}return {};
    }));
    socket.on('room:start',(_payload:Empty,ack:(r:Result<Empty>)=>void)=>handle(ack,()=>{
      const code=rooms.start(socket.id);broadcast(code);return {};
    }));
    socket.on('room:submit',(payload:SubmitRequest,ack:(r:Result<SubmitResult>)=>void)=>handle(ack,()=>{
      const {code,result}=rooms.submit(socket.id,payload?.moves);
      broadcast(code);return result;
    }));
    socket.on('room:rematch',(_payload:Empty,ack:(r:Result<Empty>)=>void)=>handle(ack,()=>{
      const code=rooms.requestRematch(socket.id);broadcast(code);return {};
    }));
    socket.on('disconnect',()=>{
      const code=rooms.disconnect(socket.id);if(code)broadcast(code);
      for(const size of [2,3,4] as const)for(const rule of ['race','fewest'] as const)broadcastQueue(size,rule);
    });
  });
  const ticker=setInterval(()=>{for(const code of rooms.tick())broadcast(code);},250);
  ticker.unref();
  return {app,httpServer,io,rooms,close:async()=>{
    clearInterval(ticker);
    await new Promise<void>(resolve=>io.close(()=>resolve()));
    if(httpServer.listening)await new Promise<void>(resolve=>httpServer.close(()=>resolve()));
  }};
}
if(process.env.NODE_ENV!=='test'&&process.env.BULLET_LAB_NO_LISTEN!=='1'){
  const port=Number(process.env.PORT)||3001;
  createGameServer().httpServer.listen(port,'0.0.0.0',()=>console.log(`[BULLET LAB] server ready on http://localhost:${port}`));
}
