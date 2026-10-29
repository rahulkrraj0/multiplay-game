/* Playora site: game cards, search and filters, Snake mini-game, join buttons. Needs engine.js and the games first. */
const modal=$('modal'),stage=$('stage'),mTitle=$('modalTitle'),startBtn=$('startSnake'),snakeControls=$('snakeControls');
let snakeTimer=null,snake=[],food={x:8,y:8},dir={x:1,y:0},nextDir={x:1,y:0},score=0,running=false,activeFilter='all';
/* solo / coming-soon cards: one object per card (turn-based multiplayer games register themselves in games/*.js instead) */
const SOLO=[];
function closeModal(){modal.classList.remove('open');document.body.style.overflow='';clearInterval(snakeTimer);running=false}
function openGame(game){clearInterval(snakeTimer);running=false;const snk=game==='snake';startBtn.style.display=snk?'inline-block':'none';snakeControls.style.display=snk?'flex':'none';const x=SOLO.find(g=>g.id===game);mTitle.textContent=x.t;modal.classList.add('open');document.body.style.overflow='hidden';
 if(snk){score=0;stage.innerHTML='<div class="snake-board" id="snakeBoard" aria-label="Snake game board"></div><p class="stage-text" id="snakeStatus">Press Start, then use arrow keys or the buttons. Eat the pink food and avoid the walls and your tail.</p>';$('snakeBoard').style.display='grid';resetSnake(false)}
 else stage.innerHTML=`<div><div class="stage-emoji">${x.i}</div><p class="stage-text">${x.text}</p></div>`}
function resetSnake(start=true){clearInterval(snakeTimer);running=false;snake=[{x:4,y:8},{x:3,y:8},{x:2,y:8}];food={x:10,y:8};dir={x:1,y:0};nextDir={x:1,y:0};score=0;drawSnake();if(start)beginSnake()}
function beginSnake(){if(running)return;running=true;$('snakeStatus').textContent='Score: '+score+' — use arrow keys or buttons to move.';snakeTimer=setInterval(tickSnake,145)}
function drawSnake(){const board=$('snakeBoard');if(!board)return;board.innerHTML='';for(let y=0;y<16;y++)for(let x=0;x<16;x++){const c=document.createElement('div');c.className='cell';if(snake.some(p=>p.x===x&&p.y===y))c.classList.add('snake');if(food.x===x&&food.y===y)c.classList.add('food');board.appendChild(c)}}
function tickSnake(){dir=nextDir;const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
 if(head.x<0||head.x>15||head.y<0||head.y>15||snake.some(p=>p.x===head.x&&p.y===head.y)){clearInterval(snakeTimer);running=false;$('snakeStatus').textContent='Game over! Score: '+score+'. Press Start / Restart to try again.';return}
 snake.unshift(head);if(head.x===food.x&&head.y===food.y){score++;do{food={x:Math.floor(Math.random()*16),y:Math.floor(Math.random()*16)}}while(snake.some(p=>p.x===food.x&&p.y===food.y));$('snakeStatus').textContent='Score: '+score+' — nice! Keep going.'}else snake.pop();drawSnake()}
function changeDir(d){const dirs={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}},nd=dirs[d];if(nd&&!(nd.x===-dir.x&&nd.y===-dir.y))nextDir=nd}
$('closeModal').onclick=$('modalDone').onclick=closeModal;modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
startBtn.onclick=()=>resetSnake(true);snakeControls.querySelectorAll('button').forEach(b=>b.onclick=()=>changeDir(b.dataset.dir));
document.addEventListener('keydown',e=>{const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
 if(e.key==='Escape'){if(!$('callPanel').hidden)return;if(modal.classList.contains('open'))closeModal();else if($('room').classList.contains('open'))$('bk').onclick();return}
 if(modal.classList.contains('open')&&map[e.key]){e.preventDefault();changeDir(map[e.key])}});
/* game cards come from the games registered in games/*.js */
const card=(g,pl,soon,btn)=>`<article class="game" data-game="${g.id}" data-name="${g.t.toLowerCase()}" data-category="${g.cat||'casual'}" role="button" tabindex="0" aria-label="${soon?'Preview':'Play'} ${g.t}"><div class="game-art ${g.art||'art-ludo'}"><span class="tag${g.hot?' hot':''}">${g.tag||'New'}</span><div class="game-emoji">${g.i||'🎮'}</div></div><div class="game-body"><div class="game-title"><h3>${g.t}</h3><span class="players">${pl}</span></div><p>${g.d||''}</p><div class="game-bottom"><span class="difficulty">● ${g.diff||'Easy to learn'}</span><span class="btn ${soon?'ghost':'primary'} play">${btn}</span></div></div></article>`;
function buildCards(){const grid=$('gameGrid');
 grid.innerHTML=Object.values(GAMES).map(g=>card(g,(g.max||2)===1?'1 player':'👥 '+(g.max>2?'2–'+g.max:'2')+' players',0,'Play now ↗')).join('')+SOLO.map(g=>card(g,g.pl,g.soon,g.soon?'Preview ↗':'Play now ↗')).join('');
 const activate=async tile=>{const game=tile.dataset.game;const metadata=GAMES[game];if(!metadata)return;
  const note=$('playora-boot');note.textContent='Loading '+metadata.t+'…';
  try{await window.ensurePlayoraGame(game);note.textContent='';if(game in GAMES)openRoom(game);else openGame(game)}
  catch(error){console.error('[playora] Could not load game:',error);note.textContent='Could not load '+metadata.t+'. Check your connection and try again.'}};
 grid.querySelectorAll('.game').forEach(tile=>{tile.onclick=()=>activate(tile);tile.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(tile)}}})}
function filterGames(){const q=$('search').value.toLowerCase().trim();let n=0;
 document.querySelectorAll('#gameGrid .game').forEach(c=>{const m=(c.dataset.name.includes(q)||c.textContent.toLowerCase().includes(q))&&(activeFilter==='all'||c.dataset.category.split(' ').includes(activeFilter));c.style.display=m?'':'none';if(m)n++});
 let e=document.querySelector('#gameGrid .empty');if(!n){if(!e){e=document.createElement('div');e.className='empty';e.textContent='No games found. Try another search.';$('gameGrid').appendChild(e)}}else if(e)e.remove()}
$('search').addEventListener('input',filterGames);
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeFilter=b.dataset.filter;filterGames()}));
$('jn').onclick=$('jn2').onclick=()=>openRoom('join');
$('lastRoomRejoin').onclick=rejoinLastRoom;
$('reconnect').onclick=rejoinLastRoom;
$('year').textContent=new Date().getFullYear();
buildCards();filterGames();updateRejoinButton();
const requestedGame=new URLSearchParams(location.search).get('play');
if(requestedGame&&Object.hasOwn(GAMES,requestedGame)){history.replaceState(null,'',location.pathname+location.hash);void window.ensurePlayoraGame(requestedGame).then(()=>openRoom(requestedGame)).catch(error=>{console.error('[playora] Could not load requested game:',error);$('playora-boot').textContent='Could not load this game. Check your connection and try again.'})}
