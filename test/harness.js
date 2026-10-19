"use strict";

/*
 * love-soundboard — Node harness (no dependencies).
 *
 * Loads js/app.js inside a fake-DOM sandbox and asserts the pure logic
 * (pad editing, id generation, sequence recording). Run with:
 *
 *   node test/harness.js
 */

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const store = {};

const el = () => ({
  style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  dataset: {},
  appendChild() {},
  addEventListener() {},
  setAttribute() {},
  removeAttribute() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  focus() {},
  remove() {},
  innerHTML: "",
  textContent: "",
  value: ""
});

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  Intl,
  performance: { now: () => 0 },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => el(),
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    documentElement: { classList: { add() {}, remove() {}, toggle() {} } }
  },
  navigator: { language: "en", clipboard: { writeText: async () => {} } },
  requestAnimationFrame: (fn) => setTimeout(fn, 0)
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = process.argv.slice(2);
for (const f of (files.length ? files : [path.join("js", "app.js")])) {
  vm.runInContext(fs.readFileSync(f, "utf8"), sandbox, { filename: f });
}

/* ---------------- assertions ---------------- */

const S = sandbox.window.MenaSoundboard;

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
    process.exitCode = 1;
  } else {
    console.log("ok - " + msg);
  }
}

assert(!!S, "namespace exposed");

/* clampFreq */
assert(S.clampFreq(440) === 440, "clampFreq keeps a normal value");
assert(S.clampFreq(NaN) === 440, "clampFreq falls back to 440");
assert(S.clampFreq(10) === 40, "clampFreq floors at 40");
assert(S.clampFreq(9999) === 4000, "clampFreq caps at 4000");
assert(S.clampFreq("880") === 880, "clampFreq parses strings");

/* clampDur */
assert(S.clampDur(0.2) === 0.2, "clampDur keeps a normal value");
assert(S.clampDur(0.001) === 0.05, "clampDur floors at 0.05");
assert(S.clampDur(9) === 2, "clampDur caps at 2");

/* waveName / colourName */
assert(S.waveName("square") === "square", "waveName accepts known wave");
assert(S.waveName("nope") === "sine", "waveName falls back to sine");
assert(S.colourName("gold") === "gold", "colourName accepts known colour");
assert(S.colourName("nope") === "pink", "colourName falls back to pink");

/* padColour */
assert(S.COLOURS.indexOf(S.padColour(0)) === 0, "padColour(0) is first colour");
assert(S.padColour(7) === S.COLOURS[2], "padColour wraps by index");

/* nextId */
assert(S.nextId([]) === "p1", "nextId on empty is p1");
assert(S.nextId([{ id: "p1" }, { id: "p3" }]) === "p4", "nextId skips ahead");
assert(S.nextId([{ id: "custom" }]) === "p1", "nextId ignores non-p ids");

/* addPad (pure) */
const base = [{ id: "p1", name: "A", freq: 100, wave: "sine", dur: 0.1, color: "pink" }];
const added = S.addPad(base, { id: "p2", name: "B", freq: 200, wave: "square", dur: 0.2, color: "gold" });
assert(added.length === 2 && base.length === 1, "addPad returns a new array");
assert(S.addPad(base).length === 2, "addPad auto-assigns an id");

/* updatePad */
const upd = S.updatePad(base, "p1", { name: "Renamed", freq: 5000 });
assert(upd[0].id === "p1", "updatePad keeps the id");
assert(upd[0].name === "Renamed", "updatePad renames");
assert(upd[0].freq === 4000, "updatePad clamps the frequency");
assert(base[0].name === "A", "updatePad does not mutate the original");

/* removePad */
assert(S.removePad(added, "p1").length === 1, "removePad drops a pad");
assert(S.removePad(added, "nope").length === 2, "removePad ignores unknown ids");

/* movePad */
const moved = S.movePad(added, "p2", -1);
assert(moved[0].id === "p2", "movePad swaps upward");
assert(S.movePad(added, "p1", -1)[0].id === "p1", "movePad clamps at the top");

/* defaultPads */
const defs = S.defaultPads();
assert(defs.length >= 8, "several default pads ship");
assert(new Set(defs.map((p) => p.id)).size === defs.length, "default pad ids are unique");
assert(defs.every((p) => S.WAVES.indexOf(p.wave) !== -1), "default pads use valid waves");
assert(defs.every((p) => p.freq >= 40 && p.freq <= 4000), "default pad freqs in range");

/* recordEvent + seqDuration */
let seq = [];
seq = S.recordEvent(seq, "p1", 0);
seq = S.recordEvent(seq, "p2", 250);
seq = S.recordEvent(seq, "p1", -10);
assert(seq.length === 3, "recordEvent appends");
assert(seq[2].at === 0, "recordEvent clamps negative offsets");
assert(S.seqDuration(seq) === 250, "seqDuration returns the last offset");
assert(S.seqDuration([]) === 0, "seqDuration on empty is 0");

/* seqToText */
assert(S.seqToText([{ padId: "p1", at: 0 }], defs).length > 0, "seqToText names a pad");
assert(S.seqToText([{ padId: "zzz", at: 0 }], defs) === "?", "seqToText marks unknown pads");

/* encode/decode round trip */
const code = S.encodeSeq(seq);
assert(S.decodeSeq(code).length === 3, "sequence round-trips through text");
assert(S.decodeSeq(S.encodeSeq(seq))[1].padId === "p2", "round-trip preserves pad ids");
assert(S.decodeSeq(S.encodeSeq(seq))[1].at === 250, "round-trip preserves timing");
assert(S.decodeSeq("").length === 0, "decodeSeq handles empty text");

/* escapeHtml */
assert(S.escapeHtml("<b>&\"'") === "&lt;b&gt;&amp;&quot;&#39;", "escapeHtml escapes markup");

console.log(failures ? ("\n" + failures + " failing assertion(s)") : "\nAll love-soundboard harness checks passed.");
