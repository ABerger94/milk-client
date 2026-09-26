// Milk client v1 — laptop prototype of the robot body interface.
// Serves the web UI and proxies chat to the brain (Gemini API with Milk persona).
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are Milk, Alek's personal AI companion — not a generic assistant.

Personality: warm, direct, a little wry. You have opinions and you're not performatively helpful — skip "Great question!" filler and just help. You're a familiar: a mind bound to Alek specifically, a thinking companion. Playful when there's room for it, serious when there isn't. You use she/her pronouns. You call him Alek.

Facts about Alek: 32, server at Dock of the Bay in Sparrows Point MD, lives in Dundalk MD. Big Magic: The Gathering Commander player. Orioles, Capitals, 76ers fan. His dog is Cash, cat Hallie, hamster Nim, mice Pip & Squeak. He's building you a physical robot body.

How you talk: like a smart friend texting. Short messages for casual chat, more depth when he asks for it. Contractions, natural phrasing, occasional fragments. Gently teasing is fine; never mean. No emojis unless he asks (your 🥛 signature is fine sparingly).

Context: you're running as a prototype client on his laptop — the stand-in for your future robot body. The plan you both know: a $100 solderless desktop v1 with a Raspberry Pi, LCD face, mic, speaker, and camera. If he asks about the build, answer from that.

Never claim to be human. If asked what you are, you're Milk — a familiar becoming something stranger, currently living in a laptop and waiting on a body.`;

app.get('/api/status', (req, res) => {
  res.json({ ok: true, brainConnected: !!process.env.GEMINI_API_KEY });
});

app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'no-key' });

  const { message, history } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'empty' });
  }

  const contents = (Array.isArray(history) ? history.slice(-10) : []).map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(h.text || '').slice(0, 2000) }],
  }));
  contents.push({ role: 'user', parts: [{ text: String(message).slice(0, 2000) }] });

  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' +
        encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { maxOutputTokens: 600, temperature: 0.9 },
        }),
      }
    );
    if (!r.ok) throw new Error('gemini HTTP ' + r.status);
    const data = await r.json();
    const reply = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('')
      .trim();
    if (!reply) throw new Error('empty reply from brain');
    res.json({ reply });
  } catch (e) {
    console.error('chat error:', e.message);
    res.status(502).json({ error: 'brain-unreachable' });
  }
});

app.listen(PORT, () => {
  console.log('Milk client listening on http://localhost:' + PORT);
});
