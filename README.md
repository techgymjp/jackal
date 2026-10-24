# ジャッカル (Jackal)

ラグビーの **ジャッカル**(タックル後のボール奪取)をテーマにしたブラウザゲームです。
タックルで相手を倒し、こぼれたボールを奪い取れ! 全 20 プレーで何回ボールを奪えるかを競います。

画面は **味方選手の背中越しの3D視点**。ナイター照明のスタジアムで、選手の動き・ボタン・花火・歓声・質感は
techgymjp/center-fly(センターフライ)と同じ作りです。

`index.html` をブラウザで開くだけで遊べます(Web 版はビルド不要)。Android アプリ版もあります(下記)。3D描画に同梱の three.js(`vendor/three.min.js`, MIT License)を使っています。
GitHub Pages などの静的ホスティングにそのまま置けます。

## 1 プレーの流れ

1. **選手A(背番号6)でタックル** — 左下の方角リングで選手Aを動かします。相手のボールキャリアは次のどちらか。
   - **向こうに逃げる**(画面に大きく「おいかけろ」)→ ダッシュで追いかけて **前タックル**。
     逃げ続ける相手はだんだん疲れて遅くなります。3m ほどまで迫ったら飛び込めば届きます
   - **こっちに攻めてくる**(画面に大きく「とめろ」)→ 目の前で左右にステップしてくるので、かわした側へ **左タックル / 右タックル**。
     早く飛び込みすぎるとかわされます。後半はフェイント(逆に振ってから切り返す)も入ります
2. **選手B(背番号7)でジャッカル** — タックルが決まると、相手に並走していた選手Bに切り替わります。
   ボールを持った選手は倒れたらすぐ手放さないといけないので、タックルの直後にボールがこぼれ、選手Bのほうへ転がってきます。
   選手Bを方角リングとダッシュで動かし、相手のサポートより先にボールに触れればジャッカル成功。花火と大歓声!
   - 後半は楕円球が **イレギュラーバウンド** して途中で向きが変わり、相手のサポートも早く来ます
   - ナビ ON なら、ボールが転がっていく先に緑の輪が出ます

失敗(トライを許す・抜かれる・逃げ切られる・ボールを拾われる)すると次のプレーへ進みます。

## 操作

| 操作 | タッチ / マウス | キーボード |
| --- | --- | --- |
| 選手A・選手Bの移動 | 左下の **方角リング**(16方位・中心から離すほど速い) | 矢印キー / WASD |
| ダッシュ | ダッシュボタン長押し(スタミナ消費) | Shift / Space |
| 前タックル(選手A) | 右側の「前」ボタン | I(または K) |
| 左タックル(選手A) | 右側の「左」ボタン | J |
| 右タックル(選手A) | 右側の「右」ボタン | L |
| 一時停止 | — | P / Esc |
| 音のオン/オフ | 画面上部のスピーカーボタン | M |
| ナビのオン/オフ | 画面上部の「ナビ」ボタン | N |

選手Bを操作している間は、前・左・右のタックルボタンは出ません(移動とダッシュだけ)。
方向は画面基準です(前 = 画面の奥)。

**ナビ**: タックルが届くタイミングで相手の足元に黄色い輪が出て、当たるボタンが点滅します。
こぼれ球の行き先には緑の輪が出ます。結果画面とシェア文にナビあり/なしが入ります。

## スコア

- タックル: 100(向かってくる相手は 150)
- ジャッカル: 300 + 速さボーナス(最大 200)+ 連続ボーナス。イレギュラーバウンドを奪うと +150
- 5 連続ジャッカルごとに花火を追加
- ベスト記録はブラウザに保存されます。結果画面から X・LINE・コピー・成績画像つきでシェアできます。
  シェア文には紹介記事 https://techgym.jp/column/claude-code-game-jackal/ が入ります

## 音と演出

音はすべて Web Audio API で合成しています(音声ファイルなし)。

- スタジアムのざわめきと応援(太鼓と手拍子のリズム。メロディはなし)。タックルが近づくほど、こぼれ球を争う間はどよめきが大きくなる
- タックルの衝撃音、楕円球が弾む音、レフリーの笛
- タックルの瞬間はスローモーション
- **チアホーン**(観客の「ブォーーー」という長い一定の音): ボールキャリアが選手Aに向かって近づいてくるときと、自陣のトライラインに近づいたときに鳴り、近いほど大きくなる
- **ジャッカル成功で笛・大歓声・拍手・指笛・花火**。速い反応やイレギュラーバウンドを奪うと、さらに派手に
- 失敗すると観客のため息「あー…」

## 言語

日本語と英語に対応しています。端末の言語が日本語なら日本語、それ以外は英語で表示し、タイトル画面左下のボタンで切り替えられます。
文言は `i18n.js` にまとめています。

## Android アプリ

[Capacitor](https://capacitorjs.com/) でゲームのファイルをアプリに同梱し、Android アプリにしています(オフラインで遊べます)。
構成は techgymjp/jet-fighter の `docs/ANDROID_PORTING.md`、techgymjp/center-fly と同じです。

- パッケージ名: `jp.techgym.jackal`
- 横画面固定・全画面・プレイ中は画面を消さない
- 戻るボタン: プレイ中は一時停止(ポーズ中なら再開)、タイトル・結果画面ではアプリを終了
- 別アプリに切り替えると自動で一時停止して音を止める
- シェアは Android の共有メニュー
- 広告(AdMob)
  - バナー: タイトル画面・ポーズ画面・結果画面の下中央(プレイ中は操作ボタンと重なるので出さない)
  - 全画面広告(インタースティシャル): 結果画面の「もう一度」、「タイトルへ」、ポーズ画面からの「再開」のたびに毎回
  - リワード広告(チート): プレーに失敗したら「広告を見てこのプレーをやり直す」(1 ゲーム 5 回まで。6 秒で自動的に次のプレーへ)。
    見終わるとそのプレーの成績を取り消して、同じプレーをもう一度。使ったことは結果画面とシェア文に「やり直しN回」と出る
  - EU など同意が必要な地域ではタイトル画面に「広告の設定」
- タイトル画面にバージョン(ビルド番号)とプライバシーポリシーへのリンク

ビルドは GitHub Actions(`.github/workflows/android.yml`)で行います。

1. `npm ci` → `npm run build`(`www/` に Web ファイルをコピーし、`ads-config.js` と `build-info.js` を生成)→ `npx cap sync android` → `./gradlew assembleDebug`
2. 既定ブランチなら、Release `android-latest` の `jackal.apk` を差し替え(動作確認用・テスト広告)
   - リリース画面: `https://github.com/techgymjp/jackal/releases/tag/android-latest`(QR コード: `docs/apk-qr.png`)
   - APK 直接: `https://github.com/techgymjp/jackal/releases/latest/download/jackal.apk`
3. GitHub Secrets に署名鍵(`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`)があれば、本番広告で署名付き AAB を作り Artifact に上げる

AdMob のアプリ ID は `android/app/src/main/res/values/strings.xml` の `admob_app_id`、本番の広告ユニット ID は `ads.js` の `UNITS.production` にあります。
広告ユニット ID が空の種類(今はリワード)は、Google Play 用の AAB では出しません。動作確認用 APK はどれもテスト広告です。

手元で試すとき: `npm install` → `npm run android:sync` → `npm run android:open`(Android Studio が必要)。
アイコンと起動画面は `assets/` の元画像から `npx @capacitor/assets generate --android` で生成しています。

## ファイル

| ファイル | 内容 |
| --- | --- |
| `game.js` | ゲームの進行・選手の動き・入力・2D の表示(HUD・ボタン・ミニマップ) |
| `scene3d.js` | 3D 描画(スタジアム・選手・楕円球・花火・カメラ) |
| `sound.js` | 音(Web Audio API で合成) |
| `i18n.js` | 日本語 / 英語の文言 |
| `ads.js` | 広告(Android アプリのときだけ動く) |
| `android/` | Android アプリのプロジェクト(Capacitor) |

テスト用に `window.Jackal`(`newGame(seed)`、`setBot(fn)`、`forceType` など)を公開しています。

## ライセンス

著作権はテックジム株式会社に帰属します(All rights reserved)。許可なく複製・改変・再配布すること、Web サイトやアプリとして公開・販売すること、名前・ロゴ・アイコン・画像を使うことを禁止します。
テックジムの受講生が学習目的で複製・改変することは許可しますが、アプリストアでの公開・広告の掲載・販売などの商用利用は禁止し、著作権表示を残してください。
同梱の three.js は MIT License です。詳しくは [LICENSE](LICENSE) を見てください。

## English

**Jackal** — a 3D rugby browser game about winning the ball at the breakdown.

- Play as **Player A**: move with the direction ring and make the tackle. A runner breaking away needs a FORWARD tackle; a runner coming at you sidesteps, so tackle LEFT or RIGHT to the side he steps.
- Once the tackle is made, you switch to **Player B**, who has been running alongside the ball carrier (B moves on his own). When the ball spills, hit FORWARD / LEFT / RIGHT JACKAL toward it. Win it and the stadium erupts with fireworks and cheers.
- 20 plays per game. Open `index.html` in a browser to play. An Android app (Capacitor) is also built by GitHub Actions.
