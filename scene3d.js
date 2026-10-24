'use strict';
// ジャッカル — 3D 描画(味方選手の背中越しの視点)
// ワールド座標 (x, y, z-up) は three.js の (x, z, -y) に対応させる。
// グラウンドは x = ±35(タッチライン)、y = ±50(トライライン)、y = ±60(デッドボールライン)。
window.Scene3D = (() => {
  const H = 640;
  let W = 960;
  const HX = 35, HY = 50, DEAD = 60;
  const BALL_R = 0.16; // 見やすさのため実物より少し大きい

  let renderer, scene, camera, ready = false;
  let ballMesh, ballShadow, screens = [], gateGuide, hitRing;
  const rigs = {};
  const cam = { fx: 0, fy: 1, x: 0, y: -8, pitch: 0, init: false };

  const V = (x, y, z = 0) => new THREE.Vector3(x, z, -y);

  // ---------- テクスチャ ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }

  // 地面の描画範囲
  const GX = 50, GY = 74, GK = 8;

  function groundTexture() {
    const w = GX * 2 * GK, h = GY * 2 * GK;
    return canvasTex(w, h, (g) => {
      const tx = (x) => (x + GX) * GK, ty = (y) => (GY - y) * GK, m = (v) => v * GK;
      g.fillStyle = '#2f7230';
      g.fillRect(0, 0, w, h);
      // 芝刈り跡(5m ごとの縞)
      for (let y = -DEAD; y < DEAD; y += 5) {
        g.fillStyle = (Math.round(y / 5) % 2) ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
        g.fillRect(tx(-HX - 3), ty(y + 5), m(HX * 2 + 6), m(5));
      }
      // インゴールは少し色を変える
      g.fillStyle = 'rgba(0,40,0,0.12)';
      g.fillRect(tx(-HX), ty(DEAD), m(HX * 2), m(DEAD - HY));
      g.fillRect(tx(-HX), ty(-HY), m(HX * 2), m(DEAD - HY));
      // 芝のざらつき
      for (let i = 0; i < 110000; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,230,0.05)';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      // ライン
      g.strokeStyle = '#f4f4f0';
      g.lineWidth = 3;
      const line = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(tx(x0), ty(y0)); g.lineTo(tx(x1), ty(y1)); g.stroke(); };
      const dashed = (x0, y0, x1, y1, on = 1.5, off = 1.5) => { g.setLineDash([m(on), m(off)]); line(x0, y0, x1, y1); g.setLineDash([]); };
      line(-HX, -DEAD, -HX, DEAD); line(HX, -DEAD, HX, DEAD);     // タッチライン
      line(-HX, DEAD, HX, DEAD); line(-HX, -DEAD, HX, -DEAD);     // デッドボールライン
      g.lineWidth = 4;
      line(-HX, HY, HX, HY); line(-HX, -HY, HX, -HY);             // トライライン
      g.lineWidth = 3;
      line(-HX, 0, HX, 0);                                        // ハーフウェイ
      line(-HX, 28, HX, 28); line(-HX, -28, HX, -28);             // 22m ライン
      dashed(-HX, 10, HX, 10, 2, 2); dashed(-HX, -10, HX, -10, 2, 2); // 10m ライン
      dashed(-HX, 45, HX, 45, 1, 3); dashed(-HX, -45, HX, -45, 1, 3); // 5m ライン
      for (const x of [-30, -20, 20, 30]) dashed(x, -HY + 1, x, HY - 1, 1, 4); // 5m・15m ライン
      // センターマーク
      line(-0.5, 0, 0.5, 0); line(0, -0.5, 0, 0.5);
    });
  }

  function crowdTexture() {
    return canvasTex(512, 512, (g, w, h) => {
      const rows = 16, rh = h / rows;
      const shirts = ['#d32f2f', '#ffffff', '#c62828', '#1a237e', '#fdd835', '#ef5350', '#283593', '#212121', '#ffcdd2', '#90caf9'];
      for (let r = 0; r < rows; r++) {
        g.fillStyle = r % 2 ? '#24324a' : '#2b3b57';
        g.fillRect(0, r * rh, w, rh);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, r * rh + rh - 4, w, 4);
        for (let x = 2; x < w; x += 9) {
          if (Math.random() < 0.12) continue;
          const sx = x + (Math.random() - 0.5) * 3;
          g.fillStyle = shirts[(Math.random() * shirts.length) | 0];
          g.fillRect(sx, r * rh + rh * 0.45, 7, rh * 0.45);
          g.fillStyle = Math.random() < 0.8 ? '#e8bf9a' : '#6d4c41';
          g.beginPath(); g.arc(sx + 3.5, r * rh + rh * 0.32, 3, 0, Math.PI * 2); g.fill();
        }
      }
    }, true);
  }

  function skyTexture() {
    return canvasTex(2048, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#060a1f');
      gr.addColorStop(0.35, '#16224f');
      gr.addColorStop(0.48, '#3a3a78');
      gr.addColorStop(0.5, '#7a5a7c');
      gr.addColorStop(0.52, '#1a1a2a');
      gr.addColorStop(1, '#0a0a12');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
  }

  function glowTexture() {
    return canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,240,1)');
      gr.addColorStop(0.2, 'rgba(255,250,220,0.8)');
      gr.addColorStop(0.5, 'rgba(255,240,200,0.18)');
      gr.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
  }

  // ---------- スタジアム ----------
  // 角の丸い長方形の輪(内側の輪郭)。各点に外向きの法線を持たせる
  function roundRect(hx, hy, r) {
    const pts = [];
    const corners = [[hx - r, hy - r, 0], [-(hx - r), hy - r, Math.PI / 2], [-(hx - r), -(hy - r), Math.PI], [hx - r, -(hy - r), Math.PI * 1.5]];
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= 10; i++) {
        const a = a0 + (Math.PI / 2) * i / 10;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) });
      }
    }
    pts.push({ ...pts[0] });
    let acc = 0;
    pts.forEach((p, i) => { if (i) acc += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); p.s = acc; });
    return pts;
  }

  function strip(ring, fn, uvScale, mat) {
    const pos = [], uv = [], idx = [];
    const cols = fn.steps + 1;
    ring.forEach((p, i) => {
      for (let j = 0; j <= fn.steps; j++) {
        const u = j / fn.steps;
        const [d, hgt] = fn.at(u);
        pos.push(p.x + p.nx * d, hgt, -(p.y + p.ny * d));
        uv.push(p.s / uvScale, u * (fn.v || 1));
      }
      if (i) {
        for (let j = 0; j < fn.steps; j++) {
          const a = (i - 1) * cols + j, b = i * cols + j;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return mesh;
  }

  function boardTexture() {
    return canvasTex(512, 64, (g, w, h) => {
      const words = ['JACKAL', 'RUGBY', 'NO SIDE', 'TRY!', 'ONE TEAM'];
      const cols = ['#c8102e', '#0d1b4f', '#ffd400', '#0a7d3b', '#202020'];
      for (let i = 0; i < 4; i++) {
        g.fillStyle = cols[i % cols.length];
        g.fillRect(i * 128, 0, 128, h);
        g.fillStyle = i % 4 === 2 ? '#111' : '#fff';
        g.font = 'bold 30px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(words[i % words.length], i * 128 + 64, h / 2 + 2, 120);
      }
    }, true);
  }

  function buildStadium() {
    // 広告看板(グラウンドの周り)
    const boards = roundRect(HX + 4, DEAD + 4, 3);
    strip(boards, { steps: 1, at: (u) => [0, u * 0.9] }, 16, new THREE.MeshBasicMaterial({ map: boardTexture(), side: THREE.DoubleSide }));

    // 観客席(すり鉢状)
    const ring = roundRect(HX + 8, DEAD + 8, 12);
    strip(ring, { steps: 10, v: 3, at: (u) => [1 + 30 * u, 1.5 + 22 * u] }, 22,
      new THREE.MeshLambertMaterial({ map: crowdTexture(), side: THREE.DoubleSide, emissive: 0x222838 }));
    // 観客席の前の壁
    strip(ring, { steps: 1, at: (u) => [0.5, u * 1.8] }, 4, new THREE.MeshLambertMaterial({ color: 0x1b2433, side: THREE.DoubleSide }));
    // 最上段の壁と屋根
    strip(ring, { steps: 1, at: (u) => [31, 23.5 + u * 6] }, 10, new THREE.MeshLambertMaterial({ color: 0x3a4660, side: THREE.DoubleSide }));
    strip(ring, { steps: 1, at: (u) => [31 - u * 18, 29.5 + u * 2] }, 10, new THREE.MeshLambertMaterial({ color: 0x252c3c, side: THREE.DoubleSide }));

    // 屋根の照明(ずらりと並ぶ光)
    const glow = glowTex;
    for (let i = 0; i < ring.length - 1; i += 2) {
      const p = ring[i];
      const pos = V(p.x + p.nx * 13.5, p.y + p.ny * 13.5, 31.2);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 1.2), new THREE.MeshBasicMaterial({ color: 0xfffbe6 }));
      lamp.position.copy(pos);
      scene.add(lamp);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.position.copy(pos);
      sp.scale.set(16, 16, 1);
      scene.add(sp);
    }

    // ゴールポスト(H 型)
    const postMat = new THREE.MeshLambertMaterial({ color: 0xf6f6f6 });
    const padMat = new THREE.MeshLambertMaterial({ color: 0xc8102e });
    for (const sy of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 16, 10), postMat);
        post.position.copy(V(sx * 2.8, sy * HY, 8));
        scene.add(post);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.0, 0.5), padMat);
        pad.position.copy(V(sx * 2.8, sy * HY, 1.0));
        scene.add(pad);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.6, 8), postMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.copy(V(0, sy * HY, 3));
      scene.add(bar);
    }
    // コーナーフラッグ
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      fp.position.copy(V(sx * HX, sy * HY, 0.7));
      scene.add(fp);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd400, side: THREE.DoubleSide }));
      flag.position.copy(V(sx * HX + 0.2, sy * HY, 1.25));
      scene.add(flag);
    }

    // 両ゴール裏スタンド上の大型ビジョン
    const c = document.createElement('canvas');
    c.width = 512; c.height = 192;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    for (const sy of [-1, 1]) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 12), new THREE.MeshBasicMaterial({ map: tex }));
      mesh.position.copy(V(0, sy * (DEAD + 40), 34));
      mesh.lookAt(V(0, 0, 20));
      scene.add(mesh);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 1), new THREE.MeshLambertMaterial({ color: 0x20242c }));
      frame.position.copy(V(0, sy * (DEAD + 40.8), 34));
      frame.lookAt(V(0, 0, 20));
      scene.add(frame);
    }
    screens = { canvas: c, tex, key: '' };
  }

  function updateScreens(state) {
    const key = `${state.phase}|${state.index}|${state.tackles}|${state.jackals}|${I18N.lang}`;
    if (key === screens.key) return;
    screens.key = key;
    const g = screens.canvas.getContext('2d');
    g.fillStyle = '#05070c'; g.fillRect(0, 0, 512, 192);
    g.fillStyle = '#ffd54f';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.fillText('JACKAL!', 256, 52);
    g.font = 'bold 34px sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(I18N.t('hud.play', { n: Math.min(state.index + 1, state.total), t: state.total }), 256, 108, 480);
    g.fillStyle = '#7fe0ff';
    g.font = 'bold 28px sans-serif';
    g.fillText(I18N.t('hud.tackles', { n: state.tackles }) + '   ' + I18N.t('hud.jackals', { n: state.jackals }), 256, 160, 480);
    screens.tex.needsUpdate = true;
  }

  // ---------- 人物 ----------
  // 横縞(フープ)のジャージ。背中には背番号
  function jerseyTexture(c1, c2, num, numColor) {
    return canvasTex(128, 160, (g, w, h) => {
      const band = h / 7;
      for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(0, i * band, w, band + 1); }
      if (num) {
        g.fillStyle = 'rgba(255,255,255,0.0)';
        g.font = 'bold 92px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 8;
        g.strokeStyle = numColor === '#ffffff' ? '#111' : '#fff';
        g.strokeText(num, w / 2, h / 2 + 6);
        g.fillStyle = numColor;
        g.fillText(num, w / 2, h / 2 + 6);
      }
    });
  }

  const TEAM = {
    red: { c1: '#c8102e', c2: '#f4f4f4', shorts: 0xf4f4f4, socks: 0xc8102e, num: '#ffffff' },
    navy: { c1: '#0d1b4f', c2: '#0d1b4f', shorts: 0x0d1b4f, socks: 0x4fc3f7, num: '#ffffff' },
    ref: { c1: '#9be22d', c2: '#9be22d', shorts: 0x111111, socks: 0x111111, num: null },
  };

  // 前方 = ローカル +Z。体は 足元(body) → 腰から上(upper) の2段で曲げられる
  function makePlayer(team, num, headgear) {
    const tm = TEAM[team];
    const plain = new THREE.MeshLambertMaterial({ color: new THREE.Color(tm.c1) });
    const shorts = new THREE.MeshLambertMaterial({ color: tm.shorts });
    const socks = new THREE.MeshLambertMaterial({ color: tm.socks });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a77f });
    const boot = new THREE.MeshLambertMaterial({ color: 0x151515 });
    const hair = new THREE.MeshLambertMaterial({ color: headgear ? (team === 'red' ? 0x1b1b1b : 0x0b1230) : 0x231a12 });
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const body = new THREE.Group(); // 体全体(タックルで倒す)
    body.rotation.order = 'YXZ';
    root.add(body);

    // 脚(付け根が回転軸)
    const mkLeg = (x) => {
      const leg = new THREE.Group();
      leg.position.set(x, 0.9, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.22), shorts); thigh.position.y = -0.16;
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.34, 0.17), skin); shin.position.y = -0.48;
      const sock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.18), socks); sock.position.y = -0.7;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.28), boot); shoe.position.set(0, -0.85, 0.05);
      leg.add(thigh, shin, sock, shoe);
      body.add(leg);
      return leg;
    };
    const legL = mkLeg(0.13), legR = mkLeg(-0.13);

    const upper = new THREE.Group();
    upper.position.set(0, 0.9, 0);
    body.add(upper);
    const jersey = new THREE.MeshLambertMaterial({ map: jerseyTexture(tm.c1, tm.c2, null) });
    const back = tm.num && num ? new THREE.MeshLambertMaterial({ map: jerseyTexture(tm.c1, tm.c2, num, tm.num) }) : jersey;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), [jersey, jersey, plain, plain, jersey, back]);
    torso.position.set(0, 0.36, 0);
    upper.add(torso);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), skin);
    neck.position.set(0, 0.73, 0);
    upper.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), skin);
    head.position.set(0, 0.88, 0.01);
    upper.add(head);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(headgear ? 0.15 : 0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * (headgear ? 0.62 : 0.5)), hair);
    hairM.position.set(0, 0.9, -0.005);
    upper.add(hairM);

    const mkArm = (x) => {
      const arm = new THREE.Group();
      arm.position.set(x, 0.64, 0);
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.24, 0.16), plain); sleeve.position.y = -0.1;
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.13), skin); fore.position.y = -0.4;
      arm.add(sleeve, fore);
      upper.add(arm);
      return arm;
    };
    const armL = mkArm(0.35), armR = mkArm(-0.35);
    // ボールを抱える位置(右脇)
    const carry = new THREE.Object3D();
    carry.position.set(-0.2, 0.3, 0.2);
    upper.add(carry);
    // 両手の間(ボールを拾う・掲げる位置)
    const hands = new THREE.Object3D();
    hands.position.set(0, 0.0, 0.42);
    upper.add(hands);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
    scene.add(root);
    return { root, body, upper, legL, legR, armL, armR, carry, hands, shadow };
  }

  // 登場人物(キーは game.js の state.actors と同じ)
  const ROSTER = {
    A: ['red', '6', true], B: ['red', '7', true],
    carrier: ['navy', '12', false], support: ['navy', '8', true], ref: ['ref', null, false],
    m1: ['red', '10', false], m2: ['red', '13', false], m3: ['red', '4', true],
    o1: ['navy', '9', false], o2: ['navy', '13', false], o3: ['navy', '5', true],
  };
  function buildPlayers() {
    for (const [k, [team, num, hg]] of Object.entries(ROSTER)) {
      rigs[k] = makePlayer(team, num, hg);
      rigs[k].root.scale.setScalar(k === 'ref' ? 1.0 : 1.08);
    }
  }

  function buildBall() {
    const tex = canvasTex(128, 64, (g, w, h) => {
      g.fillStyle = '#f5f1e6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c8102e'; g.fillRect(w * 0.2, 0, w * 0.06, h); g.fillRect(w * 0.74, 0, w * 0.06, h);
      g.fillStyle = '#0d1b4f'; g.fillRect(w * 0.44, h * 0.3, w * 0.12, h * 0.4);
    });
    const geo = new THREE.SphereGeometry(BALL_R, 18, 12);
    geo.rotateX(Math.PI / 2); // 長軸を z に
    geo.scale(1, 1, 1.6);
    ballMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, emissive: 0x333333 }));
    scene.add(ballMesh);
    ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
    ballShadow.rotation.x = -Math.PI / 2;
    scene.add(ballShadow);
  }

  // 「今だ!」の目印(タックルが届く相手の足元に出る黄色い輪)
  function buildGuides() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false });
    hitRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), mat);
    hitRing.rotation.x = -Math.PI / 2;
    hitRing.renderOrder = 2;
    scene.add(hitRing);
    // こぼれ球の落下点の輪
    gateGuide = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), mat.clone());
    gateGuide.rotation.x = -Math.PI / 2;
    gateGuide.renderOrder = 2;
    scene.add(gateGuide);
  }

  // ---------- 花火(視線の先のスタンド上空) ----------
  // 途中で新しいジオメトリやシェーダーを作るとカクつくので、最初にまとめて用意して使い回す
  const ROCKET_T = 0.9;
  const FW_COLORS = [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xe040fb, 0xffffff, 0xff9100];
  const FW_MAX = 10, FW_N = 260;
  let clock = 0, glowTex = null;
  const pendingFw = [], rocketPool = [], burstPool = [];

  function buildFireworks() {
    for (let i = 0; i < FW_MAX + 2; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.scale.set(3, 3, 1);
      sp.visible = false;
      scene.add(sp);
      rocketPool.push({ sp, active: false, x: 0, y: 0, z0: 0, z1: 0, t: 0, big: false });
    }
    for (let i = 0; i < FW_MAX; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FW_N * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FW_N * 3), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4, map: glowTex, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      pts.frustumCulled = false;
      pts.visible = false;
      scene.add(pts);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      flash.scale.set(55, 55, 1);
      flash.visible = false;
      scene.add(flash);
      burstPool.push({ pts, flash, vel: new Float32Array(FW_N * 3), n: 0, t: 0, life: 2.4, active: false });
    }
  }

  function firework(delay, big) { pendingFw.push({ at: clock + delay, big }); }

  function spawnRocket(big) {
    const r = rocketPool.find((q) => !q.active);
    if (!r) return;
    // カメラの向いている方向のスタンドの上に打ち上げる
    const side = (Math.random() - 0.5) * 110;
    const dist = 90 + Math.random() * 30;
    const x = cam.x + cam.fx * dist + cam.fy * side, y = cam.y + cam.fy * dist - cam.fx * side;
    Object.assign(r, { active: true, x, y, z0: 32, z1: (big ? 72 : 60) + Math.random() * 22, t: 0, big });
    r.sp.visible = true;
  }

  const tmpColor1 = new THREE.Color(), tmpColor2 = new THREE.Color();
  function spawnBurst(x, y, z, big) {
    // 空きがなければ一番古いものを再利用
    let bu = burstPool.find((q) => !q.active);
    if (!bu) bu = burstPool.reduce((a, q) => (q.t > a.t ? q : a));
    const n = big ? FW_N : 180;
    const pos = bu.pts.geometry.attributes.position.array, col = bu.pts.geometry.attributes.color.array, vel = bu.vel;
    tmpColor1.setHex(FW_COLORS[(Math.random() * FW_COLORS.length) | 0]);
    tmpColor2.setHex(FW_COLORS[(Math.random() * FW_COLORS.length) | 0]);
    const speed = big ? 36 : 28;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sv = speed * (0.85 + Math.random() * 0.3);
      vel[i * 3] = r * Math.cos(a) * sv; vel[i * 3 + 1] = u * sv; vel[i * 3 + 2] = r * Math.sin(a) * sv;
      pos[i * 3] = x; pos[i * 3 + 1] = z; pos[i * 3 + 2] = -y;
      const c = i % 3 === 0 ? tmpColor2 : tmpColor1;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    bu.pts.geometry.setDrawRange(0, n);
    bu.pts.geometry.attributes.position.needsUpdate = true;
    bu.pts.geometry.attributes.color.needsUpdate = true;
    bu.pts.material.size = big ? 4.5 : 3.6;
    bu.pts.material.opacity = 1;
    bu.pts.visible = true;
    bu.flash.material.color.copy(tmpColor1);
    bu.flash.material.opacity = 1;
    bu.flash.position.set(x, z, -y);
    bu.flash.visible = true;
    Object.assign(bu, { n, t: 0, active: true });
  }

  function updateFireworks(dt) {
    clock += dt;
    for (let i = pendingFw.length - 1; i >= 0; i--) {
      if (pendingFw[i].at <= clock) { spawnRocket(pendingFw[i].big); pendingFw.splice(i, 1); }
    }
    for (const r of rocketPool) {
      if (!r.active) continue;
      r.t += dt;
      const u = Math.min(1, r.t / ROCKET_T);
      const z = r.z0 + (r.z1 - r.z0) * (1 - (1 - u) * (1 - u));
      r.sp.position.set(r.x + Math.sin(r.t * 20) * 0.3, z, -r.y);
      if (u >= 1) {
        r.active = false; r.sp.visible = false;
        spawnBurst(r.x, r.y, z, r.big);
      }
    }
    const drag = Math.exp(-1.6 * dt), g = 5 * dt;
    for (const bu of burstPool) {
      if (!bu.active) continue;
      bu.t += dt;
      const arr = bu.pts.geometry.attributes.position.array, vel = bu.vel;
      for (let k = 0; k < bu.n * 3; k += 3) {
        vel[k] *= drag; vel[k + 1] = vel[k + 1] * drag - g; vel[k + 2] *= drag;
        arr[k] += vel[k] * dt; arr[k + 1] += vel[k + 1] * dt; arr[k + 2] += vel[k + 2] * dt;
      }
      bu.pts.geometry.attributes.position.needsUpdate = true;
      const fade = 1 - bu.t / bu.life;
      bu.pts.material.opacity = Math.max(0, fade < 0.4 ? fade / 0.4 * (0.6 + 0.4 * Math.random()) : 1);
      bu.flash.material.opacity = Math.max(0, 1 - bu.t * 4);
      if (bu.t >= bu.life) { bu.active = false; bu.pts.visible = false; bu.flash.visible = false; }
    }
  }

  // ---------- 初期化 ----------
  function init(canvas) {
    // スマホは描画解像度を抑える(高精細画面ではアンチエイリアスも省く)
    const dpr = window.devicePixelRatio || 1;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    quality.max = Math.min(dpr, touch ? 1.5 : 2);
    quality.pr = quality.max;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    renderer.setPixelRatio(quality.pr);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0d1c);
    scene.fog = new THREE.Fog(0x141a33, 140, 420);
    camera = new THREE.PerspectiveCamera(62, W / H, 0.1, 1200);
    glowTex = glowTexture();

    const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
    scene.add(sky);
    const starPos = [];
    for (let i = 0; i < 500; i++) {
      const az = Math.random() * Math.PI * 2, el = 0.12 + Math.random() * 1.4;
      starPos.push(Math.cos(el) * Math.cos(az) * 700, Math.sin(el) * 700, Math.cos(el) * Math.sin(az) * 700);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a3a20, 1.6));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
    key.position.set(30, 80, 40);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd0dcff, 0.9);
    fill.position.set(-40, 60, -80);
    scene.add(fill);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GX * 2, GY * 2), new THREE.MeshLambertMaterial({ map: groundTexture() }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0x1a1f2a }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -0.05;
    scene.add(under);

    buildStadium();
    buildPlayers();
    buildBall();
    buildGuides();
    buildFireworks();
    prewarm();
    ready = true;
  }

  // 最初のプレー中に初めて表示する物(ボール・目印・花火)のシェーダーを先に準備しておく
  function prewarm() {
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    renderer.compile(scene, camera);
    for (const o of hidden) o.visible = false;
  }

  // 重い端末では描画解像度を自動で下げる
  const quality = { max: 1, pr: 1, frames: 0, time: 0, warm: 0, w: 0, h: 0 };
  function adaptQuality(dt) {
    quality.warm += dt;
    if (quality.warm < 3 || quality.pr <= 1) return;
    quality.frames++; quality.time += dt;
    if (quality.time < 2) return;
    const avg = quality.time / quality.frames;
    quality.frames = 0; quality.time = 0;
    if (avg > 1 / 48) {
      quality.pr = Math.max(1, quality.pr - 0.25);
      renderer.setPixelRatio(quality.pr);
      renderer.setSize(quality.w, quality.h, false);
    }
  }

  function resize(cssW, cssH, logicalW) {
    if (!ready) return;
    quality.w = cssW; quality.h = cssH;
    W = logicalW;
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    renderer.setSize(cssW, cssH, false);
  }

  // ---------- 毎フレーム ----------
  const ease = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

  function posePlayer(r, p, time) {
    r.root.visible = r.shadow.visible = p.visible !== false;
    if (!r.root.visible) return;
    r.root.position.set(p.x, 0, -p.y);
    r.root.rotation.y = Math.PI - p.face;
    const speed = Math.hypot(p.vx || 0, p.vy || 0);
    const b = r.body, u = r.upper;
    b.rotation.set(0, 0, 0); b.position.set(0, 0, 0);
    u.rotation.set(0, 0, 0);
    r.armL.rotation.set(0, 0, 0); r.armR.rotation.set(0, 0, 0);
    r.legL.rotation.set(0, 0, 0); r.legR.rotation.set(0, 0, 0);
    let shadowScale = 1;

    switch (p.mode) {
      case 'tackle': case 'dive': { // 飛び込む(タックル・ジャッカル・トライ)
        const k = ease(p.t / 0.18);
        b.rotation.x = 1.35 * k;
        b.position.set(0, 0.35 * Math.sin(Math.min(1, p.t / 0.35) * Math.PI) * k, 0);
        r.armL.rotation.x = -2.8 * k; r.armR.rotation.x = -2.8 * k;
        r.armL.rotation.z = 0.25; r.armR.rotation.z = -0.25;
        r.legL.rotation.x = 0.3; r.legR.rotation.x = -0.4;
        shadowScale = 1.6;
        break;
      }
      case 'down': case 'tackled': { // 倒れている
        const k = p.mode === 'tackled' ? ease(p.t / 0.35) : 1;
        b.rotation.x = 1.5 * k;
        b.position.y = -0.05 * k;
        r.armL.rotation.x = -2.7 * k; r.armR.rotation.x = p.mode === 'tackled' ? -2.9 * k : -2.4;
        r.legL.rotation.x = 0.15; r.legR.rotation.x = -0.1;
        shadowScale = 1.8;
        break;
      }
      case 'jackal': { // ボールの上にかぶさる構え
        const k = ease(p.t / 0.25);
        b.position.y = -0.12 * k;
        r.legL.rotation.z = -0.28 * k; r.legR.rotation.z = 0.28 * k;
        r.legL.rotation.x = -0.25 * k; r.legR.rotation.x = -0.25 * k;
        u.rotation.x = 1.05 * k;
        r.armL.rotation.x = -0.9 * k; r.armR.rotation.x = -0.9 * k;
        r.armL.rotation.z = 0.15; r.armR.rotation.z = -0.15;
        break;
      }
      case 'blown': { // はがされて尻もち
        const k = ease(p.t / 0.3);
        b.rotation.x = -1.3 * k;
        r.armL.rotation.x = -1.5 * k; r.armR.rotation.x = -1.2 * k;
        r.legL.rotation.x = -1.2 * k; r.legR.rotation.x = -0.9 * k;
        shadowScale = 1.6;
        break;
      }
      case 'celebrate': { // ボールを高く掲げる
        r.armL.rotation.x = -3.0; r.armR.rotation.x = -3.0;
        r.armL.rotation.z = -0.15; r.armR.rotation.z = 0.15;
        b.position.y = Math.abs(Math.sin(time * 7)) * 0.12;
        break;
      }
      case 'signal': { // レフリーがペナルティの方向へ腕を伸ばす
        r.armR.rotation.x = -2.0; r.armR.rotation.z = 0.5;
        break;
      }
      default: {
        const swing = Math.min(1, speed / 6) * 0.95;
        const ph = time * (6 + speed * 1.25) + (p.phase || 0);
        r.legL.rotation.x = Math.sin(ph) * swing;
        r.legR.rotation.x = -Math.sin(ph) * swing;
        r.armL.rotation.x = -Math.sin(ph) * swing * 0.8;
        r.armR.rotation.x = Math.sin(ph) * swing * 0.8;
        b.rotation.x = Math.min(0.32, speed * 0.035);
        b.position.y = Math.abs(Math.sin(ph)) * 0.05 * swing;
        // 低く構える(ディフェンス)
        if (p.crouch) { u.rotation.x = 0.35; b.position.y -= 0.08; r.armL.rotation.x -= 0.5; r.armR.rotation.x -= 0.5; }
        // ステップ: 体を倒して切り返す
        if (p.lean) b.rotation.z = -p.lean * 0.35;
        // ボールを持っている: 右腕で抱える
        if (p.hasBall) { r.armR.rotation.x = -0.9; r.armR.rotation.z = -0.6; }
      }
    }
    r.shadow.position.set(p.x, 0.03, -p.y);
    r.shadow.scale.setScalar(shadowScale);
  }

  function placeBall(state) {
    const ball = state.ball;
    ballMesh.visible = !!ball;
    ballShadow.visible = !!ball;
    if (!ball) return;
    const holder = ball.holder && rigs[ball.holder];
    if (ball.overhead && holder) {
      // 奪ったボールを頭上に掲げる
      const p = state.actors[ball.holder];
      ballMesh.position.set(p.x, 2.45 + Math.abs(Math.sin(state.time * 7)) * 0.12, -p.y);
      ballMesh.rotation.set(0, Math.PI - p.face + Math.PI / 2, 0);
    } else if (holder && holder.root.visible) {
      holder.root.updateMatrixWorld(true);
      const a = ball.atHands ? holder.hands : holder.carry;
      a.getWorldPosition(ballMesh.position);
      const p = state.actors[ball.holder];
      ballMesh.rotation.set(0, Math.PI - p.face, 0);
      if (ball.atHands) ballMesh.rotation.x = 0;
      else ballMesh.rotation.x = -0.4;
    } else {
      ballMesh.position.set(ball.x, ball.z + BALL_R, -ball.y);
      // 楕円球は転がりながら向きが変わる
      ballMesh.rotation.set(ball.spinX || 0, ball.yaw || 0, 0);
    }
    ballShadow.position.set(ballMesh.position.x, 0.04, ballMesh.position.z);
    const h = Math.max(0, ballMesh.position.y);
    ballShadow.scale.setScalar(Math.max(0.5, 1 - h * 0.15));
  }

  function updateGuides(state) {
    const g = state.guide;
    hitRing.visible = !!(g && g.hit);
    if (hitRing.visible) {
      hitRing.position.set(g.hit.x, 0.07, -g.hit.y);
      hitRing.scale.setScalar(1.1 + 0.15 * Math.sin(state.time * 14));
      hitRing.material.opacity = 0.6 + 0.35 * Math.sin(state.time * 14);
    }
    gateGuide.visible = !!(g && g.loose);
    if (gateGuide.visible) {
      gateGuide.position.set(g.loose.x, 0.08, -g.loose.y);
      gateGuide.scale.setScalar(0.7 + 0.1 * Math.sin(state.time * 10));
      gateGuide.material.color.setHex(0x7dffb0);
      gateGuide.material.opacity = 0.75;
    }
  }

  function render(state, dt) {
    if (!ready) return;
    updateScreens(state);
    for (const [k, r] of Object.entries(rigs)) {
      const p = state.actors[k];
      if (p) posePlayer(r, p, state.time); else { r.root.visible = r.shadow.visible = false; }
    }
    placeBall(state);
    updateGuides(state);
    updateFireworks(dt);
    adaptQuality(dt);

    // カメラ: 操作中の選手の背中越し。state.view が向きと注視点を決める
    const v = state.view;
    const snap = !cam.init || v.cut;
    cam.init = true;
    const k = snap ? 1 : 1 - Math.exp(-4.5 * dt);
    cam.fx += (v.fx - cam.fx) * k; cam.fy += (v.fy - cam.fy) * k;
    const fl = Math.hypot(cam.fx, cam.fy) || 1; cam.fx /= fl; cam.fy /= fl;
    const back = v.back || 6.5, camH = v.h || 2.9;
    const tx = v.x - cam.fx * back, ty = v.y - cam.fy * back;
    const kp = snap ? 1 : 1 - Math.exp(-8 * dt);
    cam.x += (tx - cam.x) * kp; cam.y += (ty - cam.y) * kp;
    camera.position.set(cam.x, camH, -cam.y);
    const look = 30, pitch = v.pitch != null ? v.pitch : -0.04;
    cam.pitch = snap ? pitch : cam.pitch + (pitch - cam.pitch) * (1 - Math.exp(-2.5 * dt));
    camera.lookAt(cam.x + cam.fx * look, camH + Math.tan(cam.pitch) * look, -(cam.y + cam.fy * look));
    renderer.render(scene, camera);
  }

  const tmp = new THREE.Vector3();
  function project(x, y, z) {
    tmp.set(x, z, -y).project(camera);
    return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H, behind: tmp.z > 1 };
  }

  return { init, render, resize, project, firework, ROCKET_T, get info() { return renderer.info; }, get pixelRatio() { return quality.pr; } };
})();
