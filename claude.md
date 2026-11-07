# Starby

A cute desktop companion ("desktop pet") built for a hackathon. The character
concept is a little sprite / twinkle / star that hangs out on your screen and
interacts with your desktop.

## Project status

Hackathon project, starting from an empty repo, with a ~24-36 hour build
window. A team of 4 plus Claude Code is working on it. Priorities are a
working, demo-able core loop over polish. It should be built in a way that's
easy to extend later (more behaviors, maybe eventually "helpful tool"
features), but right now the goal is: cute companion, not a utility.

Given the timeline, favor shipping something working over getting it
"right" — but don't skip the placeholder-asset rule or the scope boundaries
below to save time; those are non-negotiable, not polish.

## Team conventions

4 people + Claude Code working in parallel on a tight deadline:
- Keep PRs/commits small and focused on one feature area so people aren't
  stepping on each other's files
- Favor the folder structure in "Code conventions" below so different people
  can own different behaviors (e.g. one person on stardust/shop, another on
  movement/idle, another on speech bubbles/system reads) without touching
  shared files unnecessarily
- If a change would touch shared/core files (main process setup, window
  config, the persisted-state schema), flag it rather than just doing it —
  those are the most likely source of merge conflicts

## Target platform

Windows only for this build. Don't spend time on macOS/Linux-specific window
behavior (e.g. vibrancy, dock quirks) — test and tune for Windows only.

## Tech stack

- **Electron** (JS/TS — prefer TypeScript if not more friction than it's worth
  mid-hackathon; plain JS is fine if speed matters more)
- Frameless, transparent, always-on-top `BrowserWindow`
- Click-through on fully transparent pixels (`setIgnoreMouseEvents` with
  `forward: true`), so the pet doesn't block clicks on the rest of the desktop
  except where it's actually drawn

## CRITICAL: Claude never generates or edits image assets

The team is hand-drawing their own art for the sprite, stardust, and shop
items. **Claude Code must never generate, source, hallucinate, or edit any
image/art/sound asset itself** — no placeholder shapes drawn in lieu of real
art, no "temporary" SVG/canvas stand-ins, no icon generation. If a visual
element is needed and no asset exists yet for it, stop and ask rather than
drawing something as a substitute. This is a hard rule, not a style
preference.

Claude's job on the visual side is purely to write the code that loads,
positions, animates, and swaps between asset files the team supplies — never
to create the files themselves.

### Asset format

- **PNG with transparent background** for all sprite/character art
  (sprite, stardust, shop item previews) — standard for desktop-pet-style
  sprites sitting directly on the desktop with no background box
- One PNG file per animation frame (not one combined sprite sheet) — e.g.
  `idle_1.png`, `idle_2.png`, `walk_1.png`, `walk_2.png` — simpler to wire up
  and lets artists add/replace individual frames without re-cutting a sheet
- All frames of a given character/state share the **same canvas size** with
  the art centered (e.g. every sprite frame exactly 128×128px), so swapping
  frames during animation doesn't cause jitter or jumping
- Suggested folder convention: `assets/sprite/idle/`, `assets/sprite/walk/`,
  `assets/stardust/`, `assets/shop/<item-name>/` — mirrors the per-behavior
  code structure below
- SVG is fine only for simple flat UI chrome (e.g. shop panel icons/buttons)
  if the team wants it there — not for the character art itself
- If a sprite sheet turns out to be easier for an artist to produce than
  individual frames, that's fine — just flag it so the frame-slicing logic
  gets written accordingly

### Animation approach: PNG frames driven by code, not GIFs

Animate by cycling through the PNG frames in code (swap `<img>` src or
redraw to `<canvas>` on an interval/`requestAnimationFrame`) — **do not use
animated GIFs**. GIFs only support 1-bit transparency (no real alpha), which
causes jagged/haloed edges over an arbitrary desktop background, use a
256-color palette that bands hand-drawn shading, and can't be controlled
dynamically (pausing on hover, blending idle→walk, syncing to
events/behavior) or recolored for shop variants the way a code-driven PNG
sequence can.

## Scope for this build

In scope now:
- **Idle + walk**: roams freely anywhere on the screen (not limited to
  screen edges or the taskbar), with a simple idle-vs-walking state. Stays
  on screen, below a small top margin so its speech bubble isn't clipped and
  above the taskbar. When dragged and dropped, it stays where it's let go.
- **Cursor awareness**: reacts in some simple way to cursor proximity (e.g.
  "notices" you, follows briefly, flinches)
- **Speech bubbles / idle commentary**: pops up short text occasionally or on
  click
- **Harmless system reads**: reacting to things like clipboard contents
  changing, the active/focused window, battery level, time of day. Read-only
  only (see Scope Boundaries).
- **Click/drag interaction**: clickable, draggable across the screen
- **Stardust drops**: the sprite occasionally drops a stardust particle near
  itself; the user collects it by hovering their mouse over it (no click
  needed — just cursor proximity/overlap triggers pickup)
- **Stardust currency + persistence**: collected stardust accumulates as a
  simple counter that needs to persist across app restarts (local file or
  simple local storage is enough — no real backend)
- **Shop UI**: a window/panel where the user spends stardust to customize
  the sprite (e.g. swap its color, shape variant, accessory), using real
  hand-drawn PNG art the team supplies per item (see asset format above).
  Selecting a purchased item should visibly change the on-screen sprite by
  swapping in that item's asset files. Shop items are purely cosmetic —
  don't add items that affect gameplay/behavior (drop rate, speed, etc.)
  unless asked

Explicitly out of scope for now (don't build toward these unless asked):
- Any "helpful tool" functionality (that's a possible future direction, not
  this hackathon build)
- Any backend/networking/accounts — stardust and customization state are
  local-only
- Anything requiring real elevated/admin permissions

## Scope boundaries

The app must never:
- Request, elevate to, or check for admin/root privileges
- Write to, modify, or install anything outside its own app directory
- Touch other processes, system settings, or files beyond what's needed to
  run itself

It's fine to:
- **Read** harmless system/OS state: clipboard contents, active window
  title, battery status, idle time, system time — anything read-only that
  feeds a cute reaction
- Use normal Electron APIs for window management (that's not "system access"
  in the sense this rule cares about)

If a feature request would require a write/modify/elevate action, flag it
and ask rather than implementing it.

## Code conventions

- Keep it simple and demo-ready over "correct" — this is a hackathon, not
  production software
- Favor small, single-purpose files over one giant main process file;
  structure for adding new "behaviors" later (e.g. a `behaviors/` folder
  where idle/walk/cursor-react/speech-bubble each live somewhat
  independently)
- Comment non-obvious platform-specific quirks (click-through, always-on-top
  behavior differs across OSes) since those are the parts most likely to
  break silently

## Task assignments

Work is split between Person 1–4 in `TASKS.md`. When a teammate says who they are
("I'm person 2", "user 3") or names a task id ("P1-3"), read `TASKS.md` and follow
its "How Claude Code should use this file" section: do that person's tasks in order,
stay inside the files they own, and flag anything that touches another person's or a
shared file. Never commit; the human commits.
