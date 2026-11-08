# Starby art

All art is hand-drawn by the team. Code only loads, lines up, moves and swaps these files.
The list of files and how fast they swap lives in `src/renderer/pet/frames.js`.

## Layout

```
assets/
  sprite/
    sunny/        ← one folder per color set (sunny = the free starting color)
      idle-1.png  idle-2.png  talk-1.png  ...   (flat: all of that color's frames together)
  stardust/
```

## Which file shows when

`name-1` / `name-2` pairs alternate like a GIF; single files are held still. First match wins:

| Files | When | Swap every |
|---|---|---|
| `asleep-1/2` | Napping in a top corner (even while being held) | 1.0s |
| `nervousexcited` | Being dragged | — |
| `dizzy-1/2` | Spun / thrown too much, or the cursor circling him | 0.3s |
| `yawn-1/2` | Left alone for 2 minutes, walking to a corner | 0.8s |
| `mad-1/2` | Poked 4+ times. Also used for **sad** (said no to tag): grumpy for a bit, not truly mad | 0.4s / 0.5s |
| `happy-1/2` | Playful / excited: thrown, flying, playing tag | 0.35s |
| `up-1` | Watching a star shower | — |
| `talk-1/2` | Saying something (normal mood) | 0.2s |
| `up-1` / `down` | Cursor right above / right below him (normal mood) | — |
| `left` / `right` | Walking left / right (normal mood) | — |
| `kawaii-1/2` | "Glistening": a random sparkly moment while standing around | 0.3s |
| `wink` | A random wink while standing around | — |
| `idle-1/2` | Normal, standing | 0.6s |

## Rules every frame follows (keep these for new art)

- PNG, transparent background, **2048×2048**, same as every other frame.
- **Feet at y = 1900** (the bottom of his lowest point), legs centered around x ≈ 1000.
  Code lines every frame up on that spot so swapping frames never makes him jump; frames that
  sit differently (`left`, `right`, `dizzy-*`) get a measured shift in `frames.js` (`ALIGN`).
  If you redraw one of those, tell whoever's on code so the shift can be re-measured.
- He **faces the viewer**. Code doesn't mirror him; walking direction uses `left` / `right`.
- Leave room above his head for anything that floats there (dizzy stars, zzz).

## Color sets

Each shop color gets a folder named after the color, with the same file names:
`sunny` (default), `pink`, `mint`, `peach`, `sky`, `aqua`, `coral`, `lilac`, `moonbeam`.
Any file missing from a color set falls back to the same file from `sunny`, so sets can be
filled in gradually.

## Stardust

`assets/stardust/`: not used by code yet (stardust is still a plain CSS shape).
