# Stomp Duel — 2D Action Versus

A local 1v1 platform-fighting game for one keyboard. Jump on your rival's head to score; first to the
target score wins. Built with plain HTML5 Canvas + Web Audio: no installs, no dependencies, no asset files.

（日本語の説明は下にあります）

## Launch

- **Easiest (one computer):** double-click **`StompDuel.html`**: the whole game in one file, so it also works
  when you download just that file.
- `index.html` works too, but only together with its `js` folder. If you downloaded the ZIP from GitHub,
  right-click it → **Extract All** first (opening it from inside the ZIP shows an error page).
- **With online play:** double-click **`Start Online Server.cmd`** (Windows) or run `./start-online-server.sh`
  (macOS / Linux). It starts the game server and opens the game in your browser; keep its window open while
  playing. Needs [Node.js](https://nodejs.org) 18+ (the launcher tells you if it's missing). No `npm install`
  needed. Same thing by hand: `node server.js`, then open http://localhost:8123.
- Opening `StompDuel.html` / `index.html` by double-click plays everything **except** online: a page opened as a
  file can't host or join rooms.

Sound starts after your first key press, click or tap (a browser rule).

## Multi-device play

**Controllers:** plug in or pair one or two gamepads (Xbox, PlayStation, Switch Pro…) and press a button.
Controller 1 is P1, controller 2 is P2 (in 1P modes either one controls you). D-pad / left stick moves,
A or B jumps, Start pauses. In menus: D-pad moves, A confirms, B goes back.

**Touch screens (tablets, phones):** tap the menus; in a match on-screen buttons appear
(one set for 1P / online, two sets when two people share one tablet). Turn the phone sideways.

**Online / same Wi-Fi (each player on their own device):**
1. On one computer double-click `Start Online Server.cmd` (or run `node server.js`). The game opens there, and the
   server window prints the address for other devices, such as `http://192.168.1.20:8123` (the game's Online
   screen shows it too). On Windows, allow Node.js through the firewall when asked.
2. Player 1 opens that address, chooses **Online / Wi-Fi → Create Room**, picks rules and a stage, and gets a 4-digit code
   (plus a link with the code in it).
3. Player 2 opens the link on their device (PC, tablet or phone), or opens the address and chooses
   **Online / Wi-Fi → Join Room** and types the code.
4. Either player can pause (it pauses both). Rematch starts when both pick it.

**If the other device can't connect:**
- Don't use `localhost` on the other device: `localhost` always means "this same device". Use the
  `http://192.168.…:8123` address that `node server.js` prints (also shown on the game's Online screen).
- Both devices must be on the same Wi-Fi, and the computer running `node server.js` must stay on.
- Windows: allow Node.js in the firewall (Windows Security → Firewall → Allow an app → Node.js, tick the
  network type you're on, Private and/or Public).
- Guest, school, office and hotel Wi-Fi often block devices from seeing each other. Then use a phone
  hotspot (connect both devices to it) or host the server online (below).

**Over the internet:** host `server.js` on any Node.js host that supports WebSockets (for example Render,
Railway or Fly.io; start command `node server.js`, the host sets `PORT`), then both players open its address.
Play is smoothest when both players have a low ping to the server; the HUD shows your ping.

Online play needs the page to be opened from `server.js` (not from the file or from `serve.ps1`).

## Controls (defaults: unchanged from Day 1, remappable in Settings → Controls)

| | Move | Jump |
|---|---|---|
| **P1 — Ember (red, ▲)** | A / D | W |
| **P2 — Tide (blue, ●)** | ← / → | ↑ |

- `Esc`: pause (Resume / Restart / Settings / Main Menu)  · `F1`: debug overlay
- Menus: arrow keys or WASD, `Enter`/`Space` to confirm, `Esc` to go back. The mouse works too.
- In 1P modes, P1 can use either key set.
- Hold jump for a higher jump, tap for a hop. Hold jump while stomping to bounce higher.

## Modes

- **Local 1v1:** two players on one keyboard.
- **1P vs CPU:** five levels (1 Rookie → 5 Master). Levels differ in reaction time, decision rate,
  aim error, mistakes and strategy. Never in speed, jump power or information.
- **Practice:** endless, no score limit. Opponent: training dummy (walks, never attacks), CPU 1–5 or a human.
- **Online / Wi-Fi:** each player on their own device (see *Multi-device play*).

Match setup: points to win (1–10, default 5), format (single / best of 3 / best of 5),
time limit (off / 60 / 90 / 120 s). When time runs out the leader wins; a tie goes to **sudden death** (next stomp wins).

## Stages (all left/right symmetric with mirrored spawns)

| Stage | Notes |
|---|---|
| **Green Meadow** | The original Day 1 layout: five fixed platforms. |
| **Sunset Docks** | Two rafts slide in and out horizontally. |
| **Crystal Cavern** | Twin lifts rise and fall. Ride them to strike from above. |
| **Neon Rooftops** | 1200 px wide scrolling stage; the camera follows and zooms out to keep both fighters in view. |

Moving platforms follow fixed, looping paths (dashed rails show their track) and carry anyone standing on them.

## Settings (saved automatically)

Music volume, sound volume, mute, battle music on/off, screen shake on/off, player tags on/off,
display size (fit window / 1× / 2×), fullscreen, language (English / 日本語), key remapping, reset to defaults.

## Fair-play rules

60 Hz fixed timestep (same physics on every monitor) · deterministic physics, no randomness ·
symmetric stages and spawns · both players resolved simultaneously after moving · identical rules for humans and CPU ·
coyote time 6 ticks, jump buffer 6 ticks · inputs released and the match auto-paused when the window loses focus.
Online: the server runs the 60 Hz clock and both players' inputs take the same path through it, so hosting the
room gives no advantage; both devices run the same deterministic simulation and are checked against the server
every second (a device that drifts is corrected automatically).
Details: [spec.md](spec.md).

## Development

- Tests: `node tests/run-tests.js` (Node 18+, Node 22+ for the live-server test; no packages needed)
- Architecture, checklist and decisions: [DEVELOPMENT.md](DEVELOPMENT.md)
- Prompts used to build the game with an AI coding assistant: [PROMPTS.md](PROMPTS.md)
- Packaging: the game is the folder itself (`index.html`, `js/`). Zip it or host it on any static web host
  (e.g. GitHub Pages) for local play; host `server.js` (whole folder) for online play. No build step.

After changing anything in `index.html` or `js/`, rebuild the single-file version: `node tools/build-standalone.js`
(the tests fail if it is out of date).

```
StompDuel.html    the whole game in one file (generated)
index.html        page + script order
tools/            build-standalone.js (makes StompDuel.html)
Start Online Server.cmd / start-online-server.sh   start the server + open the game
server.js         game server: serves the game + online rooms (Node.js, no packages)
server/ws.js      minimal WebSocket implementation
server/rooms.js   rooms, room codes, the authoritative 60 Hz match clock
js/net.js         network protocol shared by browser and server
js/core.js        constants, PRNG, helpers
js/i18n.js        English / Japanese strings
js/stages.js      stage definitions (mirrored automatically)
js/sim.js         deterministic simulation (players, platforms, rounds)
js/ai.js          CPU opponents
js/game.js        screens, pause, settings, input routing (DOM-free)
js/audio.js       synthesized sound effects + music
js/fighter.js     character art, animation, particles
js/render.js      camera, stage art, HUD, debug overlay
js/ui.js          menus and overlays
js/main.js        browser wiring + fixed-timestep loop
tests/            headless test suite
serve.ps1         optional local web server (local play only, no online)
```

---

## 日本語

1台のキーボードで2人が遊ぶ 1v1 対戦アクション。相手の頭を踏むと1点、先に目標点（初期設定5点）を取ったほうが勝ち。

- **オンライン対戦:** `Start Online Server.cmd` をダブルクリック（Node.js が必要）→ ゲームが開きます。ファイルを直接開いた場合はオンライン以外が遊べます
- **起動:** `StompDuel.html` をダブルクリック（1ファイルで動きます）。`index.html` は `js` フォルダと一緒に必要です（ZIP は「すべて展開」してから）
- **ほかの端末がつながらない時:** ほかの端末では `localhost` ではなく、`node server.js` が表示する `http://192.168.…:8123` を開く。
  同じ Wi-Fi に接続し、Windows のファイアウォールで Node.js を許可。ゲスト・学校の Wi-Fi で無理な場合はスマホのテザリングを使う
- **操作:** P1（赤▲）A/D 移動・W ジャンプ ／ P2（青●）←/→ 移動・↑ ジャンプ ／ Esc ポーズ ／ F1 デバッグ表示
- **モード:** ふたりで対戦、CPU と対戦（レベル1〜5）、れんしゅう（得点制限なし）、オンライン / Wi-Fi（それぞれ自分の端末で対戦）
- **コントローラー:** 1台目が P1、2台目が P2。十字キー／スティックで移動、A・B でジャンプ、Start でポーズ
- **タッチ画面:** タブレット・スマホでは試合中に画面ボタンが表示されます（横向き推奨）
- **オンライン:** 1台のPCで `node server.js` を実行 → 表示されたアドレスを各端末で開く →
  片方が「ルームを作る」、もう片方は4けたのコードで「ルームに参加」（または共有リンクを開く）
- **ステージ:** みどりの草原、夕焼けの桟橋、クリスタル洞窟、ネオンの屋上（スクロール）
- **設定:** 音量、ミュート、画面のゆれ、画面サイズ、フルスクリーン、言語、キー変更（自動保存）
