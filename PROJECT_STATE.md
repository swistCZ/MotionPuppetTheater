# PROJECT STATE: Web-Based Motion Puppet Theater (PoC)

## 1. Overall Goal & Architecture
* **Goal:** A client-side web application tracking laptop webcam hand movements via Google MediaPipe Hands to control interactive 2D puppet sprites rendered on a custom background canvas (Pixi.js).
* **Tech Stack:**
  * **Frontend:** HTML5, CSS3, TypeScript, Vite
  * **CV / AI:** Google MediaPipe Hands (`@mediapipe/hands`, `@mediapipe/camera_utils`)
  * **Graphics:** Pixi.js v8 (WebGL/WebGPU 2D rendering engine)
  * **Math:** LERP (Linear Interpolation) for jitter-free hand coordinate mapping
  * **Deployment:** GitHub Pages (via `gh-pages` branch)
* **Modular Architecture:**
  * `tracker.ts`: WebCam & MediaPipe Hands CV integration.
  * `gestures.ts`: Euclidean math, rotation angles, LERP smoothing, mirrored X coordinates, continuous mouth opening, finger splay, and winking detection (with unit tests in `gestures.test.ts`).
  * `renderer.ts`: Pixi.js 2D stage rendering, dynamic finger-reactive puppet animations (ear/wing wiggling, jaw dropping, winking), 5 preset character models (Dragon, Bunny, Fox, Robot, Cat), custom PNG texture uploads, and background switching.
  * `main.ts`: UI event handling, puppet preset dropdown controls, debug landmark canvas overlay, and application lifecycle.

## 2. Completed Milestones
* [x] Environment & Superpowers Setup (Node.js, npm, ripgrep, gh CLI, OpenCode Skills, MCP configuration)
* [x] Git Repository Initialization & `.gitignore` configuration
* [x] Scaffolded Vite + TypeScript project structure with `pixi.js`, `@mediapipe/hands`, `@mediapipe/camera_utils`, `vitest`
* [x] Implemented `gestures.ts` with unit tests for LERP, pinch distance, rotation, mirrored X coordinates, and finger splay
* [x] Implemented `tracker.ts` for camera stream and MediaPipe Hands tracking
* [x] Fixed horizontal webcam mirroring (X coordinates inverted for natural 1:1 mirror control)
* [x] Added 5 interactive character presets (Dragon, Bunny, Fox, Robot, Cat)
* [x] Implemented dynamic finger-reactive puppet animations (jaw opening ratio, ear/wing wiggling on finger splay, eye winking)
* [x] Configured GitHub Pages deployment and published live build
* [x] Verified full build and unit tests pass (`npm test` & `npm run build`)

## 3. Active Task & Next Steps
* **Active Task:** User feedback review on updated live application.
* **Next Steps:**
  1. Solicit user feedback on new character presets and gesture responsiveness.

## 4. Known Issues / Technical Debt / Blockers
* None currently.
