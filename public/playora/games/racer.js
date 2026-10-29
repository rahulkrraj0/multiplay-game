/* global S, seat, ids, amHost, hostSeat, nm, isLocalComputerGame, realtimeSend, registerGame */
(() => {
  "use strict";

  const W = 960;
  const H = 600;
  const CX = W / 2;
  const CY = H / 2;
  const RX = 390;
  const RY = 255;
  const ROAD_INNER = 0.57;
  const ROAD_OUTER = 1.02;
  const LAPS_TO_WIN = 3;
  const SNAPSHOT_MS = 33;
  const INPUT_MS = 33;
  const COLORS = ["#4cc9f0", "#ffbe0b"];
  const names = ["Cyan", "Gold"];
  const carName = (player) => typeof nm === "function" ? nm(player) : names[player];
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const wrap = (value) => ((value % TAU) + TAU) % TAU;
  const finite = (value, min, max) =>
    Number.isFinite(value) && value >= min && value <= max;
  const newControls = () => ({ throttle: 0, brake: 0, left: 0, right: 0 });

  let canvas = null;
  let context = null;
  let frame = 0;
  let lastFrame = 0;
  let accumulator = 0;
  let lastSnapshot = 0;
  let lastInput = 0;
  let inputSequence = 0;
  let snapshotSequence = -1;
  let snapshotReceivedAt = 0;
  let localSeat = 99;
  let keys = new Set();
  let pressed = newControls();
  let onKeyDown;
  let onKeyUp;
  let onBlur;
  let onResize;
  let resizeObserver = null;
  let lastStatusUpdate = 0;

  function newCar(offset) {
    const angle = -Math.PI / 2 - offset;
    const radius = 0.8;
    return {
      x: CX + Math.cos(angle) * RX * radius,
      y: CY + Math.sin(angle) * RY * radius,
      heading: angle + Math.PI / 2,
      speed: 0,
      lap: 0,
      gate: 1,
      progress: wrap(angle + Math.PI / 2),
      controls: newControls(),
      inputSeq: -1,
    };
  }

  function initialState() {
    return {
      t: 0,
      over: 0,
      msg: "",
      startedAt: 0,
      raceAt: 0,
      winner: -1,
      sequence: 0,
      cars: [newCar(0), newCar(0.055)],
    };
  }

  function setControl(name, value) {
    if (name in pressed) pressed[name] = value ? 1 : 0;
  }

  function readControls(player = 0) {
    const control = { ...pressed };
    const up = player === 0 ? "ArrowUp" : "w";
    const down = player === 0 ? "ArrowDown" : "s";
    const left = player === 0 ? "ArrowLeft" : "a";
    const right = player === 0 ? "ArrowRight" : "d";
    if (keys.has(up)) control.throttle = 1;
    if (keys.has(down)) control.brake = 1;
    if (keys.has(left)) control.left = 1;
    if (keys.has(right)) control.right = 1;
    return control;
  }

  function bindInput() {
    onKeyDown = (event) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(key)) return;
      event.preventDefault();
      keys.add(key);
    };
    onKeyUp = (event) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      keys.delete(key);
    };
    onBlur = () => {
      keys.clear();
      pressed = newControls();
    };
    onResize = () => resizeCanvas();
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    document.querySelectorAll(".race-control").forEach((button) => {
      const name = button.dataset.control;
      const start = (event) => {
        event.preventDefault();
        setControl(name, 1);
        button.setPointerCapture?.(event.pointerId);
      };
      const end = () => setControl(name, 0);
      button.addEventListener("pointerdown", start);
      button.addEventListener("pointerup", end);
      button.addEventListener("pointercancel", end);
      button.addEventListener("lostpointercapture", end);
      button._raceEnd = end;
      button._raceStart = start;
    });
  }

  function unbindInput() {
    if (onKeyDown) document.removeEventListener("keydown", onKeyDown);
    if (onKeyUp) document.removeEventListener("keyup", onKeyUp);
    if (onBlur) window.removeEventListener("blur", onBlur);
    if (onResize) window.removeEventListener("resize", onResize);
    document.querySelectorAll(".race-control").forEach((button) => {
      button.removeEventListener("pointerdown", button._raceStart);
      button.removeEventListener("pointerup", button._raceEnd);
      button.removeEventListener("pointercancel", button._raceEnd);
      button.removeEventListener("lostpointercapture", button._raceEnd);
      delete button._raceEnd;
      delete button._raceStart;
    });
    resizeObserver?.disconnect();
    resizeObserver = null;
    keys.clear();
    pressed = newControls();
  }

  function resizeCanvas() {
    if (!canvas || !context) return;
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    context.setTransform(canvas.width / W, 0, 0, canvas.width / W, 0, 0);
  }

  function validControls(value) {
    return value && typeof value === "object" &&
      ["throttle", "brake", "left", "right"].every((key) => value[key] === 0 || value[key] === 1);
  }

  function updateCar(car, dt) {
    const controls = car.controls;
    const outside = Math.hypot((car.x - CX) / RX, (car.y - CY) / RY);
    const onRoad = outside >= ROAD_INNER && outside <= ROAD_OUTER;
    const acceleration = onRoad ? 230 : 100;
    if (controls.throttle) car.speed += acceleration * dt;
    else car.speed -= 34 * dt;
    if (controls.brake) car.speed -= 280 * dt;
    car.speed = clamp(car.speed, 0, onRoad ? 280 : 120);
    const steering = 2.45 * clamp(car.speed / 110, 0, 1);
    if (controls.left) car.heading -= steering * dt;
    if (controls.right) car.heading += steering * dt;
    car.x += Math.cos(car.heading) * car.speed * dt;
    car.y += Math.sin(car.heading) * car.speed * dt;
    if (!onRoad) car.speed *= 0.97;

    const angle = wrap(Math.atan2((car.y - CY) / RY, (car.x - CX) / RX) + Math.PI / 2);
    const advance = wrap(angle - car.progress);
    if (car.speed > 25 && advance < 0.08 && advance > 0) {
      const gateProgress = car.gate * Math.PI / 2;
      if (wrap(gateProgress - car.progress) <= advance + 0.002) {
        if (car.gate === 4) {
          car.gate = 1;
          car.lap += 1;
        } else {
          car.gate += 1;
        }
      }
    }
    if (advance < 0.35) car.progress = angle;
  }

  function computerControls(car) {
    const theta = Math.atan2((car.y - CY) / RY, (car.x - CX) / RX) + 0.14;
    const targetHeading = Math.atan2(RY * Math.cos(theta), -RX * Math.sin(theta));
    const error = wrap(targetHeading - car.heading + Math.PI) - Math.PI;
    return {
      throttle: 1,
      brake: Math.abs(error) > 1.1 ? 1 : 0,
      left: error < -0.04 ? 1 : 0,
      right: error > 0.04 ? 1 : 0,
    };
  }

  function snapshot() {
    return {
      sequence: ++S.sequence,
      raceAt: S.raceAt,
      startedAt: S.startedAt,
      over: S.over,
      winner: S.winner,
      cars: S.cars.map((car) => ({
        x: car.x,
        y: car.y,
        heading: car.heading,
        speed: car.speed,
        lap: car.lap,
        gate: car.gate,
        progress: car.progress,
        controls: { ...car.controls },
      })),
    };
  }

  function validSnapshot(data) {
    return data && Number.isInteger(data.sequence) && data.sequence >= 0 &&
      Number.isFinite(data.raceAt) && Number.isFinite(data.startedAt) &&
      (data.over === 0 || data.over === 1) &&
      Number.isInteger(data.winner) && data.winner >= -1 && data.winner < 2 &&
      (data.over ? data.winner >= 0 : data.winner === -1) &&
      Array.isArray(data.cars) && data.cars.length === 2 &&
      data.cars.every((car) =>
        car && finite(car.x, -1000, 2000) && finite(car.y, -1000, 1600) &&
        finite(car.heading, -1000, 1000) && finite(car.speed, 0, 500) &&
        Number.isInteger(car.lap) && car.lap >= 0 && car.lap <= LAPS_TO_WIN &&
        Number.isInteger(car.gate) && car.gate >= 1 && car.gate <= 4 &&
        finite(car.progress, 0, TAU) && validControls(car.controls));
  }

  function onRealtimeMessage(fromSeat, kind, data) {
    if (kind === "input" && typeof amHost === "function" && amHost()) {
      if (!Number.isInteger(fromSeat) || fromSeat < 0 || fromSeat > 1 ||
          !Number.isSafeInteger(data?.sequence) || data.sequence < 0 ||
          data.sequence <= S.cars[fromSeat].inputSeq ||
          !validControls(data.controls) || S.over) return;
      S.cars[fromSeat].inputSeq = data.sequence;
      S.cars[fromSeat].controls = { ...data.controls };
      return;
    }
    if (kind !== "state" || fromSeat !== (typeof hostSeat === "function" ? hostSeat() : 0) ||
        typeof amHost === "function" && amHost() ||
        !validSnapshot(data) || data.sequence <= snapshotSequence) return;
    snapshotSequence = data.sequence;
    snapshotReceivedAt = Date.now();
    S.sequence = data.sequence;
    S.raceAt = data.raceAt;
    S.startedAt = data.startedAt;
    S.over = data.over;
    S.winner = data.winner;
    data.cars.forEach((car, index) => {
      S.cars[index] = { ...car, controls: { ...car.controls }, inputSeq: S.cars[index]?.inputSeq ?? -1 };
    });
    S.msg = S.over ? carName(S.winner) + " wins the race!" : "";
  }

  function onRealtimeDisconnect(fromSeat) {
    if (typeof amHost !== "function" || !amHost() || !Number.isInteger(fromSeat)) return;
    const car = S.cars[fromSeat];
    if (car) car.controls = newControls();
  }

  function drawTrack(ctx) {
    ctx.fillStyle = "#183b2d";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#344252";
    ctx.beginPath();
    ctx.ellipse(CX, CY, RX, RY, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#214b38";
    ctx.beginPath();
    ctx.ellipse(CX, CY, RX * ROAD_INNER, RY * ROAD_INNER, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "#e9c46a";
    ctx.lineWidth = 3;
    ctx.setLineDash([17, 15]);
    ctx.beginPath();
    ctx.ellipse(CX, CY, RX * 0.79, RY * 0.79, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(255,255,255,.72)";
    ctx.lineWidth = 3;
    [0.02, ROAD_INNER].forEach((scale) => {
      if (scale === 0.02) {
        ctx.beginPath();
        ctx.ellipse(CX, CY, RX * 1.01, RY * 1.01, 0, 0, TAU);
      } else {
        ctx.beginPath();
        ctx.ellipse(CX, CY, RX * scale, RY * scale, 0, 0, TAU);
      }
      ctx.stroke();
    });

    const lineX = CX;
    const lineY = CY - RY * 0.9;
    ctx.save();
    ctx.translate(lineX, lineY);
    ctx.rotate(Math.PI / 2);
    const tile = 14;
    for (let x = -tile * 2; x < tile * 2; x += tile) {
      for (let y = 0; y < tile * 2; y += tile) {
        ctx.fillStyle = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 ? "#111827" : "#f8fafc";
        ctx.fillRect(x, y, tile, tile);
      }
    }
    ctx.restore();

    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("3 LAPS", CX, CY + 8);
  }

  function drawCar(ctx, car, index) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading);
    ctx.shadowColor = "rgba(0,0,0,.4)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = COLORS[index];
    ctx.beginPath();
    ctx.roundRect(-20, -11, 40, 22, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#10202a";
    ctx.fillRect(-6, -8, 15, 16);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillRect(9, -7, 4, 5);
    ctx.fillRect(9, 2, 4, 5);
    ctx.restore();
  }

  function displayCar(car, index, now) {
    if (typeof amHost === "function" && amHost()) return car;
    const elapsed = clamp((now - snapshotReceivedAt) / 1000, 0, 0.1);
    const controls = index === localSeat ? readControls() : car.controls;
    const turn = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    const heading = car.heading + turn * 2.45 * clamp(car.speed / 110, 0, 1) * elapsed;
    const acceleration = controls.throttle ? 230 : -34;
    const speed = clamp(car.speed + acceleration * elapsed - (controls.brake ? 280 * elapsed : 0), 0, 280);
    return {
      ...car,
      x: car.x + Math.cos(heading) * speed * elapsed,
      y: car.y + Math.sin(heading) * speed * elapsed,
      heading,
    };
  }

  function render(now) {
    if (!context || !canvas?.isConnected) return;
    const ctx = context;
    ctx.clearRect(0, 0, W, H);
    drawTrack(ctx);
    S.cars.forEach((car, index) => drawCar(ctx, displayCar(car, index, Date.now()), index));

    const countdown = Math.ceil((S.raceAt - Date.now()) / 1000);
    if (S.raceAt && countdown > 0) {
      ctx.fillStyle = "rgba(5,12,23,.68)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "900 86px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(countdown), CX, CY + 30);
    } else if (S.over) {
      ctx.fillStyle = "rgba(5,12,23,.68)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = COLORS[S.winner];
      ctx.font = "900 44px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(carName(S.winner) + " wins!", CX, CY + 12);
      ctx.fillStyle = "#fff";
      ctx.font = "600 17px system-ui, sans-serif";
      ctx.fillText("The host can restart for another race.", CX, CY + 48);
    }

    if (now - lastStatusUpdate > 180) {
      const local = S.cars[localSeat];
      const status = document.getElementById("st");
      if (status) {
        status.textContent = S.over
          ? S.msg
          : local
            ? "Lap " + Math.min(LAPS_TO_WIN, local.lap + 1) + " of " + LAPS_TO_WIN +
              " · " + Math.round(local.speed) + " km/h · " + carName(localSeat)
            : "Spectating · " + Math.min(LAPS_TO_WIN, S.cars[0].lap + 1) + " of " + LAPS_TO_WIN;
      }
      lastStatusUpdate = now;
    }
  }

  function tick(now) {
    if (!canvas?.isConnected) return;
    if (!lastFrame) lastFrame = now;
    const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    accumulator += elapsed;

    const wallNow = Date.now();
    const isHost = typeof amHost === "function" && amHost();
    const localTwoPlayer = !ids.length && seat < 0;
    const computerOpponent = typeof isLocalComputerGame === "function" && isLocalComputerGame();
    if (!S.over && isHost) {
      const local = S.cars[localSeat];
      if (local && localSeat < 2) local.controls = readControls(0);
      if (localTwoPlayer) S.cars[1].controls = readControls(1);
      else if (computerOpponent) S.cars[1].controls = computerControls(S.cars[1]);
      if (wallNow >= S.raceAt) {
        while (accumulator >= 1 / 60) {
          S.cars.forEach((car) => updateCar(car, 1 / 60));
          accumulator -= 1 / 60;
          const winner = S.cars.findIndex((car) => car.lap >= LAPS_TO_WIN);
          if (winner >= 0) {
            S.over = 1;
            S.winner = winner;
            S.msg = carName(winner) + " wins the race!";
            break;
          }
        }
      } else accumulator = 0;
    }
    if (isHost && now - lastSnapshot >= (S.over ? 300 : SNAPSHOT_MS)) {
        realtimeSend("state", snapshot());
        lastSnapshot = now;
    } else if (!isHost && !S.over && localSeat >= 0 && localSeat < 2 && now - lastInput >= INPUT_MS) {
      realtimeSend("input", { sequence: ++inputSequence, controls: readControls() });
      lastInput = now;
    }
    render(now);
    frame = requestAnimationFrame(tick);
  }

  function start() {
    canvas = document.querySelector(".race-canvas");
    context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    localSeat = Number.isInteger(seat) && seat >= 0 && seat < 2 ? seat : seat < 0 ? 0 : 99;
    if (typeof amHost === "function" && amHost()) {
      S.raceAt = Date.now() + 3200;
      S.startedAt = Date.now();
    }
    bindInput();
    resizeCanvas();
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    lastFrame = 0;
    accumulator = 0;
    lastSnapshot = 0;
    lastInput = 0;
    snapshotSequence = -1;
    snapshotReceivedAt = Date.now();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    unbindInput();
    canvas = null;
    context = null;
  }

  const game = {
    id: "racer",
    i: "🏎️",
    t: "Realtime Racer",
    d: "Race three laps around a top-down track. Steer and accelerate together in real time.",
    max: 2,
    cat: "racing action",
    tag: "Live racing",
    diff: "Easy to learn",
    art: "art-racer",
    n: names,
    realtime: true,
    computer: true,
    init: initialState,
    valid: () => false,
    apply: () => {},
    draw() {
      return [
        '<section class="race" aria-label="Realtime racing game">' +
          '<canvas class="race-canvas" role="img" aria-label="Race track with two cars. Use arrow keys or WASD to steer and accelerate.">' +
          "</canvas>" +
          '<div class="race-help">' +
          (typeof isLocalComputerGame === "function" && isLocalComputerGame()
            ? "Keyboard: arrows · Computer controls Gold · Mobile: hold the controls below"
            : "Keyboard: arrows · Local player 2: WASD · Mobile: hold the controls below") +
          "</div>" +
          '<div class="race-controls" aria-label="Touch racing controls">' +
          '<button class="race-control race-left" type="button" data-control="left" aria-label="Steer left">◀</button>' +
          '<button class="race-control race-brake" type="button" data-control="brake" aria-label="Brake">▼</button>' +
          '<button class="race-control race-throttle" type="button" data-control="throttle" aria-label="Accelerate">▲</button>' +
          '<button class="race-control race-right" type="button" data-control="right" aria-label="Steer right">▶</button>' +
          "</div></section>",
        "Race three laps. Hold accelerate and steer around the track.",
      ];
    },
    click() {},
    onStart: start,
    onStop: stop,
    onRealtimeMessage,
    onRealtimeDisconnect,
  };

  registerGame(game);
})();
