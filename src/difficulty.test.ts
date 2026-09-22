import {describe,expect,it} from 'vitest';
import {COLORS,SIZE,isCenter,replay,samePoint} from './engine';
import {getCompetitivePuzzle,getTutorialPuzzle,competitiveCount,tutorialCount,MAX_COMPETITIVE_MOVES} from './catalog';
import {requiresOtherRobot,shortestWithin} from './difficulty';

describe('verified puzzle banks',()=>{
  it('contains playable 20x20 puzzles with no duplicated robots',()=>{
    expect(SIZE).toBe(20);
    expect(competitiveCount).toBeGreaterThanOrEqual(30);
    expect(tutorialCount).toBeGreaterThanOrEqual(10);
  });
  it('certifies every ranked puzzle: min 6, no target-only path, witnessed <=20',()=>{
    for(let i=0;i<competitiveCount;i++){
      const puzzle=getCompetitivePuzzle(i);
      const locations=COLORS.map(c=>`${puzzle.robots[c].x},${puzzle.robots[c].y}`);
      expect(new Set(locations).size).toBe(5);
      expect(COLORS.every(c=>!isCenter(puzzle.robots[c]))).toBe(true);
      const solved=replay(puzzle.robots,puzzle.solution);
      expect(solved).not.toBeNull();
      expect(samePoint(solved![puzzle.target],puzzle.goal)).toBe(true);
      expect(puzzle.solution.length).toBeLessThanOrEqual(MAX_COMPETITIVE_MOVES);
      expect(requiresOtherRobot(puzzle.robots,puzzle.target,puzzle.goal)).toBe(true);
      expect(shortestWithin(puzzle.robots,puzzle.target,puzzle.goal,5)).toBeUndefined();
    }
  });
  it('reserves all 2-5 move puzzles for the tutorial',()=>{
    for(let i=0;i<tutorialCount;i++){
      const p=getTutorialPuzzle(i);
      const solution=replay(p.robots,p.solution);
      expect(solution).not.toBeNull();
      expect(samePoint(solution![p.target],p.goal)).toBe(true);
      expect(p.solution.length).toBeGreaterThanOrEqual(2);
      expect(p.solution.length).toBeLessThanOrEqual(5);
      expect(shortestWithin(p.robots,p.target,p.goal,5)).toBe(p.solution.length);
    }
  });
});
