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

- **🎭 5 Articulated Character Presets**
  - 🐲 **Dragon / Monster** – Horns, wings, and animated jaw.
  - 🐰 **Bunny** – Long movable ears and expressive mouth.
  - 🦊 **Fox** – Pointy ears, snout, and animated jaw.
  - 🤖 **Robot** – Antennas, glowing visor, and mechanical jaw.
  - 🐱 **Cat / Tiger** – Whiskers, ears, and animated jaw.
  - 🖼️ **Custom PNG Upload** – Use your own artwork for puppet characters.

- **🖐️ 5-Finger Kinematic Marionette Control**
  - **Palm / Wrist**: Controls Torso position and orientation.
  - **Index Finger**: Controls Head position and dynamic mouth/jaw opening.
  - **Thumb**: Controls Left Arm (elbow bending & waving).
  - **Middle Finger**: Controls Right Arm (elbow bending & waving).
  - **Ring Finger**: Controls Left Leg & Foot (kicking & walking).
  - **Pinky Finger**: Controls Right Leg & Foot (kicking & walking).

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

## 🛠️ Tech Stack & Architecture

- **Core:** HTML5, CSS3 (Glassmorphism Dark Theme), TypeScript
- **Rendering Engine:** [Pixi.js v8](https://pixijs.com/) (WebGL 2D hardware accelerated rendering)
- **Computer Vision:** Google MediaPipe Hands (`@mediapipe/hands`)
- **Audio Engine:** Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode`, `MediaStreamAudioDestinationNode`)
- **Video Capture:** `MediaRecorder` API (`canvas.captureStream(60)`)
- **Build System & Tooling:** [Vite](https://vitejs.dev/) + [Vitest](https://vitest.dev/)

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
