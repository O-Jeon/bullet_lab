/** Offline certification: reject ANY puzzle solvable in five moves or fewer.
 * Used when curating the shipped competitive puzzle bank; never treat a
 * bounded search that exceeds its state budget as proof of difficulty.
 */
import {COLORS,DIRS,SIZE,hasWall,inBounds,isCenter,samePoint,slide,type Point,type Robots,type RobotColor} from './engine';
const CELL_COUNT=SIZE*SIZE;
const WEIGHTS=Array.from({length:5},(_,i)=>CELL_COUNT**(4-i));
const VECTORS=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}] as const;
const paths:number[][][]=Array.from({length:CELL_COUNT},(_,cell)=>{
  const x=cell%SIZE,y=Math.floor(cell/SIZE);
  return VECTORS.map(v=>{
    const positions:number[]=[];
    let current={x,y};
    for(;;){
      const next={x:current.x+v.x,y:current.y+v.y};
      if(!inBounds(next)||isCenter(next)||hasWall(current,next))return positions;
      positions.push(next.y*SIZE+next.x);
      current=next;
    }
  });
});
const toCell=(p:Point)=>p.y*SIZE+p.x;
function encode(positions:number[]):number{return positions.reduce((key,pos)=>key*CELL_COUNT+pos,0);}
function decode(key:number):number[]{
  const result=new Array<number>(5);
  for(let i=4;i>=0;i--){result[i]=key%CELL_COUNT;key=Math.floor(key/CELL_COUNT);}
  return result;
}
/** Returns null when the state cap prevents a complete proof. */
export function shortestWithin(robots:Robots,target:RobotColor,goal:Point,maxDepth=5,maxStates=250_000):number|null|undefined{
  const targetIndex=COLORS.indexOf(target),goalCell=toCell(goal);
  const initial=COLORS.map(c=>toCell(robots[c]));
  if(initial[targetIndex]===goalCell)return 0;
  const start=encode(initial);
  const seen=new Set<number>([start]);
  let frontier=[start];
  for(let depth=1;depth<=maxDepth;depth++){
    const next:number[]=[];
    for(const key of frontier){
      const state=decode(key);
      for(let robot=0;robot<5;robot++)for(let direction=0;direction<4;direction++){
        let destination=state[robot];
        for(const cell of paths[destination][direction]){
          if(cell===state[(robot+1)%5]||cell===state[(robot+2)%5]||cell===state[(robot+3)%5]||cell===state[(robot+4)%5])break;
          destination=cell;
        }
        if(destination===state[robot])continue;
        if(robot===targetIndex&&destination===goalCell)return depth;
        if(depth===maxDepth)continue;
        const newKey=key+(destination-state[robot])*WEIGHTS[robot];
        if(seen.has(newKey))continue;
        seen.add(newKey);next.push(newKey);
        if(seen.size>maxStates)return null;
      }
    }
    frontier=next;
    if(!frontier.length)return undefined;
  }
  return undefined;
}
/** A yes result means every valid answer moves at least one *other* robot. */
export function requiresOtherRobot(robots:Robots,target:RobotColor,goal:Point):boolean{
  const queue:Point[]=[robots[target]];
  const seen=new Set([toCell(robots[target])]);
  for(let i=0;i<queue.length;i++){
    const current={...robots,[target]:queue[i]};
    for(const direction of DIRS){
      const moved=slide(current,target,direction);
      if(!moved)continue;
      if(samePoint(moved[target],goal))return false;
      const cell=toCell(moved[target]);
      if(!seen.has(cell)){seen.add(cell);queue.push(moved[target]);}
    }
  }
  return true;
}
