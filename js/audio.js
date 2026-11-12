// ════════════════════════════════════════════════════════
// HYBRID HD AUDIO + RECORDING ENGINE (js/audio.js)
// Solves mobile Safari/Chrome/In-App silent playback bugs,
// provides Neural MP3 playback + fixed Web Speech fallback,
// speed control (0.75x ~ 1.15x), and Native-vs-User voice comparison.
// ════════════════════════════════════════════════════════

const AudioEngine = (() => {
  let _rate = parseFloat((typeof localStorage !== 'undefined' && localStorage.getItem('uni_audio_rate')) || '1.0') || 1.0;
  let _activeBtn = null;
  let _activeBtnDefaultLabel = '🔊 듣기';
  let _currentToken = 0;
  let _voices = [];
  let _resumeWatchdog = null;

  // Persistent singleton HTML5 Audio element (preserves iOS user-gesture unlock)
  let _player = null;
  if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
    _player = new Audio();
    _player.preload = 'auto';
    _player.playsInline = true;
    _player.setAttribute('playsinline', '');
    _player.setAttribute('webkit-playsinline', '');
  }

  // Ensure iOS 17+ plays audio even when hardware silent switch is ON
  function ensurePlaybackSession() {
    try {
      if (typeof navigator !== 'undefined' && navigator.audioSession && navigator.audioSession.type !== 'playback') {
        navigator.audioSession.type = 'playback';
      }
    } catch (_) {}
  }

  // Cache Web Speech API voices asynchronously
  function loadVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const list = window.speechSynthesis.getVoices();
    if (list && list.length) _voices = list;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  // Convert textbook-formatted English into 100% natural spoken English
  function toSpokenEnglish(raw) {
    if (!raw) return '';
    let s = String(raw)
      .replace(/<[^>]+>/g, ' ')
      .replace(/🇺🇸|🇰🇷|🔀/g, ' ')
      .replace(/\('ve\)|\(ve\)/gi, "'ve")
      // Replace Korean grammar placeholders like 명사, 동사
      .replace(/명사/g, 'something')
      .replace(/동사/g, 'do it')
      .replace(/[가-힣]+/g, '')
      // Spaced slashes "Have a safe flight! / Have a safe trip!" -> pause
      .replace(/\s+\/\s+/g, '. ')
      // Remove optional relative pronouns / grammar notes in parens
      .replace(/\((?:that|which|who|whom|that\/which|who\/that|that\/who|which\/that|The one|would you)\)/gi, '')
      // Unwrap natural optional words like (just), (up), (him), (pretty much)
      .replace(/\(([^)]+)\)/g, '$1');

    // Trailing slash options after question mark: "the AC?/the volume/the heat?" -> "the AC?"
    s = s.replace(/\?\/[^.?!]+\??/g, '?');

    // Specific multi-word slash alternatives in dataset
    s = s
      .replace(/make a lot of noise\/too much noise/gi, 'make too much noise')
      .replace(/replace it\/get it reissued/gi, 'get it reissued')
      .replace(/some coffee\/a cup of coffee/gi, 'a cup of coffee')
      .replace(/is gonna be here\/is gonna come here\/is coming here/gi, 'is coming here')
      .replace(/sleep\/go to bed/gi, 'go to bed')
      .replace(/should\/need to\/have to/gi, 'should')
      .replace(/We shouldn't lose our focus\/We have to stay focused/gi, 'We have to stay focused')
      .replace(/we're preparing for\/we prepare for/gi, "we're preparing for")
      .replace(/is going to\/will/gi, 'is going to')
      .replace(/got divorced\/got a divorce/gi, 'got divorced')
      .replace(/and my eyes would water\/and tears would run down my face/gi, 'and my eyes would water')
      .replace(/turn up\/turn down/gi, 'turn down')
      .replace(/register\/sign up/gi, 'sign up')
      .replace(/I'll\/Let me/gi, 'Let me');

    // Remaining word-level alternatives: word1/word2(/word3) -> word1
    s = s.replace(/([A-Za-z'-]+)(?:\/[A-Za-z'-]+)+([.,!?]?)/g, '$1$2');

    // Tildes & stray symbols
    s = s
      .replace(/~/g, ' something ')
      .replace(/\s+([.,!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    return s;
  }

  // Deterministic synchronous 64-bit hex hash (matches Python generator 1:1)
  function audioHash(spoken) {
    const clean = toSpokenEnglish(spoken);
    if (!clean) return '';
    let bytes;
    if (typeof TextEncoder !== 'undefined') {
      bytes = new TextEncoder().encode(clean);
    } else {
      const utf8 = unescape(encodeURIComponent(clean));
      bytes = new Uint8Array(utf8.length);
      for (let i = 0; i < utf8.length; i++) bytes[i] = utf8.charCodeAt(i);
    }
    let h1 = 0x811c9dc5 >>> 0;
    let h2 = 0x01000193 >>> 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ b, 0x85ebca6b) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  function resetBtnUI() {
    if (_activeBtn) {
      _activeBtn.classList.remove('speaking');
      if (_activeBtn.dataset && _activeBtn.dataset.origLabel) {
        _activeBtn.innerHTML = _activeBtn.dataset.origLabel;
      } else {
        _activeBtn.textContent = _activeBtnDefaultLabel;
      }
      _activeBtn = null;
    }
  }

  function setBtnSpeaking(btnEl) {
    if (!btnEl) return;
    if (!btnEl.dataset.origLabel) {
      btnEl.dataset.origLabel = btnEl.innerHTML;
    }
    _activeBtn = btnEl;
    btnEl.classList.add('speaking');
    const isCompact = btnEl.classList.contains('small') || btnEl.textContent.trim().length <= 3;
    btnEl.textContent = isCompact ? '⏹' : '⏹ 정지';
  }

  function stop() {
    _currentToken++;
    if (_resumeWatchdog) {
      clearInterval(_resumeWatchdog);
      _resumeWatchdog = null;
    }
    if (_player) {
      try {
        _player.pause();
        _player.currentTime = 0;
      } catch (_) {}
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
      } catch (_) {}
    }
    resetBtnUI();
  }

  function pickBestWebVoice() {
    if (!_voices.length) loadVoices();
    const en = _voices.filter(v => /^en[-_]/i.test(v.lang));
    if (!en.length) return null;
    const preferredNames = ['Ava', 'Samantha', 'Allison', 'Google US English', 'Natural', 'Karen', 'Daniel', 'Alex'];
    for (const name of preferredNames) {
      const found = en.find(v => v.name.includes(name));
      if (found) return found;
    }
    return en.find(v => /en[-_]US/i.test(v.lang) && v.localService) || en.find(v => /en[-_]US/i.test(v.lang)) || en[0];
  }

  function playWebSpeechFallback(spoken, token, rateOverride, onDone) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resetBtnUI();
      if (onDone) onDone({ duration: 2.0, engine: 'none' });
      return;
    }
    const synth = window.speechSynthesis;
    const startSpeak = () => {
      if (token !== _currentToken) return;
      const u = new SpeechSynthesisUtterance(spoken);
      u.lang = 'en-US';
      u.rate = Math.max(0.6, Math.min(1.3, (rateOverride || _rate) * 0.94));
      u.pitch = 1.0;
      const v = pickBestWebVoice();
      if (v) u.voice = v;

      const startedAt = Date.now();
      // Chrome pause-freeze watchdog
      _resumeWatchdog = setInterval(() => {
        if (synth.paused) synth.resume();
      }, 4000);

      const finish = () => {
        if (_resumeWatchdog) { clearInterval(_resumeWatchdog); _resumeWatchdog = null; }
        if (token !== _currentToken) return;
        resetBtnUI();
        const elapsed = Math.max(1.6, (Date.now() - startedAt) / 1000);
        if (onDone) onDone({ duration: elapsed, engine: 'webspeech' });
      };
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
    };

    // Safari WebKit bug workaround: never call speak() synchronously right on top of cancel() if already speaking
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(startSpeak, 60);
    } else {
      startSpeak();
    }
  }

  function speak(rawText, btnEl, opts = {}) {
    if (!rawText) return Promise.resolve({ duration: 0 });
    // Toggle off if user clicked the exact same button that is currently speaking
    if (btnEl && _activeBtn === btnEl) {
      stop();
      return Promise.resolve({ cancelled: true, duration: 0 });
    }

    stop();
    ensurePlaybackSession();

    const spoken = toSpokenEnglish(rawText);
    if (!spoken) return Promise.resolve({ duration: 0 });

    const token = ++_currentToken;
    const playRate = opts.rate || _rate;
    if (btnEl) setBtnSpeaking(btnEl);

    return new Promise((resolve) => {
      const done = (info) => {
        updateAudioBadge(info && info.engine === 'mp3' ? 'HD 원어민' : '브라우저 음성');
        if (opts.onEnd) opts.onEnd(info);
        resolve(info);
      };

      // Multi-sentence concatenated script reading: check if pre-generated MP3 exists first!
      const hash = audioHash(spoken);
      if (!_player || !hash || opts.forceWebSpeech) {
        playWebSpeechFallback(spoken, token, playRate, done);
        return;
      }

      const src = `audio/${hash}.mp3`;
      let settled = false;

      const cleanupListeners = () => {
        _player.onended = null;
        _player.onerror = null;
      };

      _player.onended = () => {
        if (settled || token !== _currentToken) return;
        settled = true;
        cleanupListeners();
        const dur = (_player.duration && isFinite(_player.duration)) ? (_player.duration / playRate) : 2.2;
        resetBtnUI();
        done({ duration: dur, engine: 'mp3' });
      };

      _player.onerror = () => {
        if (settled || token !== _currentToken) return;
        settled = true;
        cleanupListeners();
        playWebSpeechFallback(spoken, token, playRate, done);
      };

      try {
        _player.src = src;
        _player.playbackRate = playRate;
        if ('preservesPitch' in _player) _player.preservesPitch = true;
        if ('webkitPreservesPitch' in _player) _player.webkitPreservesPitch = true;

        const playPromise = _player.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            if (settled || token !== _currentToken) return;
            settled = true;
            cleanupListeners();
            playWebSpeechFallback(spoken, token, playRate, done);
          });
        }
      } catch (_) {
        if (!settled && token === _currentToken) {
          settled = true;
          cleanupListeners();
          playWebSpeechFallback(spoken, token, playRate, done);
        }
      }
    });
  }

  // Play an array of texts sequentially (e.g. Full Script or Chapter Radio Mode)
  async function speakSequence(items, btnEl, onStep) {
    if (btnEl && _activeBtn === btnEl) {
      stop();
      return;
    }
    stop();
    const seqToken = ++_currentToken;
    if (btnEl) setBtnSpeaking(btnEl);

    for (let i = 0; i < items.length; i++) {
      if (seqToken !== _currentToken) break;
      if (onStep) onStep(i);
      await new Promise((res) => {
        const text = typeof items[i] === 'string' ? items[i] : items[i].text;
        const pauseAfter = (typeof items[i] === 'object' && items[i].pauseMs) || 450;
        // Play single item without resetting sequence token
        const subSpoken = toSpokenEnglish(text);
        const hash = audioHash(subSpoken);
        ensurePlaybackSession();
        if (_player && hash) {
          _player.onended = () => {
            if (seqToken !== _currentToken) return res();
            setTimeout(res, pauseAfter);
          };
          _player.onerror = () => {
            playWebSpeechFallback(subSpoken, seqToken, _rate, () => setTimeout(res, pauseAfter));
          };
          _player.src = `audio/${hash}.mp3`;
          _player.playbackRate = _rate;
          const p = _player.play();
          if (p && p.catch) {
            p.catch(() => playWebSpeechFallback(subSpoken, seqToken, _rate, () => setTimeout(res, pauseAfter)));
          }
        } else {
          playWebSpeechFallback(subSpoken, seqToken, _rate, () => setTimeout(res, pauseAfter));
        }
      });
    }
    if (seqToken === _currentToken) {
      resetBtnUI();
      if (onStep) onStep(-1);
    }
  }

  function setRate(r) {
    _rate = parseFloat(r) || 1.0;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('uni_audio_rate', String(_rate));
    }
    if (_player && !_player.paused) {
      _player.playbackRate = _rate;
    }
    document.querySelectorAll('.speed-chip').forEach(el => {
      el.classList.toggle('active', parseFloat(el.dataset.rate) === _rate);
    });
  }

  function getRate() { return _rate; }

  function updateAudioBadge(label) {
    const el = document.getElementById('global-audio-status');
    if (el) el.textContent = `🎧 ${label}`;
  }

  return {
    speak,
    speakSequence,
    stop,
    setRate,
    getRate,
    toSpokenEnglish,
    audioHash,
    ensurePlaybackSession
  };
})();

// ── User Voice Recorder (for Shadowing Self-Feedback & 5-Min Speaking)
const VoiceRecorder = (() => {
  let _mediaRecorder = null;
  let _chunks = [];
  let _stream = null;
  let _recordingKey = null;
  const _savedBlobs = {}; // key -> { url, mimeType, createdAt }
  let _userAudio = typeof Audio !== 'undefined' ? new Audio() : null;

  function isRecording(key) {
    return !!(_mediaRecorder && _mediaRecorder.state === 'recording' && (!key || _recordingKey === key));
  }

  function hasRecording(key) {
    return !!_savedBlobs[key];
  }

  function releaseStream() {
    if (_stream) {
      _stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      _stream = null;
    }
    // Restore loud playback session on iOS after mic release!
    AudioEngine.ensurePlaybackSession();
  }

  async function toggleRecord(key, onStateChange) {
    if (isRecording()) {
      stopRecord();
      return;
    }
    AudioEngine.stop();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('이 브라우저에서는 마이크 녹음을 지원하지 않습니다.');
      return;
    }
    try {
      _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeTypes = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', ''];
      let chosenMime = '';
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        chosenMime = mimeTypes.find(m => !m || MediaRecorder.isTypeSupported(m)) || '';
      }
      _chunks = [];
      _recordingKey = key;
      _mediaRecorder = chosenMime ? new MediaRecorder(_stream, { mimeType: chosenMime }) : new MediaRecorder(_stream);

      _mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) _chunks.push(e.data);
      };
      _mediaRecorder.onstop = () => {
        const type = _mediaRecorder.mimeType || chosenMime || 'audio/mp4';
        const blob = new Blob(_chunks, { type });
        if (_savedBlobs[key] && _savedBlobs[key].url) {
          URL.revokeObjectURL(_savedBlobs[key].url);
        }
        _savedBlobs[key] = { url: URL.createObjectURL(blob), type };
        releaseStream();
        _mediaRecorder = null;
        if (onStateChange) onStateChange('stopped', true);
      };

      _mediaRecorder.start();
      if (onStateChange) onStateChange('recording', false);
    } catch (err) {
      releaseStream();
      alert('마이크 권한을 허용해주세요! (브라우저 주소창 마이크 아이콘 확인)');
      if (onStateChange) onStateChange('error', false);
    }
  }

  function stopRecord() {
    if (_mediaRecorder && _mediaRecorder.state === 'recording') {
      try { _mediaRecorder.stop(); } catch (_) { releaseStream(); }
    } else {
      releaseStream();
    }
  }

  function playUserRecording(key, btnEl) {
    const rec = _savedBlobs[key];
    if (!rec || !_userAudio) return Promise.resolve();
    AudioEngine.stop();
    AudioEngine.ensurePlaybackSession();
    return new Promise((resolve) => {
      if (btnEl) btnEl.classList.add('speaking');
      _userAudio.src = rec.url;
      _userAudio.onended = _userAudio.onerror = () => {
        if (btnEl) btnEl.classList.remove('speaking');
        resolve();
      };
      const p = _userAudio.play();
      if (p && p.catch) p.catch(() => {
        if (btnEl) btnEl.classList.remove('speaking');
        resolve();
      });
    });
  }

  // Play Native HD Audio -> 350ms pause -> User's Recorded Voice back-to-back!
  async function compareWithNative(nativeText, key, btnEl) {
    if (!hasRecording(key)) return;
    if (btnEl) btnEl.classList.add('speaking');
    await AudioEngine.speak(nativeText, null);
    await new Promise(r => setTimeout(r, 380));
    await playUserRecording(key, null);
    if (btnEl) btnEl.classList.remove('speaking');
  }

  return {
    toggleRecord,
    stopRecord,
    isRecording,
    hasRecording,
    playUserRecording,
    compareWithNative
  };
})();

// Global backwards-compatible helpers
function speak(text, btnEl, opts) { return AudioEngine.speak(text, btnEl, opts); }
function speakById(elId, btnEl) {
  const el = document.getElementById(elId);
  if (el) return AudioEngine.speak(el.innerText || el.textContent, btnEl);
}
function spkSpeak(text, btnEl) { return AudioEngine.speak(text, btnEl); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioEngine };
}
