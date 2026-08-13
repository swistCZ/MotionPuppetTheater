# PROJECT STATE: Web-Based Motion Puppet Theater (PoC)

## 1. Overall Goal & Architecture
* **Goal:** A client-side web application tracking laptop webcam hand movements via Google MediaPipe Hands to control interactive 2D puppet sprites rendered on a custom background canvas (Pixi.js).
* **Tech Stack:**
  * **Frontend:** HTML5, CSS3, TypeScript, Vite
  * **CV / AI:** Google MediaPipe Hands (`@mediapipe/hands`, `@mediapipe/camera_utils`)
  * **Graphics:** Pixi.js v8 (WebGL/WebGPU 2D rendering engine)
  * **Audio:** Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode` for Theremin synth)
  * **Math:** LERP (Linear Interpolation) for jitter-free hand coordinate mapping
  * **Deployment:** GitHub Pages (via `gh-pages` branch)
* **Modular Architecture:**
  * `tracker.ts`: WebCam & MediaPipe Hands CV integration.
  * `gestures.ts`: Euclidean math, LERP smoothing, mirrored X coordinates, index finger mouth movement, and 5-finger articulated limb kinematics.
  * `renderer.ts`: Pixi.js 2D stage rendering, Theremin Mode glowing/pulsing Orbs (Cyan Pitch & Magenta Volume), Pixi v8 `Assets.load()` for custom textures, full-bodied puppets.
  * `theremin.ts`: Web Audio API digital Theremin synthesizer (High-volume boost, single/dual-hand controls).
  * `main.ts`: UI event handling, 15-frame tracking persistence buffer to prevent flickering, Motion Freeze lock, Theremin toggle, FileReader base64 DataURL image decoding, and application lifecycle.

## 2. Completed Milestones
* [x] Environment & Superpowers Setup (Node.js, npm, ripgrep, gh CLI, OpenCode Skills, MCP configuration)
* [x] Git Repository Initialization & `.gitignore` configuration
* [x] Scaffolded Vite + TypeScript structure with `pixi.js`, `@mediapipe/hands`, `@mediapipe/camera_utils`, `vitest`
* [x] Implemented `gestures.ts` with unit tests for LERP, rotation, mirrored X coordinates, and 5-finger limb kinematics
* [x] Implemented `tracker.ts` for camera stream and MediaPipe Hands tracking
* [x] Replaced eye winking with direct index finger mouth/jaw opening movement
* [x] Added **Theremin Mode Visual Orbs**: Glowing cyan & magenta pulsating circles with live frequency Hz and volume % labels
* [x] Fixed custom background image loading bug via `FileReader.readAsDataURL` + Pixi v8 `Assets.load`
* [x] Published live build to GitHub Pages

## 3. Active Task & Next Steps
* **Active Task:** Verification of updated application.
* **Next Steps:**
  1. Solicit final user feedback on Theremin Orbs and index finger mouth movement.

## 4. Known Issues / Technical Debt / Blockers
* None currently.
