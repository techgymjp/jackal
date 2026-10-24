'use strict';
// ジャッカル — 相手をタックルで倒し、こぼれ球を奪い取れ!
// 座標系: グラウンドの中心が原点、x がタッチライン方向(右が +)、y がゴール方向、z が高さ。単位はメートル。
// 1 プレーは 2 段階:
//   1. 選手A(方角リングで移動)で相手をタックル。逃げる相手には前タックル、向かってくる相手には左右のタックル
//   2. タックルが決まると、相手に並走していた選手Bに切り替わる。こぼれたボールの方向(前・左・右)のジャッカルボタンで奪う
(() => {
  // ---------- 定数 ----------
  const H = 640;
  let W = 960; // 画面の横幅に合わせて変わる(高さ 640 基準の論理座標)
  const HX = 35, HY = 50;
  const TOTAL = 20;

  const WALK = 6.0, DASH = 8.8, ACC = 26;
  const STAMINA_MAX = 6.0, STAMINA_REGEN = 0.5;
  const TACKLE_T = 0.42, TACKLE_V = 10.0, DOWN_T = 0.9;
  // タックルが届く範囲。逃げる相手は後ろから足元に飛びつくので広め、向かってくる相手は左右を読ませるので狭め
  const TACKLE_HIT = { flee: { reach: 0.9, r: 1.2 }, attack: { reach: 0.7, r: 0.95 } };
  const GRAB_R = 1.0; // 選手B がこぼれ球に触れて奪える距離
  const SLOW_T = 0.7, SLOW_K = 0.3; // タックルの瞬間のスローモーション(実時間・倍率)
  const DT = 1 / 120;
  const t = (k, v) => I18N.t(k, v);

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ---------- 乱数 ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = mulberry32(Date.now());
  const rand = (a, b) => a + (b - a) * rng();
  const pick = (arr) => arr[(rng() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- 保存 ----------
  function loadBest() {
    try { return JSON.parse(localStorage.getItem('jackal.best')) || null; } catch (e) { return null; }
  }
  function saveBest(b) {
    try { localStorage.setItem('jackal.best', JSON.stringify(b)); } catch (e) { /* 保存できない環境 */ }
  }

  // ---------- サウンド(sound.js) ----------
  function audio() { Sound.init(); }

  // ---------- 入力 ----------
  const keys = new Set();
  const input = { mx: 0, my: 0, sx: 0, sy: 0, dash: false, act: null };
  const pressed = { act: null, start: false };
  let bot = null; // テスト用: (state) => input を返す関数

  const RING = { x: 125, y: 510, r: 95, dead: 14 };
  // 右側のボタン: 前・左・右(選手A はタックル、選手B はジャッカル)とダッシュ
  const BTN = {
    front: { x: 785, y: 385, r: 46, key: 'I' },
    left: { x: 695, y: 470, r: 46, key: 'J' },
    right: { x: 875, y: 470, r: 46, key: 'L' },
    dash: { x: 785, y: 575, r: 50, key: 'Shift' },
  };
  const MUTE = { x: 596, y: 36, r: 20 };
  const NAVBTN = { x: 660, y: 36, w: 76, h: 30 };
  const pointers = new Map(); // pointerId -> 'ring' | 'front' | 'left' | 'right' | 'dash' | 'none'
  const ringInput = { active: false, mx: 0, my: 0 };

  window.addEventListener('keydown', (e) => {
    audio();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!keys.has(k)) {
      if (k === 'i' || k === 'k') pressed.act = 'front';
      if (k === 'j') pressed.act = 'left';
      if (k === 'l') pressed.act = 'right';
      if (k === ' ' || k === 'Enter') pressed.start = true;
      if (k === 'p' || k === 'Escape') togglePause();
      if (k === 'm') Sound.setMuted(!Sound.muted);
      if (k === 'n') toggleNav();
    }
    keys.add(k);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });
  window.addEventListener('blur', () => keys.clear());

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  // タックル成立後は選手B を操作している
  function controllingB() {
    return state.phase === 'loose' || (state.phase === 'result' && !!state.play && !!state.play.tackled);
  }

  // 一番近いボタン(スマホは指が太いので、ボタンの外側も少し広めに反応させる)
  function hitButton(p) {
    let best = null, bd = Infinity;
    for (const [name, b] of Object.entries(BTN)) {
      if (controllingB() && name !== 'dash') continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y) - b.r;
      if (d < bd) { bd = d; best = name; }
    }
    return bd <= (isTouch ? 18 : 8) ? best : null;
  }
  function setRing(p) {
    const dx = p.x - RING.x, dy = p.y - RING.y;
    const d = Math.hypot(dx, dy);
    if (d < RING.dead) { ringInput.mx = 0; ringInput.my = 0; return; }
    // 円の方角合わせ: 16方位にスナップ
    const step = Math.PI / 8;
    const ang = Math.round(Math.atan2(dx, -dy) / step) * step;
    const mag = Math.min(1, (d - RING.dead) / (RING.r * 0.45)); // 少し倒すだけで全速
    ringInput.mx = Math.sin(ang) * mag;
    ringInput.my = Math.cos(ang) * mag;
  }
  canvas.addEventListener('pointerdown', (e) => {
    audio();
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPos(e);
    if (Math.hypot(p.x - MUTE.x, p.y - MUTE.y) <= MUTE.r + 8) {
      Sound.setMuted(!Sound.muted);
      pointers.set(e.pointerId, 'none');
      return;
    }
    if (Math.abs(p.x - NAVBTN.x) <= NAVBTN.w / 2 + 6 && Math.abs(p.y - NAVBTN.y) <= NAVBTN.h / 2 + 8) {
      toggleNav();
      pointers.set(e.pointerId, 'none');
      return;
    }
    if (state.phase === 'title' || state.phase === 'over') {
      if (state.phase !== 'over' || state.overT > 1.0) pressed.start = true;
      pointers.set(e.pointerId, 'none');
      return;
    }
    if (state.paused) { pointers.set(e.pointerId, 'none'); return; } // ポーズ中は「再開」ボタンで戻る
    if (Math.hypot(p.x - RING.x, p.y - RING.y) <= RING.r + 30) {
      pointers.set(e.pointerId, 'ring');
      ringInput.active = true;
      setRing(p);
      return;
    }
    const b = hitButton(p);
    if (b && b !== 'dash') pressed.act = b;
    pointers.set(e.pointerId, b || 'none');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.get(e.pointerId) === 'ring') setRing(canvasPos(e));
  });
  function releasePointer(e) {
    if (pointers.get(e.pointerId) === 'ring') {
      ringInput.active = false; ringInput.mx = 0; ringInput.my = 0;
    }
    pointers.delete(e.pointerId);
  }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  // カメラ基準の方向(前・右・左)をワールドの向きへ
  function dirOf(name, F) {
    if (name === 'front') return { x: F.x, y: F.y };
    if (name === 'right') return { x: F.y, y: -F.x };
    return { x: -F.y, y: F.x };
  }
  function toWorld(mx, my, F) {
    // 画面の右 = 前方を時計回りに90°回した方向
    return { x: my * F.x + mx * F.y, y: my * F.y - mx * F.x };
  }

  function readInput() {
    if (bot) {
      const b = bot(state);
      input.mx = b.mx || 0; input.my = b.my || 0; input.sx = input.mx; input.sy = input.my;
      input.dash = !!b.dash; input.act = b.act || null;
      return;
    }
    let mx = 0, my = 0;
    if (keys.has('ArrowUp') || keys.has('w')) my += 1;
    if (keys.has('ArrowDown') || keys.has('s')) my -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) mx += 1;
    if (keys.has('ArrowLeft') || keys.has('a')) mx -= 1;
    if (mx || my) {
      const m = Math.hypot(mx, my);
      mx /= m; my /= m;
    } else if (ringInput.active) {
      mx = ringInput.mx; my = ringInput.my;
    }
    let dash = keys.has('Shift') || keys.has(' ') || keys.has('c');
    for (const v of pointers.values()) if (v === 'dash') dash = true;
    const w = toWorld(mx, my, state.camF);
    input.mx = w.x; input.my = w.y; input.sx = mx; input.sy = my; input.dash = dash;
    input.act = pressed.act;
  }

  // ---------- ゲーム状態 ----------
  const state = {
    phase: 'title', // title | ready | chase | slow | loose | result | over
    paused: false,
    index: 0, total: TOTAL,
    tackles: 0, jackals: 0, score: 0, streak: 0, bestStreak: 0,
    phaseT: 0, overT: 0,
    play: null, actors: {}, ball: null,
    camF: { x: 0, y: 1 },
    view: { x: 0, y: -8, fx: 0, fy: 1 },
    guide: null,
    popups: [],
    msg: null,
    lastResult: null,
    best: loadBest(),
    nav: loadNav(),
    time: 0,
    newRecord: false,
  };

  function actor(x, y, face, extra) {
    return Object.assign({ x, y, vx: 0, vy: 0, face, mode: 'run', t: 0, phase: rng() * 6 }, extra || {});
  }

  function newGame(seed) {
    rng = mulberry32(seed != null ? seed : (Date.now() ^ (Math.random() * 1e9)));
    Object.assign(state, {
      phase: 'ready', paused: false, index: 0, tackles: 0, jackals: 0, score: 0,
      streak: 0, bestStreak: 0, phaseT: 0, overT: 0, popups: [], lastResult: null, newRecord: false, navUsed: false,
    });
    startPlay();
  }

  // ---------- プレーの準備 ----------
  // flee: 相手が向こうへ逃げる(自陣のトライラインは前方)/ attack: 相手がこっちへ攻めてくる(自陣は後方)
  function genPlay(i) {
    const lv = i / (TOTAL - 1);
    const force = window.Jackal && window.Jackal.forceType; // テスト用
    const type = force || (i === 0 ? 'flee' : i === 1 ? 'attack' : (rng() < 0.5 ? 'flee' : 'attack'));
    const S = type === 'flee' ? 1 : -1; // 自陣のトライライン方向(y の符号)
    const play = { type, S, lv, side: rng() < 0.5 ? -1 : 1 };
    if (type === 'flee') {
      play.ax = rand(-8, 8); play.ay = rand(2, 10);
      play.cx = play.ax + rand(-2.5, 2.5); play.cy = play.ay + rand(7, 8.5) + lv * 1.0;
      play.speed = 6.0 + 0.9 * lv;
      play.weave = lv > 0.25 ? rand(0, 1.8 * lv) : 0;
      play.weaveW = rand(1.4, 2.4);
    } else {
      play.ax = rand(-8, 8); play.ay = rand(-22, -12);
      play.cx = play.ax + rand(-3, 3); play.cy = play.ay + rand(15, 18);
      play.speed = 5.6 + 1.5 * lv;
      play.stepD = rand(4.8, 5.8) - lv * 0.3;           // ステップを切る距離
      play.stepSide = rng() < 0.5 ? -1 : 1;            // 画面の左(-1)・右(+1)
      play.feint = lv > 0.2 && rng() < 0.15 + 0.5 * lv; // フェイント(逆に振ってから切り返す)
      play.stepV = 5.0 + 1.6 * lv;
    }
    // こぼれ球: 転がる向き(B から見た角度)・距離とイレギュラーバウンド
    play.spillAng = rand(-1.9, 1.9);
    play.spillDist = rand(1.8, 3.6) + lv * 0.8;
    play.hop = lv > 0.3 && rng() < 0.12 + 0.4 * lv ? (rng() < 0.5 ? -1 : 1) * rand(1.1, 1.8) : 0;
    play.window = 2.0 - 0.7 * lv; // こぼれてから相手が拾うまでの時間
    return play;
  }

  function startPlay() {
    const p = genPlay(state.index);
    state.play = p;
    state.phase = 'ready';
    state.phaseT = 0;
    state.guide = null;
    state.msg = null;
    const cf = p.type === 'flee' ? 0 : Math.PI; // ボールキャリアの向き(+y が 0)
    const A = actor(p.ax, p.ay, 0, { stamina: STAMINA_MAX, crouch: p.type === 'attack' });
    const C = actor(p.cx, p.cy, cf, { hasBall: true, carrySide: rng() < 0.5 ? -1 : 1, ai: 'run', stepT: 0 }); // carrySide: ボールを抱える側(-1 右脇 / +1 左脇)
    // 選手B は相手と並走している(相手の横 5〜6.5m)
    let bs = p.side;
    if (Math.abs(C.x + bs * 6) > HX - 2) bs = -bs;
    p.bSide = bs;
    p.bOff = rand(5, 6.3);
    p.bAlong = rand(-1.5, 0.3);
    const B = actor(C.x + bs * p.bOff, C.y + p.bAlong * p.S, cf, { stamina: STAMINA_MAX });
    const ref = actor(C.x - bs * 9, C.y - p.S * 6, cf);
    const m = (dx, dy) => actor(clamp(A.x + dx, -HX + 2, HX - 2), A.y + dy, 0);
    const o = (dx, dy) => actor(clamp(C.x + dx, -HX + 2, HX - 2), C.y - p.S * dy, cf);
    state.actors = {
      A, B, carrier: C, ref,
      support: o((rng() < 0.5 ? -1 : 1) * rand(4, 6), rand(7, 9)), // カメラの前をふさがないよう少し横に
      m1: m(-12, rand(-4, 2)), m2: m(13, rand(-4, 2)), m3: m(rand(-4, 4), -9 * p.S),
      o1: o(-9, 10), o2: o(10, 11), o3: o(rand(-4, 4), 15),
    };
    for (const k of ['m1', 'm2', 'm3', 'o1', 'o2', 'o3', 'support']) state.actors[k].home = { dx: state.actors[k].x - (k[0] === 'm' ? A.x : C.x), dy: state.actors[k].y - (k[0] === 'm' ? A.y : C.y) };
    state.ball = { holder: 'carrier', x: C.x, y: C.y, z: 1 };
    state.camF = { x: 0, y: 1 };
    pressed.act = null;
  }

  function loadNav() {
    try { return localStorage.getItem('jackal.nav') !== '0'; } catch (e) { return true; }
  }
  function toggleNav() {
    state.nav = !state.nav;
    try { localStorage.setItem('jackal.nav', state.nav ? '1' : '0'); } catch (e) { /* 保存できない環境 */ }
  }

  // ---------- 選手の動き ----------
  function setMode(p, m) { p.mode = m; p.t = 0; }

  // 目標の速度へ加速する
  function steer(p, tvx, tvy, acc, dt) {
    const dvx = tvx - p.vx, dvy = tvy - p.vy;
    const dv = Math.hypot(dvx, dvy), maxd = acc * dt;
    if (dv <= maxd) { p.vx = tvx; p.vy = tvy; } else { p.vx += dvx / dv * maxd; p.vy += dvy / dv * maxd; }
  }
  function moveTo(p, x, y, speed, dt, acc = 18) {
    const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
    const s = Math.min(speed, d * 3);
    steer(p, d > 0.01 ? dx / d * s : 0, d > 0.01 ? dy / d * s : 0, acc, dt);
  }
  function integrate(p, dt, faceVel = true) {
    p.t += dt;
    p.x = clamp(p.x + p.vx * dt, -HX + 0.5, HX - 0.5);
    p.y += p.vy * dt;
    if (faceVel && Math.hypot(p.vx, p.vy) > 0.6) p.face = Math.atan2(p.vx, p.vy);
  }

  // 方角リングとダッシュで走る(選手A・選手B 共通)。inp が null なら止まる
  function runControl(P, inp, dt) {
    let mx = inp ? inp.mx : 0, my = inp ? inp.my : 0;
    let mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
    const dashing = !!inp && inp.dash && mag > 0.1 && P.stamina > 0;
    P.dashing = dashing;
    const top = dashing ? DASH : WALK;
    steer(P, mx * top, my * top, ACC, dt);
    if (dashing) P.stamina = Math.max(0, P.stamina - dt);
    else P.stamina = Math.min(STAMINA_MAX, P.stamina + STAMINA_REGEN * dt);
  }

  // 選手A: 方角リングで移動、ボタンで 前・左・右 にタックル
  function updateA(A, inp, dt, canMove) {
    if (A.mode === 'tackle') {
      A.vx = A.dir.x * TACKLE_V; A.vy = A.dir.y * TACKLE_V;
      if (A.t >= TACKLE_T) { setMode(A, 'down'); }
    } else if (A.mode === 'down') {
      const k = Math.exp(-7 * dt);
      A.vx *= k; A.vy *= k;
      if (A.t >= DOWN_T && !A.stayDown) setMode(A, 'run');
    } else {
      runControl(A, canMove ? inp : null, dt);
      if (canMove && inp.act) startTackle(A, inp.act);
    }
    integrate(A, dt, A.mode === 'run');
    if (A.mode === 'run' && Math.hypot(A.vx, A.vy) < 0.6) A.face = Math.atan2(state.camF.x, state.camF.y);
  }

  // タックル: 指定方向へ飛び込む。相手が近ければ少しだけ狙いを補正する
  function startTackle(A, name) {
    const C = state.actors.carrier;
    let d = dirOf(name, state.camF);
    // 向かってくる相手には前タックルの補正をほぼ効かせない(左右を読ませる)
    const cone = name === 'front' ? (state.play.type === 'attack' ? 0.1 : 0.38) : 0.7;
    const px = C.x + C.vx * 0.2 - A.x, py = C.y + C.vy * 0.2 - A.y, pd = Math.hypot(px, py);
    if (pd < 4.6 && pd > 0.1) {
      const ang = Math.acos(clamp((px * d.x + py * d.y) / pd, -1, 1));
      if (ang < cone) d = { x: px / pd, y: py / pd };
    }
    A.dir = d;
    A.face = Math.atan2(d.x, d.y);
    A.tackleName = name;
    setMode(A, 'tackle');
    Sound.lunge();
  }

  // ボールキャリア
  function updateCarrier(C, dt) {
    const p = state.play, A = state.actors.A;
    if (state.phase === 'ready') { C.vx = C.vy = 0; integrate(C, dt); return; }
    if (C.mode === 'tackled' || C.mode === 'dive') {
      const k = Math.exp(-5 * dt);
      C.vx *= k; C.vy *= k;
      integrate(C, dt, false);
      return;
    }
    C.lean = 0;
    if (p.type === 'flee') {
      // 向こうへ逃げる。後半は左右に揺さぶる
      const vx = p.weave ? Math.sin(state.phaseT * p.weaveW) * p.weave * p.weaveW : 0;
      // 逃げ続けると疲れてだんだん遅くなる
      const sp = p.speed - Math.min(1.2, Math.max(0, state.phaseT - 1.5) * 0.3);
      steer(C, vx, sp, 14, dt);
      C.lean = vx / 6;
    } else {
      const ahead = (C.y - A.y) * -p.S; // A より前(相手から見て)にいる距離
      if (C.ai === 'run') {
        // A に向かって走る
        steer(C, clamp((A.x - C.x) * 0.6, -2, 2), -p.speed, 14, dt);
        // フェイントは早めに仕掛け、本当のステップがいつもの距離で始まるようにする
        if (ahead < p.stepD + (p.feint ? 1.4 : 0) && ahead > 0) {
          const gap = C.x - A.x;
          if (Math.abs(gap) > 2.3) { p.stepSide = Math.sign(gap); p.feint = false; }
          C.ai = p.feint ? 'feint' : 'step';
          C.stepT = 0;
        }
      } else if (C.ai === 'feint') {
        C.stepT += dt;
        steer(C, -p.stepSide * 3.5, -p.speed * 0.85, 40, dt);
        C.lean = -p.stepSide;
        if (C.stepT > 0.22) { C.ai = 'step'; C.stepT = 0; }
      } else if (C.ai === 'step') {
        C.stepT += dt;
        steer(C, p.stepSide * p.stepV, -p.speed * 0.8, 45, dt);
        C.lean = p.stepSide;
        if (C.stepT > 0.45) C.ai = 'burst';
      } else {
        steer(C, p.stepSide * 0.8, -(p.speed + 0.8), 18, dt);
      }
    }
    integrate(C, dt);
  }

  // タックルが決まったか
  function checkTackle() {
    const A = state.actors.A, C = state.actors.carrier;
    if (A.mode !== 'tackle' || C.mode === 'tackled') return;
    const th = TACKLE_HIT[state.play.type];
    const hx = A.x + A.dir.x * th.reach, hy = A.y + A.dir.y * th.reach;
    if (Math.hypot(C.x - hx, C.y - hy) > th.r) return;
    onTackle(A, C);
  }

  function onTackle(A, C) {
    const p = state.play;
    setMode(C, 'tackled');
    C.hasBall = false;
    C.face = Math.atan2(C.vx, C.vy);
    C.vx = C.vx * 0.5 + A.dir.x * 2; C.vy = C.vy * 0.5 + A.dir.y * 2;
    A.stayDown = true;
    A.vx *= 0.4; A.vy *= 0.4;
    state.tackles++;
    const pts = 100 + (p.type === 'attack' ? 50 : 0);
    state.score += pts;
    p.tackled = true;
    // ボールキャリアが倒れたらすぐボールを手放す(こぼれる)。B のカメラは B からタックル地点の方向
    const B = state.actors.B;
    p.T = { x: C.x + C.vx * 0.25, y: C.y + C.vy * 0.25 };
    const fx = p.T.x - B.x, fy = p.T.y - B.y, fl = Math.hypot(fx, fy);
    p.F = fl > 1.5 ? { x: fx / fl, y: fy / fl } : { x: -p.bSide, y: 0 };
    p.spilled = false;
    popup(t(p.type === 'flee' ? 'tackle.chase' : 'tackle.ok'), '#ffffff', 44);
    popup('+' + pts, '#9fe8ff', 24, 0.2);
    Sound.thud();
    Sound.cheer(0.8, 1.6);
    state.phase = 'slow';
    state.phaseT = 0;
    state.slowReal = 0;
  }

  // 選手Bに切り替え: 並走していた勢いのまま、方角リングでこぼれ球へ走らせる
  function startLoose() {
    const p = state.play, B = state.actors.B;
    state.phase = 'loose';
    state.phaseT = 0;
    if (!p.spilled) spill();
    p.spillAt = 0; // 猶予時間は B に切り替わってから数える
    B.stamina = STAMINA_MAX;
    B.crouch = false;
    state.camF = p.F;
    state.viewCut = true;
    state.msg = { key: 'msg.loose', t: 0 };
    popup(t('msg.switchBig'), '#ffe14d', 46, 0.05);
    Sound.whoosh();
    // 相手のサポートが拾いに来る(タックル地点の奥から)
    const S = state.actors.support;
    S.x = clamp(p.T.x + rand(-2, 2), -HX + 1, HX - 1); S.y = p.T.y - p.S * rand(6.5, 8);
    S.vx = 0; S.vy = p.S * 3;
    S.mode = 'run';
  }

  // タックル地点から、B から見た角度 ang(0 = 奥、+ = 右)へ dist m の地点
  function spillPoint(from, ang, dist) {
    const F = state.play.F;
    const dx = F.x * Math.cos(ang) + F.y * Math.sin(ang), dy = F.y * Math.cos(ang) - F.x * Math.sin(ang);
    return { x: clamp(from.x + dx * dist, -HX + 1, HX - 1), y: from.y + dy * dist };
  }

  // 倒れたボールキャリアがボールを手放す
  function spill() {
    const p = state.play, b = state.ball;
    p.spilled = true;
    b.holder = null;
    const C = state.actors.carrier;
    b.x = C.x; b.y = C.y; b.z = 0.3;
    const from = { x: b.x, y: b.y };
    const to1 = spillPoint(from, p.spillAng, p.spillDist);
    const dur = (d) => 0.2 + d * 0.12;
    if (p.hop) {
      // イレギュラーバウンド: 途中で別の方向へ跳ねる
      const mid = { x: (from.x + to1.x) / 2, y: (from.y + to1.y) / 2 };
      const to2 = spillPoint(mid, p.spillAng + p.hop, rand(1.6, 2.6));
      b.path = [{ from, to: mid, dur: dur(p.spillDist / 2), hop: 0.5 }, { from: mid, to: to2, dur: dur(2), hop: 0.45 }];
    } else {
      b.path = [{ from, to: to1, dur: dur(p.spillDist), hop: 0.55 }];
    }
    b.seg = 0; b.segT = 0; b.yaw = 0; b.spinX = 0;
    Sound.bounce();
  }

  function updateBallLoose(b, dt) {
    if (b.holder || !b.path) return;
    const seg = b.path[b.seg];
    if (seg) {
      b.segT += dt;
      const u = Math.min(1, b.segT / seg.dur);
      const e = 1 - (1 - u) * (1 - u);
      b.x = seg.from.x + (seg.to.x - seg.from.x) * e;
      b.y = seg.from.y + (seg.to.y - seg.from.y) * e;
      b.z = Math.sin(Math.PI * u) * seg.hop;
      b.yaw += dt * 9; b.spinX += dt * 13;
      if (u >= 1) {
        b.seg++; b.segT = 0;
        Sound.bounce();
        const dx = seg.to.x - seg.from.x, dy = seg.to.y - seg.from.y, dl = Math.hypot(dx, dy) || 1;
        b.roll = { x: dx / dl * 0.7, y: dy / dl * 0.7 };
      }
    } else if (b.roll) {
      // 止まりかけてころころ転がる
      b.x += b.roll.x * dt; b.y += b.roll.y * dt; b.z = 0;
      const k = Math.exp(-2 * dt);
      b.roll.x *= k; b.roll.y *= k;
      b.yaw += dt * Math.hypot(b.roll.x, b.roll.y) * 4;
    }
  }

  // 選手B: タックルまでは相手に並走。切り替え後は方角リングとダッシュで動かし、ボールに触れたらジャッカル
  function updateB(B, inp, dt) {
    const p = state.play, C = state.actors.carrier;
    if (state.phase === 'ready' || state.phase === 'chase' || (state.phase === 'result' && !p.tackled)) {
      // 並走: 相手の横を同じ速さで走る
      const tx = clamp(C.x + p.bSide * p.bOff, -HX + 1, HX - 1), ty = C.y + p.bAlong * p.S;
      if (state.phase === 'ready') { B.vx = 0; B.vy = 0; } else moveTo(B, tx, ty, 9.5, dt, 22);
      integrate(B, dt);
      return;
    }
    if (state.phase === 'slow') { integrate(B, dt); return; } // スローの間はそのままの勢いで走る
    if (B.mode === 'celebrate' || B.mode === 'jackal' || B.mode === 'blown') {
      const k = Math.exp(-7 * dt);
      B.vx *= k; B.vy *= k;
      integrate(B, dt, false);
      if (B.mode === 'jackal' && B.t > 0.45) { setMode(B, 'celebrate'); state.ball.overhead = true; }
      return;
    }
    runControl(B, state.phase === 'loose' ? inp : null, dt);
    integrate(B, dt);
  }

  // ボールに触れたら奪う(高く弾んでいる間は届かない)
  function checkGrab() {
    const B = state.actors.B, b = state.ball;
    if (b.holder || B.mode !== 'run') return;
    if (b.z > 0.9 || Math.hypot(b.x - B.x, b.y - B.y) > GRAB_R) return;
    onJackal(B);
  }

  function onJackal(B) {
    const p = state.play, b = state.ball;
    b.holder = 'B'; b.atHands = true; b.path = null;
    setMode(B, 'jackal');
    B.vx *= 0.2; B.vy *= 0.2;
    B.face = Math.atan2(b.x - B.x, b.y - B.y);
    state.jackals++;
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    const react = Math.max(0, state.phaseT - p.spillAt);
    const fast = react < p.window * 0.45;
    let pts = 300 + Math.round(200 * Math.max(0, 1 - react / p.window)) + Math.min(state.streak - 1, 10) * 20;
    if (p.hop) pts += 150;
    state.score += pts;
    state.lastResult = { ok: true };
    popup(t('jackal.ok'), '#ffe14d', 58);
    popup(t(p.hop ? 'jackal.hop' : fast ? 'jackal.fast' : 'jackal.sub'), '#ff8a65', 30, 0.2);
    popup('+' + pts, '#9fe8ff', 26, 0.35);
    state.msg = null;
    celebrate(fast || p.hop);
    endPlay();
  }

  // ジャッカル成功: 花火と大歓声。速い反応やイレギュラーバウンドを拾ったら、さらに派手に
  function celebrate(great) {
    const milestone = state.streak > 0 && state.streak % 5 === 0;
    Sound.grab();
    Sound.whistle();
    Sound.cheer(great ? 1.6 : 1.25, great ? 5 : 4);
    Sound.horn();
    let n = great ? 7 : 5;
    if (milestone) {
      n += 4;
      popup(t('streak', { n: state.streak }), '#ff8a65', 34, 0.55);
    }
    fireworks(n, great);
  }

  function fireworks(n, big, gap = 0.28) {
    for (let i = 0; i < n; i++) {
      const tt = 0.1 + i * gap + Math.random() * 0.15;
      Scene3D.firework(tt, big);
      Sound.launch(tt);
      Sound.boom(tt + Scene3D.ROCKET_T);
    }
  }

  function fail(key) {
    if (state.phase === 'result') return;
    state.streak = 0;
    state.lastResult = { ok: false, key };
    state.msg = null;
    popup(t(key), '#ff6b6b', 44);
    Sound.sigh(key === 'miss.try' ? 1.3 : 1);
    endPlay();
  }

  function endPlay() {
    state.phase = 'result';
    state.phaseT = 0;
  }

  function popup(text, color, size, delay = 0) {
    state.popups.push({ text, color, size, t: -delay, life: 1.6, idx: state.popups.length });
  }

  // 周りの選手(雰囲気づくり): ボールの周りに集まってくる。こぼれ球の場面での立ち位置 [右へ, 前へ](B から見て)
  const LOOSE_SLOT = { m1: [-6.5, -1], m2: [6.5, -0.5], m3: [-4.5, 2.5], o1: [-5, 5.5], o2: [5.5, 5], o3: [2.5, 6.5] };
  function updateExtras(dt) {
    const a = state.actors, p = state.play;
    const focus = p.T || { x: a.carrier.x, y: a.carrier.y };
    const loose = state.phase === 'loose' || state.phase === 'result';
    for (const k of ['m1', 'm2', 'm3', 'o1', 'o2', 'o3']) {
      const e = a[k];
      if (state.phase === 'ready') { e.vx = e.vy = 0; integrate(e, dt); continue; }
      let tx, ty;
      if (loose) {
        // タックル地点の周りに集まる(カメラと選手Bの間には入らない)
        const [r, f] = LOOSE_SLOT[k], F = p.F || state.camF;
        tx = focus.x + F.y * r + F.x * f; ty = focus.y - F.x * r + F.y * f;
      } else if (k[0] === 'm') {
        tx = a.carrier.x + e.home.dx * 0.6; ty = a.carrier.y + p.S * (6 + Math.abs(e.home.dx) * 0.2);
      } else {
        tx = a.carrier.x + e.home.dx; ty = a.carrier.y + e.home.dy;
      }
      moveTo(e, clamp(tx, -HX + 1, HX - 1), ty, k[0] === 'm' ? 6 : 6.5, dt, 10);
      integrate(e, dt);
      if (Math.hypot(e.vx, e.vy) < 0.6) e.face = Math.atan2(focus.x - e.x, focus.y - e.y);
    }
    // レフリーはボールから少し離れてついていく
    const r = a.ref;
    const rx = clamp(focus.x - (p.bSide || 1) * 9, -HX + 1, HX - 1), ry = focus.y - p.S * 5;
    if (state.phase !== 'ready') moveTo(r, rx, ry, 6.5, dt, 10);
    integrate(r, dt);
    if (Math.hypot(r.vx, r.vy) < 0.6) r.face = Math.atan2(focus.x - r.x, focus.y - r.y);
  }

  // 相手のサポート: こぼれ球を拾いに来る
  function updateSupport(S, dt) {
    const p = state.play, b = state.ball, C = state.actors.carrier;
    if (!p.T) {
      if (state.phase === 'ready') { S.vx = S.vy = 0; integrate(S, dt); return; }
      moveTo(S, clamp(C.x + S.home.dx, -HX + 1, HX - 1), C.y + S.home.dy, 7, dt, 10);
      integrate(S, dt);
      return;
    }
    if (b.holder === 'support') {
      steer(S, 0, -p.S * 6, 12, dt);
      integrate(S, dt);
      return;
    }
    if (b.holder === 'B') {
      steer(S, 0, 0, 12, dt);
      integrate(S, dt);
      S.face = Math.atan2(b.x - S.x, b.y - S.y);
      return;
    }
    if (state.phase === 'slow') { integrate(S, dt); return; }
    // こぼれ球を追う。ちょうど「猶予時間」で届く速さで走る
    const due = p.spillAt + p.window;
    const remain = Math.max(0.05, due - state.phaseT);
    const d = Math.hypot(b.x - S.x, b.y - S.y);
    moveTo(S, b.x, b.y, clamp(d / remain, 2.5, 9.5), dt, 25);
    integrate(S, dt);
    if (state.phase === 'loose' && state.phaseT >= due - 0.02 && d < 1.3) {
      b.holder = 'support'; b.atHands = false; b.path = null;
      S.hasBall = true;
      Sound.grab();
      fail('miss.slow');
      const B = state.actors.B;
      if (Math.hypot(B.x - S.x, B.y - S.y) < 2.5) setMode(B, 'blown');
    }
  }

  // スマホは横画面で遊ぶ。縦向きの間は案内を出して一時停止する
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const portraitMQ = window.matchMedia('(orientation: portrait)');
  const isPortrait = () => isTouch && portraitMQ.matches;

  // スタートのタップで全画面+横向き固定を試す(Android Chrome など。iPhone は非対応なので何もしない)
  function goLandscape() {
    if (!isTouch) return;
    const el = document.documentElement;
    const lock = () => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    };
    try {
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
      else lock();
    } catch (e) { /* 非対応 */ }
  }
  canvas.addEventListener('pointerup', () => { if (state.phase === 'title' || state.phase === 'over') goLandscape(); });

  function togglePause() {
    if (state.phase === 'title' || state.phase === 'over') return;
    state.paused = !state.paused;
  }

  // ---------- 更新 ----------
  function update(dt) {
    state.time += dt;
    if (state.phase === 'title') {
      if (pressed.start) { pressed.start = false; newGame(); }
      return;
    }
    if (state.phase === 'over') {
      state.overT += dt;
      if (pressed.start && state.overT > 1.0) { pressed.start = false; newGame(); }
      pressed.start = false;
      return;
    }
    pressed.start = false;
    if (isPortrait()) { if (!state.paused) state.paused = true; return; }
    if (state.paused) return;

    readInput();
    pressed.act = null;
    if (state.nav && (state.phase === 'chase' || state.phase === 'loose')) state.navUsed = true;

    // タックルの瞬間はスローモーション
    let sdt = dt;
    if (state.phase === 'slow') {
      state.slowReal += dt;
      sdt = dt * SLOW_K;
    }
    state.phaseT += sdt;
    const a = state.actors, p = state.play;
    const A = a.A;
    const ctrlA = state.phase === 'chase';
    updateA(A, ctrlA ? input : { mx: 0, my: 0, dash: false, act: null }, sdt, ctrlA);
    updateCarrier(a.carrier, sdt);
    updateB(a.B, input, sdt);
    updateSupport(a.support, sdt);
    updateExtras(sdt);
    if (state.ball.holder === null) updateBallLoose(state.ball, sdt);

    if (state.phase === 'chase') {
      checkTackle();
      const C = a.carrier;
      if (state.phase === 'chase') {
        if (p.type === 'flee' && C.y >= HY + 0.5) { setMode(C, 'dive'); fail('miss.try'); }
        if (p.type === 'attack' && (A.y - C.y) > 3.2) fail('miss.break');
        if (p.type === 'flee' && C.y - A.y > 22) fail('miss.away');
      }
    }
    // 倒れたらすぐボールがこぼれる(スローモーションの間に見える)
    if (state.phase === 'slow' && !p.spilled && a.carrier.t >= 0.3) spill();
    if (state.phase === 'slow' && state.slowReal >= SLOW_T) startLoose();
    if (state.phase === 'loose') checkGrab();
    // 選手A はタックルのあと、離れる(ロールアウェイ)
    if ((state.phase === 'loose' || state.phase === 'result') && p.tackled && A.mode === 'down' && A.t > 0.8) {
      const lx = A.x - p.T.x, ly = A.y - p.T.y, ll = Math.hypot(lx, ly) || 1;
      if (ll < 2.2) { A.x += lx / ll * 1.5 * sdt; A.y += ly / ll * 1.5 * sdt; }
    }
    if (state.msg) state.msg.t += dt;

    updateGuide();
    updateView();

    for (const pp of state.popups) pp.t += dt;
    state.popups = state.popups.filter((pp) => pp.t < pp.life);

    if (state.phase === 'ready' && state.phaseT >= 1.7) {
      state.phase = 'chase';
      state.phaseT = 0;
      state.msg = { key: p.type === 'flee' ? 'msg.flee' : 'msg.attack', t: 0 };
      Sound.whistle(0.5);
    }
    if (state.phase === 'result' && state.phaseT >= 2.3) {
      state.index++;
      if (state.index >= TOTAL) gameOver();
      else startPlay();
    }
  }

  // ナビ: タックルが届くタイミングで相手の足元に輪、こぼれ球の行き先に輪
  function wouldHit(A, C, name) {
    const d = dirOf(name, state.camF), th = TACKLE_HIT[state.play.type];
    let ax = A.x, ay = A.y, cx = C.x, cy = C.y;
    for (let tt = 0; tt < TACKLE_T; tt += 0.02) {
      ax += d.x * TACKLE_V * 0.02; ay += d.y * TACKLE_V * 0.02;
      cx += C.vx * 0.02; cy += C.vy * 0.02;
      if (Math.hypot(cx - (ax + d.x * th.reach), cy - (ay + d.y * th.reach)) < th.r) return true;
    }
    return false;
  }
  function updateGuide() {
    const a = state.actors, p = state.play;
    state.guide = null;
    state.hintBtn = null;
    if (!state.nav) return;
    // 向かってくる相手は、ステップを切ってからでないとかわされる(早すぎるタックルは勧めない)
    const committed = p.type === 'flee' || (a.carrier.ai === 'step' && a.carrier.stepT > 0.15) || a.carrier.ai === 'burst';
    if (state.phase === 'chase' && committed && a.A.mode === 'run' && a.carrier.mode !== 'tackled') {
      for (const name of p.type === 'flee' ? ['front', 'left', 'right'] : ['left', 'right', 'front']) {
        if (wouldHit(a.A, a.carrier, name)) { state.hintBtn = name; break; }
      }
      if (state.hintBtn) state.guide = { hit: { x: a.carrier.x, y: a.carrier.y } };
    }
    if (state.phase === 'loose' && p.spilled && !state.ball.holder && state.ball.path) {
      const seg = state.ball.path[Math.min(state.ball.seg, state.ball.path.length - 1)];
      state.guide = { loose: seg.to };
    }
  }

  function updateView() {
    const a = state.actors, p = state.play;
    const useB = controllingB();
    const P = useB ? a.B : a.A;
    const F = state.camF;
    state.view = {
      x: P.x, y: P.y, fx: F.x, fy: F.y,
      // 選手A のときは少し高くして、A の頭越しにボールキャリアが見えるようにする
      back: useB ? 6.0 : 6.5, h: useB ? 3.4 : 3.6,
      // ジャッカル成功のあとは見上げて花火を見せる
      pitch: state.phase === 'result' && state.lastResult && state.lastResult.ok && state.phaseT > 0.5 ? 0.17 : useB ? -0.12 : -0.08,
      cut: !!state.viewCut,
    };
    state.viewCut = false;
  }

  function gameOver() {
    state.phase = 'over';
    state.overT = 0;
    const best = state.best;
    if (!best || state.jackals > best.jackals || (state.jackals === best.jackals && state.score > best.score)) {
      state.best = { jackals: state.jackals, score: state.score };
      state.newRecord = true;
      saveBest(state.best);
    }
    const perfect = state.jackals === TOTAL;
    Sound.whistle(1.2);
    Sound.fanfare(perfect);
    Sound.cheer(perfect ? 1.6 : 0.9, perfect ? 6 : 3);
    if (perfect) { Sound.horn(); fireworks(16, true, 0.35); } else if (state.jackals >= 14) fireworks(6, false, 0.4);
  }

  // ---------- 描画(2D オーバーレイ) ----------
  // ミニマップ(画面と同じ向き: カメラの前方が上)
  function drawMinimap() {
    const mw = 120, mh = 150, mx = W - mw - 12, my = 12;
    const F = state.camF;
    const sc = mh / 125;
    const cxm = mx + mw / 2, cym = my + mh / 2;
    const v = state.view;
    // ワールド → ミニマップ(前方を上に回転、操作中の選手のあたりを中心に)
    const ox = clamp(v.x, -10, 10), oy = clamp(v.y, -25, 25);
    const tx = (x, y) => cxm + ((x - ox) * F.y - (y - oy) * F.x) * sc;
    const ty = (x, y) => cym - ((x - ox) * F.x + (y - oy) * F.y) * sc;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.clip();
    const poly = (pts, fill, stroke) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(tx(x, y), ty(x, y)) : ctx.moveTo(tx(x, y), ty(x, y))));
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    };
    poly([[-HX, -60], [HX, -60], [HX, 60], [-HX, 60]], '#3c8a3f', 'rgba(255,255,255,0.8)');
    const line = (x0, y0, x1, y1, col, w = 1) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(tx(x0, y0), ty(x0, y0)); ctx.lineTo(tx(x1, y1), ty(x1, y1)); ctx.stroke(); };
    // 自陣のトライラインは赤、相手陣は白
    const S = state.play ? state.play.S : -1;
    line(-HX, HY * S, HX, HY * S, '#ff5252', 2);
    line(-HX, -HY * S, HX, -HY * S, '#ffffff', 1.5);
    line(-HX, 0, HX, 0, 'rgba(255,255,255,0.6)');
    line(-HX, 28, HX, 28, 'rgba(255,255,255,0.4)'); line(-HX, -28, HX, -28, 'rgba(255,255,255,0.4)');
    const a = state.actors;
    for (const [k, p] of Object.entries(a)) {
      const col = k === 'ref' ? '#b6f04a' : (k === 'carrier' || k === 'support' || k[0] === 'o') ? '#5c7cff' : '#ff5a5a';
      const me = (k === 'A' && state.phase !== 'loose') || (k === 'B' && state.phase === 'loose');
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(tx(p.x, p.y), ty(p.x, p.y), me ? 4 : 2.6, 0, Math.PI * 2); ctx.fill();
      if (me) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    const b = state.ball;
    if (b) {
      const h = b.holder && a[b.holder];
      const bx = h ? h.x : b.x, by = h ? h.y : b.y;
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath(); ctx.arc(tx(bx, by), ty(bx, by) - 3, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(12, 12, 270, 100);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(t('hud.play', { n: Math.min(state.index + 1, TOTAL), t: TOTAL }), 24, 40);
    ctx.font = 'bold 16px sans-serif';
    let hx = 24;
    for (const [key, n, col] of [['hud.tackles', state.tackles, '#9fe8ff'], ['hud.jackals', state.jackals, '#ffe14d'], ['hud.streak', state.streak, '#ff8a65']]) {
      const label = t(key, { n });
      ctx.fillStyle = col;
      ctx.fillText(label, hx, 64);
      hx += Math.max(70, ctx.measureText(label).width + 12);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE ${state.score}`, 24, 86);

    // スタミナ(操作中の選手のダッシュ)
    const P = controllingB() ? state.actors.B : state.actors.A;
    const st = P && P.stamina != null ? P.stamina / STAMINA_MAX : 1;
    ctx.fillStyle = '#333';
    ctx.fillRect(24, 94, 246, 8);
    ctx.fillStyle = st > 0.3 ? '#6be37a' : '#ff9a3c';
    ctx.fillRect(24, 94, 246 * st, 8);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#ddd';
    ctx.textAlign = 'right';
    ctx.fillText(t('hud.dash'), 270, 90);
    ctx.textAlign = 'left';

    // 操作中の選手
    const who = controllingB() ? 'B' : 'A';
    ctx.fillStyle = who === 'A' ? 'rgba(200,16,46,0.85)' : 'rgba(255,180,0,0.9)';
    ctx.fillRect(292, 12, 132, 34);
    ctx.fillStyle = who === 'A' ? '#fff' : '#1b1200';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(t(who === 'A' ? 'hud.playerA' : 'hud.playerB'), 302, 35, 116);
  }

  function btnLabel(name) {
    if (name === 'dash') return [t('btn.dash'), ''];
    return [t('btn.' + name), t('btn.tackle')];
  }

  function drawControls() {
    const isB = controllingB();
    // 方角リング(選手A・選手B 共通)
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(RING.x, RING.y, RING.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    const mx = input.sx, my = input.sy;
    const mag = Math.hypot(mx, my);
    const cur = mag > 0.1 ? Math.atan2(mx, my) : null;
    for (let i = 0; i < 16; i++) {
      const ang = i * Math.PI / 8;
      const major = i % 2 === 0;
      const diff = cur == null ? 9 : Math.abs(((ang - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const lit = diff < 0.2;
      ctx.fillStyle = lit ? '#ffe14d' : (major ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)');
      const rr = RING.r - 12;
      ctx.beginPath();
      ctx.arc(RING.x + Math.sin(ang) * rr, RING.y - Math.cos(ang) * rr, lit ? 7 : (major ? 4.5 : 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('ring.fwd'), RING.x, RING.y - RING.r - 6);
    ctx.fillText(t('ring.back'), RING.x, RING.y + RING.r + 15);
    const kx = RING.x + mx * RING.r * 0.6, ky = RING.y - my * RING.r * 0.6;
    ctx.fillStyle = mag > 0.1 ? '#ffe14d' : 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(kx, ky, RING.r * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // ボタン
    ctx.save();
    for (const [name, b] of Object.entries(BTN)) {
      if (isB && name !== 'dash') continue; // 選手B は移動とダッシュだけ(タックルボタンは出さない)
      let on = false;
      for (const v of pointers.values()) if (v === name) on = true;
      if (name === 'dash' && input.dash) on = true;
      const hint = state.hintBtn === name && Math.floor(state.time * 10) % 2 === 0;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = on ? 'rgba(255,225,77,0.9)' : hint ? 'rgba(255,140,60,0.75)' : 'rgba(0,0,0,0.42)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2.5; ctx.stroke();
      // 方向の矢印
      if (name !== 'dash') {
        const ang = name === 'front' ? -Math.PI / 2 : name === 'left' ? Math.PI : 0;
        ctx.save();
        const ak = b.r / 46;
        ctx.translate(b.x + Math.cos(ang) * (b.r - 11 * ak), b.y + Math.sin(ang) * (b.r - 11 * ak));
        ctx.rotate(ang);
        ctx.scale(ak, ak);
        ctx.fillStyle = on ? '#222' : '#ffe14d';
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -7); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      const [l1, l2] = btnLabel(name);
      ctx.fillStyle = on ? '#222' : '#fff';
      ctx.textAlign = 'center';
      const fk = b.r / 46;
      if (l2) {
        ctx.font = `bold ${Math.round(17 * fk)}px sans-serif`;
        ctx.fillText(l1, b.x, b.y - 2 * fk, b.r * 1.5);
        ctx.font = `bold ${Math.round(11 * fk)}px sans-serif`;
        ctx.fillText(l2, b.x, b.y + 13 * fk, b.r * 1.6);
      } else {
        ctx.font = `bold ${Math.round(15 * fk)}px sans-serif`;
        ctx.fillText(l1, b.x, b.y + 4 * fk);
      }
      if (!isTouch) { ctx.font = '10px sans-serif'; ctx.fillText(b.key, b.x, b.y + 27); }
    }
    ctx.restore();
  }

  function drawPopups() {
    ctx.textAlign = 'center';
    let line = 0;
    for (const p of state.popups) {
      if (p.t < 0) continue;
      const a = Math.min(1, (p.life - p.t) / 0.4);
      const sc = 1 + Math.max(0, 0.25 - p.t) * 1.5;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, (isTouch ? 250 : 200) + line * 56 - p.t * 14);
      ctx.scale(sc, sc);
      ctx.font = `900 ${p.size}px sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
      line++;
    }
  }

  function drawMessage() {
    const m = state.msg;
    if (!m || state.phase === 'result') return;
    const blink = m.key === 'msg.loose' && Math.floor(state.time * 8) % 2 === 0;
    const text = t(m.key);
    ctx.save();
    ctx.font = 'bold 20px sans-serif';
    const w = ctx.measureText(text).width + 36;
    ctx.fillStyle = m.key === 'msg.loose' ? 'rgba(160,60,0,0.75)' : 'rgba(0,0,0,0.55)';
    const my = isTouch ? 158 : 104; // スマホは上のボタンが大きいので少し下げる
    ctx.fillRect(W / 2 - w / 2, my, w, 36);
    ctx.fillStyle = blink ? '#ffe14d' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, my + 25);
    ctx.restore();
  }

  // 「おいかけろ」「とめろ」の大きな掛け声。準備中から走り出した直後まで出して、ふくらんで消える
  function drawCall() {
    const p = state.play;
    if (!p || state.paused) return;
    let a = 0, k = 1;
    if (state.phase === 'ready') { a = Math.min(1, state.phaseT / 0.2); k = 1 + Math.max(0, 0.2 - state.phaseT) * 2.5; }
    else if (state.phase === 'chase' && state.phaseT < 0.9) { a = 1 - state.phaseT / 0.9; k = 1 + state.phaseT * 0.5; }
    if (a <= 0) return;
    const text = t(p.type === 'flee' ? 'call.flee' : 'call.attack');
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, 315);
    ctx.scale(k, k);
    ctx.font = '900 104px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(text, 0, 0, W - 80);
    ctx.fillStyle = p.type === 'flee' ? '#ffe14d' : '#ff5a4a';
    ctx.fillText(text, 0, 0, W - 80);
    ctx.restore();
  }

  function centerText(text, y, size, color = '#fff', weight = 'bold') {
    ctx.font = `${weight} ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(text, W / 2, y);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y);
  }

  function drawTitle() {
    ctx.fillStyle = 'rgba(8,14,20,0.55)';
    ctx.fillRect(0, 0, W, H);
    centerText(t('title.name'), 140, 80, '#ffe14d', '900');
    centerText(t('title.sub'), 195, 26);
    ctx.font = '17px sans-serif';
    ctx.fillStyle = '#e6e6e6';
    const lines = [1, 2, 3, 4, 5, 6].map((i) => t(`help.${isTouch ? 'touch' : 'key'}.${i}`));
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 250 + i * 30, W - 60));
    if (state.best) centerText(t('title.best', { c: state.best.jackals, t: TOTAL, s: state.best.score }), 460, 20, '#9fe8ff');
    if (Math.floor(state.time * 2) % 2 === 0) centerText(t(isTouch ? 'title.start.touch' : 'title.start.key'), 530, 30, '#ffffff');
    centerText(t('title.sound'), 580, 15, '#cfd8dc', 'normal');
  }

  function rankOf(c) {
    if (c >= 20) return [t('rank.5'), '#ffe14d'];
    if (c >= 17) return [t('rank.4'), '#ffd54f'];
    if (c >= 13) return [t('rank.3'), '#9fe8ff'];
    if (c >= 9) return [t('rank.2'), '#b9f6ca'];
    if (c >= 5) return [t('rank.1'), '#e0e0e0'];
    return [t('rank.0'), '#bdbdbd'];
  }

  function drawOver() {
    ctx.fillStyle = 'rgba(8,14,20,0.68)';
    ctx.fillRect(0, 0, W, H);
    // 下の方(y 約 300〜500)は HTML のシェア・もう一度ボタンなので上に詰める
    centerText(t('over.title'), 84, 32, '#ffffff', '900');
    centerText(t('over.jackals', { c: state.jackals, t: TOTAL }), 130, 40, state.jackals === TOTAL ? '#ffe14d' : '#9fe8ff', '900');
    if (state.jackals === TOTAL) centerText(t('over.perfect'), 160, 18, '#ffe14d');
    const [rank, col] = rankOf(state.jackals);
    centerText(t('over.rank', { r: rank }), 190, 22, col);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#e6e6e6';
    ctx.textAlign = 'center';
    ctx.fillText(t('over.line1', { s: state.score, k: state.tackles, t: TOTAL, m: state.bestStreak, nav: navLabel() }), W / 2, 220);
    if (state.newRecord) centerText(t('over.new'), 256, 20, '#ff8a65');
    else if (state.best) centerText(t('over.best', { c: state.best.jackals, s: state.best.score }), 256, 17, '#9fe8ff');
  }

  // ---------- シェア(結果画面) ----------
  // 対応端末では成績画像つきで共有シートを開き、だめなら X・LINE・コピーで共有する
  const SHARE_URL = /^https?:/.test(location.protocol) ? location.origin + location.pathname : '';
  const shareEl = document.getElementById('share');
  const $id = (id) => document.getElementById(id);
  const navLabel = () => t(state.navUsed ? 'nav.on' : 'nav.off');
  const withUrl = (text) => (SHARE_URL ? text + '\n' + SHARE_URL : text);

  function shareText() {
    const [rank] = rankOf(state.jackals);
    return t('share.text', {
      c: state.jackals, t: TOTAL, p: state.jackals === TOTAL ? t('share.perfect') : '', r: rank,
      s: state.score, nav: navLabel(), k: state.tackles, m: state.bestStreak,
    });
  }

  function prepareShare() {
    const text = shareText();
    $id('shareX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + (SHARE_URL ? '&url=' + encodeURIComponent(SHARE_URL) : '');
    $id('shareLine').href = 'https://line.me/R/share?text=' + encodeURIComponent(withUrl(text));
    $id('shareMsg').textContent = t(navigator.share ? 'share.msg.image' : 'share.msg.links');
    $id('retryBtn').textContent = t('over.retryBtn') + (isTouch ? '' : ' (SPACE)');
  }

  // 成績カード画像(1200x630)
  function makeShareImage() {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 630;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 630);
    bg.addColorStop(0, '#060a1f'); bg.addColorStop(0.6, '#1d2b5c'); bg.addColorStop(1, '#2d6a2c');
    g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`; g.fillRect(Math.random() * 1200, Math.random() * 300, 2, 2); }
    for (const [x, y, col] of [[150, 140, '#ff5252'], [1060, 120, '#ffd740'], [990, 320, '#40c4ff'], [210, 380, '#e040fb']]) {
      g.strokeStyle = col; g.lineWidth = 3;
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2;
        g.beginPath(); g.moveTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20); g.lineTo(x + Math.cos(a) * 80, y + Math.sin(a) * 80); g.stroke();
      }
    }
    g.fillStyle = '#3a8a36'; g.fillRect(0, 560, 1200, 70);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const font = (w, sz) => `${w} ${sz}px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif`;
    g.fillStyle = '#9fd8ff'; g.font = font(800, 36); g.fillText(t('card.head', { nav: navLabel() }), 600, 70);
    const gold = g.createLinearGradient(0, 120, 0, 280);
    gold.addColorStop(0, '#fff6c4'); gold.addColorStop(0.5, '#ffd000'); gold.addColorStop(1, '#ff8a00');
    g.fillStyle = gold; g.font = font(900, 120); g.fillText(t('card.jackals', { c: state.jackals, t: TOTAL }), 600, 200, 1100);
    const [rank] = rankOf(state.jackals);
    g.fillStyle = '#ff9d3c'; g.font = font(900, 52); g.fillText(t('card.rank', { r: rank }), 600, 330, 1100);
    g.fillStyle = '#ffffff'; g.font = font(800, 40);
    g.fillText(t('card.line1', { s: state.score, k: state.tackles, t: TOTAL, m: state.bestStreak }), 600, 430, 1100);
    g.fillStyle = '#eef6e8'; g.font = font(700, 28); g.fillText(t('card.tags'), 600, 595);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }

  async function shareResult() {
    const text = shareText();
    if (navigator.share) {
      try {
        const blob = await makeShareImage();
        const file = blob && new File([blob], 'jackal-result.png', { type: 'image/png' });
        const data = { title: t('share.title'), text: withUrl(text) };
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
        await navigator.share(data);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // 共有シートを閉じただけ
      }
    }
    copyResult();
  }

  async function copyResult() {
    const text = withUrl(shareText());
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { /* 非対応 */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (e) { /* 非対応 */ }
    }
    $id('shareMsg').textContent = t(ok ? 'share.copied' : 'share.copyFail');
  }

  $id('shareBtn').addEventListener('click', () => { audio(); shareResult(); });
  $id('shareCopy').addEventListener('click', copyResult);
  // シェア欄の操作でゲームが再スタートしないようにする
  for (const ev of ['pointerdown', 'pointerup', 'keydown']) shareEl.addEventListener(ev, (e) => e.stopPropagation());

  function updateShareVisibility() {
    const show = state.phase === 'over' && state.overT > 0.6;
    if (show !== !shareEl.hidden) {
      shareEl.hidden = !show;
      if (show) prepareShare();
    }
  }

  function draw() {
    ctx.setTransform(overlayScale, 0, 0, overlayScale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (state.phase !== 'title') {
      drawMinimap();
      drawHUD();
      drawControls();
      drawMessage();
      drawPopups();
      if (state.phase === 'ready' && !state.paused) {
        const p = state.play;
        centerText(t('ready.play', { n: state.index + 1 }), 200, 34, '#ffffff', '900');
        centerText(t(p.type === 'flee' ? 'ready.flee' : 'ready.attack'), 405, 22, '#ffcc80');
      }
      drawCall();
      if (state.paused && !isPortrait()) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
        centerText('PAUSE', H * 0.3, 56);
        if (!isTouch) centerText(t('pause.resume'), H * 0.3 + 40, 18);
      }
    }
    if (state.phase === 'title') drawTitle();
    if (state.phase === 'over') drawOver();
    updateShareVisibility();
    updateLangVisibility();
    updatePauseMenu();
    drawMute();
    drawNavButton();
  }

  function drawNavButton() {
    const { x, y, w, h } = NAVBTN;
    ctx.save();
    ctx.fillStyle = state.nav ? 'rgba(255,225,77,0.9)' : 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = state.nav ? '#222' : '#fff';
    ctx.font = `bold ${Math.round(h * 0.43)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(t('nav.btn', { s: state.nav ? 'ON' : 'OFF' }), x, y + h * 0.16);
    ctx.restore();
  }

  function drawMute() {
    ctx.save();
    // アイコンは半径 20 で描いて、ボタンの大きさに合わせて拡大する
    const k = MUTE.r / 20;
    ctx.translate(MUTE.x, MUTE.y);
    ctx.scale(k, k);
    const x = 0, y = 0, r = 20;
    if (!Sound.muted && !Sound.ready && state.phase !== 'title' && state.phase !== 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 84, y + 26, 168, 24);
      ctx.fillStyle = '#ffe14d';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('sound.tap'), x, y + 43);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 4); ctx.lineTo(x - 4, y - 4); ctx.lineTo(x + 2, y - 10);
    ctx.lineTo(x + 2, y + 10); ctx.lineTo(x - 4, y + 4); ctx.lineTo(x - 9, y + 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    if (Sound.muted) {
      ctx.beginPath(); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x + 12, y + 5); ctx.moveTo(x + 12, y - 5); ctx.lineTo(x + 5, y + 5); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x + 3, y, 6, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 3, y, 11, -0.9, 0.9); ctx.stroke();
    }
    ctx.restore();
  }

  // 裏に回ったら一時停止して音を止める
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.phase !== 'title' && state.phase !== 'over') state.paused = true;
      Sound.suspend();
    } else {
      Sound.resume();
    }
  });

  // 結果画面の「もう一度」「タイトルへ」ボタン
  $id('retryBtn').addEventListener('click', () => { audio(); if (state.phase === 'over') newGame(); });
  function goTitle() {
    pauseEl.hidden = true;
    Object.assign(state, { phase: 'title', paused: false, popups: [], msg: null });
  }
  $id('titleBtn').addEventListener('click', () => { audio(); if (state.phase === 'over') goTitle(); });

  // ポーズ画面のボタン(再開 / タイトルへ)
  const pauseEl = $id('pauseMenu');
  for (const ev of ['pointerdown', 'pointerup']) pauseEl.addEventListener(ev, (e) => e.stopPropagation());
  $id('pauseResume').addEventListener('click', () => { audio(); if (state.paused) togglePause(); });
  $id('pauseTitle').addEventListener('click', () => { audio(); if (state.paused) goTitle(); });
  function updatePauseMenu() {
    const show = state.paused && !isPortrait() && state.phase !== 'title' && state.phase !== 'over';
    if (show === pauseEl.hidden) pauseEl.hidden = !show;
  }

  // タイトル画面の言語切り替え
  const langEl = document.getElementById('langSel');
  document.querySelectorAll('[data-lang]').forEach((el) => el.addEventListener('click', () => I18N.setLang(el.dataset.lang)));
  for (const ev of ['pointerdown', 'pointerup']) langEl.addEventListener(ev, (e) => e.stopPropagation());
  I18N.onChange(() => { if (!shareEl.hidden) prepareShare(); });
  I18N.apply();
  function updateLangVisibility() {
    const show = state.phase === 'title';
    if (show === langEl.hidden) langEl.hidden = !show;
  }

  // タイトル画面の背景: 選手を並べておく
  function titleScene() {
    state.index = 0;
    startPlay();
    state.phase = 'title';
    state.view = { x: 0, y: state.actors.A.y, fx: 0, fy: 1, back: 9, h: 3.6, pitch: -0.02, cut: true };
  }

  // ---------- メインループ ----------
  let overlayScale = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // 2D の表示は描画解像度を抑えめに(スマホは 1.5 倍まで)
    const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
    W = Math.round(H * r.width / r.height);
    // 右側のボタン類は右端に合わせる。スマホは指で押しやすいよう大きくする
    if (isTouch) {
      Object.assign(RING, { x: 168, y: 478, r: 122, dead: 16 });
      const cx = W - 232;
      Object.assign(BTN.front, { x: cx, y: 318, r: 70 });
      Object.assign(BTN.left, { x: cx - 142, y: 456, r: 70 });
      Object.assign(BTN.right, { x: cx + 142, y: 456, r: 70 });
      Object.assign(BTN.dash, { x: cx, y: 578, r: 56 });
      Object.assign(MUTE, { y: 42, r: 27 });
      Object.assign(NAVBTN, { y: 42, w: 104, h: 42 });
      MUTE.x = W / 2 + 90;
      NAVBTN.x = MUTE.x + 92;
    } else {
      const cx = W - 175;
      BTN.front.x = cx; BTN.dash.x = cx; BTN.left.x = cx - 92; BTN.right.x = cx + 92;
      MUTE.x = W / 2 + 116;
      NAVBTN.x = MUTE.x + 64;
    }
    overlayScale = (r.height / H) * dpr;
    canvas.width = Math.round(W * overlayScale);
    canvas.height = Math.round(H * overlayScale);
    Scene3D.resize(r.width, r.height, W);
  }
  Scene3D.init(document.getElementById('view'));
  window.addEventListener('resize', resize);
  resize();
  titleScene();

  let last = performance.now(), acc = 0;
  function frame(now) {
    const frameDt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    acc += frameDt;
    if (api.hold) acc = 0; // テスト用: シミュレーションを止めて描画だけ行う
    while (acc >= DT) { update(DT); acc -= DT; }
    Scene3D.render(state, frameDt);
    Sound.update(state);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // テスト・デバッグ用フック
  const api = window.Jackal = {
    hold: false,
    state, newGame, update, DT, TOTAL,
    setBot(fn) { bot = fn; },
    consts: { TACKLE_T, TACKLE_V, TACKLE_HIT, GRAB_R, WALK, DASH },
  };
})();
