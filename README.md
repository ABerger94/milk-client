# Milk client v1 — laptop prototype of the robot body

This is the stand-in for Milk's future physical body. It runs on your laptop
today; later the same brain + interface design moves onto the Raspberry Pi
with the LCD face, mic, speaker, and camera.

## What it does

- **Chat** with Milk (she/her) in a web UI
- **Expressive face** — a canvas LCD-style face that idles, blinks, thinks,
  listens, and talks (this is the prototype of the Pi's LCD face)
- **Voice in** — hit the mic button and talk (Chrome)
- **Voice out** — Milk speaks her replies (toggle with the 🔊 button)

## Setup (one time, ~5 minutes)

1. Install [Node.js](https://nodejs.org/) (LTS) if you don't have it.
2. Get a **free** Gemini API key at <https://aistudio.google.com/> → "Get API key".
3. In this folder, copy `.env.example` to `.env` and paste your key:
   `GEMINI_API_KEY=your_key_here`
4. Open a terminal in this folder and run:
   ```
   npm install
   npm start
   ```
5. Open <http://localhost:3000> in Chrome.

Type something or hit the mic. The face reacts while she thinks and talks.

## Notes

- The mic button needs Chrome (or Edge) — Firefox doesn't do speech recognition.
- If the "No brain connected" banner shows, your `.env` key is missing or the
  server wasn't restarted after adding it.
- No key, no chat — the face and UI still load so you can see the design.

## Roadmap to the Pi body

- v1 (this): laptop chat + face + voice
- v2: camera snapshots ("eyes"), wake word
- Pi port: same `/api/chat` brain, face rendered to the LCD HAT, USB mic/speaker,
  Pi camera — all solderless, per the build plan
