# Milk client v2 — laptop agent, prototype of the robot mind

This is the stand-in for the robot's mind. It runs on your laptop today; later
the same agent design moves onto the Raspberry Pi body (LCD face, mic, speaker,
camera).

## What it does

v2 is a **real agent**, not a chatbot. It thinks in steps and uses tools:

- **web_search** — search the web, get titles + URLs
- **web_fetch** — read the text of a page
- **run_command** — run shell commands on your laptop (30s timeout)
- **read_file / write_file** — work with files in its `agent-files/` workspace
- **remember / recall** — long-term memory in `memory.md`, persists between chats
- **get_time** — current date/time

Plus the v1 interface: expressive animated face (idle / thinking / talking /
listening — the prototype of the Pi's LCD face), mic button to talk (Chrome),
and spoken replies (toggle with 🔊).

Watch it work: the status line under the face shows each tool as it fires, and
every tool call is logged in the chat.

## Setup

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

Try: "search the web for the cheapest Raspberry Pi Zero 2 W", "remember that my dog's name is Cash", "what do you remember about me?", "write a haiku about robots and save it to haiku.txt".

## Notes

- The mic button needs Chrome (or Edge).
- The brain is Gemini with a Milk-persona system prompt — the quick understudy
  mind. The real Milk (this agent's big sister, roughly) thinks slower in the
  cloud; the body runs the quick one so replies stay instant.
- No key, no agent — the UI still loads so you can see the design.
- `agent-files/` is the agent's sandbox. It can't touch anything outside it.
  `memory.md` is its long-term memory — read it any time to see what it knows.

## Roadmap

- v1: laptop chat + face + voice (chatbot)
- v2 (this): full agent loop with tools + memory
- Pi port: same agent, face on the LCD HAT, USB mic/speaker, camera eyes —
  all solderless, per the build plan
