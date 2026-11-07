# sprite.exe

A tiny star that lives on your (Windows) desktop. Hackathon build, so see `claude.md` for scope and rules
(placeholder assets only, read-only system access).

## Run

```
npm install
npm start
```

Right-click the star → **Open shop** / **Quit**.

> Troubleshooting: if `app` is `undefined` on launch, your shell has `ELECTRON_RUN_AS_NODE=1` set
> (some editor-integrated terminals do this). Unset it and run again.

## Layout

```
src/
  main/                     Electron main process (Node)
    main.js                 entry: wires everything together            [CORE: flag before editing]
    store.js                persisted state → %APPDATA%/sprite-exe/state.json
    ipc.js                  all ipcMain handlers (stardust, shop, click-through, context menu)
    windows/
      petWindow.js          fullscreen transparent overlay + click-through   [CORE]
      shopWindow.js         normal shop window
    systemReads/            READ-ONLY system reads → 'system:event' to the pet
      clipboard.js idle.js power.js timeOfDay.js
      activeWindow.js       TODO (needs a native module or similar)
  preload/preload.js        the `window.sprite` API that renderers use
  shared/                   used by main process
    stateSchema.js          persisted-state shape + migration           [CORE]
    shopCatalog.js          shop items (colors / shapes / accessories)
  renderer/
    shared/sprite.js        draws the star with canvas primitives (used by pet + shop)
    pet/
      pet.js                builds `ctx`, runs the frame loop, renders
      clickThrough.js       toggles click-through when hovering `.hit` elements
      bubble.js             speech bubble UI (behaviors call ctx.say)
      behaviors/            one file per behavior, registered in behaviors/index.js
        idle.js walk.js drag.js cursorReact.js speech.js stardust.js systemReactions.js
    shop/                   shop window UI
```

## How it fits together

- **One overlay window.** The pet window covers the whole primary display, is transparent and click-through.
  The sprite, bubble and stardust are DOM elements moving inside it. When the cursor is over the sprite
  (`.hit`), click-through turns off so you can click or drag it.
- **Behaviors** are small modules with `init(ctx)` / `update(ctx, dt)`. They coordinate through
  `ctx.pet.mode` (`idle` | `walk` | `drag` | `fall`). To add one: create a file in `behaviors/` and add it to
  `behaviors/index.js`.
- **State** (stardust, owned items, equipped items) lives only in the main process. Renderers change it through
  `window.sprite.*`, and every window gets `state:changed` after each update. That's how equipping in the shop
  changes the on-screen sprite right away.
- **Shop items** are data in `shopCatalog.js`. A new color is a single entry. A new shape or accessory also needs
  a drawing function in `renderer/shared/sprite.js`, using flat primitives only.

## Suggested ownership (to avoid merge conflicts)

| Area | Files |
|---|---|
| Movement / idle / drag | `renderer/pet/behaviors/{idle,walk,drag}.js` |
| Cursor + speech | `behaviors/{cursorReact,speech}.js`, `bubble.js` |
| Stardust + shop | `behaviors/stardust.js`, `renderer/shop/*`, `shared/shopCatalog.js`, `renderer/shared/sprite.js` |
| System reads | `main/systemReads/*`, `behaviors/systemReactions.js` |

Core files (`main.js`, `windows/petWindow.js`, `shared/stateSchema.js`, `preload.js` channel names): flag before
changing them.
