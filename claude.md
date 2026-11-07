sprite.exe
A cute desktop companion ("desktop pet") built for a hackathon. The character concept is a little sprite / twinkle / star that hangs out on your screen and interacts with your desktop
Project status
Hackathon project, starting from an empty repo, with a ~24-36 hour build window. A team of 4 plus Claude Code is working on it. Priorities are a working, demo-able core loop over polish. It should be built in a way that's easy to extend later (more behaviors, maybe eventually "helpful tool" features), but right now the goal is: cute companion, not a utility.
Given the timeline, favor shipping something working over getting it "right" — but don't skip the placeholder-asset rule or the scope boundaries below to save time; those are non-negotiable, not polish.
Team conventions
4 people + Claude Code working in parallel on a tight deadline:
Keep PRs/commits small and focused on one feature area so people aren't stepping on each other's files
Favor the folder structure in "Code conventions" below so different people can own different behaviors (e.g. one person on stardust/shop, another on movement/idle, another on speech bubbles/system reads) without touching shared files unnecessarily
If a change would touch shared/core files (main process setup, window config, the persisted-state schema), flag it rather than just doing it — those are the most likely source of merge conflicts
Target platform
Windows only for this build. Don't spend time on macOS/Linux-specific window behavior (e.g. vibrancy, dock quirks) — test and tune for Windows only.
Tech stack
Electron (JS/TS — prefer TypeScript if not more friction than it's worth mid-hackathon; plain JS is fine if speed matters more)
Frameless, transparent, always-on-top BrowserWindow
Click-through on fully transparent pixels (setIgnoreMouseEvents with forward: true), so the pet doesn't block clicks on the rest of the desktop except where it's actually drawn
CRITICAL: Placeholder assets only
Do not generate, source, or hallucinate any real art/assets. No sprite sheets, no SVG illustrations, no "cute character" artwork, no sound files.
Instead:
The character is a rudimentary shape evoking a sprite/twinkle/star — e.g. a simple 4/5-pointed star or sparkle shape drawn with CSS clip-path or plain <canvas> primitives (path/arc/fill), or even just a diamond/plus shape as a stand-in. No detail, no shading, no gradients, no glow effects standing in for real art — a flat-colored shape is enough, maybe with simple eyes (two dots) so it reads as "a little guy."
Animation (idle bob/twinkle pulse, float/walk cycle, reactions) should be done with CSS transitions/transforms or canvas redraws on primitive shapes — not sprite frames.
Speech bubbles are plain HTML/CSS boxes with text, no illustrated bubble art.
Stardust particles are a tiny flat-colored dot/diamond — no sparkle textures or particle-effect art. Shop customization options (colors, shape variants, accessories) are likewise represented as plain colored swatches/shapes, not illustrated items.
If a real asset is genuinely unavoidable (e.g. an app icon for packaging), stop and ask rather than generating or fetching one.
This is a hard rule, not a style preference — don't quietly "improve" the placeholders into something fancier as the project goes on.
Scope for this build
In scope now:
Idle + walk: wanders along screen edges / taskbar area, simple idle-vs-walking state
Cursor awareness: reacts in some simple way to cursor proximity (e.g. "notices" you, follows briefly, flinches)
Speech bubbles / idle commentary: pops up short text occasionally or on click
Harmless system reads: reacting to things like clipboard contents changing, the active/focused window, battery level, time of day. Read-only only (see Scope Boundaries).
Click/drag interaction: clickable, draggable across the screen
Stardust drops: the sprite occasionally drops a stardust particle near itself; the user collects it by hovering their mouse over it (no click needed — just cursor proximity/overlap triggers pickup)
Stardust currency + persistence: collected stardust accumulates as a simple counter that needs to persist across app restarts (local file or simple local storage is enough — no real backend)
Shop UI: a window/panel where the user spends stardust to customize the sprite (e.g. swap its color, shape variant, accessory). Shop items are themselves placeholder shapes/colors per the asset rule below — not real art — but should be wired up for real: selecting a purchased item should visibly change the on-screen sprite. Shop items are purely cosmetic — don't add items that affect gameplay/behavior (drop rate, speed, etc.) unless asked
Explicitly out of scope for now (don't build toward these unless asked):
Any "helpful tool" functionality (that's a possible future direction, not this hackathon build)
Any backend/networking/accounts — stardust and customization state are local-only
Anything requiring real elevated/admin permissions
Scope boundaries (important, name notwithstanding)
The app must never:
Request, elevate to, or check for admin/root privileges
Write to, modify, or install anything outside its own app directory
Touch other processes, system settings, or files beyond what's needed to run itself
It's fine to:
Read harmless system/OS state: clipboard contents, active window title, battery status, idle time, system time — anything read-only that feeds a cute reaction
Use normal Electron APIs for window management (that's not "system access" in the sense this rule cares about)
If a feature request would require a write/modify/elevate action, flag it and ask rather than implementing it.
Code conventions
Keep it simple and demo-ready over "correct" — this is a hackathon, not production software
Favor small, single-purpose files over one giant main process file; structure for adding new "behaviors" later (e.g. a behaviors/ folder where idle/walk/cursor-react/speech-bubble each live somewhat independently)
Comment non-obvious platform-specific quirks (click-through, always-on-top behavior differs across OSes) since those are the parts most likely to break silently
