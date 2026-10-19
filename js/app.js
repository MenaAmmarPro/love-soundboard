"use strict";

/*
 * love-soundboard — our inside-joke soundboard.
 *
 * A grid of pads; each pad plays a Web Audio synthesised sound (frequency,
 * waveform, duration). Add / rename / delete pads, record a sequence of
 * presses and replay it. No audio files at all — every sound is generated.
 *
 * Pure logic is exposed on `window.MenaSoundboard` so it can be tested with a
 * bare Node harness (test/harness.js).
 */

(function () {
  var STORE = "mena-soundboard";

  var WAVES = ["sine", "square", "sawtooth", "triangle"];
  var COLOURS = ["pink", "purple", "gold", "blue", "white"];

  var MIN_FREQ = 40;
  var MAX_FREQ = 4000;
  var MIN_DUR = 0.05;
  var MAX_DUR = 2;

  /* ---------- pure helpers ---------- */

  function clampFreq(f) {
    var n = Math.round(Number(f));
    if (!isFinite(n)) return 440;
    return Math.max(MIN_FREQ, Math.min(MAX_FREQ, n));
  }

  function clampDur(d) {
    var n = Number(d);
    if (!isFinite(n)) return 0.2;
    return Math.max(MIN_DUR, Math.min(MAX_DUR, Math.round(n * 100) / 100));
  }

  function waveName(w) {
    return WAVES.indexOf(w) === -1 ? "sine" : w;
  }

  function colourName(c) {
    return COLOURS.indexOf(c) === -1 ? COLOURS[0] : c;
  }

  function padColour(index) {
    var i = Math.abs(index | 0) % COLOURS.length;
    return COLOURS[i];
  }

  // Map a keyboard digit to a pad index: 1-9 -> 0-8, 0 -> 9. -1 = no match.
  function keyToPadIndex(key, count) {
    if (!/^[0-9]$/.test(String(key))) return -1;
    var n = Number(key);
    var i = n === 0 ? 9 : n - 1;
    return i < (count | 0) ? i : -1;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function findPad(pads, id) {
    var list = Array.isArray(pads) ? pads : [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  function padIndex(pads, id) {
    var list = Array.isArray(pads) ? pads : [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].id === id) return i;
    }
    return -1;
  }

  function nextId(pads) {
    var list = Array.isArray(pads) ? pads : [];
    var max = 0;
    for (var i = 0; i < list.length; i += 1) {
      var m = /^p(\d+)$/.exec(list[i] && list[i].id ? list[i].id : "");
      if (m) max = Math.max(max, Number(m[1]));
    }
    return "p" + (max + 1);
  }

  function normalizePad(pad, id) {
    var p = pad || {};
    return {
      id: id || (p.id ? String(p.id) : "p0"),
      name: String(p.name || "Sound").slice(0, 40),
      freq: clampFreq(p.freq),
      wave: waveName(p.wave),
      dur: clampDur(p.dur),
      color: colourName(p.color)
    };
  }

  function addPad(pads, pad) {
    var list = Array.isArray(pads) ? pads.slice() : [];
    var id = pad && pad.id ? String(pad.id) : nextId(list);
    list.push(normalizePad(pad, id));
    return list;
  }

  function updatePad(pads, id, patch) {
    var list = (Array.isArray(pads) ? pads : []).map(function (p) {
      if (!p || p.id !== id) return p;
      var merged = {
        id: p.id,
        name: patch && patch.name != null ? patch.name : p.name,
        freq: patch && patch.freq != null ? patch.freq : p.freq,
        wave: patch && patch.wave != null ? patch.wave : p.wave,
        dur: patch && patch.dur != null ? patch.dur : p.dur,
        color: patch && patch.color != null ? patch.color : p.color
      };
      return normalizePad(merged, p.id);
    });
    return list;
  }

  function removePad(pads, id) {
    return (Array.isArray(pads) ? pads : []).filter(function (p) {
      return p && p.id !== id;
    });
  }

  function movePad(pads, id, dir) {
    var list = (Array.isArray(pads) ? pads : []).slice();
    var i = padIndex(list, id);
    if (i === -1) return list;
    var j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= list.length) return list;
    var tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
    return list;
  }

  function defaultPads() {
    return [
      normalizePad({ name: "Pop", freq: 440, wave: "sine", dur: 0.12, color: "pink" }, "p1"),
      normalizePad({ name: "Bleep", freq: 880, wave: "square", dur: 0.1, color: "purple" }, "p2"),
      normalizePad({ name: "Boom", freq: 110, wave: "sine", dur: 0.5, color: "gold" }, "p3"),
      normalizePad({ name: "Zap", freq: 320, wave: "sawtooth", dur: 0.15, color: "blue" }, "p4"),
      normalizePad({ name: "Sparkle", freq: 1320, wave: "triangle", dur: 0.25, color: "white" }, "p5"),
      normalizePad({ name: "Heartbeat", freq: 70, wave: "sine", dur: 0.3, color: "pink" }, "p6"),
      normalizePad({ name: "Coin", freq: 988, wave: "square", dur: 0.14, color: "gold" }, "p7"),
      normalizePad({ name: "Wobble", freq: 200, wave: "triangle", dur: 0.4, color: "purple" }, "p8"),
      normalizePad({ name: "Ding", freq: 1480, wave: "sine", dur: 0.6, color: "white" }, "p9"),
      normalizePad({ name: "Growl", freq: 90, wave: "sawtooth", dur: 0.35, color: "blue" }, "p10")
    ];
  }

  /* ---------- sequence (recorder) ---------- */

  function recordEvent(seq, padId, at) {
    var list = Array.isArray(seq) ? seq.slice() : [];
    list.push({ padId: String(padId), at: Math.max(0, Math.round(Number(at) || 0)) });
    return list;
  }

  function seqDuration(seq) {
    var list = Array.isArray(seq) ? seq : [];
    var max = 0;
    for (var i = 0; i < list.length; i += 1) {
      var at = Number(list[i] && list[i].at) || 0;
      if (at > max) max = at;
    }
    return max;
  }

  function seqToText(seq, pads) {
    var list = Array.isArray(seq) ? seq : [];
    return list
      .map(function (e) {
        var pad = findPad(pads, e.padId);
        return pad ? pad.name : "?";
      })
      .join(" \u00B7 ");
  }

  function encodeSeq(seq) {
    var list = Array.isArray(seq) ? seq : [];
    return list
      .map(function (e) {
        return (e.padId || "") + "@" + (Math.max(0, Math.round(Number(e.at) || 0)));
      })
      .join(",");
  }

  function decodeSeq(code) {
    var out = [];
    if (typeof code !== "string" || !code) return out;
    code.split(",").forEach(function (part) {
      var at = part.lastIndexOf("@");
      if (at <= 0) return;
      var padId = part.slice(0, at);
      var t = Number(part.slice(at + 1));
      if (!padId || !isFinite(t)) return;
      out.push({ padId: padId, at: Math.max(0, Math.round(t)) });
    });
    return out;
  }

  /* ---------- storage ---------- */

  var state = {
    pads: defaultPads(),
    seq: [],
    colours: true,
    loop: false
  };

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORE); } catch (e) { raw = null; }
    var s = null;
    if (raw) { try { s = JSON.parse(raw); } catch (e) { s = null; } }
    if (!s) return;

    if (Array.isArray(s.pads) && s.pads.length) {
      state.pads = [];
      s.pads.forEach(function (p) {
        if (p && typeof p.id === "string") {
          state.pads.push(normalizePad(p, String(p.id)));
        }
      });
      if (!state.pads.length) state.pads = defaultPads();
    }
    if (Array.isArray(s.seq)) {
      state.seq = decodeSeq(encodeSeq(s.seq));
    }
    if (typeof s.loop === "boolean") state.loop = s.loop;
    if (typeof s.colours === "boolean") state.colours = s.colours;
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /* ---------- Web Audio ---------- */

  var audioCtx = null;

  function getAudio() {
    if (audioCtx) return audioCtx;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    } catch (e) {
      audioCtx = null;
    }
    return audioCtx;
  }

  function playPad(pad) {
    if (!pad) return;
    var ctx = getAudio();
    if (!ctx) return;
    var now = ctx.currentTime;
    var dur = clampDur(pad.dur);
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = waveName(pad.wave);
      osc.frequency.setValueAtTime(clampFreq(pad.freq), now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + Math.min(0.02, dur / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.03);
    } catch (e) { /* audio is a bonus, never fatal */ }
  }

  /* ---------- recorder + replay ---------- */

  var rec = { active: false, start: 0 };
  var playTimers = [];

  function now() {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  }

  function startRecord() {
    rec.active = true;
    rec.start = now();
    state.seq = [];
    save();
    renderSeq();
  }

  function stopRecord() {
    rec.active = false;
    renderControls();
  }

  function pressPad(id, fromReplay) {
    var pad = findPad(state.pads, id);
    playPad(pad);
    if (rec.active && !fromReplay) {
      state.seq = recordEvent(state.seq, id, now() - rec.start);
      save();
      renderSeq();
    }
    flashPad(id);
  }

  function stopPlayback() {
    playTimers.forEach(function (t) { clearTimeout(t); });
    playTimers = [];
    playing = false;
    renderControls();
  }

  var playing = false;

  function replay() {
    if (playing) {
      stopPlayback();
      return;
    }
    var seq = state.seq;
    if (!seq.length) return;
    playing = true;
    renderControls();

    function schedule() {
      for (var i = 0; i < seq.length; i += 1) {
        (function (e) {
          playTimers.push(setTimeout(function () {
            pressPad(e.padId, true);
          }, e.at));
        })(seq[i]);
      }
      var total = seqDuration(seq) + 400;
      playTimers.push(setTimeout(function () {
        if (state.loop && playing) {
          schedule();
        } else {
          playing = false;
          renderControls();
        }
      }, total));
    }

    schedule();
  }

  /* ---------- DOM helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = String(value);
  }

  /* ---------- rendering ---------- */

  var selectedId = null;
  var editMode = false;

  function renderPads() {
    var host = $("pad-grid");
    if (!host) return;
    host.textContent = "";
    state.pads.forEach(function (pad) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pad pad-" + colourName(pad.color) + (state.colours ? "" : " no-colour");
      btn.setAttribute("data-id", pad.id);
      if (pad.id === selectedId && editMode) btn.classList.add("is-selected");

      var name = document.createElement("span");
      name.className = "pad-name";
      name.textContent = pad.name;
      btn.appendChild(name);

      var meta = document.createElement("span");
      meta.className = "pad-meta";
      meta.textContent = pad.freq + "Hz";
      btn.appendChild(meta);

      btn.addEventListener("click", function () {
        if (editMode) openEditor(pad.id);
        else pressPad(pad.id, false);
      });

      host.appendChild(btn);
    });
  }

  function flashPad(id) {
    if (!state.colours) return;
    var grid = $("pad-grid");
    if (!grid) return;
    var btn = grid.querySelector('[data-id="' + id + '"]');
    if (!btn) return;
    btn.classList.remove("hit");
    void btn.offsetWidth;
    btn.classList.add("hit");
  }

  function renderSeq() {
    var host = $("seq-list");
    if (host) {
      host.textContent = "";
      if (!state.seq.length) {
        var empty = document.createElement("span");
        empty.className = "seq-empty";
        empty.textContent = "No sequence yet \u2014 press Record, then tap some pads.";
        host.appendChild(empty);
      } else {
        state.seq.forEach(function (e) {
          var chip = document.createElement("span");
          chip.className = "seq-chip";
          var pad = findPad(state.pads, e.padId);
          chip.textContent = (pad ? pad.name : "?") + " ";
          var t = document.createElement("em");
          t.textContent = Math.round(e.at) + "ms";
          chip.appendChild(t);
          host.appendChild(chip);
        });
      }
    }
    setText("seq-count", state.seq.length);
  }

  function renderControls() {
    var recBtn = $("btn-record");
    if (recBtn) {
      recBtn.textContent = rec.active ? "Stop" : "Record";
      recBtn.classList.toggle("is-on", rec.active);
    }
    var playBtn = $("btn-play");
    if (playBtn) playBtn.textContent = playing ? "Stop" : "Play";
    setText("rec-status", rec.active ? "Recording\u2026" : (playing ? "Playing\u2026" : ""));
    setText("pad-count", state.pads.length);
  }

  function render() {
    renderPads();
    renderSeq();
    renderControls();
  }

  /* ---------- editor ---------- */

  function openEditor(id) {
    var pad = findPad(state.pads, id);
    if (!pad) return;
    selectedId = id;
    setText("editor-title", "Edit \u201C" + pad.name + "\u201D");
    var name = $("pad-name-input");
    var freq = $("pad-freq");
    var dur = $("pad-dur");
    var wave = $("pad-wave");
    var colour = $("pad-colour");
    if (name) name.value = pad.name;
    if (freq) { freq.value = String(pad.freq); setText("freq-value", pad.freq + " Hz"); }
    if (dur) { dur.value = String(pad.dur); setText("dur-value", pad.dur.toFixed(2) + " s"); }
    if (wave) wave.value = waveName(pad.wave);
    if (colour) colour.value = colourName(pad.color);
    var panel = $("editor");
    if (panel) panel.hidden = false;
    renderPads();
  }

  function closeEditor() {
    selectedId = null;
    var panel = $("editor");
    if (panel) panel.hidden = true;
    renderPads();
  }

  function saveEditor() {
    if (!selectedId) return;
    var name = $("pad-name-input");
    var freq = $("pad-freq");
    var dur = $("pad-dur");
    var wave = $("pad-wave");
    var colour = $("pad-colour");
    state.pads = updatePad(state.pads, selectedId, {
      name: name ? name.value : undefined,
      freq: freq ? freq.value : undefined,
      dur: dur ? dur.value : undefined,
      wave: wave ? wave.value : undefined,
      color: colour ? colour.value : undefined
    });
    save();
    render();
    closeEditor();
    setText("editor-status", "Saved \u2665");
  }

  function deletePad() {
    if (!selectedId) return;
    state.pads = removePad(state.pads, selectedId);
    save();
    render();
    closeEditor();
  }

  function addNewPad() {
    var id = nextId(state.pads);
    state.pads = addPad(state.pads, {
      id: id,
      name: "New pad " + state.pads.length,
      freq: 440,
      wave: "sine",
      dur: 0.2,
      color: padColour(state.pads.length)
    });
    save();
    render();
    openEditor(id);
  }

  /* ---------- events ---------- */

  function wire() {
    var recBtn = $("btn-record");
    if (recBtn) recBtn.addEventListener("click", function () {
      if (rec.active) stopRecord();
      else startRecord();
    });

    var playBtn = $("btn-play");
    if (playBtn) playBtn.addEventListener("click", replay);

    var clearBtn = $("btn-clear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      stopPlayback();
      state.seq = [];
      save();
      renderSeq();
    });

    var loop = $("toggle-loop");
    if (loop) {
      loop.checked = state.loop;
      loop.addEventListener("change", function () {
        state.loop = !!loop.checked;
        save();
      });
    }

    var colours = $("toggle-colours");
    if (colours) {
      colours.checked = state.colours;
      colours.addEventListener("change", function () {
        state.colours = !!colours.checked;
        save();
        renderPads();
      });
    }

    var editBtn = $("btn-edit");
    if (editBtn) editBtn.addEventListener("click", function () {
      editMode = !editMode;
      editBtn.classList.toggle("is-on", editMode);
      editBtn.textContent = editMode ? "Done editing" : "Edit pads";
      setText("pad-hint", editMode
        ? "Tap a pad to edit it."
        : "Tap a pad to play it, or press 1\u20139 (and 0).");
      renderPads();
    });

    var addBtn = $("btn-add");
    if (addBtn) addBtn.addEventListener("click", addNewPad);

    var freq = $("pad-freq");
    if (freq) freq.addEventListener("input", function () {
      setText("freq-value", clampFreq(freq.value) + " Hz");
    });

    var dur = $("pad-dur");
    if (dur) dur.addEventListener("input", function () {
      setText("dur-value", clampDur(dur.value).toFixed(2) + " s");
    });

    var save = $("editor-save");
    if (save) save.addEventListener("click", saveEditor);

    var del = $("editor-delete");
    if (del) del.addEventListener("click", deletePad);

    var cancel = $("editor-cancel");
    if (cancel) cancel.addEventListener("click", closeEditor);

    var test = $("editor-test");
    if (test) test.addEventListener("click", function () {
      var pad = findPad(state.pads, selectedId);
      playPad(pad);
    });

    var share = $("share-button");
    if (share) share.addEventListener("click", function () {
      var url = window.location.href;
      if (navigator.share) {
        navigator.share({ title: document.title, url: url }).catch(function () {});
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          setText("save-note", "Link copied \u2665");
        }).catch(function () { setText("save-note", url); });
        return;
      }
      setText("save-note", url);
    });

    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      var i = keyToPadIndex(e.key, state.pads.length);
      if (i < 0) return;
      e.preventDefault();
      pressPad(state.pads[i].id, false);
    });
  }

  function boot() {
    load();
    render();
    wire();

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }
  }

  /* ---------- namespace ---------- */

  window.MenaSoundboard = {
    WAVES: WAVES,
    COLOURS: COLOURS,
    STORE: STORE,
    clampFreq: clampFreq,
    clampDur: clampDur,
    waveName: waveName,
    colourName: colourName,
    padColour: padColour,
    keyToPadIndex: keyToPadIndex,
    escapeHtml: escapeHtml,
    findPad: findPad,
    padIndex: padIndex,
    nextId: nextId,
    normalizePad: normalizePad,
    addPad: addPad,
    updatePad: updatePad,
    removePad: removePad,
    movePad: movePad,
    defaultPads: defaultPads,
    recordEvent: recordEvent,
    seqDuration: seqDuration,
    seqToText: seqToText,
    encodeSeq: encodeSeq,
    decodeSeq: decodeSeq
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
