# NEON VOID

A neon 2D arcade space shooter — an original entry for the make.fun
best-game-01 bounty ($1,000, top 10 share the prize).

## The game

You pilot a lone fighter in the void. Survive the waves, chain kills into
combos, grab power-ups, and push your best score as high as it goes.

- **Move:** WASD / arrow keys — **Aim:** mouse — **Fire:** hold click / Space
- **Dash:** Shift / right-click (brief invulnerability, 2.5 s cooldown)
- **Hull:** 3 hits. 4 enemy types: Drone (chases), Weaver (sine-wave, shoots),
  Spinner (radial burst), Elite cruiser (every 5th wave).
- **Combo:** kills raise a multiplier (up to 3x); taking a hit resets it.
- **Power-ups:** spread shot, rapid fire, shield, repair.
- **Waves:** escalating enemy counts and speed, +100 × wave clear bonus.
- **Screens:** title, play, paused, game over — with restart. Best score is
  saved in localStorage. Sound is synthesized with WebAudio (no audio files).

## Run it

Static files, no build step, no network:

```
node serve.ts        # serves game/ on http://localhost:8080
```

Open the page in a desktop browser and play with keyboard + mouse.

## Entry

`main.ts` (Node 22) copies `game/` and `screenshots/` to `/output` and writes
`/output/dossier.json` with the vendored `vendor/makefun-game.ts` library.
Screenshots are real renders of this game's own code (`?shot=start|play|end`).
