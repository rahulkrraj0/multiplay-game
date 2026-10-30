/* engine: screens, turn handling, rendering. Games plug in through registerGame(). */
const $=i=>document.getElementById(i),SC=['mode','net','lobby','gm'],show=id=>{SC.forEach(x=>$(x).classList.toggle('hide',x!==id));const room=$('room');if(room)room.classList.toggle('game-active',id==='gm')};
const COL=['#e0463c','#2fa05a','#2f6fd6','#e0b020'];let G,S,seat=-1,pick,sel=-1,np=2,ids=[],dead=new Set(),localBot=false,aiTimer,disconnectPending=false,displayName=readDisplayName(),gamePlayerNames=[];
const DISPLAY_NAME_KEY='playora.display-name.v1';
function cleanPlayerName(value){return Array.from(String(value||'').normalize('NFC').replace(/[^\p{L}\p{M}\p{N} ._'-]/gu,'').replace(/\s+/g,' ').trim()).slice(0,24).join('')}
function readDisplayName(){try{return cleanPlayerName(localStorage.getItem('playora.display-name.v1'))}catch(error){console.warn('[playora] Could not read the saved display name.',error);return''}}
const pendingNameActions=[];
function ensureDisplayName(onSaved){if(displayName)return true;if(onSaved)pendingNameActions.push(onSaved);const dialog=$('displayNameDialog');dialog.hidden=false;$('displayNameError').hidden=true;$('displayNameInput').focus();return false}
function saveDisplayName(event){event.preventDefault();const name=cleanPlayerName($('displayNameInput').value);if(!name){$('displayNameError').hidden=false;$('displayNameInput').focus();return}displayName=name;try{localStorage.setItem(DISPLAY_NAME_KEY,displayName)}catch(error){console.warn('[playora] Could not save the display name on this device.',error)}$('displayNameDialog').hidden=true;$('displayNameInput').value='';const actions=pendingNameActions.splice(0);actions.forEach(action=>action())}
function cancelDisplayName(){pendingNameActions.length=0;$('displayNameDialog').hidden=true;$('displayNameInput').value=''}
function requireDisplayName(action){if(displayName)return true;ensureDisplayName(action);return false}
const nameForm=$('displayNameForm');nameForm.addEventListener('submit',saveDisplayName);$('cancelDisplayName').onclick=cancelDisplayName;
function cleanGamePlayerNames(names){return Array.isArray(names)?names.map((name,index)=>cleanPlayerName(name)||'Player '+(index+1)):[]}
const playerLabel=t=>localBot&&t!==seat?'Computer':gamePlayerNames[t]||G.n[t]||'Player '+(t+1);
const nm=t=>playerLabel(t),canAct=()=>!S.over&&!disconnectPending&&(seat<0||seat===S.t);
function isLocalComputerGame(){return localBot}

const GAMES={};const registerGame=g=>GAMES[g.id]=g;
/* the game room is a full-screen panel over the homepage */
function openRoom(g){if(GAMES[g]?.catalogOnly){void window.ensurePlayoraGame(g).then(()=>openRoom(g)).catch(error=>{console.error('[playora] Could not load game:',error);$('playora-boot').textContent='Could not load this game. Check your connection and try again.'});return}$('topMic').classList.add('hide');$('topVideo').classList.add('hide');$('topMenu').classList.add('hide');$('room').classList.add('open');$('room').classList.toggle('ludo-game',g==='ludo');$('room').scrollTop=0;document.body.style.overflow='hidden';
 if(g==='join'){$('rt').textContent='Join a game';if(typeof resetJoinScreen==='function')resetJoinScreen();show('net');return}
 pick=g;const x=GAMES[g],max=x.max||2;$('rt').textContent=x.t;
 if(max===1){begin(g,1);return}
 $('mt').textContent='Choose how to play';
 const hasComputerOpponent=typeof x.bot==='function'||x.computer===true;
 $('ml').textContent='User vs Computer';$('ml').classList.toggle('hide',!hasComputerOpponent);
 $('ml').disabled=!hasComputerOpponent;
 $('localTwo').disabled=max<2;$('localTwo').classList.toggle('hide',max<2);
 $('mh').classList.toggle('hide',max<2);
 const options=[];if(hasComputerOpponent)options.push('play against the computer');if(max>=2)options.push('take turns on this device','create an online lobby');
 $('modeHint').textContent='Choose how to play: '+options.join(', or ')+'.';
 show('mode')}
function closeRoom(){if(typeof saveLastRoom==='function')saveLastRoom();leave();$('dice').classList.add('hide');$('topMic').classList.add('hide');$('topVideo').classList.add('hide');$('topMenu').classList.add('hide');$('room').classList.remove('open','ludo-game');document.body.style.overflow='';history.replaceState(null,'',location.pathname);window.scrollTo(0,0)}
/* ---------- CORE ---------- */
function render(){$('rl').disabled=false;const[h,s]=G.draw();$('bd').innerHTML=h;$('st').textContent=ids.length&&seat===99?'Spectating · '+(S.msg||s):S.msg||s;$('lg').textContent=typeof S.last==='string'?S.last:'';$('rl').classList.toggle('hide',!(G.roll&&canAct()&&G.cr()))}
/* begin(game, localPlayers, order): order = list of player ids when playing online (seat = position in the list) */
function activateGameRuntime(){if(typeof G.onStart==='function')G.onStart();if(ids.length&&typeof startGameChannels==='function')startGameChannels()}
function begin(g,n,order,vsComputer=false,playerNames){if(!requireDisplayName(()=>begin(g,n,order,vsComputer,playerNames)))return;if(G&&typeof G.onStop==='function')G.onStop();clearTimeout(aiTimer);localBot=vsComputer;disconnectPending=false;if(typeof clearDisconnectRecovery==='function')clearDisconnectRecovery();G=GAMES[g];pick=g;$('room').classList.toggle('ludo-game',g==='ludo');dead=new Set();sel=-1;clearInterval(dt);if(g==='ludo'){$('dice').classList.remove('hide');$('dice').textContent='🎲'}else $('dice').classList.add('hide');if(order){ids=order;np=Math.min(G.max||2,ids.length);seat=ids.indexOf(myId);if(seat<0||seat>=np)seat=99;gamePlayerNames=cleanGamePlayerNames(playerNames)}else{ids=[];np=n;seat=vsComputer?0:-1;gamePlayerNames=Array.from({length:np},(_,index)=>index===0?displayName:vsComputer?'Computer':'Player '+(index+1))}S=G.init();$('rt').textContent=G.t;show('gm');render();if(typeof updateGameControls==='function')updateGameControls();if(order&&room.code&&typeof saveLastRoom==='function')saveLastRoom();activateGameRuntime();scheduleBot()}
/* Keep disconnected seats from receiving a turn without treating a disconnect as a win. */
function fixTurn(){if(S.over||!dead.size)return;const alive=[...Array(np).keys()].filter(i=>!dead.has(i));if(alive.length<2)return;for(let k=0;k<np&&dead.has(S.t);k++){S.t=(S.t+1)%np;S.d=0}}
function act(a,remote){if(disconnectPending)return;if(!remote&&ids.length){if(typeof sendGameAction==='function')sendGameAction(a);else bcast({k:'a',a})}if(G.roll&&a.r!==undefined)showDice(a.r);const wasCleared=!!S.cleared;G.apply(a);fixTurn();sel=-1;if(window.playoraSound&&typeof window.playoraSound.playGame==='function'){const kind=S.over||(G.id==='watersort'&&S.cleared&&!wasCleared)?'win':(a.r!==undefined?'roll':'move');window.playoraSound.playGame(G.id,kind,a)}render();scheduleBot()}
function scheduleBot(){clearTimeout(aiTimer);if(!localBot||!G||!S||S.over||S.t===seat||typeof G.bot!=='function')return;
 const thinkingTime=900+Math.random()*900;
 aiTimer=setTimeout(()=>{aiTimer=undefined;if(!localBot||!G||!S||S.over||S.t===seat)return;const move=G.bot();if(move)act(move)},thinkingTime)}
$('bd').onclick=e=>{const el=e.target.closest('[data-i],[data-m]');if(el&&canAct())G.click(el)};
/* dice: offline or as host roll here; any other online player asks the host to roll for them (so a player cannot choose their own roll) */
const d6=()=>{const sides=G&&typeof G.rollSides==='function'?G.rollSides():6;let x;do x=crypto.getRandomValues(new Uint8Array(1))[0];while(x>=256-256%sides);return 1+x%sides};
let dt;const calm=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function showDice(r){const d=$('dice');clearInterval(dt);d.classList.remove('hide');if(calm()){d.textContent=r;return}
 let k=0;d.classList.add('roll');dt=setInterval(()=>{if(++k<7)d.textContent=1+Math.floor(Math.random()*6);else{clearInterval(dt);d.textContent=r;d.classList.remove('roll')}},70)}
$('rl').onclick=()=>{if(!ids.length||amHost())return act({r:d6()});const H=peers().find(C=>C.seat===hostSeat());if(H){$('rl').disabled=true;snd(H,{k:'rq'})}};
/* online: rolls are accepted only from the host, moves only from the player whose turn it is, and each game can add a valid(a) check */
const actOk=(C,a)=>{if(!a||typeof a!=='object'||S.over||disconnectPending)return false;if(G.hostSetup&&S.setup)return a.r===undefined&&C.seat===hostSeat()&&(!G.valid||G.valid(a));if(a.r!==undefined){if(C.seat!==hostSeat()||(G.roll&&!G.cr())||(!G.roll&&typeof G.valid!=='function'))return false}else if(ids.indexOf(C.id)!==S.t)return false;return !G.valid||G.valid(a)};
$('rx').onclick=$('bk').onclick=()=>{if(ids.length&&!confirm('Leave this game?'))return;closeRoom()};$('rs').onclick=()=>ids.length?(amHost()?startNet():alert('Only the host can restart')):begin(G.id,np,null,localBot);$('panelRestart').onclick=()=>$('rs').click();

$('mb').onclick=closeRoom;$('ml').onclick=()=>begin(pick,2,null,true);
$('localTwo').onclick=()=>begin(pick,2,null,false);
