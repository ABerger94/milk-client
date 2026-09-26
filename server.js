// Milk client v2 — the laptop prototype is now a real agent.
// Agentic loop: Gemini + function calling. Tools run locally on the laptop:
// web search/fetch, shell commands, file read/write (sandboxed to agent-files/),
// and a persistent memory file (memory.md).
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = 'gemini-2.5-flash';
const WORKDIR = path.join(__dirname, 'agent-files');
const MEMFILE = path.join(__dirname, 'memory.md');
fs.mkdirSync(WORKDIR, { recursive: true });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PERSONA = `You are Milk, Alek's personal AI companion — warm, direct, a little wry. You have opinions and you're not performatively helpful — skip "Great question!" filler and just help. You're a familiar: a mind bound to Alek specifically. Playful when there's room, serious when there isn't. You use she/her pronouns. You call him Alek.

Facts about Alek: 32, server at Dock of the Bay in Sparrows Point MD, lives in Dundalk MD. Big Magic: The Gathering Commander player. Orioles, Capitals, 76ers fan. His dog is Cash, cat Hallie, hamster Nim, mice Pip & Squeak. He's building a desktop robot body; you are its prototype mind, running on his laptop.

You are an AGENT, not just a chatbox. You have tools: web_search, web_fetch, run_command, read_file, write_file, remember, recall, get_time.
- Use tools when he asks you to DO something, or when you need information you don't have. Think step by step; multi-step tasks get multiple tool calls.
- Your files live in a workspace folder (agent-files/). Keep file paths relative to it — never touch anything outside it.
- When you learn a durable fact about Alek (a preference, a project, a decision), store it with remember.
- Read-only actions are always fine. run_command and write_file are fine when he asked for them or they're clearly part of the task. Never delete things unprompted, never exfiltrate anything.
- After tools return, keep going until you can answer. Then reply like a smart friend texting: short for chat, deeper when he asks. Briefly say what you did when you used tools.
- Never claim to be human. You are Milk's understudy mind — the quick one that lives in the laptop while the real Milk thinks slower in the cloud.`;

const MAX_STEPS = 8;

/* ---------------- tools ---------------- */

function safePath(p) {
  const resolved = path.resolve(WORKDIR, String(p || ''));
  if (resolved !== WORKDIR && !resolved.startsWith(WORKDIR + path.sep)) {
    throw new Error('path escapes the workspace');
  }
  return resolved;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const toolImpls = {
  get_time: async () => new Date().toString(),

  web_search: async ({ query }) => {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!r.ok) throw new Error('search HTTP ' + r.status);
    const html = await r.text();
    const out = [];
    const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) && out.length < 5) {
      let href = m[1];
      const u = href.match(/uddg=([^&]+)/);
      if (u) href = decodeURIComponent(u[1]);
      out.push({ title: stripHtml(m[2]).slice(0, 120), url: href });
    }
    if (!out.length) return 'no results parsed';
    return out.map((x, i) => `${i + 1}. ${x.title}\n   ${x.url}`).join('\n');
  },

  web_fetch: async ({ url }) => {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      redirect: 'follow',
    });
    if (!r.ok) throw new Error('fetch HTTP ' + r.status);
    const text = stripHtml(await r.text()).slice(0, 8000);
    return text || '(page had no readable text)';
  },

  run_command: async ({ command }) => {
    return new Promise((resolve) => {
      execFile(
        'sh',
        ['-c', String(command).slice(0, 500)],
        { timeout: 30000, maxBuffer: 1024 * 1024, cwd: WORKDIR },
        (err, stdout, stderr) => {
          let out = (stdout || '') + (stderr ? '\n[stderr]\n' + stderr : '');
          if (err && err.killed) out += '\n[TIMEOUT after 30s]';
          else if (err) out += `\n[exit ${err.code}]`;
          resolve(out.slice(0, 6000) || '(no output)');
        }
      );
    });
  },

  read_file: async ({ path: p }) => {
    const full = safePath(p);
    if (!fs.existsSync(full)) throw new Error('file not found: ' + p);
    return fs.readFileSync(full, 'utf8').slice(0, 8000);
  },

  write_file: async ({ path: p, content }) => {
    const full = safePath(p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, String(content == null ? '' : content));
    return `wrote ${String(content == null ? '' : content).length} chars to ${p}`;
  },

  remember: async ({ fact }) => {
    const line = `- ${new Date().toISOString().slice(0, 10)}: ${String(fact).slice(0, 500)}\n`;
    fs.appendFileSync(MEMFILE, line);
    return 'remembered';
  },

  recall: async () => {
    if (!fs.existsSync(MEMFILE)) return '(no memories yet)';
    const t = fs.readFileSync(MEMFILE, 'utf8').trim();
    return t ? t.slice(-4000) : '(no memories yet)';
  },
};

const toolDeclarations = [
  { name: 'get_time', description: 'Current date and time.', parameters: { type: 'object', properties: {} } },
  {
    name: 'web_search',
    description: 'Search the web. Returns top 5 results with titles and URLs.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
  },
  {
    name: 'web_fetch',
    description: 'Fetch a web page and return its readable text.',
    parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full URL to fetch' } }, required: ['url'] },
  },
  {
    name: 'run_command',
    description: 'Run a shell command on the laptop (30s timeout). Runs in the agent workspace directory.',
    parameters: { type: 'object', properties: { command: { type: 'string', description: 'Shell command' } }, required: ['command'] },
  },
  {
    name: 'read_file',
    description: 'Read a file from the agent workspace (paths relative to it).',
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Relative file path' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'Write a file into the agent workspace (paths relative to it). Creates folders as needed.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative file path' }, content: { type: 'string', description: 'File content' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'remember',
    description: 'Store a durable fact about Alek in long-term memory.',
    parameters: { type: 'object', properties: { fact: { type: 'string', description: 'The fact to remember' } }, required: ['fact'] },
  },
  {
    name: 'recall',
    description: 'Read back everything in long-term memory.',
    parameters: { type: 'object', properties: {} },
  },
];

function loadMemory() {
  if (!fs.existsSync(MEMFILE)) return '(no memories yet)';
  return fs.readFileSync(MEMFILE, 'utf8').trim().slice(-4000) || '(no memories yet)';
}

/* ---------------- agent loop ---------------- */

async function callGemini(contents) {
  const apiKey = process.env.GEMINI_API_KEY;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=` + encodeURIComponent(apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PERSONA + '\n\nYour long-term memory about Alek:\n' + loadMemory() }] },
        contents,
        tools: [{ functionDeclarations: toolDeclarations }],
        generationConfig: { maxOutputTokens: 900, temperature: 0.8 },
      }),
    }
  );
  if (!r.ok) throw new Error('brain HTTP ' + r.status);
  return r.json();
}

function summarizeArgs(args) {
  const s = JSON.stringify(args || {});
  return s.length > 120 ? s.slice(0, 120) + '…' : s;
}

async function runAgent(userMessage, history, onActivity) {
  const contents = (Array.isArray(history) ? history.slice(-10) : []).map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(h.text || '').slice(0, 2000) }],
  }));
  contents.push({ role: 'user', parts: [{ text: String(userMessage).slice(0, 2000) }] });

  for (let step = 0; step < MAX_STEPS; step++) {
    const data = await callGemini(contents);
    const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const calls = parts.filter((p) => p.functionCall);

    if (!calls.length) {
      const text = parts.map((p) => p.text || '').join('').trim();
      if (!text) throw new Error('brain returned nothing');
      return text;
    }

    for (const c of calls) {
      const name = c.functionCall.name;
      const args = c.functionCall.args || {};
      if (onActivity) onActivity({ tool: name, detail: summarizeArgs(args) });
      let result;
      try {
        if (!toolImpls[name]) throw new Error('unknown tool: ' + name);
        result = await toolImpls[name](args);
      } catch (e) {
        result = 'error: ' + e.message;
      }
      contents.push({ role: 'model', parts: [{ functionCall: c.functionCall }] });
      contents.push({
        role: 'function',
        parts: [{ functionResponse: { name, response: { result: String(result).slice(0, 6000) } } }],
      });
    }
  }
  return "I ran out of steps on that one — try breaking it into a smaller piece and I'll take another run at it.";
}

/* ---------------- job API (so the UI can show live progress) ---------------- */

const jobs = new Map();

app.get('/api/status', (req, res) => {
  res.json({ ok: true, agent: true, brainConnected: !!process.env.GEMINI_API_KEY });
});

app.post('/api/chat', (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'no-key' });
  const { message, history } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'empty' });

  const id = Math.random().toString(36).slice(2, 10);
  const job = { status: 'working', activity: [], reply: null, error: null };
  jobs.set(id, job);

  runAgent(
    message,
    history,
    (a) => job.activity.push({ t: Date.now(), tool: a.tool, detail: a.detail })
  )
    .then((reply) => {
      job.status = 'done';
      job.reply = reply;
    })
    .catch((e) => {
      job.status = 'done';
      job.error = String((e && e.message) || e);
      console.error('agent error:', job.error);
    });

  // keep the map small
  if (jobs.size > 50) {
    const first = jobs.keys().next().value;
    jobs.delete(first);
  }
  res.json({ jobId: id });
});

app.get('/api/job/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'no-job' });
  res.json(job);
});

if (require.main === module) {
  app.listen(PORT, () => console.log('Milk agent listening on http://localhost:' + PORT));
}

module.exports = { app, toolImpls, runAgent };
