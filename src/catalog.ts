/** All competitive entries are pre-certified by an exhaustive BFS for depths 0..5.
 * Thus a puzzle that can be solved in <=5 moves NEVER reaches a ranked game.
 * Each entry also has a witnessed solution <=20 moves and is impossible if
 * the four non-target robots are kept in their initial locations.
 */
import type {Puzzle} from './engine';
import competitive from './puzzle-bank.json';
import tutorial from './tutorial-bank.json';

export const MAX_COMPETITIVE_MOVES=20;
export const MIN_COMPETITIVE_MOVES=6;
const competitivePuzzles=competitive as unknown as Puzzle[];
const tutorialPuzzles=tutorial as unknown as Puzzle[];

function choose(bank:Puzzle[],seed:number):Puzzle{
  if(!bank.length)throw new Error('퍼즐 목록이 비어 있어.');
  const selected=bank[(Math.abs(Math.trunc(seed||0)))%bank.length];
  return {
    seed,robots:Object.fromEntries(Object.entries(selected.robots).map(([color,p])=>[color,{...p}])) as Puzzle['robots'],
    target:selected.target,goal:{...selected.goal},solution:selected.solution.map(m=>({...m})),
  };
}
export function getCompetitivePuzzle(seed:number):Puzzle{return choose(competitivePuzzles,seed);}
export function getTutorialPuzzle(seed:number):Puzzle{return choose(tutorialPuzzles,seed);}
export const competitiveCount=competitivePuzzles.length;
export const tutorialCount=tutorialPuzzles.length;
