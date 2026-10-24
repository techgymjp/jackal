'use strict';
// 表示言語(日本語 / 英語)。端末の言語が日本語なら日本語、それ以外は英語。タイトル画面で切り替えも可能
// 構成は techgymjp/center-fly の i18n.js と同じ
window.I18N = (() => {
  const dict = {
    ja: {
      'doc.title': 'ジャッカル',
      'rotate.msg': 'スマホを横向きにしてください',
      'rotate.sub': 'ジャッカルは横画面で遊ぶゲームです',

      'btn.front': '前', 'btn.left': '左', 'btn.right': '右', 'btn.dash': 'ダッシュ',
      'btn.tackle': 'タックル', 'btn.jackal': 'ジャッカル',
      'ring.fwd': '前進', 'ring.back': '後退', 'ring.auto': 'Bは自動で並走',
      'nav.btn': 'ナビ {s}',

      'title.name': 'ジャッカル',
      'title.sub': 'タックルで倒して、こぼれ球を奪い取れ!',
      'help.touch.1': '選手A : 左下の方角リングで移動、ダッシュボタンで加速(スタミナ消費)',
      'help.touch.2': '逃げる相手 → 追いかけて「前タックル」',
      'help.touch.3': '向かってくる相手 → 左右にステップしてくる。かわした側の「左/右タックル」',
      'help.touch.4': 'タックル成立で選手B(相手に並走中)に交代。移動は自動',
      'help.touch.5': 'ボールがこぼれた方向の「前/左/右ジャッカル」で奪い取れ!',
      'help.touch.6': 'ナビ ON: タックルが届くと相手の足元に黄色い輪(上の「ナビ」で切替)',
      'help.key.1': '選手A : 矢印キー・WASD / 方角リングで移動、Shift・Space でダッシュ',
      'help.key.2': '逃げる相手 → 追いかけて「前タックル」(I)',
      'help.key.3': '向かってくる相手 → ステップした側の「左タックル」(J)/「右タックル」(L)',
      'help.key.4': 'タックル成立で選手B(相手に並走中)に交代。移動は自動',
      'help.key.5': 'ボールがこぼれた方向の ジャッカル(I 前 / J 左 / L 右)で奪い取れ!',
      'help.key.6': 'N : ナビのオン/オフ   M : 音のオン/オフ   P : 一時停止',
      'title.best': 'ベスト: ジャッカル {c} / {t}  (SCORE {s})',
      'title.start.touch': 'タップでキックオフ',
      'title.start.key': 'SPACE / タップでキックオフ',
      'title.sound': '音が鳴ります(M キー / 上のボタンで消音)。iPhone はマナーモードを解除してください',

      'hud.play': '第 {n} プレー / {t}',
      'hud.tackles': 'タックル {n}', 'hud.jackals': 'ジャッカル {n}', 'hud.streak': '連続 {n}',
      'hud.dash': 'スタミナ',
      'hud.playerA': '選手A 操作中', 'hud.playerB': '選手B 操作中',
      'ready.play': '第 {n} プレー',
      'ready.flee': '相手が逃げる!追いかけて前タックル!',
      'ready.attack': '相手が向かってくる!左右のステップを読め!',
      'msg.flee': '追いかけて「前タックル」!',
      'msg.attack': 'かわした側へ「左/右タックル」!',
      'msg.switch': '選手B が走り込む…',
      'msg.switchBig': '選手B ジャッカル!',
      'msg.wait': 'ボールがこぼれるぞ…!',
      'msg.loose': 'こぼれた!その方向のジャッカル!',
      'pause.resume': 'P / Esc で再開',
      'sound.tap': '音が出ないときはタップ',

      'tackle.ok': 'タックル成立!', 'tackle.chase': '追いついてタックル!',
      'jackal.ok': 'ジャッカル成功!!', 'jackal.sub': 'ターンオーバー!',
      'jackal.fast': '神反応!ターンオーバー!', 'jackal.hop': 'イレギュラーバウンドも奪った!',
      'miss.try': 'トライを許した…', 'miss.break': '抜かれた…', 'miss.away': '逃げ切られた…',
      'miss.slow': '反応が遅れた…相手ボール', 'miss.wrong': '逆を取られた…相手ボール', 'miss.early': '飛び込むのが早すぎた…',
      'streak': '{n} 連続ジャッカル!',

      'rank.0': '草ラグビー', 'rank.1': '控えフランカー', 'rank.2': 'レギュラー',
      'rank.3': 'ジャッカル職人', 'rank.4': '代表のフランカー', 'rank.5': '伝説のジャッカラー',

      'over.title': 'ノーサイド',
      'over.jackals': 'ジャッカル {c} / {t} 成功',
      'over.perfect': '★ パーフェクト!! 全プレーでボールを奪った ★',
      'over.rank': '称号: {r}',
      'over.line1': 'SCORE {s}   タックル {k}/{t}   最大連続 {m}   {nav}',
      'over.new': 'NEW RECORD!',
      'over.best': 'ベスト: ジャッカル {c} (SCORE {s})',
      'nav.on': 'ナビあり', 'nav.off': 'ナビなし',
      'over.retryBtn': 'もう一度',
      'menu.resume': '再開', 'menu.title': 'タイトルへ',

      'share.btn': '📤 結果をシェア', 'share.post': '𝕏 ポスト', 'share.copy': 'コピー',
      'share.title': 'ジャッカル',
      'share.msg.image': '成績画像つきでシェアできます',
      'share.msg.links': 'X・LINE・コピーからシェアしてください',
      'share.copied': '結果をコピーしました!SNSに貼り付けてください',
      'share.copyFail': 'コピーできませんでした。X・LINEボタンを使ってください',
      'share.perfect': '【パーフェクト!】',
      'share.text': '🏉ジャッカルで{c}/{t}回ボールを奪った!{p}\n称号:{r} SCORE {s}({nav})\nタックル{k}・最大{m}連続ジャッカル\n#ジャッカル #ラグビー #ClaudeCode',
      'card.head': 'ジャッカル({nav})',
      'card.jackals': 'ジャッカル {c}/{t}',
      'card.rank': '称号:{r}',
      'card.line1': 'SCORE {s} ・ タックル{k}/{t} ・ 最大{m}連続',
      'card.tags': '#ジャッカル  #ラグビー  #ClaudeCode',
    },
    en: {
      'doc.title': 'Jackal',
      'rotate.msg': 'Please rotate your phone to landscape',
      'rotate.sub': 'Jackal is played in landscape mode',

      'btn.front': 'FWD', 'btn.left': 'LEFT', 'btn.right': 'RIGHT', 'btn.dash': 'DASH',
      'btn.tackle': 'TACKLE', 'btn.jackal': 'JACKAL',
      'ring.fwd': 'FWD', 'ring.back': 'BACK', 'ring.auto': 'B runs on his own',
      'nav.btn': 'NAV {s}',

      'title.name': 'JACKAL',
      'title.sub': 'Make the tackle. Steal the loose ball!',
      'help.touch.1': 'Player A: move with the direction ring, hold DASH to sprint (uses stamina)',
      'help.touch.2': 'Runner breaking away → chase him down with a FORWARD tackle',
      'help.touch.3': 'Runner coming at you → he sidesteps. Tackle LEFT or RIGHT to his side',
      'help.touch.4': 'After the tackle you switch to Player B, running alongside. B moves on his own',
      'help.touch.5': 'Hit FORWARD / LEFT / RIGHT JACKAL toward the loose ball to steal it!',
      'help.touch.6': 'NAV on: a yellow ring appears when your tackle will connect (toggle with NAV)',
      'help.key.1': 'Player A: arrow keys / WASD / ring to move, Shift or Space to sprint',
      'help.key.2': 'Runner breaking away → chase him down with a FORWARD tackle (I)',
      'help.key.3': 'Runner coming at you → tackle LEFT (J) or RIGHT (L) to his side',
      'help.key.4': 'After the tackle you switch to Player B, running alongside. B moves on his own',
      'help.key.5': 'JACKAL toward the loose ball: I forward / J left / L right',
      'help.key.6': 'N: NAV on/off   M: sound on/off   P: pause',
      'title.best': 'Best: {c} / {t} jackals  (SCORE {s})',
      'title.start.touch': 'Tap to kick off',
      'title.start.key': 'SPACE / Tap to kick off',
      'title.sound': 'This game has sound (M key / top button to mute). On iPhone, turn off silent mode.',

      'hud.play': 'Play {n} / {t}',
      'hud.tackles': 'Tackles {n}', 'hud.jackals': 'Jackals {n}', 'hud.streak': 'Streak {n}',
      'hud.dash': 'STAMINA',
      'hud.playerA': 'PLAYER A', 'hud.playerB': 'PLAYER B',
      'ready.play': 'Play {n}',
      'ready.flee': 'He\'s breaking away! Chase and tackle!',
      'ready.attack': 'He\'s coming at you! Read the sidestep!',
      'msg.flee': 'Chase him down: FORWARD tackle!',
      'msg.attack': 'Tackle LEFT or RIGHT to the side he steps!',
      'msg.switch': 'Player B is arriving…',
      'msg.switchBig': 'PLAYER B: JACKAL!',
      'msg.wait': 'The ball is about to spill…!',
      'msg.loose': 'Loose ball! Jackal that way!',
      'pause.resume': 'P / Esc to resume',
      'sound.tap': 'No sound? Tap here',

      'tackle.ok': 'TACKLE!', 'tackle.chase': 'CAUGHT HIM!',
      'jackal.ok': 'JACKAL!!', 'jackal.sub': 'TURNOVER!',
      'jackal.fast': 'LIGHTNING HANDS! TURNOVER!', 'jackal.hop': 'Stole it off a wicked bounce!',
      'miss.try': 'Try conceded...', 'miss.break': 'He broke through...', 'miss.away': 'He got away...',
      'miss.slow': 'Too slow... their ball', 'miss.wrong': 'Wrong way... their ball', 'miss.early': 'Dived in too early...',
      'streak': '{n} jackals in a row!',

      'rank.0': 'Weekend Hacker', 'rank.1': 'Bench Flanker', 'rank.2': 'Starting Flanker',
      'rank.3': 'Breakdown Specialist', 'rank.4': 'International Openside', 'rank.5': 'Legendary Jackal',

      'over.title': 'NO SIDE',
      'over.jackals': '{c} / {t} jackals',
      'over.perfect': '★ PERFECT!! You won the ball every time ★',
      'over.rank': 'Rank: {r}',
      'over.line1': 'SCORE {s}   Tackles {k}/{t}   Best streak {m}   {nav}',
      'over.new': 'NEW RECORD!',
      'over.best': 'Best: {c} jackals (SCORE {s})',
      'nav.on': 'NAV on', 'nav.off': 'NAV off',
      'over.retryBtn': 'Play again',
      'menu.resume': 'Resume', 'menu.title': 'Title',

      'share.btn': '📤 Share result', 'share.post': '𝕏 Post', 'share.copy': 'Copy',
      'share.title': 'Jackal',
      'share.msg.image': 'Share with a result card image',
      'share.msg.links': 'Share via X, LINE or copy',
      'share.copied': 'Copied! Paste it into your social media',
      'share.copyFail': 'Could not copy. Please use the X or LINE button',
      'share.perfect': ' PERFECT!',
      'share.text': '🏉I won {c}/{t} turnovers in Jackal!{p}\nRank: {r}  SCORE {s} ({nav})\n{k} tackles, best streak {m}\n#Jackal #Rugby #ClaudeCode',
      'card.head': 'JACKAL ({nav})',
      'card.jackals': '{c}/{t} jackals',
      'card.rank': 'Rank: {r}',
      'card.line1': 'SCORE {s} ・ Tackles {k}/{t} ・ Best streak {m}',
      'card.tags': '#Jackal  #Rugby  #ClaudeCode',
    },
  };

  const STORE_KEY = 'jackal.lang';
  let saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* 保存不可 */ }
  const deviceLang = (navigator.languages && navigator.languages[0]) || navigator.language || 'ja';
  let lang = dict[saved] ? saved : (/^ja\b/i.test(deviceLang) ? 'ja' : 'en');
  const listeners = [];

  // t('hud.play', { n: 3, t: 20 }) → '第 3 プレー / 20'
  function t(key, vars) {
    let s = dict[lang][key];
    if (s === undefined) s = dict.ja[key];
    if (s === undefined) return key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)) : s;
  }

  // data-i18n の付いた要素を書き換える
  function apply() {
    document.documentElement.lang = lang;
    document.title = t('doc.title');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-lang]').forEach((el) => el.classList.toggle('on', el.dataset.lang === lang));
  }

  function setLang(l) {
    if (!dict[l] || l === lang) return;
    lang = l;
    try { localStorage.setItem(STORE_KEY, l); } catch (e) { /* 保存不可 */ }
    apply();
    listeners.forEach((f) => f(l));
  }

  return {
    t, apply, setLang,
    get lang() { return lang; },
    onChange(f) { listeners.push(f); },
  };
})();
