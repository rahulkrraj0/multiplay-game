/* engine: screens, turn handling, rendering. Games plug in through registerGame(). */
const $=i=>document.getElementById(i),SC=['mode','net','lobby','gm'],show=id=>{SC.forEach(x=>$(x).classList.toggle('hide',x!==id));const room=$('room');if(room){room.classList.toggle('game-active',id==='gm');if(id==='gm')room.scrollTop=0}};
const COL=['#e0463c','#2fa05a','#2f6fd6','#e0b020'];let G,S,seat=-1,pick,sel=-1,np=2,ids=[],dead=new Set(),localBot=false,aiTimer,disconnectPending=false,displayName=readDisplayName(),gamePlayerNames=[],homeScrollY=0;
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
const CARD_GAME_IDS=new Set(['poker','rummy','teenpatti','joker-duel','bluff','callbreak','crazyeights','hearts','spades']);
const COMPUTER_NAMES=['Aarav','Arjun','Kiran','Rohan','Rahul','Nisha','Meera','Priya','Kabir','Ishaan','Vikram','Ananya','Sanjay','Devika','Neelam','Manish','Akshay','Harish','Varsha','Aditi','Pooja','Suresh','Karthik','Nandini','Ritika','Shreya'];
function randomComputerName(){return COMPUTER_NAMES[Math.floor(Math.random()*COMPUTER_NAMES.length)]}
const isComputerOpponent=t=>localBot&&t!==seat&&CARD_GAME_IDS.has(G&&G.id);
const playerLabel=t=>{if(isComputerOpponent(t)){if(!gamePlayerNames[t]||gamePlayerNames[t]==='Computer')gamePlayerNames[t]=randomComputerName();return gamePlayerNames[t]}return gamePlayerNames[t]||G.n[t]||'Player '+(t+1)};
const computerBadge=t=>isComputerOpponent(t)?'<span class="game-computer" role="img" aria-label="Computer opponent" title="Computer opponent">🤖</span> ':"";
const nm=t=>playerLabel(t),canAct=()=>!S.over&&!disconnectPending&&(seat<0||seat===S.t||(ids.length&&typeof amHost==='function'&&amHost()&&dead.has(S.t)));
function isLocalComputerGame(){return localBot}

const GAMES={};const registerGame=g=>GAMES[g.id]=g;
let activeStandaloneCleanup=null;
function disposeStandaloneGame(){const cleanup=activeStandaloneCleanup;activeStandaloneCleanup=null;if(cleanup)cleanup()}
/* the game room is a full-screen panel over the homepage */
function openRoom(g){if(GAMES[g]?.catalogOnly){void window.ensurePlayoraGame(g).then(()=>openRoom(g)).catch(error=>{console.error('[playora] Could not load game:',error);$('playora-boot').textContent='Could not load this game. Check your connection and try again.'});return}if(!$('room').classList.contains('open'))homeScrollY=window.scrollY;$('topMic').classList.add('hide');$('topVideo').classList.add('hide');$('topMenu').classList.add('hide');$('room').classList.add('open');$('room').classList.toggle('ludo-game',g==='ludo');$('room').scrollTop=0;document.body.style.overflow='hidden';
 $('room').classList.remove('embedded-game');
 $('bd').classList.remove('embedded-game-board');
 if(g==='join'){$('rt').textContent='Join a game';if(typeof resetJoinScreen==='function')resetJoinScreen();show('net');return}
 pick=g;const x=GAMES[g],max=x.max||2;$('rt').textContent=x.t;
 if(x.standalone){disposeStandaloneGame();$('room').classList.add('standalone-game');$('rx').classList.remove('hide');$('bk').classList.add('hide');$('rs').classList.add('hide');$('reconnect').classList.add('hide');$('dice').classList.add('hide');$('rl').classList.add('hide');$('lg').textContent='';$('st').textContent='';$('bd').innerHTML='<div class="standalone-game-host"></div>';show('gm');const mounted=x.mount($('bd').firstElementChild);if(typeof mounted==='function')activeStandaloneCleanup=mounted;else if(mounted&&typeof mounted.dispose==='function')activeStandaloneCleanup=()=>mounted.dispose();return}
 disposeStandaloneGame();$('room').classList.remove('standalone-game');
 if(x.hostedUI){$('room').classList.add('embedded-game');$('bd').classList.add('embedded-game-board')}
 if(max===1){begin(g,1);return}
 $('mt').textContent='Choose how to play';
 const hasComputerOpponent=typeof x.bot==='function'||x.computer===true;
 $('ml').textContent=g==='bluff'?'Play vs computers':'User vs Computer';$('ml').classList.toggle('hide',!hasComputerOpponent);
 $('ml').disabled=!hasComputerOpponent;
 $('localTwo').disabled=max<2;$('localTwo').classList.toggle('hide',max<2);
 $('mh').classList.toggle('hide',max<2);
 const options=[];if(hasComputerOpponent)options.push('play against the computer');if(max>=2)options.push('take turns on this device','create an online lobby');
 $('modeHint').textContent='Choose how to play: '+options.join(', or ')+'.';
 show('mode')}
function closeRoom(){const wasStandalone=$('room').classList.contains('standalone-game');disposeStandaloneGame();clearTimeout(aiTimer);aiTimer=undefined;localBot=false;$('room').classList.remove('standalone-game','embedded-game','game-active');$('bd').classList.remove('embedded-game-board');if(wasStandalone)$('bd').innerHTML='';if(typeof saveLastRoom==='function')saveLastRoom();if(typeof clearAutoRejoin==='function')clearAutoRejoin();leave();$('dice').classList.add('hide');$('topMic').classList.add('hide');$('topVideo').classList.add('hide');$('topMenu').classList.add('hide');$('room').classList.remove('open','ludo-game','chess-game','spades-game');document.body.style.overflow='';history.replaceState(null,'',location.pathname);requestAnimationFrame(()=>window.scrollTo({top:homeScrollY,behavior:'instant'}))}
/* ---------- CORE ---------- */
function stackHandCards(root){root.querySelectorAll('.hand').forEach(hand=>hand.querySelectorAll('.card').forEach((card,index)=>{const order=Number(card.dataset.selectedOrder);card.style.zIndex=String(card.classList.contains('sel')?(Number.isInteger(order)?100000+order:100000+index):card.classList.contains('ok')?10000+index:index+1)}))}
window.playoraStackHandCards=stackHandCards;
function render(){$('rl').disabled=false;const[h,s]=G.draw();$('bd').innerHTML=h;stackHandCards($('bd'));$('st').textContent=ids.length&&seat===99?'Spectating · '+(S.msg||s):S.msg||s;$('lg').textContent=typeof S.last==='string'?S.last:'';$('rl').classList.toggle('hide',!(G.roll&&canAct()&&G.cr()))}
/* begin(game, localPlayers, order): order = list of player ids when playing online (seat = position in the list) */
function activateGameRuntime(){if(typeof G.onStart==='function')G.onStart();if(ids.length&&typeof startGameChannels==='function')startGameChannels()}
function syncGameLayout(game){const isLudo=game==='ludo';$('room').classList.toggle('ludo-game',isLudo);$('room').classList.toggle('chess-game',game==='chess');$('room').classList.toggle('spades-game',game==='spades');const dice=$('dice');if(isLudo){dice.classList.remove('hide');dice.textContent=S&&S.die||'🎲'}else dice.classList.add('hide')}
function begin(g,n,order,vsComputer=false,playerNames,isRestart=false){if(!requireDisplayName(()=>begin(g,n,order,vsComputer,playerNames,isRestart)))return;const previousState=isRestart&&G===GAMES[g]?S:null;if(G&&typeof G.onStop==='function')G.onStop();clearTimeout(aiTimer);localBot=vsComputer;disconnectPending=false;if(typeof clearDisconnectRecovery==='function')clearDisconnectRecovery();G=GAMES[g];pick=g;dead=new Set();sel=-1;clearInterval(dt);if(order){ids=order;np=Math.min(G.max||2,Math.max(ids.length,Number(activeLimit)||ids.length));seat=ids.indexOf(myId);if(seat<0||seat>=np)seat=99;gamePlayerNames=cleanGamePlayerNames(playerNames);while(gamePlayerNames.length<np)gamePlayerNames.push('Computer '+(gamePlayerNames.length-ids.length+1));gamePlayerNames.length=np}else{ids=[];np=n;seat=vsComputer?0:-1;gamePlayerNames=Array.from({length:np},(_,index)=>index===0?displayName:vsComputer?'Computer':'Player '+(index+1))}S=G.init(previousState);if(ids.length&&typeof persistPreviousGame==='function')persistPreviousGame();syncGameLayout(g);$('rt').textContent=G.t;show('gm');render();if(typeof updateGameControls==='function')updateGameControls();if(order&&room.code&&typeof saveLastRoom==='function')saveLastRoom();if(window.playoraSound&&typeof window.playoraSound.playGame==='function')window.playoraSound.playGame(g,'start');activateGameRuntime();scheduleBot()}
/* Keep disconnected seats from receiving a turn without treating a disconnect as a win. */
function fixTurn(){if(S.over||!dead.size)return;const alive=[...Array(np).keys()].filter(i=>!dead.has(i));if(alive.length<2)return;for(let k=0;k<np&&dead.has(S.t);k++){S.t=(S.t+1)%np;S.d=0}}
function act(a,remote){if(disconnectPending)return;if(!remote&&ids.length){if(typeof sendGameAction==='function')sendGameAction(a);else bcast({k:'a',a})}if(G.roll&&a.r!==undefined)showDice(a.r);const wasCleared=!!S.cleared,soundState=G.id==='ludo'&&Array.isArray(S.p)?{p:S.p.map(tokens=>tokens.slice())}:null;G.apply(a);fixTurn();sel=-1;if(ids.length&&typeof persistPreviousGame==='function')persistPreviousGame();if(window.playoraSound&&typeof window.playoraSound.playGame==='function'){const ended=!!S.over||(G.id==='watersort'&&S.cleared&&!wasCleared);let events=[ended?(S.win===-1?'draw':'win'):(a.r!==undefined?'roll':'move')];if(ended&&events[0]==='win'&&ids.length&&seat>=0&&seat<np){const winner=Number.isInteger(S.win)?S.win:Number.isInteger(S.winner)?S.winner:null;if(winner!==null&&winner!==seat)events[0]='loss'}if(!ended&&typeof G.soundEvents==='function'){const result=G.soundEvents(a,soundState,S);if(Array.isArray(result))events=result;else if(typeof result==='string')events=[result]}else if(!ended&&typeof G.soundEvent==='function'){const result=G.soundEvent(a,soundState,S);if(result)events=[result]}events.forEach(event=>window.playoraSound.playGame(G.id,event,a))}render();scheduleBot()}
function scheduleBot(){clearTimeout(aiTimer);if(!G||!S||S.over||typeof G.bot!=='function')return;const botTurn=localBot&&S.t!==seat||ids.length>0&&typeof amHost==='function'&&amHost()&&S.t>=ids.length;if(!botTurn)return;
 const thinkingTime=900+Math.random()*900;
 aiTimer=setTimeout(()=>{aiTimer=undefined;const stillBotTurn=localBot&&S.t!==seat||ids.length>0&&typeof amHost==='function'&&amHost()&&S.t>=ids.length;if(!G||!S||S.over||!stillBotTurn)return;const move=G.bot();if(move)act(move)},thinkingTime)}
$('bd').onclick=e=>{const el=e.target.closest('[data-i],[data-m]');if(el&&canAct())G.click(el)};
/* dice: offline or as host roll here; any other online player asks the host to roll for them (so a player cannot choose their own roll) */
const d6=()=>{const sides=G&&typeof G.rollSides==='function'?G.rollSides():6;let x;do x=crypto.getRandomValues(new Uint8Array(1))[0];while(x>=256-256%sides);return 1+x%sides};
let dt;const calm=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function showDice(r){const d=$('dice');clearInterval(dt);d.classList.remove('hide');if(calm()){d.textContent=r;return}
 let k=0;d.classList.add('roll');dt=setInterval(()=>{if(++k<7)d.textContent=1+Math.floor(Math.random()*6);else{clearInterval(dt);d.textContent=r;d.classList.remove('roll')}},70)}
$('rl').onclick=()=>{if(!ids.length||amHost())return act({r:d6()});const H=peers().find(C=>C.seat===hostSeat());if(H){$('rl').disabled=true;if(typeof requestRollFromHost==='function')requestRollFromHost(H);else snd(H,{k:'rq'})}};
/* online: rolls are accepted only from the host, moves only from the player whose turn it is, and each game can add a valid(a) check */
const actOk=(C,a)=>{if(!a||typeof a!=='object'||S.over||disconnectPending)return false;if(G.hostSetup&&S.setup)return a.r===undefined&&C.seat===hostSeat()&&(!G.valid||G.valid(a));if(a.r!==undefined){if(C.seat!==hostSeat()||(G.roll&&!G.cr())||(!G.roll&&typeof G.valid!=='function'))return false}else if(ids.indexOf(C.id)!==S.t&&!(C.seat===hostSeat()&&dead.has(S.t))&&!(C.seat===hostSeat()&&S.t>=ids.length))return false;return !G.valid||G.valid(a)};
$('rx').onclick=$('bk').onclick=()=>{if(ids.length&&!confirm('Leave this game?'))return;closeRoom()};$('rs').onclick=()=>ids.length?(amHost()?startNet(true):alert('Only the host can restart')):begin(G.id,np,null,localBot,undefined,true);$('panelRestart').onclick=()=>$('rs').click();

$('mb').onclick=closeRoom;$('ml').onclick=()=>begin(pick,pick==='bluff'?4:2,null,true);
$('localTwo').onclick=()=>begin(pick,2,null,false);
