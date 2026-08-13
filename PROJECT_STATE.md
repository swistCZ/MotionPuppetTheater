# PROJECT STATE: Web-Based Motion Puppet Theater (PoC)

## 1. Overall Goal & Architecture
* **Goal:** A client-side web application tracking laptop webcam hand movements via Google MediaPipe Hands to control interactive 2D puppet sprites rendered on a custom background canvas (Pixi.js).
* **Tech Stack:**
  * **Frontend:** HTML5, CSS3, TypeScript, Vite
  * **CV / AI:** Google MediaPipe Hands (`@mediapipe/hands`, `@mediapipe/camera_utils`)
  * **Graphics:** Pixi.js (WebGL 2D rendering engine)
  * **Math:** LERP (Linear Interpolation) for jitter-free hand coordinate mapping
* **Superpowers & Tools Configured:**
  * Node.js v22 & npm installed locally
  * `ripgrep` & `gh` CLI installed
  * OpenCode Skills created (`tdd-workflow`, `systematic-debugging`, `code-review`, `git-discipline`, `project-state-persistence`)
  * MCP Servers configured (`github`, `playwright`, `fetch`)

## 2. Completed Milestones
* [x] Environment & Superpowers Setup (Node.js, npm, ripgrep, gh CLI, OpenCode Skills, MCP configuration)
* [x] Git Repository Initialization & `.gitignore` configuration
* [x] Initial `PROJECT_STATE.md` setup

## 3. Active Task & Next Steps
* **Active Task:** Scaffold minimal Vite + TypeScript project structure for Motion Puppet Theater.
* **Next Steps:**
  1. Install dependencies (`vite`, `typescript`, `pixi.js`, `@mediapipe/hands`, `@mediapipe/camera_utils`).
  2. Implement camera feed and debug landmark rendering (`tracker.js`/`tracker.ts`).
  3. Implement LERP math smoothing and pinch gesture detection (`gestures.ts`).
  4. Integrate Pixi.js sprite renderer (`renderer.ts`).

## 4. Known Issues / Technical Debt / Blockers
* None currently.
