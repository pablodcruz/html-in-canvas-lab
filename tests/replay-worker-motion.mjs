import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(process.argv[2] ?? new URL("../features.js", import.meta.url), "utf8");
const start = source.indexOf("function setupWorker()");
const end = source.indexOf("function setupPaintLifecycle()", start);
assert.ok(start >= 0 && end > start);

for (const fallback of [false, true]) {
  let frameSignature;
  let mediaChange;
  const timers = new Map();
  let timerId = 0;
  const schedule = (fn) => {
    timers.set(++timerId, fn);
    return timerId;
  };
  const cancel = (id) => timers.delete(id);
  const motion = {
    matches: true,
    addEventListener(type, fn) {
      assert.equal(type, "change");
      mediaChange = fn;
    },
  };
  const ctx = {
    moveTo(_, y) { frameSignature = y; },
    clearRect() {}, fillRect() {}, beginPath() {}, lineTo() {}, stroke() {},
  };
  const offscreen = { width: 800, height: 230, getContext: () => ctx };
  const canvas = { dataset: {}, ...offscreen };
  const output = { value: "" };
  const window = { matchMedia: () => motion };

  class WorkerDouble {
    constructor(workerSource) {
      this.self = { postMessage: (data) => this.onMessage?.({ data }) };
      vm.runInNewContext(String(workerSource), { self: this.self, setInterval: schedule, clearInterval: cancel });
    }
    addEventListener(_, fn) { this.onMessage = fn; }
    postMessage(data) { this.self.onmessage({ data }); }
  }

  if (!fallback) {
    canvas.transferControlToOffscreen = () => offscreen;
    window.Worker = WorkerDouble;
  }
  vm.runInNewContext(source.slice(start, end) + "\nsetupWorker()", {
    document: { querySelector: (id) => id === "#workerCanvas" ? canvas : output },
    window, capabilities: {}, prefersReducedMotion: motion.matches,
    Worker: WorkerDouble, URL: { createObjectURL: (source) => source },
    Blob: class { constructor([source]) { return new String(source); } },
    requestAnimationFrame(fn) {
      let id = schedule(() => { cancel(id); fn(); });
      return id;
    },
    cancelAnimationFrame: cancel,
  });
  const label = fallback ? "main-thread-fallback" : "offscreen";
  assert.equal(canvas.dataset.workerPath, label);
  assert.equal(timers.size, 0, `${label} must not schedule motion for reduce`);
  assert.equal(output.value, "Static · reduced motion");
  assert.ok(Number.isFinite(frameSignature));
  const staticFrame = frameSignature;
  motion.matches = false;
  mediaChange(motion);
  mediaChange(motion);
  assert.equal(timers.size, 1, "Only one repeating render may run");
  for (let i = 0; i < 12; i++) [...timers.values()].forEach(fn => fn());
  assert.match(output.value, /^\d+ frames$/);
  assert.notEqual(frameSignature, staticFrame);
  motion.matches = true;
  mediaChange(motion);
  assert.equal(timers.size, 0, "Returning to reduce must cancel motion");
  assert.equal(frameSignature, staticFrame);
  assert.equal(output.value, "Static · reduced motion");
  console.log(`${label}: static → animated → static passed`);
}
