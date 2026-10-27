/* Online play: peer-to-peer mesh. Every browser links directly to every other browser and keeps the full game,
   so every attendee is both server and receiver. The lowest-numbered attendee is the host (starts/restarts games);
   if the host leaves, the next player becomes host automatically and the game carries on.
   New players need one copy-paste code exchange with ANY connected player; the rest of the links form by themselves. */
const CFG={iceServers:(window.PLAYORA&&PLAYORA.iceServers)||[{urls:'stun:stun.l.google.com:19302'}]},myId=Math.random().toString(36).slice(2,8);
const PLAYER_KEY_STORAGE='playora.player-key.v1';
function getPlayerKey(){try{const saved=localStorage.getItem(PLAYER_KEY_STORAGE);if(saved&&/^[a-f0-9]{16}$/i.test(saved))return saved;const key=[...crypto.getRandomValues(new Uint8Array(8))].map(x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(PLAYER_KEY_STORAGE,key);return key}catch(error){console.warn('[playora] Could not persist this browser’s player identity.',error);return[...Array(16)].map(()=>Math.floor(Math.random()*16).toString(16)).join('')}}
const playerKey=getPlayerKey();
let cs=[],js=0,hiSeat=0,inv=null,rep={},low=true,activeLimit=2,pendingRejoinId=null,activePlayerKeys=[],activePlayerNames=[],attendanceRoomCode='',roomAttendance={entries:{},roles:{}},attendanceVisits=new Set();const loc={};let ls=new MediaStream();
const LAST_ROOM_KEY='playora.last-room.v1';
function readLastRoom(){try{const value=JSON.parse(localStorage.getItem(LAST_ROOM_KEY)||'null');return value&&typeof value.code==='string'&&/^[A-Z0-9]{4,12}$/.test(value.code)&&typeof value.host==='boolean'&&typeof value.game==='string'&&Object.hasOwn(GAMES,value.game)?value:null}catch(error){console.warn('[playora] Could not read the saved room.',error);return null}}
function saveLastRoom(){if(!room.code||!ids.length)return;const game=G&&G.id||pick;try{localStorage.setItem(LAST_ROOM_KEY,JSON.stringify({code:room.code,host:amHost(),game,limit:activeLimit,playerId:playerKey}));updateRejoinButton()}catch(error){console.warn('[playora] Could not save the room for rejoining.',error)}}
function clearLastRoom(){try{localStorage.removeItem(LAST_ROOM_KEY)}catch(error){console.warn('[playora] Could not clear the saved room.',error)}updateRejoinButton()}
function updateRejoinButton(){const button=$('lastRoomRejoin');if(!button)return;const saved=readLastRoom();button.hidden=!saved;button.textContent=saved?(saved.host?'Reopen ':'Rejoin ')+(GAMES[saved.game]?.t||'last game'):'Rejoin last game'}
const enc=d=>btoa(JSON.stringify(d)),dec=s=>JSON.parse(atob(s.trim()));
const gath=pc=>Promise.race([new Promise(r=>{let done=0;const finish=()=>{if(!done){done=1;r()}};if(pc.iceGatheringState==='complete')return finish();pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete')finish()});pc.addEventListener('icecandidate',e=>{if(!e.candidate)finish()})}),new Promise(r=>setTimeout(r,4000))]);
const snd=(C,o)=>{if(C&&C.dc&&C.dc.readyState==='open')C.dc.send(JSON.stringify(o))},bcast=(o,ex)=>cs.forEach(C=>C!==ex&&snd(C,o));
const peers=()=>cs.filter(C=>C.open&&C.id),hostSeat=()=>Math.min(js,...peers().map(C=>C.seat)),amHost=()=>js===hostSeat();
const ready=()=>{const n=peers().length;return n>0&&peers().every(C=>rep[C.id]===n)};
function mkC(id,s){const C={pc:new RTCPeerConnection(CFG),id,seat:s,open:0,sn:{},disconnectTimer:0};C.pc.onconnectionstatechange=()=>{const state=C.pc.connectionState;if(state==='failed'&&!C.open)linkFailed(C);if(state==='disconnected'){if(!C.disconnectTimer)C.disconnectTimer=setTimeout(()=>{C.disconnectTimer=0;if(C.pc.connectionState==='disconnected')drop(C)},12000);return}clearTimeout(C.disconnectTimer);C.disconnectTimer=0;if(state==='failed'||state==='closed')drop(C)};cs.push(C);return C}
function wire(C,ch){if(ch.label==='playora-actions'){C.action=ch;ch.onmessage=e=>{try{handleRealtime(C,JSON.parse(e.data))}catch(error){console.warn('[playora] Ignored an invalid game action packet.',error)}};ch.onclose=()=>{C.action=null;C.actionStarting=0};return}
if(ch.label==='playora-realtime'){C.rtc=ch;ch.onmessage=e=>{try{handleRealtime(C,JSON.parse(e.data))}catch(error){console.warn('[playora] Ignored an invalid real-time game packet.',error)}};ch.onclose=()=>{C.rtc=null;C.rtcStarting=0};return}
C.dc=ch;ch.onmessage=e=>{try{handle(C,JSON.parse(e.data))}catch(error){console.warn('[playora] Ignored an invalid peer message.',error)}};ch.onclose=()=>drop(C);
ch.onopen=()=>{if(C.open)return;C.open=1;if(C.first)snd(C,{k:'hi',id:myId,playerKey,name:displayName});live(C);mesh()};if(ch.readyState==='open')ch.onopen()}
function startGameChannels(){if(!G||!ids.length||!amHost())return;peers().forEach(C=>{if(!C.open)return;
if(!C.action&&!C.actionStarting){C.actionStarting=1;try{wire(C,C.pc.createDataChannel('playora-actions'))}catch(error){C.actionStarting=0;console.warn('[playora] Could not create a reliable game action channel.',error)}}
if(G.realtime&&!C.rtc&&!C.rtcStarting){C.rtcStarting=1;try{wire(C,C.pc.createDataChannel('playora-realtime',{ordered:false,maxRetransmits:0}))}catch(error){C.rtcStarting=0;console.warn('[playora] Could not create a real-time game channel.',error)}}})}
function sendGameAction(action){if(!G||!ids.length)return;const packet=JSON.stringify({k:'rt',g:G.id,kind:'action',data:action});peers().forEach(C=>{if(C.action&&C.action.readyState==='open'){try{C.action.send(packet);return}catch(error){console.warn('[playora] Reliable game action channel failed; using the room channel.',error)}}snd(C,{k:'a',a:action})})}
function realtimeSend(kind,data){if(!G||!G.realtime||!ids.length)return;const packet=JSON.stringify({k:'rt',g:G.id,kind,data});if(kind==='input'&&!amHost()){const host=peers().find(C=>C.seat===hostSeat());if(host&&host.rtc&&host.rtc.readyState==='open'&&host.rtc.bufferedAmount<65536)host.rtc.send(packet);return}if(amHost())peers().forEach(C=>{if(C.rtc&&C.rtc.readyState==='open'&&C.rtc.bufferedAmount<65536)C.rtc.send(packet)})}
function requestRejoin(){if(!pendingRejoinId)return;const H=peers().find(C=>C.seat===hostSeat());if(H)snd(H,{k:'rejoin',old:pendingRejoinId})}
function handleRealtime(C,m){if(!m||m.k!=='rt'||!G||m.g!==G.id||disconnectPending)return;const remoteSeat=ids.indexOf(C.id);if(remoteSeat<0)return;
if(m.kind==='action'){if(ids.length&&actOk(C,m.data))act(m.data,1);return}
if(!G.realtime||typeof G.onRealtimeMessage!=='function')return;
if(m.kind==='input'&&!amHost())return;if(m.kind==='state'&&remoteSeat!==hostSeat())return;G.onRealtimeMessage(remoteSeat,m.kind,m.data)}
/* per-link: renegotiation + candidates travel over the data channel; add my voice/video to new links */
function live(C){C.pc.onicecandidate=e=>e.candidate&&snd(C,{k:'c',c:e.candidate});
 C.pc.onnegotiationneeded=async()=>{try{C.mk=1;await C.pc.setLocalDescription();snd(C,{k:'d',d:C.pc.localDescription})}catch{}C.mk=0};
 C.pc.ontrack=e=>vid(C,e);Object.keys(loc).forEach(k=>{C.sn[k]=C.pc.addTrack(loc[k],ls);cap(C,k)})}
async function onD(C,d){try{if(d.type==='offer'&&(C.mk||C.pc.signalingState!=='stable')&&myId<C.id)return;await C.pc.setRemoteDescription(d);if(d.type==='offer'){await C.pc.setLocalDescription();snd(C,{k:'d',d:C.pc.localDescription})}}catch{}}
function peerName(C){return C.name||'Player '+(C.seat+1)}
function mediaTile(C){
 if(C.tile)return C.tile;
 const tile=document.createElement('section');tile.className='media-tile';tile.setAttribute('aria-label',peerName(C)+' media');
 const bar=document.createElement('div');bar.className='media-tile-bar';bar.textContent=peerName(C);C.mediaTitle=bar;
 const video=document.createElement('video');video.id='v'+C.id;video.autoplay=true;video.playsInline=true;video.muted=true;video.hidden=true;
 const placeholder=document.createElement('div');placeholder.className='media-placeholder';placeholder.textContent='Camera off';
 const hide=document.createElement('button');hide.type='button';hide.textContent='✕';hide.setAttribute('aria-label','Hide video popup');hide.onclick=()=>{C.videoHidden=true;updateRemoteVideo(C)};
 bar.append(hide);tile.append(bar,video,placeholder);
 const resize=document.createElement('span');resize.className='media-resize';resize.setAttribute('role','separator');resize.setAttribute('aria-label','Resize video tile');resize.setAttribute('aria-orientation','diagonal');tile.append(resize);
 $('rvs').append(tile);C.tile=tile;C.remoteVideo=video;C.remotePlaceholder=placeholder;
 const index=peers().indexOf(C),width=Math.min(230,window.innerWidth-24),height=170;
 tile.style.left=Math.max(8,Math.min(window.innerWidth-width-8,12+index*20))+'px';tile.style.top=Math.max(8,Math.min(window.innerHeight-height-8,76+index*20))+'px';
 makeMediaTileInteractive(tile,bar,resize);
 updateMediaTileHostState(C);
 return tile
}
function makeMediaTileInteractive(tile,bar,resize){
 let gesture=null;
 const begin=(event,mode)=>{if(event.button!==undefined&&event.button!==0)return;event.preventDefault();event.stopPropagation();const rect=tile.getBoundingClientRect();gesture={mode,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height};window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});window.addEventListener('pointercancel',end,{once:true})};
 bar.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;begin(event,'drag')});
 resize.addEventListener('pointerdown',event=>begin(event,'resize'));
 const move=event=>{if(!gesture)return;const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  if(gesture.mode==='drag'){const x=Math.max(0,Math.min(window.innerWidth-tile.offsetWidth,gesture.left+dx)),y=Math.max(0,Math.min(window.innerHeight-tile.offsetHeight,gesture.top+dy));tile.style.left=x+'px';tile.style.top=y+'px'}
  else{tile.style.width=Math.max(160,Math.min(window.innerWidth-16,gesture.width+dx))+'px';tile.style.height=Math.max(120,Math.min(window.innerHeight-16,gesture.height+dy))+'px'}
 };
 const end=()=>{gesture=null;window.removeEventListener('pointermove',move);window.removeEventListener('pointercancel',end)};
}
function updateMediaTileHostState(C){if(!C.tile)return;const host=C.seat===hostSeat();C.tile.classList.toggle('media-host',host);C.mediaTitle.firstChild.textContent=host?peerName(C)+' · Host':peerName(C);C.tile.setAttribute('aria-label',host?peerName(C)+' host media':peerName(C)+' media')}
function updateMediaTilePermissions(){peers().forEach(updateMediaTileHostState)}
function updateRemoteVideo(C){if(!C.remoteVideo)return;const unavailable=!C.remoteVideoTrack||C.remoteVideoTrack.muted||C.remoteVideoTrack.readyState==='ended';C.tile.hidden=!!C.videoHidden;C.remoteVideo.hidden=!!unavailable;C.remotePlaceholder.hidden=!unavailable;C.remotePlaceholder.textContent='Camera off';updateParticipantList()}
function participantButton(icon,label,pressed,disabled,onclick){const button=document.createElement('button');button.type='button';button.textContent=icon;button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(pressed));button.disabled=disabled;button.onclick=onclick;return button}
function updateParticipantList(){
 const section=$('participants'),list=$('participantList');if(!section||!list)return;
 list.innerHTML='';
 const addRow=(name,mic,video)=>{
  const row=document.createElement('div');row.className='participant-row';
  const title=document.createElement('span');title.className='participant-name';title.textContent=name;row.append(title,mic,video);list.append(row)
 };
 if(peers().length){
  const audioEnabled=!!(loc.a&&loc.a.enabled),videoEnabled=!!(loc.v&&loc.v.enabled);
  addRow('You · '+displayName,
   participantButton('🎤',audioEnabled?'Turn your microphone off':'Turn your microphone on',!audioEnabled,false,()=>tog('a')),
   participantButton('📹',videoEnabled?'Turn your camera off':'Turn your camera on',!videoEnabled,false,()=>tog('v')));
  peers().slice().sort((a,b)=>a.seat-b.seat).forEach(C=>{
   const audioAvailable=!!C.remoteAudio,videoAvailable=!!(C.remoteVideoTrack&&C.remoteVideoTrack.readyState!=='ended'),audioMuted=!!(C.remoteAudio&&C.remoteAudio.muted),videoHidden=!!C.videoHidden;
   addRow(peerName(C),
    participantButton('🎤',audioAvailable?(audioMuted?'Unmute '+peerName(C)+' audio on this device':'Mute '+peerName(C)+' audio on this device'):peerName(C)+' microphone unavailable',audioMuted,!audioAvailable,()=>{C.remoteAudio.muted=!C.remoteAudio.muted;updateParticipantList()}),
    participantButton('📹',videoAvailable?(videoHidden?'Show '+peerName(C)+' video on this device':'Hide '+peerName(C)+' video on this device'):peerName(C)+' camera unavailable',videoHidden||!videoAvailable,!videoAvailable,()=>{C.videoHidden=!C.videoHidden;updateRemoteVideo(C)}))
  })
 }
 section.hidden=!list.childElementCount
}
let localTileInteractive=false;
let localVideoHidden=false;
function showLocalVideo(){const tile=$('localVideoTile');localVideoHidden=false;tile.hidden=false;tile.classList.remove('hide');tile.querySelector('.media-tile-bar span').textContent='You · '+displayName+' · camera preview';$('lv').classList.remove('hide');
 if(!localTileInteractive){const bar=tile.querySelector('.media-tile-bar'),resize=tile.querySelector('.media-resize');tile.style.left=Math.max(8,window.innerWidth-Math.min(230,window.innerWidth-24)-12)+'px';tile.style.top=Math.max(8,window.innerHeight-170-12)+'px';makeMediaTileInteractive(tile,bar,resize);localTileInteractive=true}updateParticipantList()}
function remoteAudio(C){if(C.remoteAudio)return C.remoteAudio;const audio=document.createElement('audio');audio.id='a'+C.id;audio.autoplay=true;audio.playsInline=true;audio.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';$('rvs').append(audio);C.remoteAudio=audio;updateParticipantList();return audio}
function vid(C,e){if(e.track.kind==='video'){mediaTile(C);C.remoteVideoTrack=e.track;C.remoteVideo.srcObject=new MediaStream([e.track]);updateRemoteVideo(C);C.remoteVideo.play().catch(()=>{});e.track.onmute=()=>updateRemoteVideo(C);e.track.onunmute=()=>updateRemoteVideo(C);e.track.onended=()=>updateRemoteVideo(C)}
 else if(e.track.kind==='audio'){const audio=remoteAudio(C);audio.srcObject=new MediaStream([e.track]);audio.play().catch(()=>{});updateParticipantList()}
 return C.tile}
function attendanceStorageKey(code){return'playora.attendance.v1.'+code}
function loadAttendance(code){try{const value=JSON.parse(localStorage.getItem(attendanceStorageKey(code))||'null');if(value&&value.entries&&typeof value.entries==='object'&&value.roles&&typeof value.roles==='object')return value}catch(error){console.warn('[playora] Could not read lobby attendance history.',error)}return{entries:{},roles:{}}}
function saveAttendance(){if(!room.code||!amHost())return;try{localStorage.setItem(attendanceStorageKey(room.code),JSON.stringify(roomAttendance));bcast({k:'attendance',data:roomAttendance})}catch(error){console.warn('[playora] Could not save lobby attendance history.',error)}}
function ensureAttendance(){if(attendanceRoomCode===room.code)return;attendanceRoomCode=room.code;attendanceVisits.clear();roomAttendance=loadAttendance(room.code)}
function recordAttendance(key,seat,joined,name){if(!amHost()||!key)return;ensureAttendance();const now=Date.now(),entry=roomAttendance.entries[key],isNew=!entry,record=entry||{key,seat,visits:0,firstSeen:now,lastSeen:now};let changed=isNew||!record.online||record.seat!==seat||record.name!==name;record.seat=seat;record.name=name;record.online=true;if(joined&&!attendanceVisits.has(key)){record.visits++;attendanceVisits.add(key);record.lastSeen=now;changed=true}roomAttendance.entries[key]=record;if(!roomAttendance.roles[key]){roomAttendance.roles[key]=key===playerKey?'player':'viewer';changed=true}const old=Object.values(roomAttendance.entries).sort((a,b)=>a.lastSeen-b.lastSeen);while(old.length>100){const removed=old.shift();delete roomAttendance.entries[removed.key];delete roomAttendance.roles[removed.key];changed=true}if(changed)saveAttendance()}
function clearDisconnectRecovery(){disconnectPending=false;const panel=$('disconnectRecovery');if(panel)panel.hidden=true;const button=$('waitForReconnect');if(button){button.disabled=false;button.textContent='Wait for reconnect'}}
function syncDisconnectRecovery(){if(dead.size&&G&&S&&!S.over){disconnectPending=true;const players=[...dead].map(index=>playerLabel(index));$('disconnectRecoveryMessage').textContent=players.join(', ')+(players.length===1?' is':' are')+' disconnected. The game is paused; play will resume when they reconnect.';$('disconnectRecovery').hidden=false}else clearDisconnectRecovery()}
function finishDisconnectedGame(){if(!disconnectPending||!G||!S)return;const game=G.id,limit=activeLimit;if(amHost()){bcast({k:'disconnect-finish'});resetToLobby(game,limit);return}const host=peers().find(C=>C.seat===hostSeat());if(host){snd(host,{k:'disconnect-finish-request'});return}$('disconnectRecoveryMessage').textContent='Cannot finish the game because the host is not connected. You can leave the room and rejoin later.'}
$('waitForReconnect').onclick=()=>{if(!disconnectPending)return;$('waitForReconnect').disabled=true;$('waitForReconnect').textContent='Waiting for reconnect…';const players=[...dead].map(index=>playerLabel(index));$('disconnectRecoveryMessage').textContent='Waiting for '+players.join(', ')+'. The game will resume automatically when they reconnect.'};
$('finishDisconnectedGame').onclick=finishDisconnectedGame;
function drop(C){if(!cs.includes(C))return;clearTimeout(C.disconnectTimer);const was=amHost(),wasOpen=C.open;if(C.playerKey&&roomAttendance.entries[C.playerKey]){roomAttendance.entries[C.playerKey].online=false;roomAttendance.entries[C.playerKey].lastSeen=Date.now()}cs=cs.filter(x=>x!==C);if(C.playerKey&&amHost())saveAttendance();try{C.pc.close()}catch{}
 C.tile?.remove();C.remoteAudio?.remove();delete rep[C.id];if(!wasOpen)return;
 if(G&&S&&ids.length){const g=ids.indexOf(C.id);if(g>=0&&g<np){if(G.realtime&&typeof G.onRealtimeDisconnect==='function')G.onRealtimeDisconnect(g);dead.add(g);syncDisconnectRecovery();render()}}
 $('lg').textContent=peerName(C)+' disconnected'+(!was&&amHost()?' – you are now the host':'');if(!was&&amHost())claimRoom();mesh();updateMediaTilePermissions();updateGameControls()}
function handle(C,m){switch(m.k){
 case'hi':if(peers().length>=7){snd(C,{k:'full'});return}C.id=m.id;C.playerKey=typeof m.playerKey==='string'&&/^[a-f0-9]{16}$/i.test(m.playerKey)?m.playerKey:'';C.seat=++hiSeat;C.name=cleanPlayerName(m.name)||'Player '+C.seat;ensureAttendance();if(C.playerKey&&!roomAttendance.roles[C.playerKey])roomAttendance.roles[C.playerKey]=peers().filter(P=>roomAttendance.roles[P.playerKey]==='player').length<activeLimit?'player':'viewer';recordAttendance(C.playerKey,C.seat,true,C.name);snd(C,{k:'welcome',id:myId,key:playerKey,name:displayName,seat:js,you:C.seat,hiSeat,g:pick,limit:activeLimit,rc:room.code,attendance:roomAttendance,playerKeys:activePlayerKeys,playerNames:activePlayerNames,peers:peers().filter(x=>x!==C).map(x=>({id:x.id,seat:x.seat,key:x.playerKey,name:x.name})),st:G&&S&&ids.length?{g:G.id,np,ids,S,playerKeys:activePlayerKeys,playerNames:activePlayerNames,dead:[...dead]}:null});
  bcast({k:'new',id:C.id,seat:C.seat,key:C.playerKey,name:C.name},C);manual();mesh();break;
 case'full':if(C===room.jc)return jfail('That room is full (8 attendees maximum).');drop(C);roomUI('err','That room is full (8 attendees maximum).');return;
 case'welcome':room.code=m.rc||'';attendanceRoomCode=room.code;roomAttendance=m.attendance||loadAttendance(room.code);roomJoined();js=m.you;hiSeat=m.hiSeat;pick=m.g;activeLimit=m.limit||2;activePlayerKeys=Array.isArray(m.playerKeys)?m.playerKeys:[];activePlayerNames=Array.isArray(m.playerNames)?m.playerNames:[];C.id=m.id;C.playerKey=m.key||'';C.name=cleanPlayerName(m.name)||'Player '+(js+1);C.seat=m.seat;m.peers.forEach(p=>{const P=mkC(p.id,p.seat);P.playerKey=p.key||'';P.name=cleanPlayerName(p.name)||'Player '+(p.seat+1);P.via=C});
 if(m.st){G=GAMES[m.st.g];np=m.st.np;ids=m.st.ids;activePlayerKeys=Array.isArray(m.st.playerKeys)?m.st.playerKeys:activePlayerKeys;activePlayerNames=Array.isArray(m.st.playerNames)?cleanGamePlayerNames(m.st.playerNames):activePlayerNames;gamePlayerNames=activePlayerNames;S=m.st.S;seat=99;dead=new Set(Array.isArray(m.st.dead)?m.st.dead:[]);show('gm');syncDisconnectRecovery();render();if(G&&G.realtime)activateGameRuntime();pendingRejoinId=room.rejoinId||null;requestRejoin()}else{clearDisconnectRecovery();room.rejoinId=null;pendingRejoinId=null;show('lobby');roomUI(room.code?'ok':'',room.code?'Share this Room ID or link to invite more players.':'');manual()}mesh();flushSig();break;
 case'new':{hiSeat=Math.max(hiSeat,m.seat);const N=mkC(m.id,m.seat);N.playerKey=m.key||'';N.name=cleanPlayerName(m.name)||'Player '+(m.seat+1);N.via=C;offerTo(N);break}
 case'sig':sig(C,m);break;
 case'config':if(C.seat===hostSeat()){pick=m.g;activeLimit=m.limit;updateLobbyControls();lobbyUp()}break;
 case'lobby':if(C.seat===hostSeat()){resetToLobby(m.g,m.limit)}break;
 case'rejoin':if(amHost()&&C.seat!==hostSeat()&&G&&S&&ids.length){const oldIndex=activePlayerKeys.indexOf(m.old),currentIndex=ids.indexOf(C.id),index=currentIndex>=0&&currentIndex<np?currentIndex:oldIndex;if(index>=0&&index<np){const stale=peers().find(P=>P!==C&&P.id===ids[index]);if(stale)drop(stale);ids[index]=C.id;activePlayerKeys[index]=C.playerKey;activePlayerNames[index]=C.name||displayName;gamePlayerNames=cleanGamePlayerNames(activePlayerNames);activePlayerNames=gamePlayerNames;dead.delete(index);syncDisconnectRecovery();render();bcast({k:'resume',g:G.id,ids,playerKeys:activePlayerKeys,playerNames:activePlayerNames,S,np,dead:[...dead]})}}break;
 case'resume':if(C.seat===hostSeat()&&GAMES[m.g]&&Array.isArray(m.ids)){if(G&&typeof G.onStop==='function')G.onStop();G=GAMES[m.g];ids=m.ids;activePlayerKeys=Array.isArray(m.playerKeys)?m.playerKeys:[];activePlayerNames=cleanGamePlayerNames(m.playerNames);gamePlayerNames=activePlayerNames;S=m.S;np=m.np;seat=ids.indexOf(myId);if(seat<0||seat>=np)seat=99;dead=new Set(Array.isArray(m.dead)?m.dead:[]);syncDisconnectRecovery();pendingRejoinId=null;room.rejoinId=null;$('rt').textContent=G.t;show('gm');render();if(typeof updateGameControls==='function')updateGameControls();activateGameRuntime();saveLastRoom()}break;
 case'disconnect-finish-request':if(amHost()&&G&&S&&!S.over&&C.open){const game=G.id,limit=activeLimit;bcast({k:'disconnect-finish'});resetToLobby(game,limit)}break;
 case'disconnect-finish':if(C.seat===hostSeat()&&G&&S){const game=G.id,limit=activeLimit;resetToLobby(game,limit)}break;
 case'start':if(C.seat===hostSeat()&&GAMES[m.g]&&Array.isArray(m.ids)){pick=m.g;activeLimit=m.ids.length;activePlayerKeys=Array.isArray(m.playerKeys)?m.playerKeys:[];activePlayerNames=cleanGamePlayerNames(m.playerNames);begin(m.g,0,m.ids,false,activePlayerNames)}break; /* only the host starts games */
 case'attendance':if(C.seat===hostSeat()&&m.data&&m.data.entries&&m.data.roles){roomAttendance=m.data;if(amHost())saveAttendance()}break;
 case'a':if(G&&S&&ids.length&&actOk(C,m.a))act(m.a,1);break;
 case'rq':if(amHost()&&G&&S&&!S.over&&ids.indexOf(C.id)===S.t&&(G.roll?G.cr():typeof G.valid==='function'&&G.valid({r:1})))act({r:d6()});break; /* host rolls the dice for everyone */
 case'm':say(m.m,0,C);break;
 case'd':onD(C,m.d);break;
 case'c':C.pc.addIceCandidate(m.c).catch(()=>{});break;
 case'mesh':rep[C.id]=m.n;lobbyUp();updateGameControls();break}}
/* existing player -> newcomer: offer/answer travel through the player who accepted the newcomer.
   Offers can arrive before the newcomer has a slot for that peer; queue and retry instead of dropping them
   (that drop is why a third player never finished connecting). */
const sigQ=[];
function queueSig(m){m._try=(m._try||0)+1;if(m._try<=40)sigQ.push(m)}
function flushSig(){if(!sigQ.length)return;const q=sigQ.splice(0);for(const m of q){const via=cs.find(x=>x.open&&x.id&&x.id===m._via)||cs.find(x=>x.open&&x.id);if(via)void sig(via,m)}}
async function offerTo(N){try{const ch=N.pc.createDataChannel('g');wire(N,ch);await N.pc.setLocalDescription(await N.pc.createOffer());await gath(N.pc);snd(N.via,{k:'sig',to:N.id,from:myId,d:N.pc.localDescription})}catch{}}
async function sig(C,m){if(!m||!m.d||m.to==null||m.from==null)return;
 if(m.to!==myId){const t=cs.find(x=>x.id===m.to&&x.open);if(!t){m._via=C&&C.id;queueSig(m);return}snd(t,m);return}
 const P=cs.find(x=>x.id===m.from);if(!P){m._via=C&&C.id;queueSig(m);return}
 try{if(m.d.type==='offer'){if(P.open)return;P.pc.ondatachannel=e=>wire(P,e.channel);await P.pc.setRemoteDescription(m.d);await P.pc.setLocalDescription(await P.pc.createAnswer());await gath(P.pc);snd((P.via&&P.via.open)?P.via:C,{k:'sig',to:P.id,from:myId,d:P.pc.localDescription})}
  else if(P.pc.signalingState!=='stable'||!P.pc.currentRemoteDescription)await P.pc.setRemoteDescription(m.d)}catch{}}
function mesh(){const n=peers().length;rep[myId]=n;bcast({k:'mesh',n});lobbyUp();updateMediaTilePermissions();startGameChannels();requestRejoin()}
const onlineGames=()=>Object.values(GAMES).filter(g=>(g.max||2)>1);
function renderLobbyGameCards(container,interactive){container.innerHTML='';onlineGames().forEach(g=>{const selected=g.id===pick,button=document.createElement('button');button.type='button';button.className='lobby-game'+(selected?' selected':'');button.dataset.game=g.id;button.disabled=!interactive;button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',g.t+(selected?', selected':''));const icon=document.createElement('span');icon.className='lobby-game-icon';icon.setAttribute('aria-hidden','true');icon.textContent=g.i||'Game';const title=document.createElement('strong');title.textContent=g.t;const players=document.createElement('small');const max=g.max||2;players.textContent='Up to '+max+' players';button.append(icon,title,players);container.append(button);if(interactive)button.onclick=()=>{const choice=$('gameChoice');choice.value=g.id;choice.dispatchEvent(new Event('change',{bubbles:true}))}})}
function updateLobbyControls(){const host=amHost(),controls=$('hostControls'),choice=$('gameChoice'),count=$('playerCount');
 controls.classList.toggle('hide',!host);$('guestGameChoices').classList.toggle('hide',host);$('guestChoice').classList.toggle('hide',host);$('wt').classList.toggle('hide',host);
 if(host){if(!choice.options.length)onlineGames().forEach(g=>choice.add(new Option(g.t,g.id)));
  if(!GAMES[pick]||(GAMES[pick].max||2)<2)pick=choice.value||onlineGames()[0]?.id;choice.value=pick;
  renderLobbyGameCards($('lobbyGames'),true);
  const max=GAMES[pick]?.max||2;
  activeLimit=Math.max(2,Math.min(activeLimit,max));
  count.innerHTML='';for(let i=2;i<=max;i++)count.add(new Option(i+' players',String(i)));
  count.disabled=max<3;count.value=String(activeLimit);
  $('playerHint').textContent=max<3?'This game supports 2 active players. Additional guests spectate; voice chat is available when there are spectators.':'Choose how many attendees play. Everyone else spectates; voice chat is available when there are spectators.'}
 else renderLobbyGameCards($('guestLobbyGames'),false);
}
function currentAttendees(){return[{id:myId,key:playerKey,seat:js,name:displayName},...peers().map(C=>({id:C.id,key:C.playerKey||C.id,seat:C.seat,name:peerName(C)}))].sort((a,b)=>a.seat-b.seat)}
function renderAttendanceRoster(attendees,host){
 const list=$('ros');list.innerHTML='';const connected=new Set(attendees.map(A=>A.key));
 const rows=attendees.map(A=>({...A,online:true}));if(host)Object.values(roomAttendance.entries).filter(E=>!connected.has(E.key)).sort((a,b)=>b.lastSeen-a.lastSeen).forEach(E=>rows.push({...E,id:'',online:false}));
 rows.forEach(A=>{const row=document.createElement('div');row.className='attendee-row'+(A.online?'':' attendee-offline');const details=document.createElement('div');details.className='attendee-details';const title=document.createElement('strong');title.textContent=(A.name||'Player '+(A.seat+1))+(A.key===playerKey?' · You':'')+(host&&A.key===playerKey?' · Host':'')+(A.online?'':' · Offline');const meta=document.createElement('small');const history=roomAttendance.entries[A.key];meta.textContent=history?(history.visits||1)+' visit'+((history.visits||1)===1?'':'s')+' · last seen '+new Date(history.lastSeen).toLocaleString():A.online?'Here now':'Previously attended';details.append(title,meta);
  const control=document.createElement('div');control.className='attendee-role';const role=roomAttendance.roles[A.key]||'viewer';if(host&&A.online){const select=document.createElement('select');select.setAttribute('aria-label','Role for '+(A.name||'Player '+(A.seat+1)));select.add(new Option('Playing','player'));select.add(new Option('Viewer','viewer'));select.value=role;select.onchange=()=>{roomAttendance.roles[A.key]=select.value;saveAttendance();lobbyUp()};control.append(select)}else{const badge=document.createElement('span');badge.className='attendee-role-badge';badge.textContent=role==='player'?'Playing':'Viewer';control.append(badge)}
  row.append(details,control);list.append(row)})
}
function lobbyUp(){ensureAttendance();const attendees=currentAttendees(),m=attendees.map(A=>A.seat),h=amHost(),r=ready(),total=m.length;
 if(h){recordAttendance(playerKey,js,true,displayName);attendees.slice(1).forEach(A=>{const entry=roomAttendance.entries[A.key];if(entry){entry.online=true;entry.name=A.name}})}
 updateLobbyControls();
 renderAttendanceRoster(attendees,h);
 $('roomCount').textContent=total+' of 8 attendees connected';
 const game=GAMES[pick],max=game?.max||2,readyToStart=r&&total>=activeLimit&&activeLimit<=max;
 const assigned=attendees.filter(A=>(roomAttendance.roles[A.key]||'viewer')==='player').length;
 const allAssigned=assigned===activeLimit;
 $('stt').classList.toggle('hide',!h);$('wt').classList.toggle('hide',h);
 $('guestChoice').textContent=game?'Host selected '+game.t+' · '+activeLimit+' players will play; others can spectate.':'Waiting for the host to choose a game.';
 $('stt').disabled=!readyToStart||!allAssigned;$('stt').textContent=!allAssigned?'Assign exactly '+activeLimit+' players to start':readyToStart?'Start game · '+activeLimit+' players':total<activeLimit?'Waiting for '+activeLimit+' players…':'Connecting players…';
 $('cp').classList.toggle('hide',!peers().length);updateGameControls()}
function startNet(){const everyone=currentAttendees(),total=everyone.length;
 if(total<activeLimit)return alert('Wait until at least '+activeLimit+' attendees have joined.');
 const players=everyone.filter(A=>(roomAttendance.roles[A.key]||'viewer')==='player').sort((a,b)=>a.seat-b.seat);
 if(players.length!==activeLimit)return alert('Assign exactly '+activeLimit+' attendees as players before starting.');
 const order=players.map(A=>A.id),playerKeys=players.map(A=>A.key),playerNames=players.map(A=>A.name);
 activePlayerKeys=playerKeys;activePlayerNames=playerNames;bcast({k:'start',g:pick,ids:order,playerKeys,playerNames});begin(pick,0,order,false,playerNames)}
function setLobbyPlayerLimit(limit){activeLimit=limit;ensureAttendance();const attendees=currentAttendees(),players=attendees.filter(A=>(roomAttendance.roles[A.key]||'viewer')==='player');if(players.length>limit)players.slice(limit).forEach(A=>{roomAttendance.roles[A.key]='viewer'});else if(players.length<limit)attendees.filter(A=>!players.includes(A)).slice(0,limit-players.length).forEach(A=>{roomAttendance.roles[A.key]='player'});saveAttendance();updateLobbyControls();lobbyUp()}
function resetToLobby(game,limit){clearDisconnectRecovery();pick=GAMES[game]?game:pick;activeLimit=limit||2;activePlayerKeys=[];activePlayerNames=[];gamePlayerNames=[];G=S=undefined;ids=[];seat=99;np=2;dead=new Set();$('dice').classList.add('hide');show('lobby');lobbyUp();updateGameControls();roomUI('ok','Choose a game and start when everyone is ready.')}
function syncMediaButtons(){[['a','topMic','🎤','microphone'],['v','topVideo','📹','camera']].forEach(([key,id,icon,label])=>{const button=$(id);if(!button)return;const track=loc[key],enabled=!!(track&&track.enabled);button.textContent=icon;button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label','Turn '+label+' '+(enabled?'off':'on'));button.title=(enabled?'Turn '+label+' off':'Turn '+label+' on')});updateParticipantList()}
function updateGameControls(){const gameActive=!$('gm').classList.contains('hide'),online=gameActive&&!!(G&&S&&ids.length),inLobby=!$('lobby').classList.contains('hide'),hasPeers=!!peers().length,lobbyReady=inLobby&&!!(room.ws||hasPeers),callAvailable=online||lobbyReady;
 const saved=online&&typeof readLastRoom==='function'?readLastRoom():null,disconnected=online&&!hasPeers;
 $('reconnect').classList.toggle('hide',!(disconnected&&saved&&!saved.host&&saved.code===room.code));
 $('chg').classList.toggle('hide',!online||!amHost());$('topMenu').classList.toggle('hide',!callAvailable);
 $('panelLeave').classList.toggle('hide',!callAvailable);$('panelRestart').classList.toggle('hide',!online);
 $('lb').classList.toggle('hide',inLobby);$('rx').classList.toggle('hide',gameActive&&!online);$('bk').classList.toggle('hide',!gameActive||online);$('rs').classList.toggle('hide',!gameActive||online);
 $('topMic').classList.toggle('hide',!callAvailable);$('topVideo').classList.toggle('hide',!callAvailable);
 $('cp').classList.toggle('hide',!hasPeers);
 if(!callAvailable)closeCallPanel();syncMediaButtons();updateParticipantList()}
function closeCallPanel(){const panel=$('callPanel'),backdrop=$('callPanelBackdrop');panel.hidden=true;backdrop.hidden=true;$('room').classList.remove('call-panel-open');$('topMenu').setAttribute('aria-expanded','false')}
function openCallPanel(){const panel=$('callPanel'),backdrop=$('callPanelBackdrop');if($('topMenu').classList.contains('hide'))return;panel.hidden=false;backdrop.hidden=false;$('room').classList.add('call-panel-open');$('topMenu').setAttribute('aria-expanded','true');$('closeCallPanel').focus()}
$('topMenu').onclick=()=>{if($('callPanel').hidden)openCallPanel();else closeCallPanel()};
$('closeCallPanel').onclick=$('callPanelBackdrop').onclick=closeCallPanel;
$('panelLeave').onclick=()=>{if(!$('gm').classList.contains('hide'))$('bk').click();else $('lb').click()};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('callPanel').hidden){event.stopImmediatePropagation();closeCallPanel();$('topMenu').focus()}},true);
/* invite: create a code for one new player (any connected player can do this) */
async function invite(){await iceReady;if(inv&&!inv.open&&inv.pc.signalingState==='have-local-offer')return; /* a fresh code is already waiting */
 if(inv&&!inv.open){cs=cs.filter(x=>x!==inv);try{inv.pc.close()}catch{}}
 const C=mkC(null,null);inv=C;$('oc').value='Creating code…';$('ar').value='';const ch=C.pc.createDataChannel('g');wire(C,ch);
 try{await C.pc.setLocalDescription(await C.pc.createOffer());await gath(C.pc);if(inv===C)$('oc').value=enc(C.pc.localDescription)}catch{}}
const manual=()=>{if($('mi').open&&!$('lobby').classList.contains('hide'))invite()};
function createLobby(){if(!requireDisplayName(createLobby))return;if(!pick||!GAMES[pick]||(GAMES[pick].max||2)<2)pick=onlineGames()[0]?.id;js=0;hiSeat=0;$('rt').textContent='Create a lobby';$('mt').textContent='Create or join a game';$('room').classList.add('open');$('room').classList.remove('ludo-game');$('room').scrollTop=0;document.body.style.overflow='hidden';show('lobby');lobbyUp();startRoom();manual()}
$('mh').onclick=createLobby;
$('stt').onclick=startNet;$('lb').onclick=$('nb').onclick=closeRoom;
$('createLobbyFromJoin').onclick=createLobby;
$('gameChoice').onchange=()=>{if(!amHost())return;pick=$('gameChoice').value;setLobbyPlayerLimit(Math.min(activeLimit,GAMES[pick]?.max||2));bcast({k:'config',g:pick,limit:activeLimit})};
$('playerCount').onchange=()=>{if(!amHost())return;setLobbyPlayerLimit(+$('playerCount').value||2);bcast({k:'config',g:pick,limit:activeLimit})};
$('chg').onclick=()=>{if(!amHost())return;const g=pick,limit=activeLimit;bcast({k:'lobby',g,limit});resetToLobby(g,limit)};
$('gameChoice').addEventListener('focus',updateLobbyControls);
$('playerCount').addEventListener('focus',updateLobbyControls);
$('hc').onclick=async()=>{try{await inv.pc.setRemoteDescription(dec($('ar').value))}catch{alert('That code is not valid')}};
$('gc').onclick=async()=>{try{await iceReady;const C=mkC(null,null);C.first=1;C.pc.ondatachannel=e=>wire(C,e.channel);await C.pc.setRemoteDescription(dec($('oi').value));await C.pc.setLocalDescription(await C.pc.createAnswer());await gath(C.pc);$('ac').value=enc(C.pc.localDescription)}catch{alert('That code is not valid')}};
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{const t=$(b.dataset.copy);t.select();if(/Android|iPhone|iPad/.test(navigator.userAgent)&&navigator.share)navigator.share({text:t.value}).catch(()=>{});else try{navigator.clipboard.writeText(t.value)}catch{document.execCommand('copy')}});
/* leave the room: close every link, stop camera/mic, clear the game */
function leave(){clearTimeout(aiTimer);localBot=false;clearDisconnectRecovery();if(G&&typeof G.onStop==='function')G.onStop();roomStop();const L=cs;cs=[];rep={};inv=null;js=0;hiSeat=0;activeLimit=2;L.forEach(C=>{try{C.pc.close()}catch{}C.tile?.remove();C.remoteAudio?.remove()});
 Object.keys(loc).forEach(k=>{try{loc[k].stop()}catch{}delete loc[k]});ls=new MediaStream();localVideoHidden=false;closeCallPanel();syncMediaButtons();
 $('lv').classList.add('hide');$('localVideoTile').hidden=true;$('localVideoTile').classList.remove('hide');$('cl').innerHTML='';$('lg').textContent='';$('du').textContent='';$('participantList').innerHTML='';$('participants').hidden=true;ids=[];dead=new Set();G=S=undefined;updateGameControls()}
/* chat */
function say(t,me,C){const p=document.createElement('p'),b=document.createElement('b');b.textContent=(me?displayName:peerName(C))+': ';p.append(b,t);$('cl').append(p);$('cl').scrollTop=1e9}
$('cs').onclick=()=>{const t=$('ci').value.trim();if(t){bcast({k:'m',m:t});say(t,1);$('ci').value=''}};$('ci').addEventListener('keydown',e=>{if(e.key==='Enter')$('cs').click()});
/* voice / video to everyone (data saver on by default) */
const vc=()=>low?{facingMode:'user',width:{ideal:320},height:{ideal:240},frameRate:{ideal:12,max:15}}:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24}};
async function cap(C,k){const x=C.sn[k];if(!x)return;const p=x.getParameters();if(!p.encodings||!p.encodings.length)p.encodings=[{}];p.encodings[0].maxBitrate=k==='a'?(low?20000:32000):(low?150000:500000);try{await x.setParameters(p)}catch{}}
async function tog(k){const n=k==='a'?'🎤 Mic':'📹 Video';
 try{if(!loc[k]){const s=await navigator.mediaDevices.getUserMedia(k==='a'?{audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}}:{video:vc()});loc[k]=s.getTracks()[0];ls.addTrack(loc[k]);
   peers().forEach(C=>{C.sn[k]=C.pc.addTrack(loc[k],ls);cap(C,k)});if(k==='v'){$('lv').srcObject=new MediaStream([loc[k]]);showLocalVideo()}}
  else{loc[k].enabled=!loc[k].enabled;if(k==='v'){if(loc[k].enabled)showLocalVideo();else{$('localVideoTile').hidden=true;updateParticipantList()}}}
  syncMediaButtons()}
 catch(error){alert('Cannot access the '+(k==='a'?'microphone':'camera')+'. Allow permission in your browser. If it keeps failing, open this page directly in Chrome or Safari, not inside another app.');console.warn('[playora] Media permission failed.',error)}}
 $('topMic').onclick=()=>tog('a');$('topVideo').onclick=()=>tog('v');
$('hideLocalVideo').onclick=()=>{localVideoHidden=true;$('localVideoTile').hidden=true;updateParticipantList()};
$('bs').onclick=()=>{low=!low;$('bs').textContent='📉 Data saver: '+(low?'on':'off');peers().forEach(C=>{cap(C,'a');cap(C,'v')});if(loc.v)loc.v.applyConstraints(vc()).catch(()=>{})};
setInterval(flushSig,400);
setInterval(async()=>{try{let t=0;for(const C of cs)(await C.pc.getStats()).forEach(r=>{if((r.type==='outbound-rtp'||r.type==='inbound-rtp')&&r.kind)t+=(r.bytesSent||0)+(r.bytesReceived||0)});if(t)$('du').textContent='Call data used: '+(t/1048576).toFixed(1)+' MB'}catch{}},3000);
