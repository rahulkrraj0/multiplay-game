/* Room IDs and invite links.
   Host and guests meet through this site's /api/rtc relay (not the public PeerJS
   cloud, which drops these handshakes), swap connection details, then play
   peer-to-peer. Manual copy-paste codes still work as a fallback. */
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  ROOM_MAX = 8;
const room = { code: "", ws: null, pend: {}, jt: 0, jws: null, jc: null, rejoinId: null };
const hostId = (c) => "h" + c,
  rtcKey = (c) => "g" + c,
  joinId = () => "j" + myId + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const roomLink = () => location.href.split(/[?#]/)[0] + "?room=" + room.code;
const newCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((x) => ALPHA[x % 32]).join("");
const parseCode = (s) => {
  s = (s || "").trim();
  const m = s.match(/[?&#]room=([^&#\s]+)/i);
  if (m) s = m[1];
  return s.replace(/^playora-/i, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
};
function api(path) {
  const h = location.hostname.toLowerCase();
  let pre = "";
  if (h === "preview.grok.genai.mil" || h === "preview.grok.mil" || h === "preview.grokgsac.com") {
    const m = location.pathname.match(/^\/hds-[a-z0-9]+-\d+-[a-z0-9]+/i);
    if (m) pre = m[0];
  }
  return pre + path;
}
const iceReady = (async () => {
  if (!window.PLAYORA?.iceUrl) return;
  try {
    const response = await fetch(api(PLAYORA.iceUrl), { cache: "no-store" });
    const config = await response.json();
    if (!response.ok) throw new Error(config.error || "ICE configuration unavailable");
    if (Array.isArray(config.iceServers) && config.iceServers.length) {
      CFG.iceServers = config.iceServers;
    }
  } catch (error) {
    console.warn("[playora] Could not load TURN configuration; direct connections may still work.", error);
  }
})();
async function sgn(ws, type, dst, payload) {
  if (!ws || ws.closed) return;
  const body = JSON.stringify({
    op: "signal",
    room: ws.rtcRoom,
    from: ws.id,
    to: dst,
    kind: type === "ANSWER" ? "answer" : "offer",
    payload,
  });
  let err;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(api("/api/rtc"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (r.ok) return;
      let detail = "";
      try {
        detail = (await r.json()).error || "";
      } catch {}
      err = new Error(detail || "signal " + r.status);
    } catch (e) {
      err = e;
    }
    await new Promise((res) => setTimeout(res, 250 * (i + 1)));
  }
  throw err || new Error("signal");
}
function sigOpen(id, onmsg, rtcRoom) {
  const sess = { id, rtcRoom, onmsg, cursor: 0, closed: false, hb: 0, onclose: null, fails: 0, busy: 0, peers: [] };
  const take = async () => {
    const q = new URLSearchParams({ room: rtcRoom, peer: id, name: "", since: String(sess.cursor) });
    const res = await fetch(api("/api/rtc?" + q), { cache: "no-store" });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json()).error || "";
      } catch {}
      throw new Error(detail || "network (" + res.status + ")");
    }
    const body = await res.json();
    if (sess.closed) return [];
    sess.peers = body.peers || [];
    const out = [];
    for (const sig of body.signals || []) {
      const idn = Number(sig.id) || 0;
      if (idn > sess.cursor) sess.cursor = idn;
      let payload = sig.payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          continue;
        }
      }
      out.push({ type: sig.kind === "answer" ? "ANSWER" : "OFFER", src: sig.from, payload: payload || {} });
    }
    return out;
  };
  const dispatch = (msgs) => {
    for (const m of msgs) if (!sess.closed) sess.onmsg(m);
  };
  const tick = async () => {
    if (sess.closed || sess.busy) return;
    sess.busy = 1;
    try {
      dispatch(await take());
      sess.fails = 0;
    } catch {
      if (++sess.fails >= 8 && !sess.closed) {
        sess.closed = true;
        clearInterval(sess.hb);
        if (sess.onclose) sess.onclose();
      }
    } finally {
      sess.busy = 0;
    }
  };
  return new Promise((resolve, reject) => {
    (async () => {
      let first = [];
      for (let i = 0; i < 10; i++) {
        try {
          first = await take();
          break;
        } catch (e) {
          if (i === 9) return reject(e instanceof Error ? e : new Error("network"));
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      if (sess.closed) return;
      sess.hb = setInterval(() => void tick(), 2000);
      resolve(sess);
      setTimeout(() => dispatch(first), 0);
    })();
  });
}
function sigClose(ws) {
  if (!ws) return;
  ws.closed = true;
  ws.onclose = null;
  clearInterval(ws.hb);
  fetch(api("/api/rtc"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "leave", room: ws.rtcRoom, peer: ws.id }),
    keepalive: true,
  }).catch(() => {});
}

function roomUI(state, msg) {
  const c = room.code;
  $("rm").classList.toggle("hide", !c);
  $("rid").value = c;
  $("rlk").value = c ? roomLink() : "";
  $("rst").textContent = msg || "";
  $("rm").dataset.s = state || "";
}
async function startRoom(preferredCode) {
  roomStop();
  room.code = preferredCode || newCode();
  roomUI("wait", "Creating room…");
  await iceReady;
  let failure = null;
  for (let i = 0; i < 4; i++) {
    try {
      room.ws = await sigOpen(hostId(room.code), hostMsg, rtcKey(room.code));
      watch(room.ws);
      roomUI("ok", "Room is open – share the ID or link. Friends join automatically.");
      lobbyUp();
      updateGameControls();
      return;
    } catch (e) {
      if (e.message === "ID-TAKEN") {
        room.code = newCode();
        roomUI("wait", "Creating room…");
        continue;
      }
      failure = e;
      break;
    }
  }
  room.ws = null;
  roomUI(
    "err",
    failure?.message ||
      "Could not reach the matchmaking service. Use “Invite with a manual code” below instead.",
  );
  $("mi").open = true;
}
async function claimRoom() {
  if (!room.code || room.ws) return;
  const c = room.code;
  for (let i = 0; i < 10 && room.code === c && amHost(); i++) {
    try {
      room.ws = await sigOpen(hostId(c), hostMsg, rtcKey(c));
      watch(room.ws);
      lobbyUp();
      return roomUI("ok", "You are now the host – the Room ID still works.");
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
function watch(ws) {
  ws.onclose = () => {
    clearInterval(ws.hb);
    if (room.ws === ws) {
      room.ws = null;
      if (room.code && amHost()) {
        roomUI("wait", "Reconnecting room…");
        setTimeout(claimRoom, 2000);
      }
    }
  };
}
function hostMsg(m) {
  const p = m.payload || {};
  if (m.type === "OFFER" && p.k === "probe") {
    void sgn(room.ws, "OFFER", m.src, { k: "probe-ack" }).catch((error) =>
      console.warn("[playora] Could not confirm the active room host.", error),
    );
  }
  if (m.type === "OFFER" && p.k === "join") admit(m.src);
  if (m.type === "ANSWER" && p.k === "answer") {
    const C = room.pend[m.src];
    if (C) C.pc.setRemoteDescription(p.sdp).catch(() => {});
  }
}
async function roomHostAvailable(code) {
  const probe = "p" + myId + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let resolveProbe;
  const response = new Promise((resolve) => {
    resolveProbe = resolve;
  });
  const ws = await sigOpen(
    probe,
    (m) => {
      if (m.type === "OFFER" && m.payload?.k === "probe-ack") resolveProbe(true);
    },
    rtcKey(code),
  );
  const hostListed = ws.peers.some((peer) => peer.id === hostId(code));
  const timeout = setTimeout(() => resolveProbe(false), 6000);
  try {
    await sgn(ws, "OFFER", hostId(code), { k: "probe" });
    return (await response) || hostListed;
  } finally {
    clearTimeout(timeout);
    sigClose(ws);
  }
}
async function admit(src) {
  if (room.pend[src]) return;
  const pending = Object.values(room.pend).filter((C) => !C.id).length;
  if (peers().length + 1 + pending >= ROOM_MAX) return sgn(room.ws, "OFFER", src, { k: "full" });
  const C = mkC(null, null);
  C.adm = 1;
  room.pend[src] = C;
  wire(C, C.pc.createDataChannel("g"));
  try {
    await C.pc.setLocalDescription(await C.pc.createOffer());
    await gath(C.pc);
    await sgn(room.ws, "OFFER", src, { k: "offer", sdp: C.pc.localDescription });
  } catch {}
  setTimeout(() => {
    if (room.pend[src] === C) delete room.pend[src];
    if (!C.open) {
      cs = cs.filter((x) => x !== C);
      try {
        C.pc.close();
      } catch {}
    }
  }, 30000);
}
function roomStop() {
  sigClose(room.ws);
  room.ws = null;
  Object.values(room.pend).forEach((C) => {
    try {
      C.pc.close();
    } catch {}
  });
  room.pend = {};
  room.code = "";
  clearTimeout(room.jt);
  sigClose(room.jws);
  room.jws = null;
  room.jc = null;
  room.rejoinId = null;
  if ($("rm")) roomUI("");
}

const hasTurn = () => CFG.iceServers.some((x) => [].concat(x.urls).some((u) => /^turns?:/i.test(u)));
const strictMsg = () =>
  hasTurn()
    ? "Reached the room, but no connection could be made even through the relay. Try a different network (for example Wi-Fi instead of mobile data)."
    : "Reached the room, but a direct connection could not be made. This usually means one of you is on a strict network (some mobile data or office Wi-Fi). Try another network, or configure METERED_DOMAIN and METERED_API_KEY in Vercel.";
function linkFailed(C) {
  if (C === room.jc)
    return jfail(strictMsg());
  if (C.adm)
    roomUI(
      "ok",
      "A player could not connect. " +
        (hasTurn()
          ? "TURN is configured, but this player's network may still block it. Ask them to try another network."
          : "TURN is not configured. Add METERED_DOMAIN and METERED_API_KEY in Vercel, then redeploy."),
    );
}
function setJoinProgress(active) {
  $("joinProgress").hidden = !active;
  $("joinOptions").hidden = active;
}
function resetJoinScreen() {
  setJoinProgress(false);
  $("jst").textContent = "";
  $("jst").dataset.bad = "";
  $("jst").dataset.busy = "";
  $("jgo").disabled = false;
  $("jid").disabled = false;
}
const jmsg = (t, bad) => {
  $("jst").textContent = t || "";
  $("jst").dataset.bad = bad ? 1 : "";
  $("jst").dataset.busy = !bad && /connecting to lobby|lobby found|host found/i.test(t || "") ? 1 : "";
  if (bad) setJoinProgress(false);
  else if (!$("joinProgress").hidden) $("joinProgressText").textContent = /lobby found|host found/i.test(t || "")
    ? "Lobby found. Finishing your connection…"
    : "Please wait while we connect you to the host.";
  if (document.body.classList.contains("invite-mode")) $("inviteStatus").textContent = t || "";
};
function jfail(t) {
  clearTimeout(room.jt);
  room.jt = 0;
  room.rejoinId = null;
  sigClose(room.jws);
  room.jws = null;
  if (room.jc) {
    cs = cs.filter((x) => x !== room.jc);
    try {
      room.jc.pc.close();
    } catch {}
    room.jc = null;
  }
  $("jgo").disabled = false;
  $("jid").disabled = false;
  room.code = "";
  jmsg(t, 1);
}
function roomJoined() {
  clearTimeout(room.jt);
  room.jt = 0;
  sigClose(room.jws);
  room.jws = null;
  room.jc = null;
  $("jgo").disabled = false;
  $("jid").disabled = false;
  setJoinProgress(false);
  jmsg("");
}
async function joinRoom(raw) {
  if (!requireDisplayName(() => joinRoom(raw))) return;
  const code = parseCode(raw);
  if (code.length < 4) {
    setJoinProgress(false);
    return jmsg("Enter a valid room code (at least 4 characters).", 1);
  }
  sigClose(room.jws);
  room.jc = null;
  clearTimeout(room.jt);
  $("jgo").disabled = true;
  $("jid").disabled = true;
  setJoinProgress(true);
  jmsg("Connecting to lobby… Please wait.");
  const host = hostId(code);
  room.code = code;
  room.jt = setTimeout(
    () =>
      jfail(
        room.jc
          ? strictMsg()
          : "Could not connect. Check the Room ID and that the host is still waiting in the lobby. If this keeps happening, try the manual code below.",
      ),
    25000,
  );
  await iceReady;
  if (room.code !== code || !room.jt) return;
  let ws;
  try {
    ws = room.jws = await sigOpen(
      joinId(),
      async (m) => {
        const p = m.payload || {};
        if (m.type === "OFFER" && p.k === "full") return jfail("That room is full.");
        if (m.type === "OFFER" && p.k === "offer" && !room.jc) {
          jmsg("Lobby found — finishing connection… Please wait.");
          const C = (room.jc = mkC(null, null));
          C.first = 1;
          C.pc.ondatachannel = (e) => wire(C, e.channel);
          try {
            await C.pc.setRemoteDescription(p.sdp);
            await C.pc.setLocalDescription(await C.pc.createAnswer());
            await gath(C.pc);
            await sgn(ws, "ANSWER", host, { k: "answer", sdp: C.pc.localDescription });
          } catch {
            jfail("Could not set up the connection. Please try again.");
          }

        }
      },
      rtcKey(code),
    );
  } catch (e) {
    return jfail(
      "Could not reach the matchmaking service (" + (e.message || "network") + "). Check your internet, or use the manual code below.",
    );
  }
  if (room.code !== code || !room.jt) {
    sigClose(ws);
    return;
  }
  try {
    await sgn(ws, "OFFER", host, { k: "join" });
  } catch {
    jfail("Could not reach the room. Check the Room ID and try again.");
  }
}

async function rejoinLastRoom() {
  if (!requireDisplayName(rejoinLastRoom)) return;
  const saved = readLastRoom();
  if (!saved) {
    updateRejoinButton();
    return;
  }
  const game = GAMES[saved.game] ? saved.game : Object.keys(GAMES)[0];
  const savedPlayerId =
    typeof saved.playerId === "string" && /^[a-z0-9]{1,32}$/i.test(saved.playerId)
      ? saved.playerId
      : null;
  if (saved.host) {
    openRoom("join");
    $("jid").value = saved.code;
    setJoinProgress(true);
    jmsg("Checking the saved room… Please wait.");
    let hostAvailable;
    try {
      hostAvailable = await roomHostAvailable(saved.code);
    } catch (error) {
      setJoinProgress(false);
      return jmsg(
        "Could not check the saved room (" + (error.message || "network") + "). Please try again.",
        1,
      );
    }
    if (hostAvailable) {
      room.rejoinId = savedPlayerId;
      void joinRoom(saved.code);
      return;
    }
    setJoinProgress(false);
    try {
      await window.ensurePlayoraGame(game);
    } catch (error) {
      return jmsg(
        "Could not load the saved game (" + (error.message || "network") + "). Please try again.",
        1,
      );
    }
    openRoom(game);
    pick = game;
    activeLimit = Math.max(2, Number(saved.limit) || 2);
    js = 0;
    hiSeat = 0;
    show("lobby");
    lobbyUp();
    void startRoom(saved.code);
    return;
  }
  room.rejoinId = savedPlayerId;
  openRoom("join");
  $("jid").value = saved.code;
  void joinRoom(saved.code);
}
let networkWasOffline = false;
window.addEventListener("offline", () => {
  if (!room.code || !ids.length) return;
  networkWasOffline = true;
  $("lg").textContent = "Internet connection lost – reconnecting when it returns";
});
window.addEventListener("online", () => {
  if (!networkWasOffline) return;
  networkWasOffline = false;
  if (!room.code || !ids.length) return;
  setTimeout(() => {
    if (!navigator.onLine) {
      networkWasOffline = true;
      return;
    }
    if (amHost()) {
      if (!room.ws) void claimRoom();
      return;
    }
    const saved = readLastRoom();
    if (saved && saved.code === room.code) {
      room.rejoinId = saved.playerId;
      rejoinLastRoom();
    }
  }, 500);
});

$("jgo").onclick = () => joinRoom($("jid").value);
$("inviteJoin").onclick = () => {
  clearAutoRejoin();
  const code = $("inviteCode").textContent;
  document.body.classList.remove("invite-mode");
  $("playora-root").removeAttribute("data-invite");
  $("invitePage").hidden = true;
  openRoom("join");
  $("jid").value = code;
  void joinRoom(code);
};
$("jid").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("jgo").click();
});
const copyTxt = (b, t) => {
  const o = b.textContent;
  const ok = () => {
    b.textContent = "Copied ✓";
    setTimeout(() => (b.textContent = o), 1500);
  };
  try {
    navigator.clipboard.writeText(t).then(ok, () => alert(t));
  } catch {
    alert(t);
  }
};
$("rcp").onclick = () => copyTxt($("rcp"), room.code);
$("rcl").onclick = () => copyTxt($("rcl"), roomLink());
$("rsh").onclick = () => {
  const t = "Join my game on Playora! Room ID: " + room.code;
  if (navigator.share) navigator.share({ title: "Join my game", text: t, url: roomLink() }).catch(() => {});
  else {
    try {
      navigator.clipboard.writeText(t + "\n" + roomLink());
      $("rsh").textContent = "Copied ✓";
      setTimeout(() => ($("rsh").textContent = "📤 Share invite"), 1500);
    } catch {
      alert(t + "\n" + roomLink());
    }
  }
};
$("mi").ontoggle = () => manual();
(() => {
  const c = parseCode(new URLSearchParams(location.search).get("room"));
  if (!c) return;
  document.body.classList.add("invite-mode");
  $("invitePage").hidden = false;
  $("inviteCode").textContent = c;
})();
