# PROJECT SPECIFICATION: Web-Based Motion Puppet Theater (PoC)

## 1. PROJECT OVERVIEW
* A client-side web application that uses a laptop webcam to track the user's hands in real time via MediaPipe Hands. The movement and gestures of each hand directly control interactive 2D puppet sprites rendered on a custom background canvas.
* You are a Senior Software Engineer and Systems Architect.
* **Language Policy:** Communicate with the user EXCLUSIVELY in CZECH (Čeština). All explanations, questions, progress summaries, and suggestions must be written in Czech.
* **Code & Git Policy:** Code, inline comments, variable names, documentation files (`PROJECT_STATE.md`), and Git commit messages MUST remain in ENGLISH.
* **Non-servile policy:** Do NOT blindly agree with the user. If a proposed design, architecture, or technology stack is suboptimal, flawed, or insecure, you MUST challenge it in Czech, explain WHY it is wrong, and propose a superior alternative.


## 2. TECHNICAL STACK
* **Frontend Core:** HTML5, CSS3, ES6+ JavaScript (or TypeScript)
* **Computer Vision / AI:** Google MediaPipe Hands (`@mediapipe/hands`, `@mediapipe/camera_utils`)
* **Build System:** Use `Vite` with `TypeScript` for fast HMR and strong typing.
* **Graphics:** `Pixi.js` (WebGL/WebGPU) for high-performance sprite rendering.
* **Math/Smoothing:** Implement LERP (Linear Interpolation) to eliminate hand tracking jitter before updating Pixi.js sprite transformations.

## 3. FUNCTIONAL REQUIREMENTS

### A. Camera & Hand Tracking
* Request user permission for camera access upon start.
* Process video stream in real-time at low latency (< 15 ms inference overhead).
* Detect and distinguish between **Left Hand** and **Right Hand**.
* Track 21 3D hand landmarks per hand.

### B. Puppet Control & Mapping
* **Puppet 1 (Left Hand):** Controls Sprite A.
* **Puppet 2 (Right Hand):** Controls Sprite B.
* **Position Mapping:** Map Wrist/Palm landmark (Landmark 0 / 9) $X, Y$ coordinates to screen coordinates.
* **Smoothing / Filtering:** Implement Lerp (Linear Interpolation) or Exponential Moving Average to eliminate camera noise/jitter.

### C. Gesture Recognition & Interactions
* **Mouth / State Control:** Measure the distance between Index Finger Tip (Landmark 8) and Thumb Tip (Landmark 4).
  * *Pinch / Closed:* Puppet mouth closed (Sprite State 1).
  * *Open:* Puppet mouth open (Sprite State 2).
* **Rotation (Optional):** Calculate angle between Wrist (Landmark 0) and Middle Finger Base (Landmark 9) to rotate the puppet sprite.

### D. UI & Scene Management
* Background selector (allow changing background color or uploading custom background image).
* Character selector for Left and Right hand (allow selecting default sprites or uploading custom PNGs).
* Simple overlay toggle: Show/Hide debug video feed and skeleton landmarks.

## 4. ACCEPTANCE CRITERIA (DEFINITION OF DONE)
1. **Performance:** App runs smoothly at ~60 FPS on standard integrated GPUs (e.g., Intel Iris, Apple Silicon).
2. **Robustness:** Graceful handling of camera denial, single-hand occlusion, or missing video feed.
3. **Clean Code:** Modular separation between CV tracking logic (`tracker.js`), math/gestures (`gestures.js`), and graphics engine (`renderer.js`).
4. **Testing:** Unit tests for gesture math (distance & angle calculations).

## 5. INITIAL TASK FOR AGENT
1. Read this `PROJECT_SPEC.md` and create `PROJECT_STATE.md`.
2. Initialize Git repo and set up a minimal project structure with a lightweight dev server (e.g., Vite).
3. Implement the barebones MediaPipe setup with a working camera feed and debug landmark rendering.