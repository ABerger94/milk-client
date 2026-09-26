/* Milk client v1 frontend — expressive face + chat + voice. */
(function () {
  'use strict';

  var face = document.getElementById('face');
  var ctx = face.getContext('2d');
  var stateLabel = document.getElementById('state-label');
  var log = document.getElementById('log');
  var input = document.getElementById('input');
  var sendBtn = document.getElementById('send-btn');
  var micBtn = document.getElementById('mic-btn');
  var voiceBtn = document.getElementById('voice-btn');
  var banner = document.getElementById('setup-banner');

  var faceState = 'idle'; // idle | thinking | talking | listening
  var voiceOn = true;
  var history = []; // {role:'user'|'assistant', text}
  var busy = false;

  function setFace(s) {
    faceState = s;
    stateLabel.textContent = s;
  }

  /* ---------- expressive face ---------- */
  var blinkAt = 0, blinkPhase = 0;
  function drawFace(t) {
    var W = face.width, H = face.height;
    ctx.clearRect(0, 0, W, H);

    // LCD bezel
    ctx.fillStyle = '#050507';
    roundRect(0, 0, W, H, 24); ctx.fill();
    ctx.fillStyle = '#0b0b10';
    roundRect(14, 14, W - 28, H - 28, 16); ctx.fill();

    var cx = W / 2, cy = H / 2 - 10;

    // blink timing
    if (t > blinkAt) { blinkPhase = t; blinkAt = t + 2200 + Math.random() * 2600; }
    var blink = 1;
    var bt = t - blinkPhase;
    if (bt < 140) blink = 1 - Math.sin((bt / 140) * Math.PI) * 0.92;

    // eye look direction
    var lookX = 0, lookY = 0;
    if (faceState === 'thinking') { lookX = Math.sin(t / 450) * 14; lookY = -4; }
    if (faceState === 'listening') { lookY = -6; }
    if (faceState === 'talking') { lookX = Math.sin(t / 900) * 4; }

    var eyeOpen = (faceState === 'listening' ? 1.15 : 1) * blink;
    var eyeW = 64, eyeH = 84 * eyeOpen;

    drawEye(cx - 90, cy, eyeW, eyeH, lookX, lookY);
    drawEye(cx + 90, cy, eyeW, eyeH, lookX, lookY);

    // mouth
    var mw = 90, mh = 12;
    if (faceState === 'talking') {
      mh = 10 + Math.abs(Math.sin(t / 110)) * 34 + Math.abs(Math.sin(t / 61)) * 10;
      mw = 90 + Math.sin(t / 130) * 8;
    } else if (faceState === 'thinking') {
      mh = 8; mw = 60;
    } else if (faceState === 'listening') {
      mh = 16; mw = 44;
    }
    ctx.fillStyle = '#e8e6e3';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 108, mw / 2, Math.max(mh / 2, 3), 0, 0, Math.PI * 2);
    ctx.fill();
    if (faceState === 'talking') {
      ctx.fillStyle = '#0b0b10';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 108 + mh / 6, mw / 4, Math.max(mh / 4, 2), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // subtle cheeks when talking
    if (faceState === 'talking' || faceState === 'listening') {
      ctx.fillStyle = 'rgba(201,167,255,0.18)';
      ctx.beginPath(); ctx.ellipse(cx - 150, cy + 70, 26, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 150, cy + 70, 26, 16, 0, 0, Math.PI * 2); ctx.fill();
    }

    requestAnimationFrame(drawFace);
  }

  function drawEye(x, y, w, h, lookX, lookY) {
    ctx.fillStyle = '#f4f2ff';
    ctx.beginPath(); ctx.ellipse(x, y, w / 2, Math.max(h / 2, 2), 0, 0, Math.PI * 2); ctx.fill();
    if (h > 12) {
      ctx.fillStyle = '#17171f';
      ctx.beginPath(); ctx.arc(x + lookX * 0.5, y + lookY * 0.5, 17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c9a7ff';
      ctx.beginPath(); ctx.arc(x + lookX * 0.5 - 5, y + lookY * 0.5 - 5, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- chat ---------- */
  function addMsg(who, text) {
    var d = document.createElement('div');
    d.className = 'msg ' + who;
    if (who === 'milk') {
      var s = document.createElement('span');
      s.className = 'who'; s.textContent = 'Milk 🥛';
      d.appendChild(s);
      d.appendChild(document.createTextNode(text));
    } else {
      d.textContent = text;
    }
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function addSys(text) {
    var d = document.createElement('div');
    d.className = 'msg sys'; d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function sendMessage(text) {
    text = (text || input.value).trim();
    if (!text || busy) return;
    busy = true;
    input.value = '';
    addMsg('user', text);
    history.push({ role: 'user', text: text });
    setFace('thinking');

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        busy = false;
        if (res.status === 503 || res.body.error === 'no-key') {
          banner.classList.remove('hidden');
          addSys('No brain connected — add your Gemini API key to .env and restart.');
          setFace('idle');
          return;
        }
        if (res.body.error || !res.body.reply) {
          addSys("Hmm, my brain glitched. Try again in a sec.");
          setFace('idle');
          return;
        }
        var reply = res.body.reply;
        history.push({ role: 'assistant', text: reply });
        addMsg('milk', reply);
        speak(reply);
      })
      .catch(function () {
        busy = false;
        addSys('Could not reach the server. Is it still running?');
        setFace('idle');
      });
  }

  /* ---------- voice out ---------- */
  var synth = window.speechSynthesis || null;
  var pickedVoice = null;
  function pickVoice() {
    if (!synth) return;
    var vs = synth.getVoices().filter(function (v) { return v.lang.indexOf('en') === 0; });
    pickedVoice =
      vs.find(function (v) { return /female|zira|samantha|google us english/i.test(v.name); }) ||
      vs.find(function (v) { return /google/i.test(v.name); }) ||
      vs[0] || null;
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }

  function speak(text) {
    if (!synth || !voiceOn) { setFace('idle'); return; }
    synth.cancel();
    var u = new SpeechSynthesisUtterance(text);
    if (pickedVoice) u.voice = pickedVoice;
    u.rate = 1.02; u.pitch = 1.05;
    u.onstart = function () { setFace('talking'); };
    u.onend = u.onerror = function () { setFace('idle'); };
    synth.speak(u);
    // safety: if events never fire, fall back to idle after a guess
    setTimeout(function () {
      if (faceState === 'talking' && !synth.speaking) setFace('idle');
    }, Math.min(15000, 1500 + text.length * 90));
  }

  /* ---------- voice in ---------- */
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var recog = null, recognizing = false;
  if (Rec) {
    recog = new Rec();
    recog.lang = 'en-US';
    recog.interimResults = false;
    recog.onresult = function (e) {
      var t = e.results[0][0].transcript;
      micBtn.classList.remove('listening');
      recognizing = false;
      setFace('idle');
      sendMessage(t);
    };
    recog.onerror = recog.onend = function () {
      micBtn.classList.remove('listening');
      recognizing = false;
      if (faceState === 'listening') setFace('idle');
    };
  } else {
    micBtn.style.display = 'none';
  }

  micBtn.addEventListener('click', function () {
    if (!recog || busy) return;
    if (recognizing) { recog.stop(); return; }
    if (synth) synth.cancel();
    recognizing = true;
    micBtn.classList.add('listening');
    setFace('listening');
    try { recog.start(); } catch (e) { recognizing = false; }
  });

  voiceBtn.addEventListener('click', function () {
    voiceOn = !voiceOn;
    voiceBtn.classList.toggle('on', voiceOn);
    if (!voiceOn && synth) synth.cancel();
    if (!voiceOn && faceState === 'talking') setFace('idle');
  });

  sendBtn.addEventListener('click', function () { sendMessage(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendMessage();
  });

  /* ---------- boot ---------- */
  fetch('/api/status')
    .then(function (r) { return r.json(); })
    .then(function (s) {
      if (!s.brainConnected) banner.classList.remove('hidden');
      else addSys('Brain connected. Talk to me — type, or hit the mic. 🎙');
    })
    .catch(function () { addSys('Server reachable, status check failed.'); });

  requestAnimationFrame(drawFace);
})();
