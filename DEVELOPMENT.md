# DEVELOPMENT.md — Stomp Duel

Development checklist and technical notes. Status markers: `[x]` done · `[~]` in progress · `[ ]` remaining.

## 1. Audit of the Day 1 prototype (commit 94febfd)

**Stack:** single `index.html`, vanilla JS + HTML5 Canvas 2D, no dependencies, no build step.
`serve.ps1` = tiny PowerShell static server (served every non-HTML file as `text/plain`).

**Working and preserved:**
- Fixed timestep 60 ticks/s with accumulator (250 ms clamp), render every frame.
- Custom deterministic physics: speed 4, jump 12, gravity 0.6, max fall 14, jump cut ×0.5 on release,
  coyote 6, buffer 6, one-way platforms, ground y=340.
- Simultaneous player-vs-player resolution after both players move; stomp = falling, previous bottom
  ≤ victim top + 4, victim not invulnerable; bounce 9; respawn at spawn + 90 tick invulnerability;
  side contact pushes both by half the overlap.
- Countdown 180 ticks, first to 5, Enter rematch, F1 debug, key reset on blur.

**Broken / weak:**
- `blur` cleared held keys but not the just-pressed buffer.
- Platform landing used "first platform in list", not the top-most crossed one (harmless on the
  original layout, wrong for moving platforms).
- Physics, rendering, input and rules all in one script → nothing testable headlessly.
- `serve.ps1` sent JS/other files as `text/plain`.

**Missing:** menus, modes, AI, stages, moving platforms, camera, audio, character art, effects,
pause, settings/persistence, remapping, i18n (UI was Japanese only), tests, docs.

**Risks:** keeping physics bit-identical while adding moving platforms; input leakage between
menus and play; AI fairness; keeping everything runnable from `file://` (no ES modules).

## 2. Architecture decisions

- Keep vanilla JS + Canvas; no framework, no dependencies, no build. Classic `<script>` files sharing
  one `SG` namespace so `index.html` still opens directly from disk.
- **Simulation (`core.js`, `stages.js`, `sim.js`) is DOM-free** and takes explicit per-player input
  objects. Humans and AI produce the *same* input structure → identical rules by construction.
- `ai.js` only reads the world (opponent state delayed by a reaction buffer) and returns inputs.
- `game.js` is the DOM-free state machine (screens, pause, sessions, input routing) → testable in Node.
- Rendering (`render.js`, `fighter.js`, `ui.js`) and `audio.js` are presentation only; they never write
  to simulation state. Render interpolates between ticks for smoothness.
- All art is drawn procedurally; all audio is synthesized with Web Audio → zero asset files, nothing
  can go missing, no licensing issues.
- Moving platforms: position is a pure function of the round's tick counter (smoothstep ping-pong),
  so it is deterministic. Riders are carried by the platform delta before their own movement.
  Landing uses the platform's top *before* the tick (`prevY`), except for the platform you are riding.
- Stages are authored as one half + `mirror: true`; the builder generates the mirrored half
  (horizontal motion reversed) → symmetric by construction, and a test verifies it every tick.

## 3. Milestones (dependency order)

- [x] M0 Audit, branch `feature/complete-game`, plan.
- [x] M1 Core refactor: constants, sim with explicit inputs, stage builder, moving platforms, rounds,
      timer + sudden death, events for presentation.
- [x] M2 Tests in Node (`node tests/run-tests.js`).
- [x] M3 Game controller: screens, pause, results, settings persistence, remapping, input hygiene.
- [x] M4 Presentation: characters + animations, particles, shake, stage art, camera, HUD, debug.
- [x] M5 Audio: synthesized SFX, menu + battle music, volume/mute.
- [x] M6 AI levels 1–5 + practice dummy.
- [x] M7 Browser QA, polish, docs.
- [x] M8 Multi-device: gamepads, touch controls, online / same-Wi-Fi play via `server.js`.

## 4. Feature checklist

See README.md for the player-facing description. Implemented:
- [x] Main menu, mode select, match setup, stage select with live preview, pause, results.
- [x] Local 1v1, 1P vs CPU (5 levels), Practice (dummy / CPU / human, endless).
- [x] Win score 1–10, Best of 1/3/5, timer Off/60/90/120 s with sudden death on tie.
- [x] 4 stages (2 static-camera with movers, 1 static classic, 1 scrolling with zoom camera).
- [x] Settings: music, SFX, mute, battle music, shake, labels, display scale, fullscreen,
      language EN/JA, key remapping, reset; persisted in localStorage.
- [x] Colorblind-safe identifiers: P1 ▲ emblem + flame crest, P2 ● emblem + wave crest.
- [x] Auto-pause on window blur; input cleared on blur and on every screen change.
- [x] Gamepads (Gamepad API → virtual keys `Pad<slot><Button>`), menus + play + pause; not remappable.
- [x] Touch: on-screen buttons in matches (1 or 2 clusters), tap menus, tap ‹ › to change values, join keypad.
- [x] Online rooms (4-digit code / share link `?room=1234`), host rules, pause-for-both, rematch votes,
      disconnect handling, ping display, desync detection + automatic resync.

## 4b. Online design (`js/net.js`, `server/`)

- **Model: server-clocked input relay.** Devices send held buttons + a monotonic jump-press counter.
  The server steps its own copy of the simulation at 60 Hz with the latest input of each player and
  broadcasts each tick's two inputs. Devices replay that input stream through the same deterministic
  `stepWorld`, so presentation (effects, sounds) stays local and the server needs no rendering.
- **Why not rollback / peer-to-peer:** no extra dependencies (WebRTC needs signalling + STUN/TURN),
  no prediction artefacts, and both players get the *same* input path → no host advantage. Cost: your own
  input is shown after one round trip + a 2-frame jitter buffer (≈35–60 ms on Wi-Fi; more over the internet).
- Press counter instead of a "pressed" flag: a short tap between two server ticks is never lost and never
  applied twice (tested with 50 ms latency).
- Determinism across devices relies on IEEE-754 `+ - * /` only in the simulation (no `Math.sin` etc.).
  Hash check every 60 ticks; on mismatch the device requests the state and replays its newer frames.
- Jitter buffer: start after 2 frames; play 2 per tick above 6 queued; jump to the newest above 20.
- Security: only `index.html` and `js/*.js` are served; WebSocket frames capped at 16 KB; clients must mask;
  message rate limit (240/s); max 500 rooms / 1000 connections; all input validated.

## 5. Deliberately not implemented

- **Quit button:** a browser page cannot close its own tab; closing the tab/window is the quit.
- **Running animation:** there is one movement speed, so a separate run state would be misleading.
- **Hazards / rotating platforms:** add reading noise to a stomp game and risk unfair spawns;
  moving platforms already provide stage variety.
- **Hit-stop (freeze frames):** would change match timing and input-buffer behaviour; feedback is
  provided with particles, flash and shake instead.

## 6. Known limitations

- Exact push tie-break: when both players' centres are exactly equal, P1 is pushed left (inherited
  from Day 1; needs pixel-exact overlap, practically never happens).
- Fullscreen must be toggled from a key press (browser rule); it is not restored on next launch.
- Floating-point mirror symmetry is verified to 1e-6, not bit-exact, on moving platforms.
- Online: no reconnect after a dropped connection (the match ends for both; create a new room).
  Rules/stage can't be changed inside a room (leave and create a new one). No spectators.
- Online latency: your own movement appears after a round trip to the server; fine on the same Wi-Fi,
  noticeable above ~100 ms ping. Both players always share the same delay path.
- Phones: a backgrounded browser tab usually drops the connection; that ends the online match.
- Gamepad buttons are fixed (keyboard remains remappable).

## 7. Tests

`node tests/run-tests.js` → **69 passed, 0 failed** (2026-11-27). Multi-device tests (`tests/net-tests.js`,
`tests/server-test.js`): WebSocket framing, input packing, two game clients + real room logic over a simulated
network (lockstep with server, exact-once jump presses at 50 ms latency, pause/focus-loss for both, desync repair,
leave/disconnect, rematch votes, bad code / full room / no server / cancel, junk + flood), the real `server.js`
on a free port (static allowlist, ~60 frames/s relay over real WebSockets), gamepad virtual keys, touch layouts.
Earlier areas covered:
movement, jump, variable jump, coyote, buffer, platforms (static + moving, riding, pass-through),
side collision, stomp, scoring, double-score guard, respawn, invulnerability, countdown, timer,
sudden death, series, determinism, mirror symmetry, stage validation, AI (fairness + levels),
controller (pause, restart, input leakage, focus loss, settings, remap, results/rematch).

**Browser QA (2026-11-27, Chromium-based pane, served via serve.ps1):** title → menus → stage select →
match on all 4 stages → pause → best-of-3 → results → rematch/menu; real keyboard events through
`main.js` (movement 4 px/tick, blur auto-pause + key release, Esc resume); mouse menu selection;
settings, controls, how-to, credits, Japanese UI; no console errors; every SFX/music track starts without
errors. Render ≈0.2–0.5 ms/frame, simulation+L5 AI ≈0.04 ms/tick.

**AI ladder** (60 s games, 4 stages × 3 seeds, points for–against):
vs random mover — L1 31–45, L2 53–56, L3 82–60, L4 168–46, L5 189–20;
vs L3 — L1 58–101, L2 82–119, L3 108–106, L4 144–133, L5 217–92.

**Multi-device browser QA (2026-11-27):** two game clients (two iframes, one browser, same server) — room
create, join via `?room=` link, both at the same frame with identical positions and 0 desyncs, pause from P2
pauses both, resume, leave → other returns to Online menu with a message. Lobby, Online and Join screens
checked visually; keypad and touch buttons driven with synthetic touch pointer events.

**Not verified yet (no hardware here):** a real gamepad, a real phone/tablet touch screen, two physical
devices over Wi-Fi (Windows firewall prompt), hosting on an internet provider, real-time feel online.

**Not verified by a human yet:** how the synthesized audio sounds (mix/levels), real-time feel in a visible
window (the QA pane was hidden, so frames were throttled and ticks were driven manually), opening
`index.html` directly from disk (uses only classic scripts, which work on `file://`).

## 8. Session log

- 2026-11-27: Full implementation pass on `feature/complete-game`: modular refactor, stages + moving
  platforms + scrolling camera, rounds/timer/sudden death, AI 1–5 + dummy, menus/settings/remap/i18n,
  character art + effects, synthesized audio, 52 automated tests, browser QA fixes (respawn interpolation,
  stage-select and how-to layout, results screen fighters).
- 2026-11-27: Multi-device pass: `server.js` (no packages) with rooms + server-clocked netcode, online
  menus/lobby/join keypad, gamepads, touch controls, pointer value adjust, 17 new tests (69 total).
- 2026-11-27: Download/launch fixes from user report: index.html opened without its js/ folder (single file
  or inside a ZIP) showed a black box → added generated single-file `StompDuel.html` (tools/build-standalone.js,
  test keeps it in sync) and an explanatory error page. Other devices tried `localhost` → server now prints and
  the Online screen shows the Wi-Fi address (`/info`), skips 169.254.x adapters; README troubleshooting.
  Verified with headless Edge from disk (lone index.html → message; StompDuel.html alone → game) and
  `/info` via the Wi-Fi address on this PC. Not verified: an actual second device on this Wi-Fi.
- 2026-11-27: Online from a double-clicked file was confusing → added `Start Online Server.cmd` /`n  `start-online-server.sh` (`node server.js --open` opens the browser; detects a server already running),
  Online screen now gives the exact step and flashes it instead of a toast that covered the menu.
- 2026-11-27: Room screen: "Copy Invite Link" button (first item) copies `http://<wifi-ip>:8123/?room=CODE`;
  confirmation shows on the button. Works on plain-http LAN addresses (execCommand fallback). Verified with a
  real click in the browser: the Windows clipboard held the link. 71 tests.
