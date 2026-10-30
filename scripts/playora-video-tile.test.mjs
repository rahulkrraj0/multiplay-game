import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "public", "playora", "core", "net.js"), "utf8");
const start = source.indexOf("function makeMediaTileInteractive(");
const end = source.indexOf("\nfunction updateMediaTileHostState", start);
const interactiveFunction = source.slice(start, end);

function createTile() {
  const tileListeners = new Map(), windowListeners = new Map();
  const tile = {
    style: { left: "10px", top: "20px", width: "230px", height: "180px" },
    addEventListener(type, handler) {
      if (!tileListeners.has(type)) tileListeners.set(type, []);
      tileListeners.get(type).push(handler);
    },
    setAttribute() {},
    setPointerCapture() {},
    get offsetWidth() { return Number.parseFloat(this.style.width); },
    get offsetHeight() { return Number.parseFloat(this.style.height); },
    getBoundingClientRect() {
      const left = Number.parseFloat(this.style.left), top = Number.parseFloat(this.style.top);
      const width = this.offsetWidth, height = this.offsetHeight;
      return { left, top, right: left + width, bottom: top + height, width, height };
    },
    pointer(type, event) {
      for (const handler of tileListeners.get(type) || []) handler(event);
    },
  };
  const window = {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { windowListeners.get(type)?.delete(handler); },
    dispatch(type, event) { for (const handler of windowListeners.get(type) || []) handler(event); },
  };
  const sandbox = { window };
  vm.runInNewContext(interactiveFunction, sandbox, { filename: "net.js" });
  const bar = { style: {} }, resize = { setAttribute() {}, style: {} };
  sandbox.makeMediaTileInteractive(tile, bar, resize);
  const event = (pointerId, x, y, isButton = false) => ({
    pointerId, clientX: x, clientY: y, button: 0,
    target: { closest: (selector) => selector === "button" && isButton ? {} : null },
    preventDefault() {}, stopPropagation() {},
  });
  return { tile, window, event };
}

test("video tile drags from its body", () => {
  const { tile, window, event } = createTile();
  tile.pointer("pointerdown", event(1, 120, 110));
  window.dispatch("pointermove", event(1, 150, 135));
  window.dispatch("pointerup", event(1, 150, 135));
  assert.equal(tile.style.left, "40px");
  assert.equal(tile.style.top, "45px");
});

test("video tile resizes from any side and corner", () => {
  const { tile, window, event } = createTile();
  tile.pointer("pointerdown", event(1, 12, 100));
  window.dispatch("pointermove", event(1, 2, 100));
  window.dispatch("pointerup", event(1, 2, 100));
  assert.equal(tile.style.left, "0px");
  assert.equal(tile.style.width, "240px");

  tile.pointer("pointerdown", event(2, 239, 199));
  window.dispatch("pointermove", event(2, 259, 219));
  window.dispatch("pointerup", event(2, 259, 219));
  assert.equal(tile.style.width, "260px");
  assert.equal(tile.style.height, "200px");
});

test("two-pointer pinch changes the video tile size", () => {
  const { tile, window, event } = createTile();
  tile.pointer("pointerdown", event(1, 80, 80));
  tile.pointer("pointerdown", event(2, 160, 160));
  window.dispatch("pointermove", event(2, 240, 240));
  window.dispatch("pointerup", event(2, 240, 240));
  assert.equal(tile.style.width, "460px");
  assert.equal(tile.style.height, "360px");
});

test("video tile buttons remain interactive instead of starting a drag", () => {
  const { tile, window, event } = createTile();
  tile.pointer("pointerdown", event(1, 120, 110, true));
  window.dispatch("pointermove", event(1, 150, 135));
  window.dispatch("pointerup", event(1, 150, 135));
  assert.equal(tile.style.left, "10px");
  assert.equal(tile.style.top, "20px");
});
