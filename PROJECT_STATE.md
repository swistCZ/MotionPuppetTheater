# PROJECT STATE: Web-Based Motion Puppet Theater (Pro Architecture)

## 1. Overall Goal & Architecture
* **Goal:** A client-side web application tracking laptop webcam hand movements via Google MediaPipe Hands to control interactive 2D puppet sprites rendered on a custom background canvas (Pixi.js).
* **Branch:** `feat/pro-redesign` (Maintained separate from initial `main` PoC branch)
* **Tech Stack:**
  * **Frontend:** HTML5, CSS3, TypeScript, Vite
  * **CV / AI:** Google MediaPipe Hands (`@mediapipe/hands`, `@mediapipe/camera_utils`)
  * **Graphics:** Pixi.js v8 (WebGL/WebGPU 2D rendering engine)
  * **Audio:** Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode` for Theremin synth)
  * **Math:** LERP (Linear Interpolation) with Adaptive Low-pass Velocity Filtering & Spatial Proximity Assignment
  * **Deployment:** GitHub Pages (via `gh-pages` branch)
* **Modular Architecture:**
  * `tracker.ts`: WebCam & MediaPipe Hands CV integration.
  * `gestures.ts`: Euclidean math, Adaptive LERP smoothing, Outlier Jump Rejection (>250px step clamping), `matchDetectedHandsToPuppets` spatial proximity matching to eliminate hand swapping/teleportation.
  * `renderer.ts`: Pixi.js 2D stage rendering, Theremin Mode glowing/pulsing Orbs (Cyan Pitch & Magenta Volume), Pixi v8 `Assets.load()` for custom background and puppet textures.
  * `theremin.ts`: Web Audio API digital Theremin synthesizer (High-volume boost, single/dual-hand controls).
  * `main.ts`: UI event handling, Spatial Proximity Matching, 15-frame tracking persistence buffer, Motion Freeze lock, Theremin toggle, live FPS counter, and application lifecycle.

## 2. Completed Milestones
* [x] Created and checked out new Git branch `feat/pro-redesign` to preserve `main` PoC checkpoint
* [x] Implemented **Spatial Proximity Hand Tracking** (`matchDetectedHandsToPuppets`) to eliminate hand swapping and teleportation when hands cross or get close
* [x] Implemented **Outlier Jump Rejection & Adaptive LERP Filtering** in `gestures.ts` for rock-solid stability and zero erratic motion
* [x] Redesigned UI with **Pro Glassmorphism Dark Theme**, backdrop blur, glowing badges, and live **FPS counter** (`⚡ 60 FPS`)
* [x] Published Pro build to GitHub Pages and pushed branch `feat/pro-redesign` to remote GitHub repository

## 3. Active Task & Next Steps
* **Active Task:** Verification of Pro redesign build.
* **Next Steps:**
  1. Solicit user feedback on Spatial Proximity Tracking and Pro UI.

## 4. Known Issues / Technical Debt / Blockers
* None currently.
