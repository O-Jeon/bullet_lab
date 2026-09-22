/** One-off offline bank generator. Run `npm run curate:puzzles`, then `npm test`.
 * Never include a candidate unless the exhaustive BFS proves that no answer
 * exists at 0..5 moves. A search that exceeds the state limit is inconclusive.
 */
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {COLORS,DIRS,SIZE,inBounds,isCenter,replay,samePoint,slide,type Direction,type Move,type Point,type Puzzle,type Robots} from '../src/engine';
import {requiresOtherRobot,shortestWithin} from '../src/difficulty';

const count=Number(process.argv[2]??120);
const maxSeeds=Number(process.argv[3]??20_000);
if(!Number.isSafeInteger(count)||count<1||count>500)throw Error('Target count must be 1..500.');
const accepted: Array<Puzzle&{minimumAtLeast:6;requiresOtherRobot:true}>=[];
const delta:Record<Direction,Point>={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};

function rng(seed:number){
  let s=seed>>>0;
  return ()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
for(let seed=1;seed<=maxSeeds&&accepted.length<count;seed++){
  const r=rng(seed*87317),rand=(max:number)=>Math.floor(r()*max);
  const cells=new Set<string>(),initial={} as Robots;
  for(const color of COLORS){
    let p:Point;
    do{p={x:rand(SIZE),y:rand(SIZE)};}while(isCenter(p)||cells.has(`${p.x},${p.y}`));
    initial[color]=p;cells.add(`${p.x},${p.y}`);
  }
  const target=COLORS[rand(COLORS.length)];
  let state=initial;
  const moves:Move[]=[];
  const steps=13+rand(13);
  for(let i=0;i<steps;i++){
    const options:Array<Move&{next:Robots}>=[];
    for(const robot of COLORS)for(const direction of DIRS){
      const next=slide(state,robot,direction);
      if(next)options.push({robot,direction,next});
    }
    if(!options.length)break;
    const nonTarget=options.filter(o=>o.robot!==target);
    const pool=i<5&&nonTarget.length?nonTarget:options;
    const picked=pool[rand(pool.length)];
    state=picked.next;
    moves.push({robot:picked.robot,direction:picked.direction});
    if(picked.robot!==target||moves.length<6||moves.length>20||samePoint(state[target],initial[target]))continue;
    const v=delta[picked.direction];
    const stopper={x:state[target].x+v.x,y:state[target].y+v.y};
    if(!inBounds(stopper)||!COLORS.some(c=>c!==target&&samePoint(state[c],stopper)))continue;
    const goal={...state[target]};
    if(!requiresOtherRobot(initial,target,goal))continue;
    const shortest=shortestWithin(initial,target,goal,5,220_000);
    if(shortest!==undefined)continue; // includes inconclusive=null, which must NOT be accepted
    const solution=moves.slice();
    const end=replay(initial,solution);
    if(!end||!samePoint(end[target],goal))throw Error('Invalid constructive witness.');
    accepted.push({seed,robots:initial,target,goal,solution,minimumAtLeast:6,requiresOtherRobot:true});
    if(accepted.length%10===0)console.log(`Certified ${accepted.length}/${count} puzzles (seed ${seed})`);
    break;
  }
}
if(accepted.length!==count)throw Error(`Only ${accepted.length} of ${count} verified puzzles; keeping old bank.`);
writeFileSync(resolve('src/puzzle-bank.json'),JSON.stringify(accepted,null,2)+'\n');
console.log(`Saved ${accepted.length} certified 6+-move puzzles. Run npm test before committing.`);
