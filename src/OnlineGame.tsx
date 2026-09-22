import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {io,type Socket} from 'socket.io-client';
import {QRCodeSVG} from 'qrcode.react';
import {samePoint,slide,type Direction,type Move,type RobotColor,type Robots} from './engine';
import {BoardLegend,GameBoard,MoveControls,Objective,pad,useMoveKeyboard} from './GameBoard';
import {sortResults,type Empty,type Result,type RoomSnapshot,type Seat,type SubmitResult} from './multiplayer';

function originalRoomCode(){return new URLSearchParams(window.location.search).get('room')?.toUpperCase().trim()??'';}
function savedNickname(){try{return window.localStorage.getItem('bullet-lab-nickname')??'';}catch{return '';}}
function seatKey(code:string){return `bullet-lab-seat-${code}`;}
function getToken(code:string){try{return window.sessionStorage.getItem(seatKey(code))??undefined;}catch{return undefined;}}
function setToken(code:string,token:string){try{window.sessionStorage.setItem(seatKey(code),token);}catch{/* private mode */}}
function clearToken(code:string){try{window.sessionStorage.removeItem(seatKey(code));}catch{/* private mode */}}
function setRoomUrl(code:string|null){const url=new URL(window.location.href);if(code)url.searchParams.set('room',code);else url.searchParams.delete('room');url.searchParams.delete('seed');window.history.replaceState(null,'',url);}

export default function OnlineGame(){
  const socketRef=useRef<Socket|null>(null);
  const activeCode=useRef<string|null>(null);
  const roundRef=useRef<string>('');
  const [connected,setConnected]=useState(false);
  const [room,setRoom]=useState<RoomSnapshot|null>(null);
  const [playerId,setPlayerId]=useState<string|null>(null);
  const [nickname,setNickname]=useState(savedNickname);
  const [joinCode,setJoinCode]=useState(originalRoomCode);
  const [loading,setLoading]=useState(false);
  const [toast,setToast]=useState('');
  const [now,setNow]=useState(Date.now());
  const [serverOffset,setServerOffset]=useState(0);
  const [robots,setRobots]=useState<Robots|null>(null);
  const [selected,setSelected]=useState<RobotColor>('blue');
  const [history,setHistory]=useState<Array<{robots:Robots;move:Move}>>([]);
  const [attempt,setAttempt]=useState<'playing'|'submitting'|'submitted'>('playing');
  const [submissionMessage,setSubmissionMessage]=useState('');

  const send=useCallback(async <T,>(event:string,payload:unknown):Promise<Result<T>>=>{
    const socket=socketRef.current;
    if(!socket?.connected)return {ok:false,error:'서버에 연결되지 않았어. 연결을 확인해 줘.'};
    try{return await socket.timeout(8_000).emitWithAck(event,payload) as Result<T>;}
    catch{return {ok:false,error:'서버 응답이 늦어지고 있어. 다시 시도해 줘.'};}
  },[]);
  const notify=useCallback((message:string)=>setToast(message),[]);
  const acceptSeat=useCallback((seat:Seat)=>{
    activeCode.current=seat.room.code;
    setToken(seat.room.code,seat.token);
    setRoomUrl(seat.room.code);
    setJoinCode(seat.room.code);
    setPlayerId(seat.playerId);
    setRoom(seat.room);
    setServerOffset(seat.room.serverTime-Date.now());
    try{window.localStorage.setItem('bullet-lab-nickname',nickname.trim());}catch{/* private mode */}
  },[nickname]);

  useEffect(()=>{
    const socket=io({path:'/socket.io',reconnection:true,reconnectionAttempts:Infinity,timeout:10_000});
    socketRef.current=socket;
    const onConnect=async()=>{
      setConnected(true);
      const code=activeCode.current;
      if(code){
        const token=getToken(code);
        if(token){
          try{
            const response=await socket.timeout(8_000).emitWithAck('room:join', {code,name:savedNickname()||'플레이어',token}) as Result<Seat>;
            if(response.ok){setPlayerId(response.data.playerId);setRoom(response.data.room);setServerOffset(response.data.room.serverTime-Date.now());}
            else{activeCode.current=null;setRoom(null);setPlayerId(null);setRoomUrl(null);notify(response.error+' 새 방을 만들거나 초대 코드를 다시 입력해 줘.');}
          }catch{notify('재접속에 실패했어. 잠시 후 다시 연결해 봐.');}
        }
      }
    };
    const onDisconnect=()=>setConnected(false);
    const onState=(snapshot:RoomSnapshot)=>{
      // Join acknowledgment may arrive after the first room update.
      if(activeCode.current===snapshot.code){setRoom(snapshot);setServerOffset(snapshot.serverTime-Date.now());}
    };
    const onError=()=>notify('연결이 불안정해. 네트워크와 서버 상태를 확인해 줘.');
    socket.on('connect',onConnect);socket.on('disconnect',onDisconnect);socket.on('room:state',onState);socket.on('connect_error',onError);
    if(socket.connected)void onConnect();
    return()=>{socket.off('connect',onConnect);socket.off('disconnect',onDisconnect);socket.off('room:state',onState);socket.off('connect_error',onError);socket.disconnect();socketRef.current=null;};
  },[notify]);

  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),250);return()=>window.clearInterval(id);},[]);
  useEffect(()=>{if(!toast)return;const id=window.setTimeout(()=>setToast(''),4100);return()=>window.clearTimeout(id);},[toast]);
  useEffect(()=>{
    if(room?.puzzle){
      const key=`${room.code}:${room.round}`;
      if(roundRef.current!==key){
        roundRef.current=key;setRobots(room.puzzle.robots);setSelected(room.puzzle.target);setHistory([]);setAttempt('playing');setSubmissionMessage('');
      }
    }
  },[room]);
  const serverNow=now+serverOffset;
  const countdown=room?.startsAt?Math.max(0,Math.ceil((room.startsAt-serverNow)/1000)):0;
  const seconds=room?.endsAt?Math.max(0,Math.ceil((room.endsAt-Math.max(serverNow,room.startsAt??serverNow))/1000)):120;
  const canPlay=Boolean(connected&&room?.stage==='playing'&&countdown===0&&seconds>0&&attempt==='playing'&&robots&&room.puzzle);
  const isHost=Boolean(room?.players.find(p=>p.id===playerId)?.isHost);
  const me=room?.players.find(p=>p.id===playerId);
  const ordered=useMemo(()=>room?.players.slice().sort(sortResults)??[],[room]);
  const inviteUrl=room?`${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room.code)}`:'';
  const localhostInvite=typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location.hostname);

  async function createRoom(){
    if(!nickname.trim()){notify('닉네임을 먼저 입력해 줘.');return;}
    setLoading(true);
    const response=await send<Seat>('room:create',{name:nickname});
    setLoading(false);
    if(response.ok)acceptSeat(response.data);else notify(response.error);
  }
  async function joinRoom(){
    if(!nickname.trim()){notify('닉네임을 먼저 입력해 줘.');return;}
    const code=joinCode.toUpperCase().replace(/\s/g,'');
    if(code.length!==6){notify('6자리 초대 코드를 입력해 줘.');return;}
    setLoading(true);
    const response=await send<Seat>('room:join',{code,name:nickname,token:getToken(code)});
    setLoading(false);
    if(response.ok)acceptSeat(response.data);else notify(response.error);
  }
  async function leave(){
    const code=activeCode.current;
    if(!code)return;
    const response=await send<Empty>('room:leave',{});
    if(!response.ok&&connected){notify(response.error);return;}
    clearToken(code);activeCode.current=null;roundRef.current='';setRoom(null);setPlayerId(null);setRobots(null);setRoomUrl(null);
    notify('방에서 나왔어.');
  }
  async function start(){
    const response=await send<Empty>('room:start',{});
    if(!response.ok)notify(response.error);
  }
  async function rematch(){
    const response=await send<Empty>('room:rematch',{});
    if(!response.ok)notify(response.error);
  }
  async function copyInvite(){
    try{await navigator.clipboard.writeText(inviteUrl);notify('초대 링크를 복사했어!');}
    catch{window.prompt('초대 링크를 복사해 줘.',inviteUrl);}
  }
  const resetAttempt=useCallback(()=>{
    if(!room?.puzzle)return;
    setRobots(room.puzzle.robots);setSelected(room.puzzle.target);setHistory([]);setAttempt('playing');setSubmissionMessage('');
  },[room]);
  const onMove=useCallback((direction:Direction)=>{
    if(!canPlay||!room?.puzzle||!robots)return;
    const next=slide(robots,selected,direction);
    if(!next){notify('여기서는 움직일 수 없어!');return;}
    const move:Move={robot:selected,direction};
    const moves=[...history.map(h=>h.move),move];
    setHistory(h=>[...h,{robots,move}]);setRobots(next);
    if(samePoint(next[room.puzzle.target],room.puzzle.goal)){
      setAttempt('submitting');setSubmissionMessage('정답을 서버에서 확인하는 중…');
      void send<SubmitResult>('room:submit',{moves}).then(response=>{
        setAttempt('submitted');
        if(response.ok)setSubmissionMessage(response.data.improved?`제출 완료! 현재 내 최고 기록 ${response.data.bestMoves}회`:`제출 완료! 내 최고 기록은 ${response.data.bestMoves}회야.`);
        else setSubmissionMessage(`서버 제출 실패: ${response.error}`);
      });
    }
  },[canPlay,room,robots,selected,history,notify,send]);
  const onSelect=useCallback((color:RobotColor)=>setSelected(color),[]);
  useMoveKeyboard(onMove,onSelect,Boolean(room?.stage==='playing'&&countdown===0&&seconds>0));
  function undo(){
    if(!history.length||!canPlay)return;
    const item=history[history.length-1];setRobots(item.robots);setHistory(h=>h.slice(0,-1));
  }

  return <><main className="page">
    <div className="intro"><div><div className="eyebrow">02 / ONLINE MULTIPLAYER</div><h1>함께 겨뤄보자<span className="title-dot">.</span></h1><p>모두 같은 퍼즐을 풀고, 2분 안에 더 적은 이동 횟수에 도전해 봐.</p></div>
      <div className="intro-counter"><span>실시간 서버</span><strong className={connected?'connection-good':'connection-bad'}>{connected?'● 연결됨':'○ 연결 중…'}</strong></div></div>
    {!room&&<div className="online-entry">
      <section className="entry-card entry-primary"><div className="eyebrow">CREATE OR JOIN</div><h2>친구들과 한 판!</h2><p>회원가입 없이 닉네임만 입력하면 돼. 방을 만들고 QR코드를 보내 줘.</p>
        <label className="field-label" htmlFor="player-name">내 닉네임</label>
        <input id="player-name" maxLength={16} placeholder="닉네임 (최대 16자)" value={nickname} onChange={e=>setNickname(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void createRoom();}}/>
        <button className="new-puzzle create-button" disabled={loading||!connected} onClick={createRoom}>+ 새 방 만들기 <span>↗</span></button>
        <div className="entry-separator"><span>또는 초대받았다면</span></div>
        <label className="field-label" htmlFor="join-code">6자리 초대 코드</label>
        <div className="join-row"><input id="join-code" placeholder="ABC234" maxLength={6} value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,''))} onKeyDown={e=>{if(e.key==='Enter')void joinRoom();}}/><button disabled={loading||!connected} onClick={joinRoom}>입장하기 →</button></div>
      </section>
      <section className="entry-card entry-explain"><div className="eyebrow">MATCH RULES</div><h2>대전은 이렇게 진행돼</h2>
        <div className="rule-item"><span>01</span><div><b>2~8명 입장</b><p>한 명이 방을 만들고 초대 코드나 QR을 공유해.</p></div></div>
        <div className="rule-item"><span>02</span><div><b>3초 카운트다운</b><p>방장이 시작하면 전원에게 똑같은 퍼즐이 주어져.</p></div></div>
        <div className="rule-item"><span>03</span><div><b>2분 동안 재도전</b><p>성공하면 풀이가 서버에 기록돼. 다시 풀어 기록을 줄일 수도 있어.</p></div></div>
        <div className="rule-item"><span>04</span><div><b>최소 이동 횟수 승리</b><p>동률이면 먼저 정답을 제출한 사람이 앞서.</p></div></div>
      </section>
    </div>}
    {room?.stage==='lobby'&&<div className="lobby-grid">
      <section className="entry-card"><div className="eyebrow">WAITING ROOM / {room.code}</div><h2>친구들이 모이는 중</h2><p>방장만 시작할 수 있고, 2명 이상 모이면 게임을 시작할 수 있어.</p>
        <div className="lobby-topline"><span>참가 인원</span><strong>{room.players.filter(p=>p.connected).length} / 8</strong></div>
        <div className="lobby-players">{room.players.map(player=><div className={`player-tile ${player.connected?'':'player-offline'}`} key={player.id}><span className="player-avatar">{player.name.slice(0,1).toUpperCase()}</span><div><b>{player.name}{player.id===playerId?' (나)':''}</b><small>{player.isHost?'방장':player.connected?'준비 완료':'연결 끊김'}</small></div><span className="presence-dot"/></div>)}</div>
        <div className="lobby-actions">{isHost&&<button className="new-puzzle" onClick={start} disabled={!connected||room.players.filter(p=>p.connected).length<2}>모두 준비됐어! 게임 시작 <span>→</span></button>}
          {!isHost&&<div className="waiting-host">방장이 게임을 시작하기를 기다리는 중…</div>}
          <button className="quiet-button" onClick={leave}>방 나가기</button></div>
      </section>
      <section className="entry-card invite-card"><div className="eyebrow">SCAN & JOIN</div><h2>QR로 친구 초대하기</h2><div className="qr-frame"><QRCodeSVG value={inviteUrl} size={208} level="M" marginSize={1} fgColor="#172033"/></div>
        <div className="invite-code-label">ROOM CODE</div><div className="invite-code">{room.code}</div>
        <button className="invite-copy" onClick={copyInvite}>↗ 초대 링크 복사</button>
        {localhostInvite&&<p className="local-tip">다른 기기에서 QR로 접속하려면 같은 Wi-Fi의 PC IP 주소로 접속하거나 웹에 배포해야 해. 현재의 localhost 주소는 다른 기기에서 열리지 않아.</p>}
        <p className="invite-url">{inviteUrl}</p>
      </section>
    </div>}
    {room&&room.stage!=='lobby'&&room.puzzle&&<>
      <div className="match-banner"><span>{room.stage==='playing'?'● LIVE MATCH':'◈ ROUND COMPLETE'}</span><b>방 {room.code}</b><button onClick={leave}>나가기</button></div>
      <div className="workspace">
        <section className="board-panel"><div className="panel-header"><div><span className="panel-index">ROUND {pad(room.round)} / SAME BOARD FOR EVERYONE</span><h2>{room.stage==='finished'?'경기 종료':'2분 최단 경로 대전'}</h2></div><span className="match-count">{room.players.length}명 플레이 중</span></div>
          <Objective puzzle={room.puzzle} code={room.code}/>
          <div className="online-board-container"><GameBoard puzzle={room.puzzle} robots={robots??room.puzzle.robots} selected={selected} onSelect={onSelect} onMove={onMove} disabled={!canPlay}/>
            {room.stage==='playing'&&countdown>0&&<div className="countdown-mask"><span>READY?</span><strong>{countdown}</strong><small>잠시 후 동시에 시작해!</small></div>}
            {room.stage==='finished'&&<div className="countdown-mask finished-mask"><span>TIME UP</span><strong>종료!</strong><small>오른쪽에서 최종 기록을 확인해.</small></div>}
          </div><BoardLegend/>
        </section>
        <aside className="sidebar"><section className="stat-card"><div className="sidebar-label">LIVE SESSION <span className="live-dot"/></div>
          <div className="stats-grid"><div><span>남은 시간</span><strong className={seconds<=20?'danger':''}>{pad(Math.floor(seconds/60))}:{pad(seconds%60)}</strong></div><div><span>이번 시도</span><strong>{pad(history.length)}<small> MOVES</small></strong></div></div>
          <div className="timer-rail"><div style={{width:`${seconds/120*100}%`}}/></div><div className="bestline"><span>서버에 기록된 내 최고 기록</span><b>{me?.bestMoves===null||!me?'아직 없음':`${me.bestMoves}회`}</b></div></section>
          <section className="control-card">
            {room.stage==='finished'?<><div className="sidebar-label">FINAL RESULTS</div><h2 className="result-heading">이번 경기 결과</h2><p className="hint-desc">성공한 플레이어는 이동 횟수 순서로 정렬돼. 동률이면 제출 시간이 빨랐던 순서야.</p></>
              :<>{attempt!=='playing'&&<div className="submitted-banner"><b>{attempt==='submitting'?'정답 확인 중…':'이번 풀이 완료'}</b><p>{submissionMessage}</p><button onClick={resetAttempt} disabled={seconds===0||!connected||attempt==='submitting'}>처음부터 다시 도전 ↻</button></div>}
                <MoveControls selected={selected} onSelect={onSelect} onMove={onMove} disabled={!canPlay}/>
                <div className="action-row"><button onClick={undo} disabled={!canPlay||!history.length}>↶ 한 수 되돌리기</button><button onClick={resetAttempt} disabled={!connected||seconds===0}>⟲ 이번 시도 초기화</button></div></>}
          </section>
          <section className="extra-card"><div className="sidebar-label">{room.stage==='finished'?'FINAL SCOREBOARD':'LIVE SCOREBOARD'}</div><div className="scoreboard">{ordered.map((player,index)=><div key={player.id} className={`score-row ${player.id===playerId?'my-score':''}`}><span className="score-rank">{player.bestMoves===null?'—':String(index+1).padStart(2,'0')}</span><div><b>{player.name}{player.id===playerId?' (나)':''}</b><small>{player.connected?'온라인':'연결 끊김'}</small></div><strong>{player.bestMoves===null?'도전 중':`${player.bestMoves}회`}</strong></div>)}</div>
            {room.stage==='finished'&&<div className="lobby-actions">{isHost?<button className="new-puzzle" onClick={rematch} disabled={!connected||room.players.filter(p=>p.connected).length<2}>다음 경기 준비 →</button>:<div className="waiting-host">방장이 다음 경기를 준비하기를 기다리는 중…</div>}<button className="quiet-button" onClick={leave}>방 나가기</button></div>}
          </section>
        </aside>
      </div>
    </>}
    <section className="howto"><div className="sidebar-label">ONLINE MATCH GUIDE</div><div className="howto-items"><div><span>01</span><b>각자 독립된 게임판</b><p>로봇 이동은 다른 플레이어의 게임판에 영향을 주지 않아.</p></div><div><span>02</span><b>서버에서 기록 검증</b><p>제출한 모든 이동을 서버가 다시 실행해 결과를 확인해.</p></div><div><span>03</span><b>2분이 끝나면 결과 발표</b><p>먼저 성공했더라도 다른 사람이 더 적은 횟수로 성공할 수 있어.</p></div></div></section>
  </main><footer>© BULLET LAB · QR FRIEND MATCH <span>NO LOGIN REQUIRED · UP TO 8 PLAYERS</span></footer>
  {toast&&<div className="toast" role="status">{toast}</div>}
  </>;
}
