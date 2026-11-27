# Prompts used to build Stomp Duel

The prompts given to the AI coding assistant (Claude Code) during development, in order, word for word.
Answers given through choice cards are listed as such.

## 1. Main brief (2026-11-26)

````text
Act as a senior indie game developer, game designer, gameplay programmer, UI/UX designer, audio designer, QA tester, and software architect.

the game you developed already have a functioning Day 1 prototype pushed on the git named 1v1-game. I do NOT want a temporary prototype or a series of disconnected features. I want you to help transform my EXISTING GAME into a fully completed, polished, playable game.

You are responsible for identifying missing features, making thoughtful design decisions, implementing them, testing them, and ensuring the final game feels like a complete product.

Do not limit yourself to the features I explicitly listed. If a feature is necessary or strongly beneficial for a complete game, identify it and implement it where appropriate.

However, do not add unnecessary features that make the game bloated.

==================================================
1. CURRENT GAME SPECIFICATION
==================================================

GAME CONCEPT:

- Local 1v1 action platform fighting game.
- Two players play on the same keyboard.
- P1 is Red.
- P2 is Blue.
- Players compete by stomping on each other's heads.
- First player to score 5 points wins.
- The game should be easy to learn but difficult to master.
- The game should feel responsive, fair, competitive, and fun.

GAME FLOW:

- Start screen.
- Select game mode.
- Select stage.
- Configure match settings where applicable.
- 3-second countdown.
- Gameplay.
- Score tracking.
- Winner screen when a player reaches the winning score.
- Restart or return to menu.

==================================================
2. EXISTING CONTROLS
==================================================

PLAYER 1:

- A: Move left.
- D: Move right.
- W: Jump.

PLAYER 2:

- Left arrow: Move left.
- Right arrow: Move right.
- Up arrow: Jump.

F1:
- Toggle debug information.

Preserve the current controls by default.

You may add control remapping, but default controls must remain unchanged.

==================================================
3. EXISTING STAGE AND PHYSICS
==================================================

STAGE:

- Resolution: 800 x 400.
- Ground level: y = 340.
- 5 symmetrical platforms.
- Players can land on platforms from above.
- Platforms are pass-through from below.

PLAYER:

- Size: 30 x 40.
- Horizontal speed: 4.
- Initial jump velocity: 12.
- Gravity: 0.6 per tick.
- Maximum fall speed: 14.
- Stomp bounce velocity: 9.
- A stomped player respawns at their initial position.
- Respawn invulnerability: 1.5 seconds.
- Invulnerability blinking effect.
- Side collisions do not award points.
- Players are pushed back fairly during side collisions.

==================================================
4. EXISTING FAIRNESS SYSTEM
==================================================

These are fundamental systems and must be preserved unless a modification is absolutely necessary and approved.

- Fixed timestep of 60 ticks per second.
- Deterministic physics.
- No random physics behavior.
- Symmetrical starting positions.
- Symmetrical arena design for competitive stages.
- Simultaneous collision detection after both players have moved.
- Identical physics rules for both players.
- Jump triggered by pressing the jump key.
- Variable jump height.
- Coyote time: 6 ticks.
- Jump input buffer: 6 ticks.
- Reset keyboard input when the window loses focus.
- No frame-rate-dependent physics.

Do not break these systems during development.

==================================================
5. COMPLETE GAME DESIGN
==================================================

You must evaluate and implement the following features where appropriate.

A. CHARACTER DESIGN AND VISUAL POLISH

Replace plain rectangular players with proper game characters.

Requirements:

- Visually appealing characters.
- Clearly distinguishable Red P1 and Blue P2.
- Consistent character style.
- Characters should be readable during fast gameplay.
- Character animations must not affect hitboxes.
- Visual size may differ from collision size.
- Hitboxes should remain fair and consistent.

Required animations:

- Idle.
- Walking.
- Running if appropriate.
- Jumping.
- Falling.
- Landing.
- Stomping.
- Hit.
- Respawning.
- Invulnerability.
- Victory.
- Defeat.

Add suitable animation transitions.

Add character visual feedback:

- Squash and stretch where appropriate.
- Landing effects.
- Jump effects.
- Stomp effects.
- Hit effects.
- Small particles.
- Trail effects where appropriate.
- Screen shake for important events, with an option to disable it.

If original assets are not available, create or use suitable assets with appropriate licensing. Do not rely on broken URLs, missing files, or assets that require an unavailable external service.

Do not leave placeholder graphics in the final game.

B. SOUND AND MUSIC

Add a complete audio system.

Sound effects:

- Menu navigation.
- Menu selection.
- Countdown.
- Jump.
- Landing.
- Stomp.
- Hit.
- Respawn.
- Point scored.
- Victory.
- Match start.

Music:

- Menu music.
- Optional gameplay music.
- Victory music or victory sound.

Requirements:

- Sound volume settings.
- Music volume settings.
- Mute option.
- Audio must not interfere with gameplay performance.
- Prevent unnecessary sound overlap.
- Sound settings must work consistently.

If suitable audio assets are unavailable, create or use appropriate licensed assets. Do not leave missing audio files.

C. COMPLETE UI AND MENUS

Create a polished and consistent user interface.

MAIN MENU:

- Play.
- 1P vs AI.
- Local 1v1.
- Stage selection.
- Settings.
- How to play.
- Credits.
- Quit.

If appropriate, combine menu options to keep the interface clean and intuitive.

GAME HUD:

- P1 score.
- P2 score.
- Player identifiers.
- Countdown.
- Match timer if enabled.
- Clear scoring feedback.
- Clean and readable interface.
- No unnecessary HUD clutter.

PAUSE MENU:

- Resume.
- Restart match.
- Settings.
- Return to main menu.

WINNER SCREEN:

- Clearly show the winner.
- Display final scores.
- Victory animation.
- Victory sound.
- Rematch.
- Return to menu.

MENU REQUIREMENTS:

- Consistent visual design.
- Smooth but lightweight transitions.
- Keyboard navigation.
- Clear button feedback.
- No inaccessible or unresponsive menu items.
- Proper handling of keyboard focus.
- Proper handling of Escape and Enter where appropriate.

D. GAME MODES

Implement the following game modes:

1. LOCAL 1v1

- Two human players.
- Same keyboard.
- Competitive match.
- First to the configured winning score.

2. 1 PLAYER VS AI

- Player 1 controls Red.
- AI controls Blue.
- AI difficulty selection.
- First to the configured winning score.

3. OPTIONAL ADDITIONAL MODES

Consider and implement only if they fit the existing architecture and do not compromise the main game:

- Best-of-3 matches.
- Best-of-5 matches.
- Practice mode.
- Time-limited matches.
- Custom score limits.

The main default mode must remain simple and easy to start.

E. AI SYSTEM

Implement five AI difficulty levels.

LEVEL 1:

- Basic movement.
- Occasional jumping.
- Limited awareness.
- Easy opponent.

LEVEL 2:

- Basic opponent tracking.
- Attempts to move toward the player.
- Basic jumping behavior.

LEVEL 3:

- Better positioning.
- Platform awareness.
- More appropriate jump timing.
- Attempts to intercept the opponent.

LEVEL 4:

- Attempts strategic stomps.
- Better movement decisions.
- Basic defensive behavior.
- Attempts to avoid dangerous situations.

LEVEL 5:

- Predicts opponent movement using available current information.
- Uses platform positioning intelligently.
- Attempts strategic attacks and defensive maneuvers.
- More accurate positioning and timing.

AI FAIRNESS:

- AI must use the same physical rules as human players.
- AI must not teleport.
- AI must not bypass collisions.
- AI must not receive unfair movement speed.
- AI must not receive unfair jump power.
- AI must not read future inputs.
- AI must not have access to hidden future simulation states.
- AI must not be unbeatable.
- Difficulty should primarily change decision quality, reaction delays, and strategy.
- AI must operate within the fixed timestep system.

Provide a working difficulty selection interface.

F. STAGE SYSTEM

Build a proper stage system.

Requirements:

- Multiple playable stages.
- Stage selection screen.
- Stage preview.
- Stage name.
- Different platform layouts.
- Competitive stages should remain symmetrical.
- Clear visual differences between stages.
- Stage-specific background art.
- Proper collision handling.
- Proper player spawn locations.
- No unfair starting positions.
- No broken platforms or inaccessible areas.

Consider additional stage mechanics where appropriate:

- Moving platforms.
- Vertical platforms.
- Horizontal platforms.
- Platform rotation only if it is appropriate and fair.
- Environmental hazards only if they are well designed and balanced.

Hazards must never randomly favor one player.

Stage mechanics must be deterministic when used in competitive gameplay.

G. MOVING PLATFORMS

Implement moving platforms as a stage mechanic.

Requirements:

- Horizontal movement.
- Vertical movement.
- Looping movement.
- Predictable motion.
- Proper landing behavior.
- Players should move with platforms when standing on them where appropriate.
- No collision glitches.
- No players getting trapped inside platforms.
- No unfair positioning.

Moving platform behavior must be deterministic.

H. CAMERA AND SCROLLING STAGES

Implement a camera system for larger stages.

Requirements:

- Smooth camera movement.
- Proper world coordinates.
- Proper screen coordinates.
- Camera must not modify physics.
- Keep both players visible whenever possible.
- Avoid sudden camera movement.
- Handle larger arenas correctly.
- Support scrolling stages.

Scrolling stages should not be implemented at the expense of the stability of existing fixed-screen stages.

I. MATCH SETTINGS

Create a settings system allowing players to configure:

- Winning score.
- Match timer, if enabled.
- AI difficulty.
- Stage selection.
- Music volume.
- Sound effect volume.
- Screen shake.
- Fullscreen.
- Resolution, if supported.
- Key remapping, if supported.

Settings must have sensible defaults.

Persist settings between game sessions where appropriate.

J. FAIRNESS AND COMPETITIVE FEATURES

Evaluate and implement suitable competitive features:

- Symmetrical competitive stages.
- Consistent hitboxes.
- Deterministic gameplay.
- Fixed timestep.
- Equal player physics.
- No random competitive advantage.
- Fair spawn locations.
- Proper invulnerability handling.
- Proper simultaneous collision handling.
- Score tracking.
- Rematch.
- Best-of-series functionality if implemented.

Ensure the game can be played competitively without performance-based advantages.

K. GAME FEEL

Improve the overall gameplay feel.

Consider:

- Responsive controls.
- Smooth animation.
- Strong stomp feedback.
- Clear hit feedback.
- Landing feedback.
- Jump feedback.
- Proper character movement.
- Good sound timing.
- Small visual effects.
- UI feedback.
- Smooth menu transitions.
- Countdown effects.
- Match tension.
- Victory celebration.

Effects should enhance the game without making competitive gameplay difficult to read.

L. ACCESSIBILITY AND QUALITY OF LIFE

Add appropriate features:

- Volume controls.
- Mute.
- Screen shake toggle.
- Fullscreen toggle.
- Clear control instructions.
- Keyboard-friendly menus.
- High contrast between players.
- Readable text.
- Ability to restart quickly.
- Pause functionality.
- Proper window focus handling.

Consider colorblind-friendly player indicators, such as unique outlines, symbols, or patterns, in addition to red and blue colors.

M. GAME STATE MANAGEMENT

Implement a reliable game state system.

Possible states:

- Main menu.
- Settings.
- Stage selection.
- Mode selection.
- Countdown.
- Playing.
- Paused.
- Respawning.
- Match finished.
- Victory.

Ensure transitions are correct.

Prevent:

- Double scoring.
- Multiple respawns.
- Input leakage between screens.
- Restart bugs.
- Stuck keys.
- Incorrect score resets.
- Countdown glitches.
- AI running during menus.
- Physics running when the game is paused.
- Audio continuing unnecessarily after returning to menu.

N. DEBUGGING AND TESTING

Preserve F1 debug functionality.

Debug information should include where appropriate:

- FPS.
- Tick count.
- Player coordinates.
- Velocity.
- Collision state.
- Grounded state.
- Current game state.
- AI state.
- Hitbox information.

Debug mode should not affect gameplay.

Add or implement testing for:

- Player movement.
- Jumping.
- Variable jump height.
- Coyote time.
- Jump buffering.
- Platform collisions.
- Side collisions.
- Stomps.
- Scoring.
- Respawning.
- Invulnerability.
- Countdown.
- Pause.
- Restart.
- Victory.
- AI.
- Stage selection.
- Moving platforms.
- Settings.
- Window focus behavior.
- Simultaneous collision scenarios.
- Deterministic behavior.

Test edge cases whenever possible.

O. PERFORMANCE AND STABILITY

Requirements:

- Stable gameplay.
- Fixed timestep physics.
- Smooth rendering.
- Proper handling of different frame rates.
- No unnecessary memory usage.
- No crashes during normal gameplay.
- Proper handling of window resizing if supported.
- Proper handling of window focus.
- Proper resource cleanup.
- No unnecessary external dependencies.
- No broken asset paths.

The game should be playable on ordinary computers.

P. FINAL PRODUCT REQUIREMENTS

The final game must:

- Be playable from start to finish.
- Have a proper main menu.
- Have playable game modes.
- Have a working AI.
- Have multiple stages.
- Have proper character visuals.
- Have sound effects.
- Have victory effects.
- Have a pause menu.
- Have working settings.
- Have clear controls.
- Have proper scoring.
- Have stable physics.
- Have working rematches.
- Have no obvious placeholder content.
- Have no broken features.
- Have no unfinished menu buttons.
- Have no missing assets.
- Have no unnecessary debugging output in the normal gameplay interface.
- Have a clear way to launch the game.

==================================================
6. TECHNICAL DEVELOPMENT RULES
==================================================

Before modifying anything:

1. Inspect the entire existing project.
2. Read all relevant source files.
3. Understand the current architecture.
4. Identify the programming language, framework, dependencies, and entry point.
5. Identify the physics engine or custom physics implementation.
6. Identify the current rendering system.
7. Identify the existing game loop.
8. Identify the current collision system.
9. Identify the existing game state structure.
10. Identify what is already working.
11. Identify what is incomplete or broken.
12. Identify architectural risks.

Do not assume the project needs a complete rewrite.

If the architecture is sufficient, improve it incrementally.

If the architecture needs restructuring, explain why and propose the smallest reasonable restructuring.

Never destroy working features just to make the implementation easier.

Preserve existing working code wherever possible.

Do not unnecessarily change the programming language or framework.

Do not introduce unnecessary dependencies.

Do not silently modify core physics.

Do not remove existing features.

Do not create redundant files.

Do not leave unfinished code, TODOs, fake implementations, or nonfunctional buttons in the final product.

Do not pretend a feature is tested when it has not been tested.

==================================================
7. YOUR DEVELOPMENT RESPONSIBILITY
==================================================

You are responsible for more than simply writing code.

You must:

- Analyze the game.
- Identify missing features.
- Make reasonable design decisions.
- Develop the game.
- Test the game.
- Fix bugs.
- Improve performance.
- Improve UI.
- Improve gameplay.
- Maintain the existing fairness systems.
- Maintain a clear development structure.

If you discover an important missing feature that I did not mention, include it in your development plan.

If a feature is unnecessary, explain why you are not implementing it.

If something cannot be implemented due to the current framework or project limitations, explain the limitation and provide a reasonable alternative.

Do not ask me about every small design decision. Make sensible professional decisions and continue.

However, ask before making major changes that could fundamentally alter the game's identity or existing gameplay mechanics.

==================================================
8. DEVELOPMENT WORKFLOW
==================================================

STEP 1: AUDIT

Inspect my entire existing project.

Create a clear audit of:

- Existing features.
- Broken features.
- Missing features.
- Technical risks.
- Gameplay issues.
- Architecture.
- Assets.
- Dependencies.

STEP 2: COMPLETE GAME PLAN

Prepare a comprehensive plan for transforming the existing game into a complete game.

Organize the work into development milestones based on dependencies.

The milestones are for project management only. The objective is to complete the entire game, not stop after a milestone.

Identify which features must be completed before other features.

STEP 3: IMPLEMENTATION

Work directly in my existing project.

Implement the features systematically.

Do not only give me advice or code snippets. Whenever your environment allows, actually modify the project files.

Do not stop after preparing the plan.

Begin implementing the game.

STEP 4: TESTING

Test the implemented features.

Fix bugs discovered during testing.

Verify that existing features continue working.

Do not claim that tests passed unless you actually performed the tests.

STEP 5: POLISH

Improve the game until it feels like a complete, cohesive product.

STEP 6: FINALIZATION

Prepare the game for normal users.

Provide:

- How to launch the game.
- Controls.
- Game modes.
- Stage descriptions.
- Settings.
- Known limitations.
- Build or packaging instructions.
- Testing summary.
- Final file structure.
- Any necessary installation instructions.

==================================================
9. PROJECT MANAGEMENT
==================================================

Maintain a development checklist in the project, such as DEVELOPMENT.md.

Track:

- Completed features.
- In-progress features.
- Remaining features.
- Known bugs.
- Tests.
- Important technical decisions.

Update the checklist after each development session.

Do not mark features as completed unless they have been implemented.

Keep the documentation concise and useful.

==================================================
10. FINAL OBJECTIVE
==================================================

My objective is to create a complete, polished local 1v1 platform-fighting game that feels like an actual finished indie game rather than a basic school project or prototype.

The game should have:

- Strong gameplay.
- Responsive controls.
- Fair competitive physics.
- Attractive characters.
- Good animation.
- Sound.
- Music.
- Multiple stages.
- AI opponents.
- Game modes.
- Settings.
- UI.
- Victory effects.
- Proper menus.
- Stability.
- Performance.
- Replayability.

I want you to take initiative as a professional developer and identify additional missing elements that would genuinely improve the game.

Do not merely tell me what I should do.

Inspect my project, create the complete development plan, and start working toward completing the actual game.

The goal is a finished game, not just another prototype.
````

## 2. Repository

```text
https://github.com/Hanakawalab-AIdev/1v1-game
```

## 3. Branch choice (choice card)

Work on a new branch `feature/complete-game`, keeping `main` unchanged.

## 4. Multi-device play (2026-11-27)

```text
can we do multi device option also
```

Choice card "Which multi-device options do you want?" — selected all: Same Wi-Fi play, Online over internet,
Gamepads / controllers, Touch controls, and "Something else" (no details given).

## 5. Commit and push (2026-11-27)

```text
did you push into the git also push all the propt to git
```
