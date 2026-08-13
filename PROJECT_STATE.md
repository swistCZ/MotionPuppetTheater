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
  * `gestures.ts`: Euclidean math, high-response LERP smoothing (0.45), deterministic Screen-X sorting matching, 100% index-finger mouth movement, 5-finger articulated limb kinematics.
  * `renderer.ts`: Pixi.js 2D stage rendering, Theremin Mode glowing/pulsing Orbs (Cyan Pitch & Magenta Volume), Pixi v8 `Assets.load()`.
  * `theremin.ts`: Web Audio API digital Theremin synthesizer with `MediaStreamAudioDestinationNode` output.
  * `recorder.ts`: `StageRecorder` module for capturing 60 FPS stage video + Theremin soundtrack with live `🔴 REC` timer and direct video file download to disk.
  * `main.ts`: UI event handling, decoupled `requestAnimationFrame` display loop (native 60+ FPS), 6-frame persistence buffer, Motion Freeze lock, Theremin toggle, Video Recording controls, live FPS counter, and application lifecycle.

## 2. Completed Milestones
* [x] Created and checked out new Git branch `feat/pro-redesign` to preserve `main` PoC checkpoint
* [x] Implemented **Stage Video Recording (`src/recorder.ts`)**: 60 FPS canvas capture + Theremin audio mixing with direct video download to user's disk
* [x] Added live **`🔴 REC 00:00`** pulsating timer badge and Record toggle button (`btn-record`)
* [x] Implemented intermediate offscreen frame canvas buffer in `src/tracker.ts` to bypass DuckDuckGo Browser & Safari video hardware acceleration restrictions
* [x] Bundled MediaPipe WASM and solution data files locally in `public/mediapipe/` for **100% DuckDuckGo Privacy Browser & Brave compatibility**
* [x] Published 60+ FPS DuckDuckGo-compatible Pro build with Video Recording to GitHub Pages

## 3. Active Task & Next Steps
* **Active Task:** Verification of video recording feature.
* **Next Steps:**
  1. Solicit final user feedback on stage video recording.

## 4. Known Issues / Technical Debt / Blockers
* None currently.
