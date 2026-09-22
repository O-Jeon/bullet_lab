import {useCallback,useEffect,useMemo,useState} from 'react';
import {COLORS,createSeed,generatePuzzle,replay,samePoint,slide,type Direction,type Move,type RobotColor,type Robots} from './engine';
import {BoardLegend,GameBoard,ICONS,LABELS,MoveControls,Objective,pad,useMoveKeyboard} from './GameBoard';

function initialSeed(){const v=Number(new URLSearchParams(window.location.search).get('seed'));return Number.isSafeInteger(v)&&v>0&&v<=2147483647?v:createSeed();}
function daySeed(){const d=new Date();return Number(`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`);}
function sameRobots(a:Robots,b:Robots){return COLORS.every(color=>samePoint(a[color],b[color]));}

export default function SoloGame(){
  const [seed,setSeed]=useState(initialSeed);
  const puzzle=useMemo(()=>generatePuzzle(seed),[seed]);
  const [robots,setRobots]=useState<Robots>(()=>puzzle.robots);
  const [selected,setSelected]=useState<RobotColor>(puzzle.target);
  const [history,setHistory]=useState<Array<{robots:Robots;move:Move}>>([]);
  const [mode,setMode]=useState<'timed'|'practice'>('timed');
  const [seconds,setSeconds]=useState(120);
  const [running,setRunning]=useState(false);
  const [status,setStatus]=useState<'playing'|'won'|'expired'>('playing');
  const [showHint,setShowHint]=useState(false);
  const [toast,setToast]=useState('');
  const [best,setBest]=useState<number|null>(null);
  const moveCount=history.length;
  const reset=useCallback((nextPuzzle=puzzle)=>{
    setRobots(nextPuzzle.robots);setSelected(nextPuzzle.target);setHistory([]);setSeconds(120);
    setRunning(false);setStatus('playing');setShowHint(false);
  },[puzzle]);
  useEffect(()=>{const url=new URL(window.location.href);url.searchParams.set('seed',String(seed));window.history.replaceState(null,'',url);reset(puzzle);
    const stored=window.localStorage.getItem(`bullet-lab-best-${seed}`);setBest(stored===null?null:Number(stored));},[seed,puzzle,reset]);
  useEffect(()=>{if(!running||status!=='playing'||mode!=='timed')return;
    const id=window.setInterval(()=>setSeconds(s=>Math.max(0,s-1)),1000);return()=>window.clearInterval(id);},[running,status,mode]);
  useEffect(()=>{if(seconds===0&&status==='playing'&&mode==='timed'){setStatus('expired');setRunning(false);}},[seconds,status,mode]);
  useEffect(()=>{if(!toast)return;const id=window.setTimeout(()=>setToast(''),3200);return()=>window.clearTimeout(id);},[toast]);
  const onMove=useCallback((direction:Direction)=>{
    if(status!=='playing')return;
    const next=slide(robots,selected,direction);
    if(!next){setToast('여기서는 움직일 수 없어!');return;}
    const nextCount=history.length+1;
    setHistory(h=>[...h,{robots,move:{robot:selected,direction}}]);setRobots(next);
    if(!running&&mode==='timed')setRunning(true);
    if(samePoint(next[puzzle.target],puzzle.goal)){
      setStatus('won');setRunning(false);
      if(best===null||nextCount<best){setBest(nextCount);window.localStorage.setItem(`bullet-lab-best-${seed}`,String(nextCount));}
    }
  },[status,robots,selected,history,running,mode,puzzle,best,seed]);
  const onSelect=useCallback((color:RobotColor)=>setSelected(color),[]);
  useMoveKeyboard(onMove,onSelect,status==='playing');
  function undo(){if(!history.length||status==='won')return;const item=history[history.length-1];setRobots(item.robots);setHistory(h=>h.slice(0,-1));}
  function changePuzzle(nextSeed:number){if(nextSeed===seed){reset();return;}setSeed(nextSeed);}
  async function share(){const url=new URL(window.location.href);url.searchParams.delete('room');url.searchParams.set('seed',String(seed));try{await navigator.clipboard.writeText(url.toString());setToast('같은 문제 링크를 복사했어!');}catch{window.prompt('아래 링크를 복사해 줘.',url.toString());}}
  const solutionPrefix=useMemo(()=>{
    const moves=history.map(h=>h.move);const expected=replay(puzzle.robots,moves);
    return expected!==null&&sameRobots(expected,robots)&&moves.every((m,i)=>puzzle.solution[i]?.robot===m.robot&&puzzle.solution[i]?.direction===m.direction);
  },[history,puzzle,robots]);
  const hint=solutionPrefix?puzzle.solution[moveCount]:undefined;
  return <><main className="page">
    <div className="intro"><div><div className="eyebrow">01 / SOLO PUZZLE</div><h1>총알탄 사나이<span className="title-dot">.</span></h1><p>벽이나 다른 로봇을 만날 때까지 미끄러져요. 목표에 최소 이동으로 도착해 봐!</p></div><div className="intro-counter"><span>현재 모드</span><strong>{mode==='timed'?'2분 챌린지':'자유 연습'}</strong></div></div>
    <div className="workspace">
      <section className="board-panel"><div className="panel-header"><div><span className="panel-index">GAME BOARD</span><h2>목표를 찾아라</h2></div><button className="icon-button" onClick={share}>↗ 문제 공유</button></div>
        <Objective puzzle={puzzle} code={String(seed).slice(-6).padStart(6,'0')}/>
        <GameBoard puzzle={puzzle} robots={robots} selected={selected} onSelect={onSelect} onMove={onMove} disabled={status!=='playing'}/><BoardLegend/>
      </section>
      <aside className="sidebar"><section className="stat-card"><div className="sidebar-label">YOUR SESSION <span className="live-dot"/></div>
        <div className="stats-grid"><div><span>남은 시간</span><strong className={seconds<=20&&mode==='timed'?'danger':''}>{mode==='timed'?`${pad(Math.floor(seconds/60))}:${pad(seconds%60)}`:'∞'}</strong></div><div><span>이동 횟수</span><strong>{pad(moveCount)}<small> MOVES</small></strong></div></div>
        <div className="timer-rail"><div style={{width:mode==='timed'?`${(seconds/120)*100}%`:'100%'}}/></div><div className="bestline"><span>이 문제의 내 최고 기록</span><b>{best===null?'아직 없음':`${best}회`}</b></div></section>
        <section className="control-card"><div className="sidebar-label">GAME MODE</div><div className="segment"><button className={mode==='timed'?'active':''} onClick={()=>{setMode('timed');reset();}}>⏱ 2분 챌린지</button><button className={mode==='practice'?'active':''} onClick={()=>{setMode('practice');reset();}}>◎ 자유 연습</button></div><div className="separator"/>
          <MoveControls selected={selected} onSelect={onSelect} onMove={onMove} disabled={status!=='playing'}/>
          <div className="action-row"><button onClick={undo} disabled={!history.length||status==='won'}>↶ 한 수 되돌리기</button><button onClick={()=>reset()}>⟲ 다시 시작</button></div></section>
        <section className="extra-card"><div className="sidebar-label">PUZZLE TOOLS</div><button className="new-puzzle" onClick={()=>changePuzzle(createSeed())}>새로운 문제 만들기 <span>↗</span></button><button className="daily-puzzle" onClick={()=>changePuzzle(daySeed())}>오늘의 퍼즐 열기 <span>☼</span></button>
          <button className="hint-trigger" onClick={()=>setShowHint(v=>!v)}>{showHint?'힌트 닫기':'힌트 보기'} <span>{showHint?'−':'+'}</span></button>{showHint&&<div className="hint-box">{hint?<>풀 수 있는 예시 경로의 다음 수: <b>{LABELS[hint.robot]} {ICONS[hint.direction]}</b></>:<>지금 경로는 준비된 예시와 달라. 다시 시작해 봐!</>}<small>예시 경로는 최단 경로가 아닐 수 있어.</small></div>}</section>
      </aside>
    </div>
    <section className="howto"><div className="sidebar-label">HOW TO PLAY</div><div className="howto-items"><div><span>01</span><b>로봇 선택</b><p>다른 색의 로봇도 움직일 수 있어.</p></div><div><span>02</span><b>끝까지 이동</b><p>모든 로봇의 이동이 횟수에 포함돼.</p></div><div><span>03</span><b>목표 달성</b><p>정해진 색을 G로 보내면 성공!</p></div></div></section>
  </main><footer>© BULLET LAB · 퍼즐 프로토타입 <span>MADE FOR LOGIC LOVERS</span></footer>
    {toast&&<div className="toast" role="status">{toast}</div>}
    {status!=='playing'&&<div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="게임 결과"><div className="result-card"><span className="result-emoji">{status==='won'?'✦':'◷'}</span><div className="eyebrow">{status==='won'?'MISSION COMPLETE':'TIME IS UP'}</div><h2>{status==='won'?'목표 달성!':'시간 종료!'}</h2><p>{status==='won'?`총 ${moveCount}번의 이동으로 성공했어.`:'2분이 지났어. 자유 연습으로 더 풀어볼래?'}</p><div className="result-actions"><button onClick={()=>reset()}>같은 문제 다시 하기</button><button onClick={()=>changePuzzle(createSeed())}>새 문제 도전 →</button>{status==='expired'&&<button onClick={()=>{setMode('practice');setStatus('playing');setSeconds(120);}}>시간제한 없이 이어하기</button>}</div></div></div>}
  </>;
}
