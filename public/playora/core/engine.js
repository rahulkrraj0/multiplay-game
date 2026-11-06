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
function closeRoom(){closeGameResult();const wasStandalone=$('room').classList.contains('standalone-game');disposeStandaloneGame();clearTimeout(aiTimer);aiTimer=undefined;localBot=false;$('room').classList.remove('standalone-game','embedded-game','game-active');$('bd').classList.remove('embedded-game-board');if(wasStandalone)$('bd').innerHTML='';if(typeof saveLastRoom==='function')saveLastRoom();if(typeof clearAutoRejoin==='function')clearAutoRejoin();leave();$('dice').classList.add('hide');$('topMic').classList.add('hide');$('topVideo').classList.add('hide');$('topMenu').classList.add('hide');$('room').classList.remove('open','ludo-game','chess-game','spades-game');document.body.style.overflow='';history.replaceState(null,'',location.pathname);requestAnimationFrame(()=>window.scrollTo({top:homeScrollY,behavior:'instant'}))}
/* ---------- CORE ---------- */
function stackHandCards(root){root.querySelectorAll('.hand').forEach(hand=>hand.querySelectorAll('.card').forEach((card,index)=>{const order=Number(card.dataset.selectedOrder);card.style.zIndex=String(card.classList.contains('sel')?(Number.isInteger(order)?100000+order:100000+index):card.classList.contains('ok')?10000+index:index+1)}))}
window.playoraStackHandCards=stackHandCards;
let resultModal=null,resultCanvasStop=null,resultIdentity='',resultKeyHandler=null;
function closeGameResult(keepIdentity=false){if(resultCanvasStop){resultCanvasStop();resultCanvasStop=null}if(resultKeyHandler){document.removeEventListener('keydown',resultKeyHandler);resultKeyHandler=null}if(resultModal){resultModal.remove();resultModal=null}if(!keepIdentity)resultIdentity=''}
function resultConfetti(canvas){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return()=>{};const ctx=canvas.getContext('2d');if(!ctx)return()=>{};let raf=0,alive=true,last=performance.now(),started=last;const dpr=Math.min(devicePixelRatio||1,2),width=innerWidth,height=innerHeight;canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);const colors=['#f5b301','#e0463c','#2fa05a','#2f6fd6','#fff'],pieces=Array.from({length:88},()=>({x:Math.random()*width,y:-Math.random()*height,vx:(Math.random()-.5)*140,vy:70+Math.random()*200,r:Math.random()*6,w:5+Math.random()*7,h:4+Math.random()*6,c:colors[Math.random()*colors.length|0]}));const stop=()=>{alive=false;cancelAnimationFrame(raf);ctx.clearRect(0,0,width,height)};const frame=now=>{if(!alive)return;const dt=Math.min(.04,(now-last)/1000);last=now;ctx.clearRect(0,0,width,height);for(const p of pieces){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=230*dt;p.r+=2*dt;if(p.y>height+16){p.y=-12;p.x=Math.random()*width;p.vy=70+Math.random()*150}ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.fillStyle=p.c;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore()}if(now-started<3500)raf=requestAnimationFrame(frame);else stop()};raf=requestAnimationFrame(frame);return stop}
function presentGameResult(options){const gameId=String(options.gameId||G&&G.id||'game'),winner=Number.isInteger(options.winner)?options.winner:null,type=options.outcome||'result',message=String(options.message||options.subtitle||''),identity=[gameId,type,winner,message,options.title||''].join('|');if(resultIdentity===identity)return;closeGameResult();resultIdentity=identity;const titles={win:'You win!',loss:'You lose',draw:"It’s a draw!",complete:'Level complete!',result:options.title||'Game over'};const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;const backdrop=document.createElement('div');backdrop.className='playora-result-backdrop';backdrop.setAttribute('role','dialog');backdrop.setAttribute('aria-modal','true');backdrop.setAttribute('aria-label','Game result');backdrop.dataset.game=gameId;const card=document.createElement('section');card.className='playora-result-card';const icon=document.createElement('div');icon.className='playora-result-icon';icon.setAttribute('aria-hidden','true');icon.textContent=type==='draw'?'🤝':type==='loss'?'💪':type==='complete'?'🎉':'🏆';const heading=document.createElement('h2');heading.textContent=titles[type]||titles.result;const description=document.createElement('p');description.textContent=message||options.title||'';const button=document.createElement('button');button.type='button';button.className='playora-result-button';button.textContent=options.actionLabel||'Close';button.addEventListener('click',()=>{const action=options.onAction;closeGameResult(true);if(typeof action==='function')action()});backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeGameResult(true)});resultKeyHandler=event=>{if(event.key==='Escape')closeGameResult(true)};document.addEventListener('keydown',resultKeyHandler);card.append(icon,heading,description,button);backdrop.append(card);if(!document.getElementById('playora-result-style')){const style=document.createElement('style');style.id='playora-result-style';style.textContent='.playora-result-backdrop{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:20px;box-sizing:border-box;background:radial-gradient(ellipse at 50% 35%,#263451bb,#050816eF);backdrop-filter:blur(8px);animation:playora-result-in .22s ease-out}.playora-result-card{position:relative;width:min(100%,440px);padding:30px 26px 24px;border:1px solid #ffffff35;border-radius:24px;background:linear-gradient(145deg,#202c45,#111a2e);box-shadow:0 24px 80px #0009;color:#f7f8fc;text-align:center;font-family:Inter,system-ui,sans-serif}.playora-result-icon{font-size:58px;line-height:1.2}.playora-result-card h2{margin:12px 0 8px;font-size:clamp(26px,6vw,36px)}.playora-result-card p{margin:0 auto 22px;max-width:38ch;color:#cbd5e1;line-height:1.55}.playora-result-button{min-width:132px;padding:12px 22px;border:0;border-radius:12px;background:#f5c84c;color:#171717;font:inherit;font-weight:700;font-size:16px;cursor:pointer}.playora-result-button:hover{filter:brightness(1.08);transform:translateY(-1px)}@keyframes playora-result-in{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.playora-result-backdrop,.playora-result-button{animation:none;transition:none}}';document.head.appendChild(style)}document.body.append(backdrop);resultModal=backdrop;if(type==='win'||type==='complete'){const canvas=document.createElement('canvas');canvas.className='playora-result-confetti';canvas.setAttribute('aria-hidden','true');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';backdrop.prepend(canvas);if(!reduced)resultCanvasStop=resultConfetti(canvas)}button.focus({preventScroll:true})}
window.playoraPresentGameResult=options=>{const current=currentGameResult();if(current&&current.gameId===options.gameId)presentGameResult({...options,...current,actionLabel:options.actionLabel||current.actionLabel,onAction:options.onAction||current.onAction});else presentGameResult(options)};
window.playoraDismissGameResult=gameId=>{if(!gameId||resultModal&&resultModal.dataset.game===gameId||resultIdentity.startsWith(String(gameId)+'|'))closeGameResult()};
function currentGameResult(){
 if(!G||!S)return null;
 const message=String(S.msg||'');
 const heartsDone=G.id==='hearts'&&S.phase==='roundend'&&Array.isArray(S.players)&&S.players.some(player=>player.total>=100);
 const ended=!!S.over||(G.id==='checkers'&&S.winner!==null&&S.winner!==undefined)||(G.id==='watersort'&&!!S.cleared)||heartsDone;
 if(!ended)return null;
 let raw=Number.isInteger(S.winner)&&S.winner>=0?S.winner:S.winner==='draw'?'draw':S.winner==='r'||S.winner==='b'?S.winner:S.win;
 let winner=Number.isInteger(raw)&&raw>=0?raw:null;
 if(G.id==='checkers'&&(raw==='r'||raw==='b'))winner=raw==='r'?0:1;
 if(heartsDone&&S.players.length)winner=S.players.reduce((best,player,index)=>player.total<S.players[best].total?index:best,0);
 if(winner===null&&!/draw|tie|stalemate/i.test(message)&&['rummy','poker','teenpatti','joker-duel'].includes(G.id)&&Number.isInteger(S.t))winner=S.t;
 const draw=G.id!=='watersort'&&(raw===-1||raw==='draw'||/\b(draw|tie|stalemate)\b/i.test(message));
 let winnerName=winner!==null?(S.players&&S.players[winner]&&S.players[winner].name||playerLabel(winner)):'';
 let teamWinner=null,localTeam=null;
 if(G.id==='carrom'&&S.teamMode&&Array.isArray(S.teams)&&winner!==null){
  teamWinner=winner;
  localTeam=ids.length&&seat>=0&&seat<np?S.teams[seat]:localBot?S.teams[0]:null;
  winnerName=S.teams.map((team,index)=>team===teamWinner?playerLabel(index):'').filter(Boolean).join(' & ')||winnerName;
 }else if(G.id==='spades'&&winner!==null&&S.players&&S.players.length===4){
  teamWinner=winner;
  localTeam=ids.length&&seat>=0&&seat<np?seat%2:localBot?0:null;
  winnerName=[S.players[winner],S.players[winner+2]].filter(Boolean).map(player=>player.name).join(' & ')||winnerName;
 }
 let outcome='result';
 if(draw)outcome='draw';
 else if(G.id==='watersort'&&S.cleared)outcome='complete';
 else if(winner===null&&(G.max===1||G.maxPlayers===1))outcome='win';
 else if(winner!==null){
  if(ids.length&&seat===99)outcome='result';
  else if(teamWinner!==null&&localTeam!==null)outcome=winner===localTeam?'win':'loss';
  else if(ids.length&&seat>=0&&seat<np)outcome=winner===seat?'win':'loss';
  else if(localBot)outcome=winner===0?'win':'loss';
  else if(G.id==='hearts'&&!ids.length)outcome=winner===0?'win':'loss';
 }
 const title=outcome==='result'?(winnerName?winnerName+' wins!':message||'Game over'):'';
 let options={gameId:G.id,winner,outcome,title,message};
 if(G.id==='watersort'&&S.cleared&&!S.over)options={...options,outcome:'complete',title:'Level '+S.L+' complete!',message:'Completed in '+S.moves+' moves.',actionLabel:'Next level',onAction:()=>act({k:'next'})};
 return options;
}
function render(){ $('rl').disabled=false;const[h,s]=G.draw();$('bd').innerHTML=h;stackHandCards($('bd'));$('st').textContent=ids.length&&seat===99?'Spectating · '+(S.msg||s):S.msg||s;$('lg').textContent=typeof S.last==='string'?S.last:'';$('rl').classList.toggle('hide',!(G.roll&&canAct()&&G.cr()));const result=currentGameResult();if(result)presentGameResult(result);else closeGameResult()}
/* begin(game, localPlayers, order): order = list of player ids when playing online (seat = position in the list) */
function activateGameRuntime(){if(typeof G.onStart==='function')G.onStart();if(ids.length&&typeof startGameChannels==='function')startGameChannels()}
function syncGameLayout(game){const isLudo=game==='ludo';$('room').classList.toggle('ludo-game',isLudo);$('room').classList.toggle('chess-game',game==='chess');$('room').classList.toggle('spades-game',game==='spades');const dice=$('dice');if(isLudo){dice.classList.remove('hide');dice.textContent=S&&S.die||'🎲'}else dice.classList.add('hide')}
function begin(g,n,order,vsComputer=false,playerNames,isRestart=false){if(!requireDisplayName(()=>begin(g,n,order,vsComputer,playerNames,isRestart)))return;closeGameResult();const previousState=isRestart&&G===GAMES[g]?S:null;if(G&&typeof G.onStop==='function')G.onStop();clearTimeout(aiTimer);localBot=vsComputer;disconnectPending=false;if(typeof clearDisconnectRecovery==='function')clearDisconnectRecovery();G=GAMES[g];pick=g;dead=new Set();sel=-1;clearInterval(dt);if(order){ids=order;np=Math.min(G.max||2,Math.max(ids.length,Number(activeLimit)||ids.length));seat=ids.indexOf(myId);if(seat<0||seat>=np)seat=99;gamePlayerNames=cleanGamePlayerNames(playerNames);while(gamePlayerNames.length<np)gamePlayerNames.push('Computer '+(gamePlayerNames.length-ids.length+1));gamePlayerNames.length=np}else{ids=[];np=n;seat=vsComputer?0:-1;gamePlayerNames=Array.from({length:np},(_,index)=>index===0?displayName:vsComputer?'Computer':'Player '+(index+1))}S=G.init(previousState);if(ids.length&&typeof persistPreviousGame==='function')persistPreviousGame();syncGameLayout(g);$('rt').textContent=G.t;show('gm');render();if(typeof updateGameControls==='function')updateGameControls();if(order&&room.code&&typeof saveLastRoom==='function')saveLastRoom();if(window.playoraSound&&typeof window.playoraSound.playGame==='function')window.playoraSound.playGame(g,'start');activateGameRuntime();scheduleBot()}
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
