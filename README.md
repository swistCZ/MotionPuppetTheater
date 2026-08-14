# 🎭 Web-Based Motion Puppet Theater (Pro Edition)

> Interactive client-side puppet theater controlled in real-time by your hands and webcam using Google MediaPipe Hands, Pixi.js v8, and Web Audio API.

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-58a6ff?style=for-the-badge&logo=github)](https://swistcz.github.io/MotionPuppetTheater/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Pixi.js](https://img.shields.io/badge/Pixi.js-v8-e72264?style=for-the-badge&logo=pixijs)](https://pixijs.com/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands-007acc?style=for-the-badge&logo=google)](https://developers.google.com/mediapipe)

---

## 🌟 Live Application
👉 **[https://swistcz.github.io/MotionPuppetTheater/](https://swistcz.github.io/MotionPuppetTheater/)**

---

## ✨ Features

- **📷 Real-Time 60+ FPS Hand Tracking**
  - Powered by Google MediaPipe Hands with zero-latency 640x480 resolution and decoupled `requestAnimationFrame` render loop.
  - Same-origin local WASM bundling (`public/mediapipe/`) for 100% compatibility with **DuckDuckGo Privacy Browser**, **Brave**, **Safari (macOS/iOS)**, **Chrome**, **Firefox**, and **Edge**.
  - Intuitive mirrored X-coordinate control (moving left moves left).

- **🎭 Cut-Out Characters** (file-based, auto-indexed)
  - 🧙 **demo** – A full six-part humanoid puppet (body, head, arms, legs).
  - Folders in `public/characters/` with a valid `config.json` are picked up automatically — no manual registry. The list is generated at dev-time and baked into the build by a Vite plugin.
  - Plus **procedural presets**: Fox, Robot.
  - A **Prázdné (empty)** option hides the puppet for that hand so you can play with just one hand.
  - 💾 **Saved in the browser** – puppets built with the rig builder can be saved to `localStorage` and reappear in the character list on every visit.

- **🔧 Rig Builder** (`/builder.html`)
  - Assemble a cut-out puppet from up to **six parts**: body, head, left/right arm, left/right leg.
  - For each part choose whether it is **movable** or **static** (a switch per part).
  - Place **joints** by clicking on the part image: shoulders, neck, hips (body); pivots (arms, legs); set rest angles for arms and legs.
  - Save the puppet **to the browser** (`localStorage`) or **export/import** the rig config as JSON.
  - Run the builder locally at `http://localhost:3000/builder.html`.

- **🖐️ 5-Finger Kinematic Marionette Control**
  - **Palm / Wrist**: Controls body position.
  - **Index Finger**: Controls head position / jaw opening.
  - **Thumb**: Left arm.
  - **Middle Finger**: Right arm.
  - **Ring Finger**: Left leg.
  - **Pinky Finger**: Right leg.
  - For rigged puppets: movable arms rotate around their pivots, **legs swing opposite to the same-side arm** (walking look), and a **movable head bobs** with the average arm swing.

- **🎵 Digital Theremin Synthesizer**
  - Built-in Web Audio API continuous frequency synthesizer.
  - **Left Hand ($Y$)**: Pitch / Frequency control ($130\text{ Hz}$ to $880\text{ Hz}$) with live Hz readout.
  - **Right Hand ($Y$)**: Volume / Amplitude control ($0\%$ to $85\%$) with live volume readout.
  - Visual glowing, pulsating Theremin Orbs (Cyan & Magenta) that replace puppets in Theremin Mode.

- **🎥 60 FPS Stage Video Recording**
  - Direct canvas video capture using browser native `MediaRecorder` API.
  - Records only the theater stage canvas (puppets, background, and Theremin soundtrack).
  - Live `🔴 REC 00:00` timer and instant direct download to `.webm` / `.mp4` on your disk.

- **🔒 Motion Freeze / Lock**
  - Lock puppets in their current pose on stage for storytelling without webcam interference.

- **🖼️ Custom Backgrounds**
  - Scenic color presets (Dark, Slate, Black, Scenic Blue, Forest Green) + custom image upload support.

---

## 🎭 Creating Your Own Puppet (Builder Workflow)

1. Open the builder at `http://localhost:3000/builder.html` (or via the **Builder** button in the app).
2. **Díly loutky** – upload up to six part images (body, head, arms, legs). Each part can be toggled **movable / static**.
3. **Klouby a úhly** – select a joint and click into the part image to place it (shoulders, neck, hips, pivots). Set rest angles for arms and legs.
4. **Identita / Pohyb a měřítko** – give the puppet a name, scale, and arm responsiveness.
5. **Uložit a sdílet** – save to the browser (appears in the character list) or export/import the config as JSON.
6. Share puppets by committing a character folder (e.g. `public/characters/<id>/` with `config.json` + part SVGs) — the Vite plugin registers it automatically.

---

## 🛠️ Tech Stack & Architecture

- **Core:** HTML5, CSS3 (Glassmorphism Dark Theme), TypeScript
- **Rendering Engine:** [Pixi.js v8](https://pixijs.com/) (WebGL 2D hardware accelerated rendering)
- **Computer Vision:** Google MediaPipe Hands (`@mediapipe/hands`)
- **Audio Engine:** Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode`, `MediaStreamAudioDestinationNode`)
- **Video Capture:** `MediaRecorder` API (`canvas.captureStream(60)`)
- **Build System & Tooling:** [Vite](https://vitejs.dev/) + [Vitest](https://vitest.dev/)
  - Custom Vite plugin `plugins/characters-index.ts` auto-generates `characters/index.json` from `public/characters/`.

---

## 🚀 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)

### Installation & Run

```bash
# 1. Clone the repository
git clone https://github.com/swistCZ/MotionPuppetTheater.git
cd MotionPuppetTheater

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Open in browser at http://localhost:3000
```

### Build & Testing

```bash
# Run unit tests (Vitest)
npm test

# Build production bundle to dist/
npm run build

# Preview production build locally
npm run preview
```

---

## 📄 License
MIT License. Created for open-source interactive computer vision and creative web entertainment.