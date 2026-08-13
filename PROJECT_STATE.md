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
  * `gestures.ts`: Euclidean math, LERP smoothing, mirrored X coordinates, and 5-finger articulated limb kinematics (Head, Left Arm, Right Arm, Left Leg, Right Leg).
  * `renderer.ts`: Pixi.js 2D stage rendering, full-bodied puppets with articulated limbs, hands & feet, 5 preset character models (Dragon, Bunny, Fox, Robot, Cat), custom PNG texture uploads, and background switching.
  * `main.ts`: UI event handling, puppet preset dropdown controls, debug landmark canvas overlay, and application lifecycle.

## 2. Completed Milestones
* [x] Environment & Superpowers Setup (Node.js, npm, ripgrep, gh CLI, OpenCode Skills, MCP configuration)
* [x] Git Repository Initialization & `.gitignore` configuration
* [x] Scaffolded Vite + TypeScript project structure with `pixi.js`, `@mediapipe/hands`, `@mediapipe/camera_utils`, `vitest`
* [x] Implemented `gestures.ts` with unit tests for LERP, pinch distance, rotation, mirrored X coordinates, and 5-finger limb kinematics
* [x] Implemented `tracker.ts` for camera stream and MediaPipe Hands tracking
* [x] Fixed horizontal webcam mirroring (X coordinates inverted for natural 1:1 mirror control)
* [x] Implemented full-bodied articulated puppets with dynamic torso, head, 2 arms, 2 legs and feet
* [x] Mapped 5 fingers directly to 5 puppet limbs (Ukazováček -> Hlava, Palec -> Levá ruka, Prostředníček -> Pravá ruka, Prsteníček -> Levá noha, Malíček -> Pravá noha)
* [x] Configured GitHub Pages deployment and published live build
* [x] Verified full build and unit tests pass (`npm test` & `npm run build`)

## 3. Active Task & Next Steps
* **Active Task:** User feedback review on articulated limb puppet control.
* **Next Steps:**
  1. Solicit user feedback on articulated limb movements.

## 4. Known Issues / Technical Debt / Blockers
* None currently.
