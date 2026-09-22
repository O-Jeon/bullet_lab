import {useRef} from 'react';
import {COLORS,getWallSegments,isCenter,SIZE,type Direction,type RobotColor,type Robots} from './engine';
import type {PublicPuzzle} from './multiplayer';

export const LABELS:Record<RobotColor,string>={blue:'블루',pink:'핑크',green:'그린',yellow:'옐로',slate:'차콜'};
export const HEX:Record<RobotColor,string>={blue:'#4b9ce5',pink:'#ef7fbb',green:'#55b77a',yellow:'#f1c44a',slate:'#64748b'};
export const ICONS:Record<Direction,string>={up:'↑',down:'↓',left:'←',right:'→'};
export const pad=(n:number)=>String(n).padStart(2,'0');
const CELL=640/SIZE;
const CENTER=(SIZE/2-1)*CELL;

type Props={puzzle:PublicPuzzle;robots:Robots;selected:RobotColor;onSelect:(color:RobotColor)=>void;onMove:(direction:Direction)=>void;disabled?:boolean};

export function GameBoard({puzzle,robots,selected,onSelect,onMove,disabled=false}:Props){
  const gestureStart=useRef<{x:number;y:number}|null>(null);
  return <div className="board-wrap">
    <svg className="gameboard" viewBox="0 0 640 640" role="img"
      aria-label={`${SIZE}×${SIZE} 게임판. 로봇을 선택한 후 방향 버튼이나 키보드 방향키로 움직이세요.`}
      onTouchStart={e=>{gestureStart.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}}
      onTouchEnd={e=>{if(disabled||!gestureStart.current)return;const dx=e.changedTouches[0].clientX-gestureStart.current.x,dy=e.changedTouches[0].clientY-gestureStart.current.y;gestureStart.current=null;if(Math.max(Math.abs(dx),Math.abs(dy))<26)return;onMove(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));}}>
      <rect x="0" y="0" width="640" height="640" rx="12" fill="#eef3f8"/>
      {Array.from({length:SIZE*SIZE},(_,i)=>{const x=i%SIZE,y=Math.floor(i/SIZE);return <rect key={i} x={x*CELL+1.5} y={y*CELL+1.5} width={CELL-3} height={CELL-3} rx="2" fill={isCenter({x,y})?'#344155':'#fff'}/>;})}
      <rect x={CENTER+2} y={CENTER+2} width={2*CELL-4} height={2*CELL-4} rx="4" fill="#344155"/>
      <text x="320" y="317" fontSize="12" textAnchor="middle" fill="#f9fafb" fontWeight="800" letterSpacing="1.8">BULLET</text>
      <text x="320" y="335" fontSize="13" textAnchor="middle" fill="#a9cff2" fontWeight="800" letterSpacing="2">LAB</text>
      {getWallSegments().map(([x,y,d],i)=>{const right=d==='right',down=d==='down';const x1=right?(x+1)*CELL:x*CELL;const y1=down?(y+1)*CELL:y*CELL;const x2=right?x1:(x+1)*CELL;const y2=down?y1:(y+1)*CELL;return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#394455" strokeWidth={CELL*.17} strokeLinecap="square"/>;})}
      <rect x={puzzle.goal.x*CELL+CELL*.18} y={puzzle.goal.y*CELL+CELL*.18} width={CELL*.64} height={CELL*.64} rx="5" fill="#e99239" stroke="#fff" strokeWidth="2"/>
      <text x={puzzle.goal.x*CELL+CELL/2} y={puzzle.goal.y*CELL+CELL*.70} textAnchor="middle" fontSize={CELL*.54} fontWeight="900" fill="#fff">G</text>
      {COLORS.map(color=>{const p=robots[color];const active=selected===color;return <g key={color} role="button" aria-label={`${LABELS[color]} 로봇 선택`} tabIndex={0}
        onClick={()=>onSelect(color)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(color);}}} style={{cursor:'pointer'}}>
        {active&&<circle cx={p.x*CELL+CELL/2} cy={p.y*CELL+CELL/2} r={CELL*.46} fill="none" stroke={HEX[color]} strokeWidth="3" strokeDasharray="4 3"/>}
        <circle cx={p.x*CELL+CELL/2} cy={p.y*CELL+CELL/2} r={CELL*.36} fill={HEX[color]} stroke="#fff" strokeWidth="3"/>
        <line x1={p.x*CELL+CELL*.39} y1={p.y*CELL+CELL*.69} x2={p.x*CELL+CELL*.61} y2={p.y*CELL+CELL*.31} stroke="#172033" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx={p.x*CELL+CELL/2} cy={p.y*CELL+CELL/2} r={CELL*.46} fill="transparent"/>
      </g>;})}
    </svg>
  </div>;
}

export function MoveControls({selected,onSelect,onMove,disabled=false}:Pick<Props,'selected'|'onSelect'|'onMove'|'disabled'>){
  return <>
    <div className="sidebar-label">SELECT ROBOT <small>NUMBER 1–5</small></div>
    <div className="robot-options">{COLORS.map((color,i)=><button key={color} className={`robot-option ${selected===color?'selected':''}`} onClick={()=>onSelect(color)} aria-pressed={selected===color}>
      <span className="small-robot" style={{background:HEX[color]}}/><span>{LABELS[color]}</span><kbd>{i+1}</kbd></button>)}</div>
    <div className="separator"/>
    <div className="sidebar-label">MOVE ROBOT <small>ARROWS / WASD</small></div>
    <div className="move-control"><button aria-label="위로" className="up" disabled={disabled} onClick={()=>onMove('up')}>↑</button>
      <button aria-label="왼쪽으로" className="left" disabled={disabled} onClick={()=>onMove('left')}>←</button>
      <div className="control-center"><span className="small-robot" style={{background:HEX[selected]}}/></div>
      <button aria-label="오른쪽으로" className="right" disabled={disabled} onClick={()=>onMove('right')}>→</button>
      <button aria-label="아래로" className="down" disabled={disabled} onClick={()=>onMove('down')}>↓</button></div>
  </>;
}

export function Objective({puzzle,code}: {puzzle:PublicPuzzle;code?:string}){
  return <div className="objective"><span className="objective-dot" style={{background:HEX[puzzle.target]}}/>
    <span><b>{LABELS[puzzle.target]}</b> 로봇을 <b>G</b> 지점으로 이동시키세요</span>
    {code&&<span className="objective-code">#{code}</span>}</div>;
}

export function BoardLegend(){return <div className="board-bottom"><div>↖ 로봇을 선택한 다음 방향을 입력하세요</div><div className="board-bottom-legend"><span className="legend-wall"/> 벽 <span className="legend-goal">G</span> 목표</div></div>;}

export function useMoveKeyboard(onMove:(direction:Direction)=>void,onSelect:(color:RobotColor)=>void,enabled=true){
  // Defined as a separate hook so solo and online share keyboard controls.
  // Implemented below to avoid recreating global key handlers on each keypress.
  useKeyboardImpl(onMove,onSelect,enabled);
}

import {useEffect} from 'react';
function useKeyboardImpl(onMove:(d:Direction)=>void,onSelect:(c:RobotColor)=>void,enabled:boolean){
  useEffect(()=>{
    if(!enabled)return;
    const handler=(event:KeyboardEvent)=>{
      if(event.target instanceof HTMLElement&&['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
      const directions:Record<string,Direction>={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
      const direction=directions[event.key];
      if(direction){event.preventDefault();onMove(direction);}
      if(/^[1-5]$/.test(event.key))onSelect(COLORS[Number(event.key)-1]);
    };
    window.addEventListener('keydown',handler);
    return()=>window.removeEventListener('keydown',handler);
  },[onMove,onSelect,enabled]);
}
