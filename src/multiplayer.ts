/** Shared client/server protocol. A solved round stops on the first verified solution. */
import type {Move,Point,RobotColor,Robots} from './engine';

export type PublicPuzzle={robots:Robots;target:RobotColor;goal:Point};
export type Stage='lobby'|'playing'|'finished';
export type RoomMode='friends'|'random';
export type FinishReason='solved'|'timeout'|null;
export type RandomSize=2|3|4;
export type PlayerView={
  id:string;name:string;connected:boolean;isHost:boolean;
  bestMoves:number|null;submittedAt:number|null;readyForRematch:boolean;
};
export type RoomSnapshot={
  code:string;mode:RoomMode;stage:Stage;round:number;players:PlayerView[];
  puzzle:PublicPuzzle|null;startsAt:number|null;endsAt:number|null;
  winnerId:string|null;finishReason:FinishReason;serverTime:number;
};
export type Seat={playerId:string;token:string;room:RoomSnapshot};
export type Result<T>={ok:true;data:T}|{ok:false;error:string};
export type Empty=Record<string,never>;
export type SubmitResult={bestMoves:number;improved:boolean};
export type CreateRequest={name:string};
export type JoinRequest={code:string;name:string;token?:string};
export type SubmitRequest={moves:Move[]};
export type QueueRequest={name:string;size:RandomSize};
export type QueueStatus={size:RandomSize;waiting:number};

export const MAX_PLAYERS=8;
export const MATCH_MILLISECONDS=120_000;
export const COUNTDOWN_MILLISECONDS=3_000;

/** Only successful solvers receive a numeric rank; unfinished players share DNF. */
export function sortResults(a:PlayerView,b:PlayerView){
  if(a.bestMoves===null)return b.bestMoves===null?a.name.localeCompare(b.name):1;
  if(b.bestMoves===null)return -1;
  return a.bestMoves-b.bestMoves||(a.submittedAt??0)-(b.submittedAt??0);
}
