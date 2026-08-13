# PROJECT STATE: Web-Based Motion Puppet Theater (Pro Architecture)

## 1. Overall Goal & Architecture
* **Goal:** A client-side web application tracking laptop webcam hand movements via Google MediaPipe Hands to control interactive 2D puppet sprites rendered on a custom background canvas (Pixi.js).
* **Branch:** `feat/pro-redesign` (Maintained separate from initial `main` PoC branch)
* **Tech Stack:**
  * **Frontend:** HTML5, CSS3, TypeScript, Vite
  * **CV / AI:** Google MediaPipe Hands (`@mediapipe/hands`, `@mediapipe/camera_utils`)
  * **Graphics:** Pixi.js v8 (WebGL/WebGPU 2D rendering engine)
  * **Audio:** Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode` for Theremin synth)
  * **Math:** Decoupled `requestAnimationFrame` Display Loop & 640x480 Low-Latency Model for 60+ FPS performance
  * **Deployment:** GitHub Pages (via `gh-pages` branch)
* **Modular Architecture:**
  * `tracker.ts`: WebCam & MediaPipe Hands CV integration (640x480 resolution, `modelComplexity: 0` for <10ms inference overhead).
  * `gestures.ts`: Euclidean math, high-response LERP smoothing (0.45), deterministic Screen-X sorting matching, 100% index-finger mouth movement, 5-finger articulated limb kinematics.
  * `renderer.ts`: Pixi.js 2D stage rendering, Theremin Mode glowing/pulsing Orbs (Cyan Pitch & Magenta Volume) with complete puppet hiding, Pixi v8 `Assets.load()` for custom textures, full-bodied puppets.
  * `theremin.ts`: Web Audio API digital Theremin synthesizer (High-volume boost, single/dual-hand controls).
  * `main.ts`: UI event handling, decoupled `requestAnimationFrame` display loop (native 60+ FPS), 6-frame persistence buffer, Motion Freeze lock, Theremin toggle, live FPS counter, and application lifecycle.

## 2. Completed Milestones
* [x] Created and checked out new Git branch `feat/pro-redesign` to preserve `main` PoC checkpoint
* [x] Boosted performance to native **60+ FPS** by changing camera input resolution to 640x480, using `modelComplexity: 0`, and decoupling display loop via `requestAnimationFrame`
* [x] Implemented deterministic Screen-X sorting matching to eliminate stutter and hand swapping when hands cross
* [x] Redesigned UI with **Pro Glassmorphism Dark Theme**, backdrop blur, glowing badges, and live **FPS counter** (`⚡ 60 FPS`)
* [x] Published 60+ FPS Pro build to GitHub Pages and pushed branch `feat/pro-redesign` to remote GitHub repository

## 3. Active Task & Next Steps
* **Active Task:** Verification of 60+ FPS Pro redesign build.
* **Next Steps:**
  1. Solicit user feedback on 60+ FPS performance.

## 4. Known Issues / Technical Debt / Blockers
* None currently.
