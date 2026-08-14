# PROJECT STATE: Web-Based Motion Puppet Theater (Pro Architecture)

## 1. Overall Goal & Architecture
* **Goal:** A client-side web application tracking laptop webcam hand movements via Google MediaPipe Hands to control interactive 2D puppet sprites rendered on a custom background canvas (Pixi.js).
* **Branch:** `feat/pro-redesign` & `main`
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
  * `simulator.ts`: Camera-free hand simulator - body follows the mouse (or an idle demo path), arms wave around the shoulders; used to verify rigs without a webcam.
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
* [x] **Hand simulator without webcam** (`Simulace` button or `?sim=1`): body follows the mouse (or idle demo path), arms wave automatically - verifies rigs on machines with no camera.
* [x] Unit tests for proximity matching and rig math (`armRotation`, `validateRigConfig`) - 17 tests passing.
* [x] **Professional UI polish**: emojis removed from the main control bar, selects, builder and status text; uniform 32px control heights (buttons / selects / uploads); rebuilt builder page with consistent GitHub-dark design tokens, dropzone tiles, switch toggles and grouped joint modes.

## 3. Active Task & Next Steps
* **Active Task:** Six-part rig (head + arms + legs, each movable/static) and professional builder UI complete (build & 17 tests green). Character list is auto-generated (Vite plugin scans `public/characters/` for folders with a valid `config.json`; dev serves it live, build emits `index.json`). Waiting on user to re-cut the rabbit (and add dog, snail, etc.) into separate part files and assemble them via `/builder.html`.
* **Next Steps:**
  1. User prepares separate part images (body, head, arms, legs) and assembles them via the builder; either hit `Uložit do prohlížeče` (character appears instantly in the app's list for that browser) or drop the exported `config.json` into `public/characters/<id>/` for the shared, site-wide list (the Vite plugin regenerates `index.json` automatically). Characters with a missing `config.json` or missing part images are auto-removed from the list at runtime.
  2. Optional: two-bone IK (elbows/knees) so arms bend instead of rotating rigidly at the shoulder.

## 4. Known Issues / Technical Debt / Blockers
* Builder exports data-URL images (self-contained single file, slightly larger JSON) - fine for dev; swap for file paths in `config.json` if bundle size matters.
* Rig arms rotate rigidly around the shoulder (simplified v1); no elbow/knee IK yet.
* Full-page manuscript scans include background clutter - prefer isolated single-figure crops when adding new characters.