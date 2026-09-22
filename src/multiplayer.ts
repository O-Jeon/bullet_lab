/** Wire format shared between the browser and the game server. */
import type {Move,Point,RobotColor,Robots} from './engine';

export type PublicPuzzle = {
  robots: Robots;
  target: RobotColor;
  goal: Point;
};
export type Stage = 'lobby' | 'playing' | 'finished';
export type PlayerView = {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  bestMoves: number | null;
  submittedAt: number | null;
};
export type RoomSnapshot = {
  code: string;
  stage: Stage;
  players: PlayerView[];
  puzzle: PublicPuzzle | null;
  round: number;
  startsAt: number | null;
  endsAt: number | null;
  serverTime: number;
};
export type Seat = { playerId: string; token: string; room: RoomSnapshot };
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type Empty = Record<string, never>;
export type SubmitResult = { bestMoves: number; improved: boolean };
export type CreateRequest = { name: string };
export type JoinRequest = { code: string; name: string; token?: string };
export type SubmitRequest = { moves: Move[] };

export const MAX_PLAYERS = 8;
export const MATCH_MILLISECONDS = 120_000;
export const COUNTDOWN_MILLISECONDS = 3_000;

export function sortResults(a:PlayerView,b:PlayerView) {
  if(a.bestMoves === null) return b.bestMoves === null ? a.name.localeCompare(b.name) : 1;
  if(b.bestMoves === null) return -1;
  return a.bestMoves - b.bestMoves || (a.submittedAt ?? 0) - (b.submittedAt ?? 0);
}
