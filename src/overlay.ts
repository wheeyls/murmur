export function generateOverlayScript(): string {
  return `(function() {
  'use strict';

  var WS_PATH = '/__murmur/ws';
  var RECONNECT_DELAY = 2000;

  var ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  var ICON_STOP = '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><polyline points="20 6 9 17 4 12"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
  var ICON_UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
  var ICON_KEYBOARD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="10" y2="8"/><line x1="14" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="14" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/></svg>';

  var CSS = \`
    .__mu { position:fixed; bottom:24px; right:24px; z-index:2147483647; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size:14px; line-height:1.5; color:#fff; pointer-events:none; }
    .__mu * { box-sizing:border-box; margin:0; padding:0; }
    .__mu button { font-family:inherit; }

    .__mu-fab { pointer-events:auto; width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 24px rgba(99,102,241,0.35); transition:all .2s cubic-bezier(.4,0,.2,1); position:relative; margin-left:auto; color:#fff; }
    .__mu-fab:hover { transform:scale(1.08); box-shadow:0 6px 28px rgba(99,102,241,0.45); }
    .__mu-fab:active { transform:scale(0.95); }
    .__mu-fab.listening { background:#ef4444; box-shadow:0 4px 24px rgba(239,68,68,0.4); }
    .__mu-fab.processing { background:linear-gradient(135deg,#6366f1,#8b5cf6); }
    .__mu-fab.applied { background:#22c55e; box-shadow:0 4px 24px rgba(34,197,94,0.4); }
    .__mu-fab.error { background:#ef4444; }

    .__mu-pulse { position:absolute; inset:-4px; border-radius:50%; border:2px solid #ef4444; opacity:0; pointer-events:none; }
    .__mu-fab.listening .__mu-pulse { animation:__mu-p 1.5s ease-out infinite; }
    .__mu-pulse2 { position:absolute; inset:-4px; border-radius:50%; border:2px solid #ef4444; opacity:0; pointer-events:none; }
    .__mu-fab.listening .__mu-pulse2 { animation:__mu-p 1.5s ease-out .75s infinite; }
    @keyframes __mu-p { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(1.6);opacity:0} }

    .__mu-spinner { animation:__mu-spin 1s linear infinite; }
    @keyframes __mu-spin { to{transform:rotate(360deg)} }

    .__mu-transcript { pointer-events:auto; position:absolute; bottom:68px; right:0; background:rgba(10,10,15,.92); backdrop-filter:blur(24px) saturate(180%); -webkit-backdrop-filter:blur(24px) saturate(180%); border-radius:16px; padding:12px 16px; max-width:320px; min-width:180px; opacity:0; transform:translateY(8px); transition:all .3s cubic-bezier(.4,0,.2,1); border:1px solid rgba(255,255,255,.08); box-shadow:0 8px 32px rgba(0,0,0,.3); }
    .__mu-transcript.visible { opacity:1; transform:translateY(0); }
    .__mu-transcript-text { font-size:13px; color:rgba(255,255,255,.9); display:block; }
    .__mu-transcript-status { font-size:11px; color:rgba(255,255,255,.4); margin-top:6px; display:block; }

    .__mu-panel { pointer-events:auto; position:absolute; bottom:68px; right:0; width:380px; max-height:500px; background:rgba(10,10,15,.95); backdrop-filter:blur(24px) saturate(180%); -webkit-backdrop-filter:blur(24px) saturate(180%); border-radius:16px; border:1px solid rgba(255,255,255,.08); display:flex; flex-direction:column; overflow:hidden; opacity:0; transform:translateY(8px) scale(.97); transition:all .3s cubic-bezier(.4,0,.2,1); pointer-events:none; box-shadow:0 8px 40px rgba(0,0,0,.5); }
    .__mu-panel.open { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }

    .__mu-panel-hdr { padding:14px 16px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,.08); }
    .__mu-panel-title { font-weight:600; font-size:13px; display:flex; align-items:center; gap:8px; letter-spacing:.3px; }
    .__mu-panel-dot { width:8px; height:8px; border-radius:50%; background:#22c55e; }
    .__mu-panel-dot.disconnected { background:#ef4444; }
    .__mu-panel-actions { display:flex; gap:4px; }
    .__mu-panel-btn { background:none; border:none; color:rgba(255,255,255,.4); cursor:pointer; padding:4px 6px; border-radius:6px; display:flex; align-items:center; gap:4px; font-size:11px; transition:all .15s; }
    .__mu-panel-btn:hover { color:#fff; background:rgba(255,255,255,.1); }

    .__mu-history { flex:1; overflow-y:auto; padding:8px; min-height:60px; }
    .__mu-history::-webkit-scrollbar { width:4px; }
    .__mu-history::-webkit-scrollbar-track { background:transparent; }
    .__mu-history::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:2px; }

    .__mu-item { padding:10px 12px; border-radius:10px; margin-bottom:4px; font-size:13px; color:rgba(255,255,255,.6); display:flex; align-items:flex-start; gap:10px; transition:background .15s; }
    .__mu-item:hover { background:rgba(255,255,255,.04); }
    .__mu-item.success { color:rgba(255,255,255,.85); }
    .__mu-item.active { color:#f59e0b; }
    .__mu-item-icon { flex-shrink:0; width:18px; text-align:center; padding-top:1px; }
    .__mu-item-body { flex:1; min-width:0; }
    .__mu-item-text { word-break:break-word; }
    .__mu-item-summary { font-size:11px; color:rgba(255,255,255,.35); margin-top:4px; }

    .__mu-empty { padding:32px 16px; text-align:center; color:rgba(255,255,255,.25); font-size:13px; }

    .__mu-input-row { padding:12px; border-top:1px solid rgba(255,255,255,.08); display:flex; gap:8px; }
    .__mu-input { flex:1; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.1); border-radius:10px; padding:9px 14px; color:#fff; font-size:13px; outline:none; font-family:inherit; transition:border-color .2s; }
    .__mu-input::placeholder { color:rgba(255,255,255,.25); }
    .__mu-input:focus { border-color:rgba(99,102,241,.6); }
    .__mu-send { background:#6366f1; border:none; border-radius:10px; padding:9px 14px; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .15s; }
    .__mu-send:hover { background:#4f46e5; }
    .__mu-send:disabled { opacity:.4; cursor:not-allowed; }

    .__mu-hint { position:absolute; bottom:4px; right:68px; background:rgba(0,0,0,.6); border-radius:6px; padding:4px 8px; font-size:10px; color:rgba(255,255,255,.35); white-space:nowrap; opacity:0; transition:opacity .3s; pointer-events:none; }
    .__mu-fab:hover ~ .__mu-hint { opacity:1; }
  \`;

  var state = 'idle';
  var ws = null;
  var recognition = null;
  var speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  var currentTranscript = '';
  var history = [];
  var panelOpen = false;
  var connected = false;
  var el = {};

  try {
    var saved = sessionStorage.getItem('__murmur_history');
    if (saved) history = JSON.parse(saved);
  } catch(e) {}

  function saveHistory() {
    try { sessionStorage.setItem('__murmur_history', JSON.stringify(history.slice(-50))); } catch(e) {}
  }

  function capturePageHtml() {
    var clone = document.documentElement.cloneNode(true);
    var overlay = clone.querySelector('.__mu');
    if (overlay) overlay.remove();
    var scripts = clone.querySelectorAll('script[src*="__murmur"]');
    scripts.forEach(function(s) { s.remove(); });
    return clone.outerHTML;
  }

  function createUI() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.className = '__mu';
    root.innerHTML = [
      '<div class="__mu-panel">',
        '<div class="__mu-panel-hdr">',
          '<div class="__mu-panel-title"><div class="__mu-panel-dot"></div>murmur</div>',
          '<div class="__mu-panel-actions">',
            '<button class="__mu-panel-btn __mu-undo-btn">' + ICON_UNDO + ' undo</button>',
            '<button class="__mu-panel-btn __mu-close-btn">\\u00d7</button>',
          '</div>',
        '</div>',
        '<div class="__mu-history"></div>',
        '<div class="__mu-input-row">',
          '<input class="__mu-input" type="text" placeholder="Describe a change..." />',
          '<button class="__mu-send">' + ICON_SEND + '</button>',
        '</div>',
      '</div>',
      '<div class="__mu-transcript">',
        '<span class="__mu-transcript-text"></span>',
        '<span class="__mu-transcript-status"></span>',
      '</div>',
      '<button class="__mu-fab">',
        '<div class="__mu-pulse"></div>',
        '<div class="__mu-pulse2"></div>',
        '<span class="__mu-fab-icon">' + ICON_MIC + '</span>',
      '</button>',
      '<div class="__mu-hint">' + (speechSupported ? 'Click to speak or press /' : 'Press / to type') + '</div>',
    ].join('');

    document.body.appendChild(root);

    el.root = root;
    el.fab = root.querySelector('.__mu-fab');
    el.fabIcon = root.querySelector('.__mu-fab-icon');
    el.transcript = root.querySelector('.__mu-transcript');
    el.transcriptText = root.querySelector('.__mu-transcript-text');
    el.transcriptStatus = root.querySelector('.__mu-transcript-status');
    el.panel = root.querySelector('.__mu-panel');
    el.historyEl = root.querySelector('.__mu-history');
    el.input = root.querySelector('.__mu-input');
    el.sendBtn = root.querySelector('.__mu-send');
    el.undoBtn = root.querySelector('.__mu-undo-btn');
    el.closeBtn = root.querySelector('.__mu-close-btn');
    el.dot = root.querySelector('.__mu-panel-dot');

    renderHistory();
  }

  function bindEvents() {
    el.fab.addEventListener('click', function() {
      if (state === 'idle') {
        if (speechSupported) startListening();
        else togglePanel();
      } else if (state === 'listening') {
        stopListening();
      }
    });

    el.sendBtn.addEventListener('click', function() { submitTextInput(); });
    el.input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTextInput(); }
    });
    el.closeBtn.addEventListener('click', function() { togglePanel(false); });
    el.undoBtn.addEventListener('click', function() { sendUndo(); });

    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        if (e.key === 'Escape') { e.target.blur(); togglePanel(false); }
        return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        togglePanel(true);
        setTimeout(function() { el.input.focus(); }, 100);
      }
      if (e.key === 'Escape') {
        if (state === 'listening') stopListening();
        else togglePanel(false);
      }
    });
  }

  function togglePanel(force) {
    panelOpen = force !== undefined ? force : !panelOpen;
    el.panel.classList.toggle('open', panelOpen);
    el.transcript.classList.remove('visible');
  }

  function submitTextInput() {
    var text = el.input.value.trim();
    if (!text || state === 'processing') return;
    el.input.value = '';
    sendCommand(text);
  }

  function setState(newState, data) {
    state = newState;
    data = data || {};

    el.fab.className = '__mu-fab ' + newState;

    switch (newState) {
      case 'idle':
        el.fabIcon.innerHTML = ICON_MIC;
        el.transcript.classList.remove('visible');
        break;
      case 'listening':
        el.fabIcon.innerHTML = ICON_STOP;
        el.transcript.classList.add('visible');
        el.transcriptText.textContent = currentTranscript || 'Listening...';
        el.transcriptStatus.textContent = 'Speak your change';
        break;
      case 'processing':
        el.fabIcon.innerHTML = '<span class="__mu-spinner">' + ICON_MIC + '</span>';
        el.transcriptText.textContent = data.transcript || currentTranscript;
        el.transcriptStatus.textContent = 'Thinking...';
        el.transcript.classList.add('visible');
        break;
      case 'applied':
        el.fabIcon.innerHTML = ICON_CHECK;
        el.transcriptText.textContent = data.summary || 'Changes applied';
        el.transcriptStatus.textContent = '';
        el.transcript.classList.add('visible');
        setTimeout(function() { if (state === 'applied') setState('idle'); }, 3000);
        break;
      case 'error':
        el.fabIcon.innerHTML = ICON_X;
        el.transcriptText.textContent = data.message || 'Something went wrong';
        el.transcriptStatus.textContent = '';
        el.transcript.classList.add('visible');
        setTimeout(function() { if (state === 'error') setState('idle'); }, 4000);
        break;
    }
  }

  function addHistoryItem(text, status, summary) {
    history.push({ text: text, status: status, summary: summary || '', ts: Date.now() });
    saveHistory();
    renderHistory();
  }

  function updateLastHistoryItem(status, summary) {
    if (history.length === 0) return;
    var last = history[history.length - 1];
    last.status = status;
    if (summary) last.summary = summary;
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    if (!el.historyEl) return;
    if (history.length === 0) {
      el.historyEl.innerHTML = '<div class="__mu-empty">' + (speechSupported ? 'Click the mic and describe a change' : 'Press / and describe a change') + '</div>';
      return;
    }
    el.historyEl.innerHTML = history.map(function(h) {
      var icon = h.status === 'success' ? '\\u2713' : h.status === 'error' ? '\\u2717' : h.status === 'processing' ? '\\u25cf' : '\\u25cb';
      var cls = h.status === 'success' ? 'success' : h.status === 'processing' ? 'active' : '';
      var summaryHtml = h.summary ? '<div class="__mu-item-summary">' + escapeHtml(h.summary) + '</div>' : '';
      return '<div class="__mu-item ' + cls + '"><span class="__mu-item-icon">' + icon + '</span><div class="__mu-item-body"><div class="__mu-item-text">' + escapeHtml(h.text) + '</div>' + summaryHtml + '</div></div>';
    }).join('');
    el.historyEl.scrollTop = el.historyEl.scrollHeight;
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function connectWebSocket() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = protocol + '//' + location.host + WS_PATH;
    ws = new WebSocket(url);

    ws.onopen = function() {
      connected = true;
      if (el.dot) el.dot.classList.remove('disconnected');
    };
    ws.onclose = function() {
      connected = false;
      if (el.dot) el.dot.classList.add('disconnected');
      setTimeout(connectWebSocket, RECONNECT_DELAY);
    };
    ws.onerror = function() {
      connected = false;
    };
    ws.onmessage = function(evt) {
      try {
        var msg = JSON.parse(evt.data);
        handleServerMessage(msg);
      } catch(e) {}
    };
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'status':
        if (msg.state === 'applied') {
          setState('applied', { summary: msg.summary });
          updateLastHistoryItem('success', msg.summary);
          if (panelOpen) togglePanel(true);
        } else if (msg.state === 'error') {
          setState('error', { message: msg.message });
          updateLastHistoryItem('error', msg.message);
        } else if (msg.state === 'processing') {
          setState('processing', { transcript: msg.transcript });
        }
        break;
      case 'reload':
        location.reload();
        break;
      case 'undo_done':
        if (history.length > 0) {
          history.pop();
          saveHistory();
          renderHistory();
        }
        setState('idle');
        break;
    }
  }

  function sendCommand(text) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setState('error', { message: 'Not connected to murmur server' });
      return;
    }
    var html = capturePageHtml();
    setState('processing', { transcript: text });
    addHistoryItem(text, 'processing');
    togglePanel(true);
    ws.send(JSON.stringify({ type: 'command', transcript: text, html: html }));
  }

  function sendUndo() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'undo' }));
  }

  function initSpeechRecognition() {
    if (!speechSupported) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    var silenceTimer = null;

    recognition.onresult = function(event) {
      var interim = '';
      var final = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var t = event.results[i][0].transcript;
        if (event.results[i].isFinal) { final += t; }
        else { interim += t; }
      }
      currentTranscript = (final + interim).trim();
      if (el.transcriptText) el.transcriptText.textContent = currentTranscript || 'Listening...';

      if (silenceTimer) clearTimeout(silenceTimer);
      if (currentTranscript) {
        silenceTimer = setTimeout(function() {
          if (state === 'listening' && currentTranscript) stopListening();
        }, 2500);
      }
    };

    recognition.onend = function() {
      if (state === 'listening') {
        if (currentTranscript) {
          sendCommand(currentTranscript);
          currentTranscript = '';
        } else {
          setState('idle');
        }
      }
    };

    recognition.onerror = function(event) {
      if (event.error === 'no-speech') {
        setState('idle');
      } else if (event.error !== 'aborted') {
        setState('error', { message: 'Speech error: ' + event.error });
      }
    };
  }

  function startListening() {
    if (!recognition) return;
    currentTranscript = '';
    setState('listening');
    try { recognition.start(); } catch(e) {}
  }

  function stopListening() {
    if (!recognition) return;
    try { recognition.stop(); } catch(e) {}
  }

  function init() {
    createUI();
    bindEvents();
    connectWebSocket();
    initSpeechRecognition();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();`;
}
