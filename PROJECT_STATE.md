# PROJECT STATE: Web-Based Motion Puppet Theater (Pro Architecture)

## 1. Overall Goal & Architecture
* **Goal:** A client-side web application tracking laptop webcam hand movements via Google MediaPipe Hands to control interactive 2D puppet sprites rendered on a custom background canvas (Pixi.js).
* **Branch:** `feat/pro-redesign`, `main`, & `feat/stop-motion`
* **Tech Stack:**
  * **Frontend:** HTML5, CSS3, TypeScript, Vite
  * **CV / AI:** Google MediaPipe Hands (`@mediapipe/hands`) with same-origin WASM bundling (`public/mediapipe/`)
  * **Graphics:** Pixi.js v8 (WebGL/WebGPU 2D rendering engine with universal WebGL fallback)
  * **Audio:** Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode` for Theremin synth)
  * **Recording:** `MediaRecorder` API & Canvas `captureStream(60)` for direct MP4/WebM video download
  * **Math:** Decoupled `requestAnimationFrame` Display Loop & 640x480 Low-Latency Model for 60+ FPS performance
  * **Deployment:** GitHub Pages (via `gh-pages` branch)
* **Modular Architecture:**
  * `tracker.ts`: WebCam & MediaPipe Hands CV integration (Intermediate offscreen frame canvas buffer, absolute same-origin WASM URL resolution).
  * `gestures.ts`: Euclidean math, high-response LERP smoothing (0.45), **true Spatial Proximity hand matching** (no swapping/teleporting), 100% index-finger mouth movement, 5-finger articulated limb kinematics.
  * `renderer.ts`: Pixi.js 2D stage rendering, Theremin Mode glowing/pulsing Orbs, **sprite-based cut-out rig rendering** (`rig:` presets) alongside procedural presets.
  * `rig.ts`: Pure cut-out rig model (config types, `validateRigConfig`, `armRotation`) - unit testable without Pixi.
  * `rigAssets.ts`: Rig asset loading (config fetch, per-part image loading, optional background removal, sprite hierarchy build).
  * `builder.html` + `builder.ts`: **Rig builder page** (`/builder.html`) - upload body/left/right arm files, click-to-place shoulders & pivots, rest-angle + swing preview, **import/export of `config.json`** (images embedded as data URLs, relative paths fetched on import).
  * `simulator.ts`: Camera-free hand simulator - body follows the mouse (no idle demo drift; it stays put when the mouse rests), arms wave around the shoulders; used to verify rigs without a webcam.
  * `theremin.ts`: Web Audio API digital Theremin synthesizer with `MediaStreamAudioDestinationNode` output.
  * `recorder.ts`: `StageRecorder` module for capturing 60 FPS stage video + Theremin soundtrack with live `REC` timer and direct video file download.
  * `main.ts`: UI event handling, decoupled `requestAnimationFrame` display loop, persistence buffers, Motion Freeze, Theremin toggle, Recording, FPS counter, rig character menu population, app lifecycle.

## 2. Completed Milestones
* [x] Created and checked out new Git branch `feat/pro-redesign` to preserve `main` PoC checkpoint
* [x] Implemented **Stage Video Recording (`src/recorder.ts`)**: 60 FPS canvas capture + Theremin audio mixing with direct video download
* [x] Bundled MediaPipe WASM and solution data locally in `public/mediapipe/` for cross-browser compatibility
* [x] **Fixed hand swapping**: `matchDetectedHandsToPuppets` now uses real Spatial Proximity matching against previous slot positions (with X-sort fallback). Unit tested (crossing recovery, single-hand continuity).
* [x] **Cut-out rig subsystem (v3, six-part model)**: sprite rigs where body follows the palm and **each part (head, arms, legs) is independently movable or static** (`parts.*.movable` flag). Arms rotate at the shoulders, legs swing opposite to the same-side arm (walking look), head bobs with the average arm swing. Each character = separate body / head / left arm / right arm / left leg / right leg images. Config JSON per character, optional background removal per part, arm/leg rotation kinematics (`armRotation`).
* [x] **Demo rig character** (`public/characters/demo/`): body + head + two arm + two leg SVG files proving the full six-part rig end-to-end.
* [x] **Rig builder** (`Builder` / `/builder.html`): uploads up to six parts (body required + arms; head/legs optional), per-part **Pohyblivá / Statická** toggle, auto-guessed shoulders/neck/hips/pivots, click-to-place joints on previews, rest-angle & swing preview, imports/exports a self-contained `config.json` (images embedded as data URLs) or saves it straight into the browser's localStorage (`Uložit do prohlížeče`) - the single supported way to add characters. Browser-local characters show up under `Uložené v prohlížeči` in the app's selects.
* [x] **Historical rabbit** (`public/characters/rabbit/rabbit.png`): BL Stowe MS17 f191v (public domain), kept as reference material until user re-cuts it into separate parts.
* [x] **Hand simulator without webcam** (`Simulace` button or `?sim=1`): body follows the mouse, arms wave automatically - verifies rigs on machines with no camera. Idle no longer drifts the puppet (idle demo path removed - body parks where the mouse rests).
* [x] **Simulator limbs move independently**: each arm/leg now has its own sine (frequency/amplitude/phase) instead of being a mirrored copy of the sibling limb - closer to real finger-driven tracking and no longer looks like a single motion pasted to both sides.
* [x] **Palm-width limb scaling**: limb reach is now derived from the palm width (`limbScale(palmWidth)`, lm5-lm17 distance) instead of a fixed `scale = 250`, so puppet gestures stay consistent regardless of hand distance from the camera. Clamped (`70..500`) and falls back to the base scale for degenerate palms; direction is unchanged so rig `armRotation` is unaffected. Unit tested (21 tests).
* [x] Unit tests for proximity matching and rig math (`armRotation`, `validateRigConfig`) - 17 tests passing.
* [x] **Professional UI polish**: emojis removed from the main control bar, selects, builder and status text; uniform 32px control heights (buttons / selects / uploads); rebuilt builder page with consistent GitHub-dark design tokens, dropzone tiles, switch toggles and grouped joint modes.
* [x] **Unused preset cleanup**: removed the unreachable procedural presets (dragon, bunny, cat) — `PuppetPreset` is now `'fox' | 'robot' | 'custom' | 'none' | rig`; Theremin orb labels de-emojified (`"440 Hz"` / `"50 %"`).
* [x] **Mild in-plane puppet rotation**: `rotation` (wrist→palm angle) is now used — upright hand maps to 0°, EMA-smoothed via `shortestAngleDelta` and damped (`ROT_DAMP = 0.35`) so the flat sprite only leans (it can never foreshorten to a line; that would require 3D rotation).
* [x] **Finger-splay limb spread**: `spreadFactor(splay)` amplifies the swing/limb reach (fist = 0.7x tucked in, spread = 1.5x) and drives an A-frame leg stance (±0.35 rad per leg) — applied to both procedural puppets and cut-out rigs.
* [x] **Camera/model error handling**: `tracker.start()` now resolves a `boolean` so the error banner is no longer instantly hidden by `hideStatus()`; a `try/catch` in the UI prevents a stuck "Zastavit" button when MediaPipe init fails; `initialize()` probes each source (`fetch(.../hands.js, HEAD)`) and the processing loop falls back to the next source after 60 consecutive `send()` failures.
* [x] **Motion Freeze honored everywhere**: freeze is enforced inside `PuppetRenderer.updateHandState` (via `setFrozen`), so it now also locks puppets while the hand simulator is driving them.
* [x] **Theremin full stop**: toggling off ramps the gain, then stops the oscillator and disconnects the gain graph + stream destination; the next toggle rebuilds the nodes.
* [x] **Stop-motion polish pass** (branch `feat/stop-motion`): middle-finger camera zoom, two-layer strip parallax, custom background color, loop/reverse playback, registration grid, A/B flip, undo/redo, Theremin soundtrack in WebM export, onion ghost count 1-3, Space = snap, clear-all. 25 unit tests green.
* [x] **In-app manual** (`Nápověda` button): modal with sections for hand control (finger-to-limb map), main toolbar, stop-motion gestures & timeline, backgrounds, export and the builder; closes via button, backdrop click or Esc.
* [x] **Stop-motion UX rework** (feedback pass): puppets now appear at default resting positions immediately on mode entry (never-tracked slots get a synthetic neutral pose so all limbs render); an onboarding hint stays on the stage until the first frame is snapped; the duplicated top-bar "Scéna" background group is hidden while the mode is active so the bottom panel is the single place for background controls.
* [x] **Stop-motion frame-composition fixes** (second feedback pass): (1) the onion-skin ghost was layered *behind* the opaque Pixi canvas (never visible) - moved above the stage so the previous frame is actually shown as a reference while posing; (2) manual drag placement was instantly overwritten by live hand tracking - added a **Ruka** (hand-follow) toggle: off = puppets stop following hands and stay where dragged, so the user sees the exact final composition and can adjust it before snapping.
* [x] **Mouse control for ALL puppets** (third feedback pass): mouse drag now works on the procedural puppets too (fox/robot/custom), not only builder rigs - grab the body to move the whole puppet, grab head/arms/legs to pose individual parts, using zoom-corrected world-space conversion. A real hand frame clears the manual overrides; with **Ruka** off the camera cannot move or hide a manually placed puppet. Puppets also stay on stage in stop-motion even when a hand leaves the frame (hideHand is disabled in the mode) so the user can always see and frame the puppet before snapping.

## 3. Active Task & Next Steps
* **Active Task:** Six-part rig + professional builder UI complete; preset cleanup, mild in-plane rotation, finger-splay limb spread, and the camera/model/freeze/theremin robustness fixes all shipped (build & 19 tests green). Character list is auto-generated (Vite plugin scans `public/characters/` for folders with a valid `config.json`; dev serves it live, build emits `index.json`). Waiting on user to re-cut the rabbit (and add dog, snail, etc.) into separate part files and assemble them via `/builder.html`.
* **Next Steps:**
  1. User prepares separate part images (body, head, arms, legs) and assembles them via the builder; either hit `Uložit do prohlížeče` (character appears instantly in the app's list for that browser) or drop the exported `config.json` into `public/characters/<id>/` for the shared, site-wide list (the Vite plugin regenerates `index.json` automatically). Characters with a missing `config.json` or missing part images are auto-removed from the list at runtime.
  2. Optional: two-bone IK (elbows/knees) so arms bend instead of rotating rigidly at the shoulder.
  3. Optional: tune `ROT_DAMP` / `ROT_ALPHA` and `spreadFactor` range after real-camera playtesting.

## 5. Roadmap: Stop-Motion Assistant Mode (`feat/stop-motion`)
* **Idea:** a separate mode (toggle in the main bar) turning the theater into a **stop-motion animation assistant** - pose a rig puppet, snap a frame, nudge it, snap again, then play back and export. Branch: `feat/stop-motion` (new, not started). Nothing below is implemented yet.
* **Phase 1 - Core mode (DONE):**
  * [x] Mode toggle (`Stop-motion` button in the main bar) showing the stop-motion timeline panel; live theater controls stay untouched. Exit restores the freeze state.
  * [x] **Posing = combination of both:**
    * [x] live hand tracking - a **clenched-fist gesture freezes** motion (`fistFactor` metric, threshold 0.6, drives the existing Motion Freeze);
    * [x] **Snímek button** captures the current stage as a PNG frame;
    * [x] **manual fine-tuning** - drag rig part pivots directly on the stage with the mouse (Pixi `eventMode`; arms/legs/head rotate around their joint, body moves the whole puppet; movable respects the config flag; auto pose update is suspended while a part is dragged).
  * [x] Frame strip with thumbnails: select, delete, **duplicate**, reorder (&larr;/&rarr;).
  * [x] **Onion skin** (ghost of the selected frame at 40% alpha behind the live stage; toggle button).
* **Phase 2 - Playback & export (DONE, all three formats):**
  * [x] Frame playback at selectable fps (12/24).
  * [x] Export **WebM/MP4** (MediaRecorder + `captureStream(0)`/`requestFrame()` on the playback overlay, records at the selected fps),
  * [x] Export **GIF** (via `gifenc`; frames quantized to 256 colors, capped at 1280px wide, per-frame delay from the fps),
  * [x] Export **PNG frames as ZIP** (via `fflate`; original-resolution PNGs).
* **Phase 3 - Background (DONE, two independent choices):**
  * [x] **Full-frame chroma key green** (uniform `#00B140`, `Zelená` button) so the whole image can be keyed out and composited into another scene/video.
  * [x] **Long horizontal image strip** (`Pruh` upload) rendered as a TilingSprite behind the puppets - a viewport window is visible, panned by a **manual slider** or **auto-advancing a fixed step per captured frame** (`Krok` input, applied after each Snímek via `onAfterSnap`).
  * [x] Background reset (`Výchozí`) restores the default solid color.
* **Phase 4 - Props / connected chains (DONE, leaves as first use-case):**
  * [x] Generic **chain prop** (`src/chainProp.ts`): N connected leaves attached to the tracked hand point. Verlet physics give gravity + inertia (secondary motion), each leaf flutters with a phase-shifted sine, and leaves come in varying sizes. `Listí` button toggles it in the stop-motion panel; the chain anchors to the left (or right) hand. Generalizable to ribbons, beads, branches (swap the generated leaf texture / tune `DEFAULT_CHAIN_CONFIG`).
* **Phase 5 - Camera moves, layered backgrounds & playback polish (DONE):**
  * [x] **Middle-finger camera zoom**: `middleFingerFactor` gesture (middle tip extended while index/ring/pinky curl, normalized by palm width; unit tested). In stop-motion mode the factor smoothly zooms the world layer (puppets, theremin orbs, chain prop) up to 1.6x around the stage center - backgrounds stay fullscreen so zooming never exposes edge gaps (new `worldContainer`).
  * [x] **Two-layer strip parallax**: a second, "near" strip (`Pruh 2`) pans on top of the far one; its offset = far offset x a configurable **Paralaxa** factor (default 1.6) for a depth illusion. Slider / `Krok` drive both layers together.
  * [x] **Custom background color**: native color picker (`Barva`) for any solid backdrop alongside the chroma-green preset.
  * [x] **Playback polish**: `Opakovat` (loop on/off) and `Zpětně` (reverse playback) toggles; with loop off the playback stops at the end instead of wrapping.
* **Additional ideas (all implemented in this pass):**
  * [x] **Registration grid overlay** (`Mřížka`): light grid lines every 96px + center crosshair for aligning frames on top of each other (position/scale consistency).
  * [x] **A/B flip** (`A/B`): toggles between the live scene and the selected frame to spot small movements (stop-motion classic).
  * [x] **Undo/redo** (`Zpět`/`Znovu`) for all timeline edits (snap, delete, duplicate, reorder, clear) - snapshot history capped at 50 steps.
  * [x] **Theremin as the soundtrack of the exported video**: when the Theremin is enabled, its `MediaStreamAudioDestinationNode` is mixed into the WebM/MP4 recording (recorded live during export).
  * [x] **Configurable onion-skin ghosts** (`Duchů` 1-3): the last N frames ending at the reference frame, newest most opaque.
  * [x] **Space bar = Snímek** shortcut (capture-phase keydown; ignored while exporting/playing).
  * [x] **Clear all** (`Vše`) button to wipe the whole timeline.
  * [x] Onion skin auto-enables when entering stop-motion mode.

## 4. Known Issues / Technical Debt / Blockers
* **Stop-motion thumbnail image preview (RESOLVED):**
  * *Příznak:* Na časové ose přibývají rámečky snímků, funguje jejich výběr, drag & drop, načtení pózy i přepsání, ale uvnitř náhledových rámečků se nezobrazoval obsah snímku (černý / prázdný).
  * *Skutečná příčina (bez vazby na WebGL/GPU):* Commit `903ccd0` (přidání drag & drop na časovou osu) omylem smazal `thumb.appendChild(img)` a `thumb.appendChild(label)` ve `renderStrip()`. Rámeček tak byl prázdný `<div>` s tmavým pozadím `rgba(0,0,0,0.4)`. Capture pipeline (`toDataURL`/`extract`) generoval vždy validní PNG – reprodukováno headless Chromium + Edge (všechny WebGL backendy).
  * *Oprava:* Chybějící `appendChild` pro `img` (náhled) a `label` (číslo snímku) znovu přidány do `renderStrip()` (`src/stopMotion.ts`). Ověřeno programově: rámečky obsahují dekódovaný `<img>` a číslo snímku; build + 25 testů zelených.
* **Hand tracking stops in normal mode after a stop-motion session (RESOLVED):**
  * *Příznak:* Po práci ve stop-motion přestanou loutky v normálním módu reagovat na ruce (i po restartu kamery); loutky zůstanou zmražené / nehybné – působí to jako regrese trackingu.
  * *Skutečná příčina:* Přepínač **Ruka** (hand-follow, `PuppetRenderer.handFollowEnabled`) je stav scény stop-motion, který se ukládá do rendereru a *nikde se neresetoval*. Uživatel ho v stop-motion vypnul (což doporučuje i onboarding hint „vypni Ruka"), pak z módu odešel – a `handFollowEnabled` zůstal `false`. V normálním módu tak `updateHandState()` i `hideHand()` začaly okamžitě returnovat a kamera loutky nikdy nepohybovala.
  * *Oprava:* Při výstupu ze stop-motion se `handFollowEnabled` resetuje na `true` (default) a tlačítko **Ruka** se při každém vstupu do módu synchronizuje s reálným stavem. Ověřeno headless Chromium: po výstupu ze stop-motion s vypnutou Ruka znovu funguje ovládání; build + 25 testů zelených.
* **Puppet drifts off the hand when the stop-motion camera is zoomed (RESOLVED):**
  * *Příznak:* Při ovládání rukou ve stop-motion se zoomem (middle-finger gesto) loutky, řetěz a theremin orbíky neseděly na dlani – čím větší zoom, tím více se zobrazovaná pozice posouvala směrem ke středu scény.
  * *Skutečná příčina:* Loutky/řetěz/orby leží ve `worldContainer`, který je při zoomu škálovaný okolo středu (`position == pivot == center`, `scale = zoom`), ale `updateHandState`, `updateChain` a `updateThereminVisuals` jim nastavovaly pozici přímo ze `smoothedPosition` ve *stage* pixelech. Při zoom=1 to je identita, ale při zoom>1 se ručně-ovládaný objekt objevil mimo ruku.
  * *Oprava:* Nová pomocná metoda `toWorldLocal()` (`renderer.ts`) převádí stage souřadnici do lokálního prostoru `worldContainer` (`worldContainer.toLocal(...)`) a používá se pro pozici loutky, kotvu řetězu i theremin orbíky/texty. Při zoom=1 beze změny chování. Ověřeno headless Chromium (zoom 1.5 → loutka sedí přesně na ruce); build + 25 testů zelených.
* **Twisted / crossed puppet limbs with a vertical open palm (RESOLVED):**
  * *Příznak:* Dlaň kolmo ke kameře, prsty natažené a lehce roztažené → figurky měly zkroucené paže a nohy; demo loutka překřížené nohy. Při natáčení prstů vzhůru mířily končetiny nahoru, a protože palec/pinky sedí při dané ruce na opačných stranách, ruce i nohy se křížily.
  * *Skutečná příčina:* Končetiny se počítaly jako *hrubý rozdíl* (koneček prstu − střed dlaně) v obrazových souřadnicích. U svislé dlaně jsou všechny konečky nad dlaní → končetiny mířily vzhůru; rozložení prstů pak určovalo křížení (nebrala se v úvahu handedness ruky).
  * *Oprava:* `processHandLandmarks` (`gestures.ts`) nyní počítá končetiny v **lokálním rámci ruky** – osa `fwd` (podél prstů) a `side` (k levé straně loutky; pro levou ruku pinky, pro pravou palec, po X-mirroru). Paže/nohy používají jen *across* složku → visí přirozeně po stranách, hlava jde vzhůru (index). Čtyři prsty končetin jsou seřazené podle polohy zleva → paže a nohy se nikdy nekříží (funguje pro obě ruce a libovolnou rotaci). Přidány 4 unit testy; build + 29 testů zelených.
* **Stop-motion hand control freezes permanently after a fist pose (RESOLVED):**
  * *Příznak:* Ve stop-motion se zapnutým ovládáním rukou (Ruka ZAP) figurky po zavření pěsti přestaly reagovat úplně – ani po otevření ruky se póza neodemkla.
  * *Skutečná příčina:* `updateHandState` při `isFrozen` vracel *před* uložením `lastLeftState`/`lastRightState`. Display loop četl fistFactor ze zastaralého stavu (pěst), takže `fistHeld` zůstal `true` a freeze se nikdy neuvolnil – pozice se neaktualizovala navždy.
  * *Oprava:* `updateHandState` (`renderer.ts`) ukládá `lastLeftState`/`lastRightState` vždy (gesta pěsti/zoomu tak dostávají čerstvá data i při zamrznutí či vypnuté Ruka), jen pohyb loutky zůstává gated. Ověřeno headless Chromium: pěst → freeze, otevření → odemčení a loutka opět sleduje ruku; build + 29 testů zelených.
* Builder exports data-URL images (self-contained single file, slightly larger JSON) - fine for dev; swap for file paths in `config.json` if bundle size matters.
* Rig arms rotate rigidly around the shoulder (simplified v1); no elbow/knee IK yet.
* Full-page manuscript scans include background clutter - prefer isolated single-figure crops when adding new characters.
* Puppet rotation is intentionally subtle and damped; a full 360° follow would require resolving the wrist→palm angle wrap against the container's smoothed rotation (out of scope).
* `multiHandedness.label` is still unused by the spatial-proximity hand matcher — kept that way deliberately so crossing recovery and screen-half assignment stay deterministic (covered by unit tests).

## 5. Backlog / Plánované funkce (TODO)
* [ ] **Multi-puppet support (více než 2 figurky na scéně):**
  * Při ovládání myší / stop-motion možnost přidat na scénu libovolný počet figurek (L1, L2, L3, ...).
  * Možnost jednotlivé figurky ze scény odebírat / mazat.
  * Dynamické UI pro správu figurek na scéně (výběr presetů, z-order / vrstvy pořadí figurek, focus na aktivní loutku).