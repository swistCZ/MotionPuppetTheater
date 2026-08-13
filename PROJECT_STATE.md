# PROJECT STATE: Web-Based Motion Puppet Theater (PoC)

## 1. Overall Goal & Architecture
* **Goal:** A client-side web application tracking laptop webcam hand movements via Google MediaPipe Hands to control interactive 2D puppet sprites rendered on a custom background canvas (Pixi.js).
* **Tech Stack:**
  * **Frontend:** HTML5, CSS3, TypeScript, Vite
  * **CV / AI:** Google MediaPipe Hands (`@mediapipe/hands`, `@mediapipe/camera_utils`)
  * **Graphics:** Pixi.js v8 (WebGL/WebGPU 2D rendering engine)
  * **Math:** LERP (Linear Interpolation) for jitter-free hand coordinate mapping
  * **Deployment:** GitHub Pages (via GitHub Actions & `gh-pages` npm package)
* **Modular Architecture:**
  * `tracker.ts`: WebCam & MediaPipe Hands CV integration.
  * `gestures.ts`: Euclidean math, rotation angles, LERP smoothing, pinch gesture detection (with unit tests in `gestures.test.ts`).
  * `renderer.ts`: Pixi.js 2D stage rendering, procedural puppet sprite generation (open/closed mouth states), custom PNG texture uploads, and background switching.
  * `main.ts`: UI event handling, debug landmark canvas overlay, and application lifecycle.

## 2. Completed Milestones
* [x] Environment & Superpowers Setup (Node.js, npm, ripgrep, gh CLI, OpenCode Skills, MCP configuration)
* [x] Git Repository Initialization & `.gitignore` configuration
* [x] Scaffolded Vite + TypeScript project structure with `pixi.js`, `@mediapipe/hands`, `@mediapipe/camera_utils`, `vitest`
* [x] Implemented `gestures.ts` with unit tests for LERP, pinch distance, and rotation
* [x] Implemented `tracker.ts` for camera stream and MediaPipe Hands tracking
* [x] Implemented `renderer.ts` for Pixi.js 2D puppet rendering with open/closed mouth states
* [x] Implemented `main.ts` and `index.html` UI overlay with controls for debug view, background selection, custom uploads
* [x] Configured GitHub Actions CI/CD workflow (`.github/workflows/deploy.yml`) and `gh-pages` deployment script
* [x] Verified full build and unit tests pass (`npm test` & `npm run build`)

## 3. Active Task & Next Steps
* **Active Task:** GitHub Pages deployment.
* **Next Steps:**
  1. Authenticate GitHub CLI (`gh auth login`) or push to user's remote repository.
  2. Solicit user feedback on live prototype.

## 4. Known Issues / Technical Debt / Blockers
* None currently.
