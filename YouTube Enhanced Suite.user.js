// ==UserScript==
// @name         YouTube Enhanced (Controls & Downloader)
// @namespace    https://github.com/sizwinz/YtOP
// @version      3.2.0
// @description  Adds a real yt-dlp download button and video player controls (speed, loop, cinema mode, screenshot) to YouTube.
// @author       sizwinz
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @homepageURL  https://github.com/sizwinz/YtOP
// @supportURL   https://github.com/sizwinz/YtOP/issues
// @icon         https://raw.githubusercontent.com/sizwinz/YtOP/master/ytOP.png
// @updateURL    https://raw.githubusercontent.com/sizwinz/YtOP/master/YouTube%20Enhanced%20Suite.user.js
// @downloadURL  https://raw.githubusercontent.com/sizwinz/YtOP/master/YouTube%20Enhanced%20Suite.user.js
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════
   * CONFIG & CONSTANTS
   * ═══════════════════════════════════════════════════════════════ */
  const SERVER = "http://127.0.0.1:9898";
  const BTN_ID = "ytdlp-dl-btn";
  const OVL_ID = "ytdlp-overlay";

  const CFG = {
    presetSpeeds: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3],
    fineStep: 0.25,
    minSpeed: 0.1,
    maxSpeed: 16,
    osdDuration: 1500,
    keySpeed: 'yt-spd-ctrl',
    wrapperId: 'yt-spd-wrap',
    featureRowId: 'yt-feat-wrap',
    osdId: 'yt-spd-osd',
    cinemaOverlayId: 'yt-cinema-overlay',
  };

  /* ═══════════════════════════════════════════════════════════════
   * STATE
   * ═══════════════════════════════════════════════════════════════ */
  let osdTimeout = null;
  const presetBtnMap = new Map(); // speed value → <button> element

  /* ═══════════════════════════════════════════════════════════════
   * STYLES
   * ═══════════════════════════════════════════════════════════════ */
  GM_addStyle(`
    /* ── Downloader Styles ── */
    #ytdlp-dl-btn {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 0 18px; height: 36px; border-radius: 18px;
      border: none; background: #ff0000; color: #fff;
      font-size: 14px; font-weight: 600;
      font-family: "Roboto", sans-serif;
      cursor: pointer; letter-spacing: .3px; flex-shrink: 0;
      transition: background .15s, transform .1s;
      vertical-align: middle;
    }
    #ytdlp-dl-btn:hover  { background: #cc0000; }
    #ytdlp-dl-btn:active { transform: scale(.97); }
    #ytdlp-dl-btn svg    { width: 18px; height: 18px; fill: #fff; flex-shrink: 0; }
    #ytdlp-dl-btn.loading { background: #555; pointer-events: none; }
    #ytdlp-dl-btn.loading svg { animation: ytdlp-spin 1s linear infinite; }

    #ytdlp-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.65); z-index: 99998;
      display: flex; align-items: center; justify-content: center;
      animation: ytdlp-fadein .18s ease;
    }
    #ytdlp-modal {
      background: #0f0f0f; color: #e8e8e8;
      border-radius: 14px; width: min(700px, 96vw);
      max-height: 88vh; display: flex; flex-direction: column;
      font-family: "Roboto", sans-serif;
      box-shadow: 0 24px 80px rgba(0,0,0,.85);
      overflow: hidden; animation: ytdlp-slidein .2s ease;
    }

    /* Header */
    .ytdlp-header {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 20px; border-bottom: 1px solid #2a2a2a; flex-shrink: 0;
    }
    .ytdlp-thumb {
      width: 96px; height: 54px; object-fit: cover;
      border-radius: 6px; flex-shrink: 0; background: #222;
    }
    .ytdlp-meta { flex: 1; min-width: 0; }
    .ytdlp-title {
      font-size: 14px; font-weight: 600;
      white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; margin-bottom: 3px;
    }
    .ytdlp-sub { font-size: 12px; color: #999; }
    .ytdlp-close {
      width: 34px; height: 34px; background: none; border: none;
      cursor: pointer; color: #888; font-size: 18px;
      border-radius: 50%; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
      transition: background .15s, color .15s;
    }
    .ytdlp-close:hover { background: #2a2a2a; color: #fff; }

    /* Tabs */
    .ytdlp-tabs {
      display: flex; border-bottom: 1px solid #2a2a2a;
      padding: 0 16px; flex-shrink: 0;
    }
    .ytdlp-tab {
      padding: 10px 16px; font-size: 13px; font-weight: 500;
      cursor: pointer; color: #888;
      border-bottom: 2px solid transparent;
      transition: color .15s, border-color .15s;
      user-select: none; white-space: nowrap;
    }
    .ytdlp-tab:hover  { color: #ddd; }
    .ytdlp-tab.active { color: #fff; border-bottom-color: #ff0000; }

    /* Body */
    .ytdlp-body { overflow-y: auto; flex: 1; }
    .ytdlp-body::-webkit-scrollbar { width: 5px; }
    .ytdlp-body::-webkit-scrollbar-thumb { background: #3a3a3a; border-radius: 3px; }
    .ytdlp-panel { display: none; padding: 6px 0; }
    .ytdlp-panel.active { display: block; }
    .ytdlp-empty {
      padding: 48px 20px; text-align: center; color: #555; font-size: 14px;
    }

    /* Format rows */
    .ytdlp-row {
      display: flex; align-items: center; padding: 8px 20px;
      gap: 10px; transition: background .12s;
    }
    .ytdlp-row:hover { background: #181818; }

    .ytdlp-badge {
      font-size: 11px; font-weight: 700; padding: 3px 8px;
      border-radius: 4px; flex-shrink: 0; min-width: 58px;
      text-align: center; letter-spacing: .4px;
    }
    .ytdlp-badge.res { background: #152a44; color: #60b4ff; }
    .ytdlp-badge.abr { background: #152b1a; color: #52c46a; }
    .ytdlp-badge.hdr { background: #2e1a00; color: #ffaa33; margin-left: 4px; }

    .ytdlp-info {
      flex: 1; display: flex; flex-wrap: wrap;
      gap: 4px 8px; align-items: center;
    }
    .ytdlp-codec {
      font-size: 11px; color: #777;
      background: #1c1c1c; padding: 2px 6px;
      border-radius: 3px; white-space: nowrap;
    }
    .ytdlp-ext  { font-size: 11px; color: #666; text-transform: uppercase; }
    .ytdlp-size {
      font-size: 12px; color: #bbb;
      min-width: 72px; text-align: right; flex-shrink: 0;
    }

    .ytdlp-dl-btn {
      padding: 5px 14px; background: #222; color: #ddd;
      border: 1px solid #3a3a3a; border-radius: 18px;
      font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0;
      transition: background .12s, border-color .12s, color .12s;
      display: flex; align-items: center; gap: 5px;
      white-space: nowrap;
    }
    .ytdlp-dl-btn:hover { background: #ff0000; border-color: #ff0000; color: #fff; }
    .ytdlp-dl-btn.sent  { background: #173517; border-color: #2e7d2e; color: #4cff6c; pointer-events: none; }
    .ytdlp-dl-btn.err   { background: #3a1212; border-color: #7d2e2e; color: #ff6666; pointer-events: none; }
    .ytdlp-dl-btn svg   { width: 12px; height: 12px; fill: currentColor; }

    /* Footer */
    .ytdlp-footer {
      padding: 10px 20px; border-top: 1px solid #2a2a2a;
      display: flex; align-items: center; gap: 8px;
      font-size: 11px; color: #666; flex-shrink: 0;
    }
    .ytdlp-footer-dir { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ytdlp-dot {
      width: 7px; height: 7px; border-radius: 50%;
      flex-shrink: 0; background: #444;
      transition: background .3s;
    }
    .ytdlp-dot.ok  { background: #4caf50; }
    .ytdlp-dot.err { background: #f44336; }

    /* Loading */
    .ytdlp-loading {
      padding: 56px 20px; text-align: center;
      color: #555; font-size: 14px;
    }
    .ytdlp-spinner {
      width: 30px; height: 30px; margin: 0 auto 14px;
      border: 3px solid #2a2a2a; border-top-color: #ff0000;
      border-radius: 50%; animation: ytdlp-spin .75s linear infinite;
    }

    /* Error box */
    .ytdlp-error-box {
      margin: 20px; padding: 16px 20px;
      background: #1e0f0f; border: 1px solid #4a1c1c;
      border-radius: 10px; font-size: 13px; color: #ff8888;
      line-height: 1.7;
    }
    .ytdlp-error-box strong { color: #ffaaaa; }
    .ytdlp-error-box code {
      background: #2a1010; padding: 1px 6px;
      border-radius: 3px; font-size: 12px;
    }

    /* Toast */
    #ytdlp-toast {
      position: fixed; bottom: 28px; right: 28px; z-index: 999999;
      padding: 12px 20px; border-radius: 10px;
      font-size: 13px; font-family: "Roboto", sans-serif; font-weight: 500;
      box-shadow: 0 6px 28px rgba(0,0,0,.6);
      transition: opacity .35s, transform .35s;
      opacity: 0; transform: translateY(8px);
      pointer-events: none; max-width: 360px; line-height: 1.4;
    }
    #ytdlp-toast.show { opacity: 1; transform: translateY(0); }

    /* Animations */
    @keyframes ytdlp-spin    { to { transform: rotate(360deg); } }
    @keyframes ytdlp-fadein  { from { opacity:0 } to { opacity:1 } }
    @keyframes ytdlp-slidein {
      from { opacity:0; transform: translateY(-16px) scale(.98); }
      to   { opacity:1; transform: translateY(0)     scale(1);   }
    }

    /* ── Enhanced Controls Styles ── */
    #yt-cinema-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.82);
      z-index: 1500;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    #yt-cinema-overlay.active { display: block; }

    /* Lift player above cinema overlay */
    body.yt-cinema #player-container-outer,
    body.yt-cinema #player-theater-container,
    body.yt-cinema ytd-watch-flexy[theater] #player-theater-container {
      position: relative;
      z-index: 1501;
    }
    /* Keep top nav bar accessible in cinema */
    body.yt-cinema ytd-masthead {
      position: relative;
      z-index: 1502;
    }

    /* Controls button hover and active effects */
    .yt-ctrl-btn:not([data-active="1"]):hover {
      background-color: rgba(255,255,255,0.22) !important;
    }
    .yt-ctrl-btn:active {
      transform: scale(0.92) !important;
    }

    /* Filter bar */
    .ytdlp-filters {
      display: flex; gap: 8px; padding: 10px 20px;
      border-bottom: 1px solid #2a2a2a; flex-wrap: wrap;
      align-items: center;
    }
    .ytdlp-filter-label {
      font-size: 11px; color: #888; text-transform: uppercase;
      font-weight: 700; margin-right: 4px;
    }
    .ytdlp-filter-chip {
      padding: 4px 12px; border-radius: 12px; font-size: 11px;
      font-weight: 500; cursor: pointer; background: rgba(255,255,255,0.08);
      color: #aaa; transition: background .15s, color .15s;
      user-select: none;
    }
    .ytdlp-filter-chip:hover { background: rgba(255,255,255,0.15); color: #fff; }
    .ytdlp-filter-chip.active { background: #fff; color: #000; font-weight: 600; }

    /* Minimize button */
    .ytdlp-minimize {
      width: 34px; height: 34px; background: none; border: none;
      cursor: pointer; color: #888; font-size: 14px;
      border-radius: 50%; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
      transition: background .15s, color .15s;
      margin-right: 4px;
    }
    .ytdlp-minimize:hover { background: #2a2a2a; color: #fff; }

    /* Inline row progress bar */
    .ytdlp-row-progress-track {
      display: none;
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 3px; background: rgba(255,255,255,0.05);
      overflow: hidden;
    }
    .ytdlp-row-progress-bar {
      height: 100%; width: 0%;
      background: #ff0000;
      transition: width 0.2s ease;
    }
    .ytdlp-row.downloading .ytdlp-row-progress-track {
      display: block;
    }

    /* Floating Minimized Card */
    #ytdlp-min-card {
      position: fixed; bottom: 84px; right: 24px; z-index: 99999;
      background: #0f0f0f; color: #fff; border: 1px solid #2a2a2a;
      border-radius: 12px; width: 300px; padding: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      font-family: "Roboto", sans-serif;
      display: flex; flex-direction: column; gap: 8px;
      cursor: pointer; transition: transform 0.2s, background-color 0.2s;
    }
    #ytdlp-min-card:hover { background: #1c1c1c; transform: translateY(-2px); }
    .ytdlp-min-header {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .ytdlp-min-title {
      font-size: 12px; font-weight: 600; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; flex: 1;
      color: #eee;
    }
    .ytdlp-min-close {
      background: none; border: none; color: #666; cursor: pointer;
      font-size: 12px; padding: 2px 6px; border-radius: 4px;
      transition: background 0.15s, color 0.15s;
    }
    .ytdlp-min-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .ytdlp-min-progress-track {
      width: 100%; height: 6px; background: rgba(255,255,255,0.08);
      border-radius: 3px; overflow: hidden;
    }
    .ytdlp-min-progress-bar {
      height: 100%; width: 0%; background: #ff0000;
      transition: width 0.2s ease;
    }
    .ytdlp-min-meta {
      display: flex; justify-content: space-between; font-size: 11px; color: #888;
    }
  `);

  /* ═══════════════════════════════════════════════════════════════
   * SHARED UTILITIES
   * ═══════════════════════════════════════════════════════════════ */
  const getVideo = () => document.querySelector("video");
  const isShorts = () => location.pathname.startsWith("/shorts/");

  // ─────────────────────────────────────────────────────────────
  // SVG ICON FACTORY (Downloader icons)
  // ─────────────────────────────────────────────────────────────
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PATHS = {
    download: "M5 20h14v-2H5v2zm7-18v10.17l-3.59-3.58L7 10l5 5 5-5-1.41-1.41L13 12.17V2h-1z",
    spinner: "M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2z",
    check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    cross: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  };

  function mkSVG(key) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", PATHS[key]);
    svg.appendChild(path);
    return svg;
  }

  // ─────────────────────────────────────────────────────────────
  // DOM CREATION HELPERS
  // ─────────────────────────────────────────────────────────────
  function el(tag, props = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "cls") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "title") e.title = v;
      else e.setAttribute(k, v);
    }
    children.flat().forEach(c => {
      if (c == null) return;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  }

  function appendKids(parent, ...kids) {
    kids.flat().forEach(k => {
      if (k == null) return;
      parent.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    });
    return parent;
  }

  function clearAndFill(node, ...kids) {
    node.textContent = "";
    return appendKids(node, ...kids);
  }

  /* ═══════════════════════════════════════════════════════════════
   * PLAYER CONTROLS IMPLEMENTATION
   * ═══════════════════════════════════════════════════════════════ */
  const clamp = (v) => Math.min(Math.max(v, CFG.minSpeed), CFG.maxSpeed);
  const round2 = (v) => Math.round(v * 100) / 100;
  const loadRate = () => parseFloat(localStorage.getItem(CFG.keySpeed)) || 1;
  const saveRate = (r) => localStorage.setItem(CFG.keySpeed, r);

  // OSD Toast
  function showOSD(msg) {
    let osd = document.getElementById(CFG.osdId);
    if (!osd) {
      osd = el("div", { id: CFG.osdId });
      Object.assign(osd.style, {
        position: 'fixed',
        bottom: '76px',
        right: '24px',
        background: 'rgba(0,0,0,0.80)',
        color: '#fff',
        padding: '8px 20px',
        borderRadius: '10px',
        fontSize: '17px',
        fontWeight: '700',
        fontFamily: 'Roboto, Arial, sans-serif',
        zIndex: '2147483647',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 0.22s ease',
        letterSpacing: '0.02em',
      });
      document.body.appendChild(osd);
    }
    osd.textContent = msg;
    void osd.offsetWidth;           // force reflow so transition replays
    osd.style.opacity = '1';
    clearTimeout(osdTimeout);
    osdTimeout = setTimeout(() => { osd.style.opacity = '0'; }, CFG.osdDuration);
  }

  // Speed handlers
  function setSpeed(rate) {
    rate = clamp(round2(rate));
    const video = getVideo();
    if (video) video.playbackRate = rate;
    saveRate(rate);
    syncSpeedHighlight(rate);
    showOSD(`⚡ ${rate}×`);
    const input = document.getElementById('yt-spd-input');
    if (input) input.value = rate;
  }

  function syncSpeedHighlight(rate) {
    presetBtnMap.forEach((btn, speed) => {
      const active = (speed === rate);
      btn.dataset.active = active ? '1' : '0';
      btn.style.backgroundColor = active ? '#cc0000' : 'rgba(255,255,255,0.10)';
    });
  }

  function onVideoRateChange(e) {
    const r = round2(e.target.playbackRate);
    saveRate(r);
    syncSpeedHighlight(r);
    const input = document.getElementById('yt-spd-input');
    if (input) input.value = r;
  }

  // Video Loop
  function toggleLoop(btn) {
    const video = getVideo();
    if (!video) return;
    video.loop = !video.loop;
    updateToggleBtn(btn, video.loop, 'Loop');
    showOSD(video.loop ? 'Loop ON' : 'Loop OFF');
  }

  // Cinema Mode
  function ensureCinemaOverlay() {
    if (document.getElementById(CFG.cinemaOverlayId)) return;
    const overlay = el("div", { id: CFG.cinemaOverlayId });
    document.body.appendChild(overlay);
  }

  function toggleCinema(btn) {
    ensureCinemaOverlay();
    const overlay = document.getElementById(CFG.cinemaOverlayId);
    const on = !overlay.classList.contains('active');
    overlay.classList.toggle('active', on);
    document.body.classList.toggle('yt-cinema', on);
    updateToggleBtn(btn, on, 'Cinema');
    showOSD(on ? 'Cinema ON' : 'Cinema OFF');
  }

  // Canvas screenshot downloader
  function takeScreenshot() {
    const video = getVideo();
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const safeName = document.title
      .replace(' - YouTube', '')
      .replace(/[^a-z0-9]/gi, '_')
      .slice(0, 60);
    const secs = Math.round(video.currentTime);
    const a = document.createElement('a');
    a.download = `yt_${safeName}_${secs}s.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    showOSD('Saved!');
  }

  // Keyboard Shortcuts (Shift+1–9 for presets, < and > for fine-tuning)
  function onKeydown(e) {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;
    if (isTyping && document.activeElement?.id !== 'yt-spd-input') return;
    if (isTyping) return;

    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const idx = parseInt(e.key) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < CFG.presetSpeeds.length) {
        e.preventDefault();
        setSpeed(CFG.presetSpeeds[idx]);
        return;
      }
    }
    if (e.key === '<') { e.preventDefault(); setSpeed((getVideo()?.playbackRate ?? loadRate()) - CFG.fineStep); }
    if (e.key === '>') { e.preventDefault(); setSpeed((getVideo()?.playbackRate ?? loadRate()) + CFG.fineStep); }
  }

  // UI Construction for controls
  function makeBtn(text, title) {
    const btn = el('button', { cls: 'yt-ctrl-btn', title: title || '' }, text);
    Object.assign(btn.style, {
      backgroundColor: 'rgba(255,255,255,0.10)',
      color: '#fff',
      border: 'none',
      borderRadius: '18px',
      padding: '5px 11px',
      cursor: 'pointer',
      fontSize: '12.5px',
      fontWeight: '500',
      fontFamily: 'Roboto, Arial, sans-serif',
      transition: 'background-color 0.15s, transform 0.1s',
      lineHeight: '1.4',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    });
    return btn;
  }

  function updateToggleBtn(btn, isOn, label) {
    btn.dataset.active = isOn ? '1' : '0';
    btn.style.backgroundColor = isOn ? '#1a7a1a' : 'rgba(255,255,255,0.10)';
    btn.textContent = isOn ? `${label} ✓` : label;
  }

  function buildSpeedRow() {
    const wrap = el('div', { id: CFG.wrapperId });
    Object.assign(wrap.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '5px',
      marginTop: '10px',
      alignItems: 'center',
    });

    const label = el('span', { title: 'Speed controls · < / > to fine-tune · Shift+1–9 for presets' }, '⚡ Speed:');
    Object.assign(label.style, {
      color: '#aaa',
      fontSize: '12px',
      userSelect: 'none',
      cursor: 'default',
      whiteSpace: 'nowrap',
    });
    wrap.appendChild(label);

    const decBtn = makeBtn('−', `Decrease speed by ${CFG.fineStep}× · keyboard <`);
    Object.assign(decBtn.style, { padding: '5px 9px', fontSize: '15px', fontWeight: '700' });
    decBtn.addEventListener('click', () => setSpeed((getVideo()?.playbackRate ?? loadRate()) - CFG.fineStep));
    wrap.appendChild(decBtn);

    CFG.presetSpeeds.forEach(speed => {
      const btn = makeBtn(`${speed}×`, `Set speed to ${speed}× · Shift+${CFG.presetSpeeds.indexOf(speed) + 1}`);
      btn.dataset.active = '0';
      btn.addEventListener('click', () => setSpeed(speed));
      presetBtnMap.set(speed, btn);
      wrap.appendChild(btn);
    });

    const incBtn = makeBtn('+', `Increase speed by ${CFG.fineStep}× · keyboard >`);
    Object.assign(incBtn.style, { padding: '5px 9px', fontSize: '15px', fontWeight: '700' });
    incBtn.addEventListener('click', () => setSpeed((getVideo()?.playbackRate ?? loadRate()) + CFG.fineStep));
    wrap.appendChild(incBtn);

    const input = el('input', { id: 'yt-spd-input', type: 'number', min: CFG.minSpeed, max: CFG.maxSpeed, step: '0.05', value: loadRate() });
    input.title = 'Custom speed — type any value then press Enter';
    Object.assign(input.style, {
      width: '54px',
      background: 'rgba(255,255,255,0.10)',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '14px',
      padding: '4px 8px',
      fontSize: '12.5px',
      fontFamily: 'Roboto, Arial, sans-serif',
      textAlign: 'center',
      outline: 'none',
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // prevent YouTube from stealing input focus
      if (e.key === 'Enter') {
        const v = parseFloat(input.value);
        if (!isNaN(v)) setSpeed(v);
        input.blur();
      }
    });
    input.addEventListener('focus', () => { input.style.borderColor = 'rgba(200,0,0,0.8)'; });
    input.addEventListener('blur', () => { input.style.borderColor = 'rgba(255,255,255,0.25)'; });
    wrap.appendChild(input);

    const resetBtn = makeBtn('↺', 'Reset speed to 1×');
    Object.assign(resetBtn.style, { padding: '5px 9px', fontSize: '14px' });
    resetBtn.addEventListener('click', () => setSpeed(1));
    wrap.appendChild(resetBtn);

    return wrap;
  }

  function buildFeatureRow() {
    const wrap = el('div', { id: CFG.featureRowId });
    Object.assign(wrap.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '5px',
      marginTop: '6px',
      alignItems: 'center',
    });

    const label = el('span', {}, 'Features:');
    Object.assign(label.style, {
      color: '#aaa',
      fontSize: '12px',
      userSelect: 'none',
      cursor: 'default',
      whiteSpace: 'nowrap',
    });
    wrap.appendChild(label);

    const loopBtn = makeBtn('Loop', 'Toggle video looping');
    loopBtn.addEventListener('click', () => toggleLoop(loopBtn));
    wrap.appendChild(loopBtn);

    const cinemaBtn = makeBtn('Cinema', 'Dim the page outside the player');
    cinemaBtn.addEventListener('click', () => toggleCinema(cinemaBtn));
    wrap.appendChild(cinemaBtn);

    const snapBtn = makeBtn('Screenshot', 'Download the current video frame as a PNG');
    snapBtn.addEventListener('click', takeScreenshot);
    wrap.appendChild(snapBtn);

    return wrap;
  }

  function tryInjectControls() {
    const anchor = document.querySelector('#bottom-row');
    const video = getVideo();
    if (!anchor || !video) return;

    if (!document.getElementById(CFG.wrapperId)) {
      anchor.prepend(buildSpeedRow());
    }

    if (!document.getElementById(CFG.featureRowId)) {
      const speedRow = document.getElementById(CFG.wrapperId);
      speedRow
        ? speedRow.insertAdjacentElement('afterend', buildFeatureRow())
        : anchor.prepend(buildFeatureRow());
    }

    if (!video.dataset.spdHooked) {
      video.addEventListener('ratechange', onVideoRateChange);
      video.dataset.spdHooked = '1';
    }

    const savedRate = loadRate();
    video.playbackRate = savedRate;
    onVideoRateChange({ target: video });
  }

  /* ═══════════════════════════════════════════════════════════════
   * YT-DLP DOWNLOADER IMPLEMENTATION
   * ═══════════════════════════════════════════════════════════════ */
  function gmFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: opts.method || "GET",
        url,
        headers: { "Content-Type": "application/json" },
        data: opts.body || null,
        timeout: 45000,
        onload: (r) => {
          try {
            resolve({
              ok: r.status >= 200 && r.status < 400,
              status: r.status,
              json: () => JSON.parse(r.responseText),
            });
          } catch (e) { reject(new Error("Bad JSON response from local server.")); }
        },
        onerror: () => reject(new Error("Cannot reach local server — is yt-dlp-server.py running?")),
        ontimeout: () => reject(new Error("Request timed out after 45 seconds")),
      });
    });
  }

  function getVideoURL() {
    const u = new URL(window.location.href);
    const clean = new URL("https://www.youtube.com/watch");
    if (u.searchParams.has("v")) clean.searchParams.set("v", u.searchParams.get("v"));
    return window.location.pathname.startsWith("/shorts/")
      ? window.location.href.split("?")[0]
      : clean.toString();
  }

  function fmtDuration(sec) {
    if (!sec) return "";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  const pad = n => String(n).padStart(2, "0");

  function codecLabel(c) {
    if (!c || c === "none") return "";
    if (/^avc1|^h264/i.test(c)) return "H.264";
    if (/^av01/i.test(c)) return "AV1";
    if (/^vp9/i.test(c)) return "VP9";
    if (/^vp8/i.test(c)) return "VP8";
    if (/^mp4a/i.test(c)) return "AAC";
    if (/^opus/i.test(c)) return "Opus";
    return c.split(".")[0].toUpperCase();
  }

  function showToast(text, isError = false) {
    let t = document.getElementById("ytdlp-toast");
    if (!t) { t = el("div", { id: "ytdlp-toast" }); document.body.appendChild(t); }
    t.textContent = text;
    t.style.background = isError ? "#3d0f0f" : "#0f2d0f";
    t.style.color = isError ? "#ff8888" : "#77ee77";
    t.style.border = `1px solid ${isError ? "#6b1c1c" : "#1e5c1e"}`;
    t.classList.add("show");
    clearTimeout(t._tmr);
    t._tmr = setTimeout(() => t.classList.remove("show"), 4000);
  }

  function closeModal() {
    if (activePolls.size > 0) {
      minimizeModal();
    } else {
      document.getElementById(OVL_ID)?.remove();
      document.getElementById("ytdlp-min-card")?.remove();
    }
  }

  function makeCloseBtn() {
    const b = el("button", { cls: "ytdlp-close", title: "Close (Esc)" }, "✕");
    b.onclick = closeModal;
    return b;
  }

  function attachOverlayClose(overlay) {
    overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
    const onKey = e => {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", onKey);
      } else if ((e.key === "m" || e.key === "M") && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        minimizeModal();
      }
    };
    document.addEventListener("keydown", onKey);
  }

  function showLoadingModal() {
    document.getElementById(OVL_ID)?.remove();
    const modal = el("div", { id: "ytdlp-modal" },
      el("div", { cls: "ytdlp-header", style: "justify-content:flex-end;border:none" }, makeCloseBtn()),
      el("div", { cls: "ytdlp-loading" }, el("div", { cls: "ytdlp-spinner" }), "Fetching formats from yt-dlp…"),
    );
    const overlay = el("div", { id: OVL_ID }, modal);
    attachOverlayClose(overlay);
    document.body.appendChild(overlay);
  }

  function showErrorInModal(msg) {
    const modal = document.getElementById("ytdlp-modal");
    if (!modal) return;
    modal.querySelector(".ytdlp-loading")?.remove();

    const box = el("div", { cls: "ytdlp-error-box" });
    appendKids(box,
      el("strong", {}, "⚠ Could not reach the local bridge server"),
      el("br"), el("br"),
      msg,
      el("br"), el("br"),
      "Make sure the server is running:",
      el("br"),
      el("code", {}, "python yt-dlp-server.py"),
      el("br"), el("br"),
      "Then refresh this page.",
    );
    modal.appendChild(box);
  }

  let isMinimized = false;

  function minimizeModal() {
    const overlay = document.getElementById(OVL_ID);
    if (overlay) {
      overlay.style.display = "none";
      isMinimized = true;
      createOrUpdateMinCard();
    }
  }

  function restoreModal() {
    const overlay = document.getElementById(OVL_ID);
    if (overlay) {
      overlay.style.display = "flex";
      isMinimized = false;
      document.getElementById("ytdlp-min-card")?.remove();
    }
  }

  function createOrUpdateMinCard(percent = 0, speed = "~", eta = "~", status = "downloading") {
    if (!isMinimized) return;

    let card = document.getElementById("ytdlp-min-card");
    if (!card) {
      card = el("div", { id: "ytdlp-min-card" });
      card.addEventListener("click", (e) => {
        if (e.target.closest(".ytdlp-min-close")) {
          e.stopPropagation();
          card.remove();
        } else {
          restoreModal();
        }
      });
      document.body.appendChild(card);
    }

    const title = document.title.replace(" - YouTube", "");
    let barWidth = percent + "%";
    let metaLeft = `${percent}%`;
    let metaRight = `ETA: ${eta}`;

    if (status === "merging") {
      barWidth = "100%";
      metaLeft = "Muxing…";
      metaRight = "FFmpeg merging";
    } else if (status === "completed") {
      barWidth = "100%";
      metaLeft = "Completed!";
      metaRight = "Done";
      setTimeout(() => {
        if (card && card.parentNode) card.remove();
      }, 4000);
    } else if (status === "error") {
      barWidth = "100%";
      metaLeft = "Failed";
      metaRight = "Error";
    } else {
      metaLeft = `${percent}% (${speed})`;
    }

    clearAndFill(card,
      el("div", { cls: "ytdlp-min-header" },
        el("div", { cls: "ytdlp-min-title", title: title }, title),
        el("button", { cls: "ytdlp-min-close", title: "Dismiss" }, "✕")
      ),
      el("div", { cls: "ytdlp-min-progress-track" },
        el("div", { cls: "ytdlp-min-progress-bar", style: `width:${barWidth}` })
      ),
      el("div", { cls: "ytdlp-min-meta" },
        el("span", {}, metaLeft),
        el("span", {}, metaRight)
      )
    );
  }

  function buildRow(fmt) {
    const row = el("div", { cls: "ytdlp-row" });
    const isAudio = fmt.type === "audio";

    const badge = el("div", { cls: `ytdlp-badge ${isAudio ? "abr" : "res"}` });
    if (isAudio) {
      badge.textContent = fmt.abr ? `${Math.round(fmt.abr)}k` : (fmt.note || "Audio");
    } else {
      const fps = fmt.fps && fmt.fps > 30 ? fmt.fps : "";
      badge.textContent = fmt.height ? `${fmt.height}p${fps}` : (fmt.note || "?");
    }
    row.appendChild(badge);

    if (fmt.hdr) row.appendChild(el("div", { cls: "ytdlp-badge hdr" }, "HDR"));

    const info = el("div", { cls: "ytdlp-info" });
    const vcl = codecLabel(fmt.vcodec || fmt.acodec);
    if (vcl) info.appendChild(el("span", { cls: "ytdlp-codec" }, vcl));

    if ((fmt.type === "video+audio" || fmt.type === "muxed") && fmt.acodec) {
      const acl = codecLabel(fmt.acodec);
      if (acl) info.appendChild(el("span", { cls: "ytdlp-codec" }, `+ ${acl}`));
    }

    const extStr = (fmt.type === "video+audio") ? (fmt.merge_ext || "mp4") : (fmt.ext || "?");
    info.appendChild(el("span", { cls: "ytdlp-ext" }, extStr.toUpperCase()));
    row.appendChild(info);

    row.appendChild(el("div", { cls: "ytdlp-size" }, fmt.filesize_hr || "~"));

    const dlBtn = el("div", { cls: "ytdlp-dl-btn" });
    appendKids(dlBtn, mkSVG("download"), " Download");
    dlBtn.setAttribute("role", "button");
    dlBtn.setAttribute("tabindex", "0");
    const doClick = () => triggerDownload(dlBtn, fmt);
    dlBtn.addEventListener("click", doClick);
    dlBtn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") doClick(); });
    row.appendChild(dlBtn);

    const track = el("div", { cls: "ytdlp-row-progress-track" },
      el("div", { cls: "ytdlp-row-progress-bar" })
    );
    row.appendChild(track);

    // Resume visual progress state if an active background poll exists
    const key = `${getVideoURL()}|${fmt.format_id}`;
    if (activePolls.has(key)) {
      const poll = activePolls.get(key);
      poll.btn = dlBtn; // bind running poll to new button DOM node
      dlBtn.className = "ytdlp-dl-btn loading";
      clearAndFill(dlBtn, mkSVG("spinner"), " Resuming…");
      row.classList.add("downloading");
    }

    return row;
  }

  const activePolls = new Map();

  function pollProgress(btn, fmt) {
    const key = `${getVideoURL()}|${fmt.format_id}`;
    if (activePolls.has(key)) {
      clearInterval(activePolls.get(key).intervalId);
    }

    let errCount = 0;
    const intervalId = setInterval(() => {
      gmFetch(`${SERVER}/progress?url=${encodeURIComponent(getVideoURL())}&format_id=${encodeURIComponent(fmt.format_id)}`)
        .then(r => {
          if (!r.ok) return;
          const p = r.json();

          const poll = activePolls.get(key);
          if (!poll) return;
          const curBtn = poll.btn;
          const row = curBtn.closest(".ytdlp-row");

          if (p.status === "downloading") {
            if (row) {
              row.classList.add("downloading");
              const bar = row.querySelector(".ytdlp-row-progress-bar");
              if (bar) bar.style.width = p.percent + "%";
            }
            curBtn.className = "ytdlp-dl-btn loading";
            clearAndFill(curBtn, mkSVG("spinner"), ` ${p.percent}%`);
            curBtn.title = `Speed: ${p.speed} · ETA: ${p.eta}`;
            createOrUpdateMinCard(Math.round(p.percent), p.speed, p.eta, "downloading");
          } else if (p.status === "merging") {
            if (row) {
              row.classList.add("downloading");
              const bar = row.querySelector(".ytdlp-row-progress-bar");
              if (bar) bar.style.width = "100%";
            }
            curBtn.className = "ytdlp-dl-btn loading";
            clearAndFill(curBtn, mkSVG("spinner"), " Muxing…");
            curBtn.title = "FFmpeg is combining video and audio tracks...";
            createOrUpdateMinCard(100, "", "", "merging");
          } else if (p.status === "completed") {
            clearInterval(intervalId);
            activePolls.delete(key);
            if (row) row.classList.remove("downloading");
            curBtn.className = "ytdlp-dl-btn sent";
            clearAndFill(curBtn, mkSVG("check"), " Done!");
            curBtn.title = "Download finished successfully!";
            showToast("⬇ Download completed!");
            createOrUpdateMinCard(100, "", "", "completed");
          } else if (p.status === "error") {
            clearInterval(intervalId);
            activePolls.delete(key);
            if (row) row.classList.remove("downloading");
            curBtn.className = "ytdlp-dl-btn err";
            clearAndFill(curBtn, mkSVG("cross"), " Failed");
            curBtn.title = p.error || "Unknown error";
            showToast(`❌ Download failed: ${p.error || "Unknown error"}`, true);
            createOrUpdateMinCard(100, "", "", "error");
          }
        })
        .catch(() => {
          errCount++;
          if (errCount > 10) {
            clearInterval(intervalId);
            const poll = activePolls.get(key);
            if (poll) {
              const curBtn = poll.btn;
              const row = curBtn.closest(".ytdlp-row");
              if (row) row.classList.remove("downloading");
              curBtn.className = "ytdlp-dl-btn err";
              clearAndFill(curBtn, mkSVG("cross"), " Offline");
              curBtn.title = "Local server offline";
            }
            activePolls.delete(key);
          }
        });
    }, 1000);

    activePolls.set(key, { intervalId, btn });
  }

  function triggerDownload(btn, fmt) {
    clearAndFill(btn, mkSVG("spinner"), " Sending…");

    gmFetch(`${SERVER}/download`, {
      method: "POST",
      body: JSON.stringify({
        url: getVideoURL(),
        format_id: fmt.format_id,
        merge_ext: fmt.merge_ext || fmt.ext || "mp4",
      }),
    })
      .then(r => {
        const d = r.json();
        if (!r.ok) throw new Error(d.error || `Server returned ${r.status}`);
        pollProgress(btn, fmt);
      })
      .catch(err => {
        btn.className = "ytdlp-dl-btn err";
        clearAndFill(btn, mkSVG("cross"), " Failed");
        btn.title = err.message;
        showToast(`❌ ${err.message}`, true);
      });
  }

  function buildModal(data) {
    document.getElementById(OVL_ID)?.remove();
    isMinimized = false;
    document.getElementById("ytdlp-min-card")?.remove();

    const hdr = el("div", { cls: "ytdlp-header" });
    if (data.thumbnail) hdr.appendChild(el("img", { cls: "ytdlp-thumb", src: data.thumbnail, alt: "" }));

    const subText = [data.uploader, data.duration ? fmtDuration(data.duration) : ""]
      .filter(Boolean).join(" · ");

    const minBtn = el("button", { cls: "ytdlp-minimize", title: "Minimize to background (M)" }, "🗕");
    minBtn.onclick = minimizeModal;

    appendKids(hdr,
      el("div", { cls: "ytdlp-meta" },
        el("div", { cls: "ytdlp-title", title: data.title || "" }, data.title || "Unknown title"),
        el("div", { cls: "ytdlp-sub" }, subText),
      ),
      minBtn,
      makeCloseBtn(),
    );

    const TABS = [
      { key: "video_audio", label: "🎬 Video + Audio" },
      { key: "video_only", label: "🎥 Video Only" },
      { key: "audio_only", label: "🎵 Audio Only" },
    ];

    const savedTab = GM_getValue("lastTab", "video_audio");
    const tabBar = el("div", { cls: "ytdlp-tabs" });
    const body = el("div", { cls: "ytdlp-body" });
    const panels = {};
    const tabEls = {};

    TABS.forEach(({ key, label }) => {
      const isActive = key === savedTab;

      const tab = el("div", { cls: "ytdlp-tab" + (isActive ? " active" : "") }, label);
      tab.addEventListener("click", () => {
        Object.values(tabEls).forEach(t => t.classList.remove("active"));
        Object.values(panels).forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        panels[key].classList.add("active");
        GM_setValue("lastTab", key);
      });
      tabBar.appendChild(tab);
      tabEls[key] = tab;

      const panel = el("div", { cls: "ytdlp-panel" + (isActive ? " active" : "") });
      const list = (data[key] || []);
      if (list.length === 0) {
        panel.appendChild(el("div", { cls: "ytdlp-empty" }, "No formats in this category."));
      } else {
        // 1. Extract unique extensions
        const exts = new Set();
        list.forEach(fmt => {
          const ext = (fmt.type === "video+audio") ? (fmt.merge_ext || "mp4") : (fmt.ext || "?");
          exts.add(ext.toLowerCase());
        });

        // 2. Add filter chips if more than 1 extension exists
        if (exts.size > 1) {
          const filterBar = el("div", { cls: "ytdlp-filters" },
            el("span", { cls: "ytdlp-filter-label" }, "Format:")
          );

          const chips = [];
          const allChip = el("div", { cls: "ytdlp-filter-chip active", text: "All" });
          chips.push(allChip);
          filterBar.appendChild(allChip);

          exts.forEach(ext => {
            const chip = el("div", { cls: "ytdlp-filter-chip", text: ext.toUpperCase() });
            chips.push(chip);
            filterBar.appendChild(chip);

            chip.addEventListener("click", () => {
              chips.forEach(c => c.classList.remove("active"));
              chip.classList.add("active");
              panel.querySelectorAll(".ytdlp-row").forEach(row => {
                row.style.display = (row.getAttribute("data-ext") === ext) ? "flex" : "none";
              });
            });
          });

          allChip.addEventListener("click", () => {
            chips.forEach(c => c.classList.remove("active"));
            allChip.classList.add("active");
            panel.querySelectorAll(".ytdlp-row").forEach(row => {
              row.style.display = "flex";
            });
          });

          panel.appendChild(filterBar);
        }

        // 3. Render and append rows
        list.forEach(fmt => {
          const row = buildRow(fmt);
          const ext = (fmt.type === "video+audio") ? (fmt.merge_ext || "mp4") : (fmt.ext || "?");
          row.setAttribute("data-ext", ext.toLowerCase());
          panel.appendChild(row);
        });
      }
      body.appendChild(panel);
      panels[key] = panel;
    });

    const dot = el("div", { cls: "ytdlp-dot" });
    const dirText = el("div", { cls: "ytdlp-footer-dir" }, "Checking server…");
    const branding = el("a", {
      href: "https://github.com/sizwinz/YtOP",
      target: "_blank",
      style: "margin-left: auto; color: #888; font-size: 11px; text-decoration: none; font-weight: 500; transition: color 0.15s; display: flex; align-items: center; gap: 6px;"
    });
    const logoImg = el("img", {
      src: "https://raw.githubusercontent.com/sizwinz/YtOP/master/ytOP.png",
      style: "width: 14px; height: 14px; border-radius: 3px;"
    });
    branding.appendChild(logoImg);
    branding.appendChild(document.createTextNode("ytOP by sizwinz ↗"));
    branding.addEventListener("mouseenter", () => branding.style.color = "#ff0000");
    branding.addEventListener("mouseleave", () => branding.style.color = "#888");
    const footer = el("div", { cls: "ytdlp-footer" }, dot, dirText, branding);

    const modal = el("div", { id: "ytdlp-modal" }, hdr, tabBar, body, footer);
    const overlay = el("div", { id: OVL_ID }, modal);
    attachOverlayClose(overlay);
    document.body.appendChild(overlay);

    gmFetch(`${SERVER}/health`)
      .then(r => {
        const d = r.json();
        dot.className = "ytdlp-dot ok";
        let warning = "";
        let tooltip = `Download folder: ${d.download_dir}`;
        if (d.ffmpeg_installed === false) {
          warning = " (⚠️ FFmpeg missing)";
          tooltip += "\n\n⚠️ WARNING: FFmpeg is not found by the server. Video + Audio merging will fail. Please add FFmpeg to your system PATH or edit FFMPEG_BIN inside yt-dlp-server.py.";
          dirText.style.color = "#ffaa33";
        } else {
          dirText.style.color = "";
        }
        dirText.textContent = `yt-dlp ${d.yt_dlp_version}${warning} · ${d.download_dir}`;
        dirText.title = tooltip;
      })
      .catch(() => {
        dot.className = "ytdlp-dot err";
        dirText.textContent = "Server offline";
        dirText.title = "Local server is offline. Run start-server.bat to start it.";
        dirText.style.color = "#ff6666";
      });
  }

  function createBtn() {
    const btn = el("button", { id: BTN_ID, title: "Download with yt-dlp" });
    appendKids(btn, mkSVG("download"), " yt-dlp");
    btn.addEventListener("click", onBtnClick);
    return btn;
  }

  async function onBtnClick() {
    const btn = document.getElementById(BTN_ID);
    if (btn) { btn.classList.add("loading"); clearAndFill(btn, mkSVG("spinner"), " Loading…"); }

    showLoadingModal();

    try {
      const res = await gmFetch(`${SERVER}/formats?url=${encodeURIComponent(getVideoURL())}`);
      if (!res.ok) { const j = res.json(); throw new Error(j.error || `HTTP ${res.status}`); }
      buildModal(res.json());
    } catch (err) {
      showErrorInModal(err.message);
    } finally {
      if (btn) { btn.classList.remove("loading"); clearAndFill(btn, mkSVG("download"), " yt-dlp"); }
    }
  }

  const CONTAINER_SELECTORS = [
    "ytd-watch-metadata #top-level-buttons-computed",
    "ytd-watch-metadata #flexible-item-buttons",
    "ytd-watch-metadata #actions-inner",
    "ytd-watch-metadata #actions",
    "#above-the-fold #top-level-buttons-computed",
    "#above-the-fold #flexible-item-buttons",
    "#top-level-buttons-computed",
    "#flexible-item-buttons",
  ];

  function findContainer() {
    for (const sel of CONTAINER_SELECTORS) {
      const node = document.querySelector(sel);
      if (node && node.offsetParent !== null) return node;
    }
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════
   * UNIFIED LIFECYCLE & INJECTION MANAGER
   * ═══════════════════════════════════════════════════════════════ */
  let _observerPaused = false;
  let _moTimer = null;
  let _retryTimer = null;
  let _navUrl = "";

  function cleanupStaleUI() {
    // Downloader cleanup
    document.getElementById(BTN_ID)?.remove();
    closeModal();

    // Controls cleanup
    document.getElementById(CFG.wrapperId)?.remove();
    document.getElementById(CFG.featureRowId)?.remove();
    presetBtnMap.clear();
    document.getElementById(CFG.cinemaOverlayId)?.classList.remove('active');
    document.body.classList.remove('yt-cinema');
  }

  function injectAll() {
    if (_observerPaused) return;

    const path = window.location.pathname;
    const isWatchOrShorts = path.startsWith("/watch") || path.startsWith("/shorts/");

    // 1. Downloader button injection
    if (isWatchOrShorts && !document.getElementById(BTN_ID)) {
      const container = findContainer();
      if (container) {
        _observerPaused = true;
        // Hide YouTube's own download button
        document.querySelectorAll(
          "ytd-download-button-renderer, yt-download-button-renderer"
        ).forEach(n => { n.style.display = "none"; });

        // Insert as first button
        container.insertBefore(createBtn(), container.firstChild);
        setTimeout(() => { _observerPaused = false; }, 300);
        console.log("[yt-dlp] ✅ Button injected into", container.className || container.id);
      }
    }

    // 2. Enhanced controls injection
    if (!isShorts() && (!document.getElementById(CFG.wrapperId) || !document.getElementById(CFG.featureRowId))) {
      tryInjectControls();
    }
  }

  function scheduleInject(delay = 0) {
    clearTimeout(_retryTimer);
    _retryTimer = setTimeout(injectAll, delay);
  }

  function onNavigate() {
    const url = window.location.href;
    if (url === _navUrl) return;
    _navUrl = url;
    cleanupStaleUI();
    scheduleInject(800);
  }

  // Wire up page lifecycle hooks
  window.addEventListener("yt-navigate-finish", onNavigate);
  window.addEventListener("yt-page-data-updated", () => scheduleInject(600));
  window.addEventListener("yt-navigate-start", () => {
    cleanupStaleUI();
  });

  // Debounced MutationObserver for dynamic page mutations
  const observer = new MutationObserver(() => {
    if (_observerPaused) return;
    clearTimeout(_moTimer);
    _moTimer = setTimeout(injectAll, 250);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Keyboard shortcut listener for player controls
  document.addEventListener('keydown', onKeydown, true);

  // Boot execution
  scheduleInject(800);

})();
