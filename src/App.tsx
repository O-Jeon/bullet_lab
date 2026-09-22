import {useState} from 'react';
import SoloGame from './SoloGame';
import OnlineGame from './OnlineGame';

type Screen='solo'|'online';
export default function App(){
  const [screen,setScreen]=useState<Screen>(()=>new URLSearchParams(window.location.search).has('room')?'online':'solo');
  const pick=(next:Screen)=>{
    if(next==='solo'){
      const url=new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.replaceState(null,'',url);
    }
    setScreen(next);
  };
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" onClick={event=>{event.preventDefault();pick('solo');}}><span className="brand-icon">✳</span><span>BULLET<span className="brand-light">LAB</span></span><span className="brand-beta">BETA 0.4</span></a>
      <nav className="top-nav" aria-label="게임 모드"><button className={screen==='solo'?'active':''} onClick={()=>pick('solo')}>혼자 하기</button><button className={screen==='online'?'active':''} onClick={()=>pick('online')}>친구 · 랜덤 대전 <span className="live-dot"/></button></nav>
    </header>
    {screen==='solo'?<SoloGame/>:<OnlineGame/>}
  </div>;
}
