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
  * `renderer.ts`: Pixi.js 2D stage rendering, full-bodied puppets with articulated limbs, 5 preset character models, custom PNG texture uploads, and background switching.
  * `theremin.ts`: Web Audio API digital Theremin synthesizer (Left hand Y = Pitch, Right hand Y = Volume).
  * `main.ts`: UI event handling, Motion Freeze lock, Theremin toggle, background image decode fix, and application lifecycle.

## 2. Completed Milestones
* [x] Environment & Superpowers Setup (Node.js, npm, ripgrep, gh CLI, OpenCode Skills, MCP configuration)
* [x] Git Repository Initialization & `.gitignore` configuration
* [x] Scaffolded Vite + TypeScript project structure with `pixi.js`, `@mediapipe/hands`, `@mediapipe/camera_utils`, `vitest`
* [x] Implemented `gestures.ts` with unit tests for LERP, pinch distance, rotation, mirrored X coordinates, and 5-finger limb kinematics
* [x] Implemented `tracker.ts` for camera stream and MediaPipe Hands tracking
* [x] Fixed horizontal webcam mirroring (X coordinates inverted for natural 1:1 mirror control)
* [x] Implemented full-bodied articulated puppets with dynamic torso, head, 2 arms, 2 legs and feet
* [x] Fixed custom background image loading via `HTMLImageElement` texture decoding
* [x] Implemented **Motion Freeze / Lock** toggle button (`btn-toggle-freeze`) to lock puppets in pose
* [x] Implemented **Digital Theremin Synthesizer** (`theremin.ts`) with ON/OFF toggle (`btn-toggle-theremin`)
* [x] Published live build to GitHub Pages

## 3. Active Task & Next Steps
* **Active Task:** Verification of complete feature set.
* **Next Steps:**
  1. Solicit final user feedback on Theremin synth, motion lock, and background loading.

## 4. Known Issues / Technical Debt / Blockers
* None currently.
