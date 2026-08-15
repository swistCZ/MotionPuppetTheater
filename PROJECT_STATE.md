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

## 3. Active Task & Next Steps
* **Active Task:** Six-part rig + professional builder UI complete; preset cleanup, mild in-plane rotation, finger-splay limb spread, and the camera/model/freeze/theremin robustness fixes all shipped (build & 19 tests green). Character list is auto-generated (Vite plugin scans `public/characters/` for folders with a valid `config.json`; dev serves it live, build emits `index.json`). Waiting on user to re-cut the rabbit (and add dog, snail, etc.) into separate part files and assemble them via `/builder.html`.
* **Next Steps:**
  1. User prepares separate part images (body, head, arms, legs) and assembles them via the builder; either hit `Uložit do prohlížeče` (character appears instantly in the app's list for that browser) or drop the exported `config.json` into `public/characters/<id>/` for the shared, site-wide list (the Vite plugin regenerates `index.json` automatically). Characters with a missing `config.json` or missing part images are auto-removed from the list at runtime.
  2. Optional: two-bone IK (elbows/knees) so arms bend instead of rotating rigidly at the shoulder.
  3. Optional: tune `ROT_DAMP` / `ROT_ALPHA` and `spreadFactor` range after real-camera playtesting.

## 5. Roadmap: Stop-Motion Assistant Mode (`feat/stop-motion`)
* **Idea:** a separate mode (toggle in the main bar) turning the theater into a **stop-motion animation assistant** - pose a rig puppet, snap a frame, nudge it, snap again, then play back and export. Branch: `feat/stop-motion` (new, not started). Nothing below is implemented yet.
* **Phase 1 - Core mode:**
  * Mode toggle in the main control bar switching to a dedicated stop-motion UI layer (keeps the live theater untouched).
  * **Posing = combination of both:**
    * live hand tracking - a **clenched-fist gesture freezes** both motion and capture (reuses existing Motion Freeze);
    * **Snímek button** captures the current stage as a frame;
    * **manual fine-tuning** - drag rig part pivots directly on the stage with the mouse for precise poses.
  * Frame strip with thumbnails: select, delete, **duplicate**, reorder.
  * **Onion skin** (ghost of previous frame; configurable 1-3 ghosts).
* **Phase 2 - Playback & export (all three formats):**
  * Frame playback at selectable fps (12/24).
  * Export **WebM** (reuse `StageRecorder` during playback), **GIF**, and **PNG frames as ZIP**.
* **Phase 3 - Background (two independent choices):**
  * **Full-frame chroma key green** (uniform `#00B140`) so the whole image can be keyed out and composited into another scene/video.
  * **Long horizontal image strip** loaded by the user - a viewport window over it, panned manually via a slider or **auto-advancing a fixed step per captured frame** (parallax / camera-pan feel).
  * Background picker: strip | keyable green | (default).
* **Phase 4 - Props / connected chains (leaves as first use-case):**
  * Generic prop system: a chain of N connected, differently-sized elements (e.g. a garland of leaves) attached to the tracked hand point, with secondary flutter motion. Generalizable to ribbons, beads, branches, etc.
* **Additional ideas (deferred):**
  * Registration marks / grid overlay for aligning frames on top of each other (position/scale consistency).
  * **A/B flip** - quick toggle between the previous and current frame to spot small movements (stop-motion classic).
  * Undo/redo for frame delete/reorder actions.
  * **Theremin as the soundtrack of the exported video.**

## 4. Known Issues / Technical Debt / Blockers
* Builder exports data-URL images (self-contained single file, slightly larger JSON) - fine for dev; swap for file paths in `config.json` if bundle size matters.
* Rig arms rotate rigidly around the shoulder (simplified v1); no elbow/knee IK yet.
* Full-page manuscript scans include background clutter - prefer isolated single-figure crops when adding new characters.
* Puppet rotation is intentionally subtle and damped; a full 360° follow would require resolving the wrist→palm angle wrap against the container's smoothed rotation (out of scope).
* `multiHandedness.label` is still unused by the spatial-proximity hand matcher — kept that way deliberately so crossing recovery and screen-half assignment stay deterministic (covered by unit tests).