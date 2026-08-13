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
  * `gestures.ts`: Euclidean math, LERP smoothing, mirrored X coordinates, and 5-finger articulated limb kinematics.
  * `renderer.ts`: Pixi.js 2D stage rendering, Pixi v8 `Assets.load()` for custom background & puppet PNG textures, full-bodied puppets with articulated limbs, 5 preset character models.
  * `theremin.ts`: Web Audio API digital Theremin synthesizer (High-volume boost, single/dual-hand controls).
  * `main.ts`: UI event handling, 15-frame tracking persistence buffer to prevent flickering, Motion Freeze lock, Theremin toggle, and application lifecycle.

## 2. Completed Milestones
* [x] Environment & Superpowers Setup (Node.js, npm, ripgrep, gh CLI, OpenCode Skills, MCP configuration)
* [x] Git Repository Initialization & `.gitignore` configuration
* [x] Scaffolded Vite + TypeScript project structure with `pixi.js`, `@mediapipe/hands`, `@mediapipe/camera_utils`, `vitest`
* [x] Implemented `gestures.ts` with unit tests for LERP, pinch distance, rotation, mirrored X coordinates, and 5-finger limb kinematics
* [x] Implemented `tracker.ts` for camera stream and MediaPipe Hands tracking
* [x] Fixed horizontal webcam mirroring (X coordinates inverted for natural 1:1 mirror control)
* [x] Implemented full-bodied articulated puppets with dynamic torso, head, 2 arms, 2 legs and feet
* [x] Fixed custom background image loading using Pixi.js v8 `Assets.load()`
* [x] Added 15-frame tracking persistence buffer to eliminate puppet flickering during brief camera occlusion
* [x] Compacted UI Control Bar into a sleek single-line horizontal bar (`style.css` & `index.html`)
* [x] Boosted Theremin synthesizer volume up to 0.85 with single-hand support
* [x] Published live build to GitHub Pages

## 3. Active Task & Next Steps
* **Active Task:** Verification of updated application.
* **Next Steps:**
  1. Solicit final user feedback on single-line control bar, Theremin volume, and background loading.

## 4. Known Issues / Technical Debt / Blockers
* None currently.
