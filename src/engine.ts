/** No browser or React dependencies: shared by the UI and future authoritative server. */
export const SIZE = 20;
export const COLORS = ['blue', 'pink', 'green', 'yellow', 'slate'] as const;
export type RobotColor = (typeof COLORS)[number];
export type Point = { x: number; y: number };
export type Robots = Record<RobotColor, Point>;
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Move = { robot: RobotColor; direction: Direction };
export type Puzzle = { seed: number; robots: Robots; target: RobotColor; goal: Point; solution: Move[] };
export const DIRS: Direction[] = ['up', 'right', 'down', 'left'];
const VECTORS: Record<Direction, Point> = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

const pkey = ({ x, y }: Point) => `${x},${y}`;
/** A wall key denotes an undirected edge between two adjacent board cells. */
const edgeKey = (a: Point, b: Point) => [pkey(a), pkey(b)].sort().join('|');
const walls = new Set<string>();
const addWall = (a: Point, b: Point) => walls.add(edgeKey(a, b));
/** Fixed interior layout inspired by the screenshot, not a pixel-for-pixel copy. */
const wallSegments: Array<[number, number, Direction]> = [
  [2,0,'right'],[9,0,'right'],[11,0,'right'],[1,2,'down'],[3,1,'right'],[4,1,'down'],[9,1,'down'],[11,2,'right'],
  [7,3,'right'],[6,4,'down'],[14,3,'down'],[1,5,'down'],[3,6,'right'],[12,5,'right'],[13,5,'down'],
  [0,6,'down'],[3,7,'down'],[4,9,'right'],[5,9,'down'],[10,8,'down'],[12,8,'right'],[2,10,'down'],[4,10,'right'],
  [10,10,'right'],[14,11,'down'],[1,12,'down'],[10,12,'right'],[6,13,'right'],[13,13,'right'],[3,14,'down'],
  [4,15,'right'],[11,14,'down'],[13,14,'right'],[14,15,'right'],[0,12,'down'],[9,11,'down'],[15,10,'down'],
  // Additional fixed walls distribute stopping points across the larger 20x20 board.
  [16,1,'down'],[17,2,'right'],[18,4,'down'],[15,5,'right'],[17,7,'down'],
  [16,9,'right'],[18,10,'down'],[17,12,'right'],[15,14,'down'],[18,15,'right'],
  [16,17,'down'],[18,18,'right'],[3,17,'right'],[5,18,'down'],[7,16,'right'],
  [9,17,'down'],[11,18,'right'],[13,16,'down'],[1,17,'down'],[7,18,'down'],
  [12,16,'right'],[15,18,'down'],[0,17,'right'],[8,15,'down'],[18,6,'right'],[11,7,'down']
];
for (const [x,y,direction] of wallSegments) {
  const v = VECTORS[direction];
  addWall({x,y}, { x:x+v.x, y:y+v.y });
}
export const isCenter = ({x,y}:Point) => (x === 9 || x === 10) && (y === 9 || y === 10);
export const inBounds = ({x,y}:Point) => x>=0 && x<SIZE && y>=0 && y<SIZE;
export const hasWall = (a:Point,b:Point) => walls.has(edgeKey(a,b));
export const getWallSegments = () => wallSegments;
export const samePoint = (a:Point,b:Point) => a.x === b.x && a.y === b.y;
export const cloneRobots = (robots:Robots):Robots => ({blue:{...robots.blue},pink:{...robots.pink},green:{...robots.green},yellow:{...robots.yellow},slate:{...robots.slate}});

/** Robots slide until just before a wall, another robot or the central blocked square. */
export function slide(robots: Robots, robot: RobotColor, direction: Direction): Robots | null {
  const result = cloneRobots(robots);
  const v = VECTORS[direction];
  let current = result[robot];
  for (;;) {
    const next = { x: current.x + v.x, y: current.y + v.y };
    if (!inBounds(next) || isCenter(next) || hasWall(current,next)) break;
    if (COLORS.some(c => c !== robot && samePoint(robots[c],next))) break;
    current = next;
  }
  if (samePoint(result[robot], current)) return null;
  result[robot] = current;
  return result;
}

export function replay(initial: Robots, path: Move[]): Robots | null {
  let robots = cloneRobots(initial);
  for(const move of path) {
    const next = slide(robots,move.robot,move.direction);
    if(!next) return null;
    robots = next;
  }
  return robots;
}

/** Deterministic seed lets friends play exactly the same board via a URL. */
function rng(seed:number) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
}
const rand = (r:()=>number, max:number) => Math.floor(r()*max);
function randomRobots(r:()=>number):Robots {
  const occupied = new Set<string>();
  const robots = {} as Robots;
  for(const color of COLORS) {
    let p:Point;
    do { p = { x: rand(r,SIZE), y: rand(r,SIZE) }; } while(isCenter(p) || occupied.has(pkey(p)));
    robots[color]=p; occupied.add(pkey(p));
  }
  return robots;
}
/** Do not claim this solution is optimal; it is a constructive proof that puzzle is solvable. */
export function generatePuzzle(seed:number):Puzzle {
  const r = rng(seed);
  for(let attempt=0;attempt<150;attempt++) {
    const initial = randomRobots(r);
    const target = COLORS[rand(r,COLORS.length)];
    let current = cloneRobots(initial);
    const solution:Move[] = [];
    let targetMoves=0;
    const steps=5+rand(r,5);
    for(let i=0;i<steps;i++) {
      const options: Array<{move:Move;next:Robots}> = [];
      for(const color of COLORS) for(const direction of DIRS) {
        const next=slide(current,color,direction);
        if(next) options.push({move:{robot:color,direction},next});
      }
      if(!options.length) break;
      // Aim for a puzzle whose demonstrated solution moves the target several times.
      const targetOptions = options.filter(o=>o.move.robot===target);
      const pool=(i===steps-1 || (targetMoves<2 && i>steps-4)) && targetOptions.length ? targetOptions : options;
      const picked=pool[rand(r,pool.length)];
      current=picked.next;solution.push(picked.move);
      if(picked.move.robot===target) targetMoves++;
    }
    const goal=current[target];
    if(targetMoves<2 || samePoint(goal,initial[target]) || isCenter(goal)) continue;
    // Exclude puzzles solvable by one move from their starting state.
    if(DIRS.some(d=>{const n=slide(initial,target,d);return n&&samePoint(n[target],goal);} )) continue;
    return { seed,robots:initial,target,goal:{...goal},solution };
  }
  // Deterministic fallback: still always solvable with a known move.
  const initial:Robots={blue:{x:2,y:3},pink:{x:10,y:2},green:{x:4,y:12},yellow:{x:12,y:11},slate:{x:5,y:5}};
  const solution:Move[]=[{robot:'blue',direction:'right'}];
  const end=replay(initial,solution)!;
  return {seed,robots:initial,target:'blue',goal:end.blue,solution};
}
export const createSeed = () => Math.floor(Math.random()*2147483647)+1;
