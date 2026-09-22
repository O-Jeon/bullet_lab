import {describe,it,expect} from 'vitest';
import {COLORS,generatePuzzle,hasWall,isCenter,replay,samePoint,slide,type Robots} from './engine';
const robots:Robots={blue:{x:0,y:0},pink:{x:1,y:0},green:{x:4,y:5},yellow:{x:6,y:13},slate:{x:9,y:9}};
describe('slide rules',()=>{
  it('stops immediately before another robot',()=>{const moved=slide(robots,'blue','right');expect(moved).toBeNull();});
  it('does not mutate source robot state',()=>{const before=structuredClone(robots);slide(robots,'blue','down');expect(robots).toEqual(before);});
  it('never enters central blocked square',()=>{const moved=slide(robots,'green','right');if(moved)expect(isCenter(moved.green)).toBe(false);});
  it('uses fixed interior walls',()=>{expect(hasWall({x:2,y:0},{x:3,y:0})).toBe(true);});
});
describe('puzzle generator',()=>{
  it('makes deterministic puzzles',()=>{expect(generatePuzzle(123456)).toEqual(generatePuzzle(123456));});
  it('generates distinct, valid, reproducibly solvable puzzles',()=>{for(let seed=1;seed<=40;seed++){const p=generatePuzzle(seed);const cells=COLORS.map(c=>`${p.robots[c].x},${p.robots[c].y}`);expect(new Set(cells).size).toBe(5);expect(COLORS.every(c=>!isCenter(p.robots[c]))).toBe(true);const end=replay(p.robots,p.solution);expect(end).not.toBeNull();expect(samePoint(end![p.target],p.goal)).toBe(true);}});
});
