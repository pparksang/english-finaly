// ════════════════════════════════════════════════════════
// MAIN STUDY APPLICATION (js/app.js)
// Integrates Visual Scene Association, Camera Chunk Flow,
// Auto-Shadowing Studio + Voice Comparison, Chunk Builder,
// Spaced Repetition (SRS), and Chapter Radio Mode.
// ════════════════════════════════════════════════════════

function escAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function speakEl(btn) {
  if (!btn) return;
  const txt = btn.getAttribute('data-speak') || '';
  if (txt) AudioEngine.speak(txt, btn);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── STATE
let state = {
  completedG: JSON.parse(localStorage.getItem('uni_cg') || '{}'),
  completedM: JSON.parse(localStorage.getItem('uni_cm') || '{}'),
  completedP: JSON.parse(localStorage.getItem('uni_cp') || '[]'),
  bookmarksG: JSON.parse(localStorage.getItem('uni_bg') || '{}'),
  bookmarksM: JSON.parse(localStorage.getItem('uni_bm') || '{}'),
  srs: JSON.parse(localStorage.getItem('uni_srs') || '{}'), // id -> { level:'hard'|'good'|'easy', due:timestamp }
  streak: JSON.parse(localStorage.getItem('uni_streak') || '{"days":0,"lastDate":"","todayCount":0,"todayDate":""}'),
  autoSpeakCard: localStorage.getItem('uni_autospeak') !== 'false',
  shadowRepeat: parseInt(localStorage.getItem('uni_shadow_rep') || '2', 10) || 2,
  currentTab: 'home',
  chapterView: null,
  patternView: null,
  timer: { remaining: 300, total: 300, running: false, id: null },
  speakingTopic: null
};

// Auto-Shadowing runtime controller
let _autoShadow = {
  running: false,
  token: 0,
  timerId: null
};

function stopAutoShadow() {
  _autoShadow.running = false;
  _autoShadow.swapLoop = false;
  _autoShadow.activeSwapIdx = -1;
  _autoShadow.token++;
  if (_autoShadow.timerId) {
    clearTimeout(_autoShadow.timerId);
    _autoShadow.timerId = null;
  }
  AudioEngine.stop();
  const meter = document.getElementById('shadowSpeakMeter');
  if (meter) meter.classList.remove('active');
  const btn = document.getElementById('autoShadowBtn');
  if (btn) {
    btn.classList.remove('running');
    btn.innerHTML = '▶ 실전 자동 쉐도잉 시작';
  }
  const sbtn = document.getElementById('autoSwapBtn');
  if (sbtn) {
    sbtn.classList.remove('running');
    sbtn.innerHTML = '▶ 원문+변주 3연속 자동말하기';
  }
}

function save() {
  localStorage.setItem('uni_cg', JSON.stringify(state.completedG));
  localStorage.setItem('uni_cm', JSON.stringify(state.completedM));
  localStorage.setItem('uni_cp', JSON.stringify(state.completedP));
  localStorage.setItem('uni_bg', JSON.stringify(state.bookmarksG));
  localStorage.setItem('uni_bm', JSON.stringify(state.bookmarksM));
  localStorage.setItem('uni_srs', JSON.stringify(state.srs));
  localStorage.setItem('uni_streak', JSON.stringify(state.streak));
}

function recordStudyActivity() {
  const t = todayStr();
  if (state.streak.todayDate !== t) {
    state.streak.todayCount = 0;
    state.streak.todayDate = t;
  }
  state.streak.todayCount = (state.streak.todayCount || 0) + 1;

  if (state.streak.lastDate !== t) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    if (state.streak.lastDate === yStr) {
      state.streak.days = (state.streak.days || 0) + 1;
    } else {
      state.streak.days = 1;
    }
    state.streak.lastDate = t;
  }
  save();
}

function rateSRS(itemKey, level) {
  const now = Date.now();
  const dayMs = 86400000;
  // 'hard' stays due immediately/tomorrow so user can review tough sentences right away
  const offset = level === 'hard' ? 0 : level === 'good' ? 3 * dayMs : 7 * dayMs;
  state.srs[itemKey] = { level, due: now + offset, updatedAt: now };
  recordStudyActivity();
  save();
}

function buildSmartReviewChapter() {
  const now = Date.now();
  const items = [];
  const seen = new Set();

  const pushSent = (s, tag, itemKey) => {
    if (seen.has(itemKey)) return;
    seen.add(itemKey);
    items.push({ kr: s.kr, en: s.en, _reviewTag: tag, _srsKey: itemKey });
  };

  // 1. Due or 'hard' SRS items
  GYEOLLON_CHAPTERS.forEach((ch, ci) => {
    ch.sentences.forEach((s, si) => {
      const k = `g-${ci}-${si}`;
      const r = state.srs[k];
      if ((r && (r.level === 'hard' || r.due <= now)) || state.bookmarksG[`${ci}-${si}`]) {
        pushSent(s, state.bookmarksG[`${ci}-${si}`] ? `★ 결론 ${ch.label}` : `복습 · 결론 ${ch.label}`, k);
      }
    });
  });
  MOUSE_CHAPTERS.forEach((ch, ci) => {
    ch.sentences.forEach((s, si) => {
      const k = `m-${ci}-${si}`;
      const r = state.srs[k];
      if ((r && (r.level === 'hard' || r.due <= now)) || state.bookmarksM[`${ci}-${si}`]) {
        pushSent(s, state.bookmarksM[`${ci}-${si}`] ? `★ 마우스 ${ch.label}` : `복습 · 마우스 ${ch.label}`, k);
      }
    });
  });

  // If user has no bookmarks/SRS yet, build a curated 12-sentence starter booster mix!
  let isStarter = false;
  if (items.length === 0) {
    isStarter = true;
    for (let i = 0; i < Math.min(6, GYEOLLON_CHAPTERS.length); i++) {
      const ch = GYEOLLON_CHAPTERS[i];
      if (ch.sentences[0]) pushSent(ch.sentences[0], `추천 · 결론 ${ch.label}`, `g-${i}-0`);
    }
    for (let i = 0; i < Math.min(6, MOUSE_CHAPTERS.length); i++) {
      const ch = MOUSE_CHAPTERS[i];
      if (ch.sentences[0]) pushSent(ch.sentences[0], `추천 · 마우스 ${ch.label}`, `m-${i}-0`);
    }
  }

  return {
    isStarter,
    dueCount: isStarter ? 0 : items.length,
    chapter: {
      id: 'review',
      label: 'SRS',
      title: isStarter ? '오늘의 핵심 워밍업 12문장' : `스마트 복습 (${items.length}문장)`,
      subtitle: '간격 반복 & 별표 북마크 집중 훈련',
      pattern: '결론 먼저 + 장면 연상 집중 복습',
      vocab: GYEOLLON_CHAPTERS[0].vocab || [],
      sentences: items
    }
  };
}

// ════════════════════════════════════════════════════════
// ROUTING / TABS
// ════════════════════════════════════════════════════════
function switchTab(tab) {
  stopAutoShadow();
  VoiceRecorder.stopRecord();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + tab);
  const navEl = document.getElementById('nav-' + tab);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');
  state.currentTab = tab;

  if (tab === 'home') renderHome();
  else if (tab === 'gyeollon') renderGyeollonList();
  else if (tab === 'mouse') renderMouseList();
  else if (tab === 'pattern') renderPatternHome();
  else if (tab === 'speaking') renderSpeakingPage();
}
function openApp(app) { switchTab(app); }
function goHome() {
  stopAutoShadow();
  state.chapterView = null;
  state.patternView = null;
  switchTab('home');
}

function openSmartReview() {
  stopAutoShadow();
  const rev = buildSmartReviewChapter();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
  document.getElementById('page-gyeollon').classList.add('active');
  document.getElementById('nav-gyeollon').classList.add('active');
  state.currentTab = 'gyeollon';
  state.chapterView = {
    type: 'review',
    customChapter: rev.chapter,
    chIdx: 0,
    sentIdx: 0,
    mode: 'card',
    revealed: false
  };
  renderChapterStudy();
}

// ════════════════════════════════════════════════════════
// HOME DASHBOARD
// ════════════════════════════════════════════════════════
function getGyeollonStats() {
  const total = GYEOLLON_CHAPTERS.reduce((a, c) => a + c.sentences.length, 0);
  const done = Object.keys(state.completedG).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
function getMouseStats() {
  const total = MOUSE_CHAPTERS.reduce((a, c) => a + c.sentences.length, 0);
  const done = Object.keys(state.completedM).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
function getPatternStats() {
  const done = state.completedP.length;
  return { done, pct: Math.round((done / 30) * 100) };
}

function renderHome() {
  const g = getGyeollonStats(), m = getMouseStats(), p = getPatternStats();
  const totalSent = g.total + m.total;
  const doneSent = g.done + m.done;
  const overallPct = totalSent ? Math.round((doneSent / totalSent) * 100) : 0;

  const t = todayStr();
  const todayCnt = state.streak.todayDate === t ? (state.streak.todayCount || 0) : 0;
  const streakDays = state.streak.days || 0;

  document.getElementById('home-total-sent').textContent = totalSent;
  document.getElementById('home-done-sent').textContent = doneSent;
  document.getElementById('home-pattern-done').textContent = p.done;
  document.getElementById('home-total-pct').textContent = overallPct + '%';

  const streakEl = document.getElementById('home-streak-tag');
  if (streakEl) {
    streakEl.textContent = `🔥 연속 ${streakDays}일 · 오늘 ${todayCnt}회`;
  }

  const rev = buildSmartReviewChapter();
  const srTitle = document.getElementById('home-sr-title');
  const srDesc = document.getElementById('home-sr-desc');
  if (srTitle && srDesc) {
    if (rev.dueCount > 0) {
      srTitle.innerHTML = `🧠 오늘의 복습 대기 <span style="color:var(--gold)">${rev.dueCount}문장</span>`;
      srDesc.textContent = '어려움 체크 · 복습 주기 도래 · ★ 별표 문장을 이미지 연상으로 집중 복습해요';
    } else {
      srTitle.innerHTML = `🚀 핵심 워밍업 <span style="color:var(--cyan)">12문장 코스</span>`;
      srDesc.textContent = '카드에서 ☆ 별표나 [어려움]을 누르면 이곳에 나만의 스마트 복습함이 쌓여요!';
    }
  }

  document.getElementById('home-gyeollon-pct').textContent = g.pct + '%';
  document.getElementById('home-gyeollon-bar').style.width = g.pct + '%';
  document.getElementById('home-gyeollon-desc').textContent = `${g.done}/${g.total} 문장 · 이미지연상 + 어순조립`;
  document.getElementById('home-mouse-pct').textContent = m.pct + '%';
  document.getElementById('home-mouse-bar').style.width = m.pct + '%';
  document.getElementById('home-mouse-desc').textContent = `${m.done}/${m.total} 문장 · 원어민 자동쉐도잉`;
  document.getElementById('home-pattern-pct').textContent = p.pct + '%';
  document.getElementById('home-pattern-bar').style.width = p.pct + '%';
  const nextDay = state.completedP.length > 0 ? Math.min(Math.max(...state.completedP) + 1, 30) : 1;
  document.getElementById('home-pattern-desc').textContent = `오늘: Day ${nextDay} — ${PATTERNS[nextDay - 1].pattern}`;
  document.getElementById('home-speaking-desc').textContent = state.speakingTopic
    ? `주제: ${state.speakingTopic.en}`
    : '실전 녹음 + 원어민 스크립트 연속듣기';
}

// ════════════════════════════════════════════════════════
// CHAPTER LISTS
// ════════════════════════════════════════════════════════
function renderChapterList(type, chapters, completedObj, container, badgeEl) {
  stopAutoShadow();
  const pageHeader = container && container.parentElement ? container.parentElement.querySelector(':scope > .inner-header') : null;
  if (pageHeader) pageHeader.style.display = 'flex';
  const totalDone = Object.keys(completedObj).length;
  const totalSent = chapters.reduce((a, c) => a + c.sentences.length, 0);
  badgeEl.textContent = `${totalDone}/${totalSent}`;

  let html = '<div class="chapter-list-scroll"><div class="ch-grid">';
  chapters.forEach((ch, ci) => {
    const chDone = ch.sentences.filter((_, si) => completedObj[`${ci}-${si}`]).length;
    const chPct = Math.round((chDone / ch.sentences.length) * 100);
    const done100 = chPct === 100;
    html += `<div class="ch-card ${done100 ? 'done' : ''}" onclick="${type}OpenChapter(${ci})">
      <div class="ch-label">${ch.label}</div>
      <div class="ch-info">
        <div class="ch-title">${ch.title}</div>
        <div class="ch-sub">${ch.subtitle} · ${ch.sentences.length}문장</div>
      </div>
      <div class="ch-right">
        ${done100 ? '<div class="ch-done-badge">✓ 완료</div>' : `<div class="ch-pct">${chPct}%</div><div class="ch-pbar"><div class="ch-pfill" style="width:${chPct}%"></div></div>`}
      </div>
    </div>`;
  });
  html += '</div></div>';
  container.innerHTML = html;
}

function gyeollonOpenChapter(ci) {
  state.chapterView = { type: 'gyeollon', chIdx: ci, sentIdx: 0, mode: 'card', revealed: false };
  renderChapterStudy();
}
function mouseOpenChapter(ci) {
  state.chapterView = { type: 'mouse', chIdx: ci, sentIdx: 0, mode: 'card', revealed: false };
  renderChapterStudy();
}
function renderGyeollonList() {
  renderChapterList('gyeollon', GYEOLLON_CHAPTERS, state.completedG,
    document.getElementById('gyeollon-content'),
    document.getElementById('gyeollon-badge'));
}
function renderMouseList() {
  renderChapterList('mouse', MOUSE_CHAPTERS, state.completedM,
    document.getElementById('mouse-content'),
    document.getElementById('mouse-badge'));
}

// ════════════════════════════════════════════════════════
// CHAPTER STUDY CORE
// ════════════════════════════════════════════════════════
function getChapterData() {
  const cv = state.chapterView;
  if (cv.type === 'review') {
    return {
      ch: cv.customChapter,
      chapters: [cv.customChapter],
      completed: state.completedG,
      bookmarks: state.bookmarksG,
      prefix: 'rev'
    };
  }
  const chapters = cv.type === 'gyeollon' ? GYEOLLON_CHAPTERS : MOUSE_CHAPTERS;
  const completed = cv.type === 'gyeollon' ? state.completedG : state.completedM;
  const bookmarks = cv.type === 'gyeollon' ? state.bookmarksG : state.bookmarksM;
  const prefix = cv.type === 'gyeollon' ? 'g' : 'm';
  return { ch: chapters[cv.chIdx], chapters, completed, bookmarks, prefix };
}

function getCurrentSrsKey() {
  const cv = state.chapterView;
  const { ch, prefix } = getChapterData();
  const s = ch.sentences[cv.sentIdx];
  return (s && s._srsKey) ? s._srsKey : `${prefix}-${cv.chIdx}-${cv.sentIdx}`;
}

function renderChapterStudy() {
  const cv = state.chapterView;
  const { ch } = getChapterData();
  const containerId = cv.type === 'mouse' ? 'mouse-content' : 'gyeollon-content';
  const container = document.getElementById(containerId);
  const pageHeader = container && container.parentElement ? container.parentElement.querySelector(':scope > .inner-header') : null;
  if (pageHeader) pageHeader.style.display = 'none';

  const modeLabels = {
    card: '🎨 연상카드',
    swap: '🔄 갈아끼우기',
    shadow: '🎙 자동쉐도잉',
    chunk: '🧩 어순조립',
    list: '📋 전체·라디오',
    listen: '👂 듣고말하기',
    trans: '🔄 번역챌린지',
    pronun: '🎤 발음체크',
    flash: '⚡ 3D암기',
    quiz: '✏️ 타이핑',
    vocab: '💡 표현'
  };

  const modesHtml = `<div class="mode-bar">
    ${Object.keys(modeLabels).map(m => `<button class="mode-pill ${cv.mode === m ? 'active' : ''}" onclick="chSetMode('${m}')">${modeLabels[m]}</button>`).join('')}
  </div>`;

  let bodyHtml = '';
  if (cv.mode === 'card') bodyHtml = renderCardMode(ch);
  else if (cv.mode === 'swap') bodyHtml = renderSwapMode(ch);
  else if (cv.mode === 'shadow') bodyHtml = renderShadowMode(ch);
  else if (cv.mode === 'chunk') bodyHtml = renderChunkMode(ch);
  else if (cv.mode === 'list') bodyHtml = renderListMode(ch);
  else if (cv.mode === 'vocab') bodyHtml = renderVocabMode(ch);
  else if (cv.mode === 'quiz') bodyHtml = renderQuizMode(ch);
  else if (cv.mode === 'listen') bodyHtml = renderListenMode(ch);
  else if (cv.mode === 'trans') bodyHtml = renderTransMode(ch);
  else if (cv.mode === 'flash') bodyHtml = renderFlashMode(ch);
  else if (cv.mode === 'pronun') bodyHtml = renderChPronunMode(ch);

  const backAction = cv.type === 'review'
    ? 'goHome()'
    : (cv.type === 'gyeollon' ? 'renderGyeollonList()' : 'renderMouseList()');

  container.innerHTML = `
    <div class="inner-header">
      <button class="back-btn" onclick="${backAction}">←</button>
      <span style="flex:1;font-size:14px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ch.label} — ${ch.title}</span>
      <span style="font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace;flex-shrink:0">${cv.sentIdx + 1}/${ch.sentences.length}</span>
    </div>
    ${modesHtml}
    <div class="study-body fade-in" id="study-body">${bodyHtml}</div>
  `;
}

function chSetMode(m) {
  stopAutoShadow();
  VoiceRecorder.stopRecord();
  const cv = state.chapterView;
  cv.mode = m;
  cv.revealed = false;
  cv.shadowStep = 1;
  cv.listenPhase = 'listen';
  cv.transRevealed = false;
  cv.flashFlipped = false;
  cv.chunkState = null;
  cv.swapRevealed = {};
  renderChapterStudy();
}

// ════════════════════════════════════════════════════════
// 1. 🎨 연상카드 (Visual Scene + Camera Chunk Flow + SRS)
// ════════════════════════════════════════════════════════
function renderCardMode(ch) {
  const cv = state.chapterView;
  const { completed, bookmarks } = getChapterData();
  const s = ch.sentences[cv.sentIdx];
  const key = `${cv.chIdx}-${cv.sentIdx}`;
  const srsKey = getCurrentSrsKey();
  const isDone = !!completed[key];
  const isBm = !!bookmarks[key];
  const srsInfo = state.srs[srsKey];

  const sceneHtml = VisualEngine.renderSceneCardHTML(s.en, s.kr, srsKey, {
    pattern: ch.pattern,
    showChunks: !!cv.revealed
  });

  const enHtml = cv.revealed ? `
    <div class="flash-en-wrap">
      <div class="flash-en" id="flashEnText">${s.en}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="tts-btn" data-speak="${escAttr(s.en)}" onclick="event.stopPropagation();speakEl(this)">🔊 원어민 발음 듣기</button>
        <button class="tts-btn small" style="border-color:var(--border2);color:var(--text2);background:var(--bg3)"
          onclick="event.stopPropagation();toggleAutoSpeak()">
          ${state.autoSpeakCard ? '🔔 자동재생 ON' : '🔕 자동재생 OFF'}
        </button>
        ${isDone ? '<span style="font-size:11px;color:var(--green);font-weight:700">✓ 학습됨</span>' : ''}
      </div>
      <button class="card-swap-jump-btn" onclick="event.stopPropagation();chSetMode('swap')">
        🔄 이 뼈대로 단어 갈아끼우기 (3연속 응용) →
      </button>
      <div class="srs-rate-bar" onclick="event.stopPropagation()">
        <button class="srs-btn hard" onclick="chRateAndNext('hard')">😓 어려움 · 복습함</button>
        <button class="srs-btn good" onclick="chRateAndNext('good')">🙂 보통 · 3일뒤</button>
        <button class="srs-btn easy" onclick="chRateAndNext('easy')">😎 완벽 · 7일뒤</button>
      </div>
      ${srsInfo ? `<div style="font-size:10px;color:var(--text3);margin-top:6px;text-align:center">최근 기억 상태: ${srsInfo.level === 'hard' ? '😓 집중복습 대상' : srsInfo.level === 'good' ? '🙂 3일 주기' : '😎 장기기억'}</div>` : ''}
    </div>
  ` : `<button class="flash-reveal-btn" onclick="event.stopPropagation();chReveal()">▶ 장면 떠올린 후 영어+발음 확인</button>`;

  return `
    ${sceneHtml}
    <div class="flash-inner ${isDone ? 'revealed' : ''}" ${!cv.revealed ? 'onclick="chReveal()"' : ''}>
      <span class="flash-counter">${s._reviewTag ? s._reviewTag + ' · ' : ''}${cv.sentIdx + 1} / ${ch.sentences.length}</span>
      ${cv.type !== 'review' ? `<button class="flash-bm ${isBm ? 'active' : ''}" onclick="chToggleBm(event,'${key}')">${isBm ? '★' : '☆'}</button>` : ''}
      <div class="flash-kr" style="margin-top:10px">${s.kr}</div>
      ${enHtml}
    </div>
    <div class="card-nav">
      <button class="cnav-btn" onclick="chPrev()" ${cv.sentIdx === 0 ? 'disabled' : ''}>← 이전</button>
      <button class="cnav-btn primary" onclick="chNext()" ${cv.sentIdx === ch.sentences.length - 1 ? 'disabled' : ''}>다음 문장 →</button>
    </div>
  `;
}

function toggleAutoSpeak() {
  state.autoSpeakCard = !state.autoSpeakCard;
  localStorage.setItem('uni_autospeak', String(state.autoSpeakCard));
  renderChapterStudy();
}

function chReveal() {
  const cv = state.chapterView;
  cv.revealed = true;
  const { ch, completed } = getChapterData();
  if (cv.type !== 'review') {
    completed[`${cv.chIdx}-${cv.sentIdx}`] = true;
  }
  recordStudyActivity();
  renderChapterStudy();
  if (state.autoSpeakCard) {
    const s = ch.sentences[cv.sentIdx];
    AudioEngine.speak(s.en);
  }
}

function chRateAndNext(level) {
  const { ch } = getChapterData();
  const srsKey = getCurrentSrsKey();
  rateSRS(srsKey, level);
  if (state.chapterView.sentIdx < ch.sentences.length - 1) {
    state.chapterView.sentIdx++;
    state.chapterView.revealed = false;
    renderChapterStudy();
  } else {
    renderChapterStudy();
  }
}

function chPrev() {
  if (state.chapterView.sentIdx > 0) {
    AudioEngine.stop();
    state.chapterView.sentIdx--;
    state.chapterView.revealed = false;
    renderChapterStudy();
  }
}
function chNext() {
  const { ch } = getChapterData();
  if (state.chapterView.sentIdx < ch.sentences.length - 1) {
    AudioEngine.stop();
    state.chapterView.sentIdx++;
    state.chapterView.revealed = false;
    renderChapterStudy();
  }
}
function chToggleBm(e, key) {
  e.stopPropagation();
  const bm = state.chapterView.type === 'gyeollon' ? state.bookmarksG : state.bookmarksM;
  if (bm[key]) delete bm[key]; else bm[key] = true;
  save();
  renderChapterStudy();
}

// ════════════════════════════════════════════════════════
// 1.5 🔄 단어 갈아끼우기 3연속 변주 드릴 (Slot-Swapping)
// ════════════════════════════════════════════════════════
function getActiveSwapRevealedMap() {
  if (state.currentTab === 'pattern' && state.patternView) {
    if (!state.patternView.swapRevealed) state.patternView.swapRevealed = {};
    return state.patternView.swapRevealed;
  }
  if (!state.chapterView.swapRevealed) state.chapterView.swapRevealed = {};
  return state.chapterView.swapRevealed;
}

function renderSwapDrillUI(rawEn, rawKr, itemKey, swapContext, counterLabel, prevFn, nextFn, hasPrev, modeScope) {
  const swapSet = SlotSwapEngine.getSwapSet(rawEn, rawKr, swapContext);
  const revMap = getActiveSwapRevealedMap();
  const allRevealed = swapSet.swaps.every((_, i) => !!revMap[i]);
  const userCustom = SlotSwapEngine.getUserSwap(itemKey);
  const isLooping = !!(_autoShadow.running && _autoShadow.swapLoop);

  const itemsHtml = swapSet.swaps.map((sw, idx) => {
    const isRev = !!revMap[idx];
    const isActiveLoop = isLooping && _autoShadow.activeSwapIdx === idx;
    return `
      <div class="swap-item ${isRev ? 'revealed' : ''} ${isActiveLoop ? 'active-loop' : ''}"
        onclick="swapRevealOne(${idx}, '${modeScope}')">
        <div class="swap-item-top">
          <span class="swap-step-pill">${isRev ? `✓ 변주 ${idx + 1} 입트임 완료` : `⚡ 변주 ${idx + 1} · 단어 교체`}</span>
          <span class="swap-hint-pill">💡 ${sw.hint}</span>
        </div>
        <div class="swap-kr">${sw.kr}</div>
        ${isRev ? `
          <div class="swap-en-row">
            <div class="swap-en">${sw.en}</div>
            <button class="tts-btn small" data-speak="${escAttr(sw.en)}" onclick="event.stopPropagation();speakEl(this)">🔊 듣기</button>
          </div>
        ` : `
          <div class="swap-prompt-mask">👆 뼈대에 키워드를 넣어 먼저 말해본 뒤 탭해서 확인!</div>
        `}
      </div>
    `;
  }).join('');

  return `
    <div class="swap-wrap">
      <div class="swap-loop-bar">
        <button id="autoSwapBtn" class="swap-loop-btn ${isLooping ? 'running' : ''}" onclick="toggleAutoSwapLoop('${modeScope}')">
          ${isLooping ? '⏹ 3연속 루프 중지' : '▶ 원문+변주 3연속 자동말하기'}
        </button>
        <button class="swap-reveal-all-btn" onclick="swapToggleAll('${modeScope}', ${swapSet.swaps.length})">
          ${allRevealed ? '🙈 다시 가리기' : '👀 3개 모두 보기'}
        </button>
      </div>

      <div class="shadow-speak-meter" id="shadowSpeakMeter">
        <div class="ssm-label" id="shadowSpeakLabel">👄 소리 내어 말해보세요!</div>
        <div class="ssm-track"><div class="ssm-fill" id="shadowSpeakFill"></div></div>
      </div>

      <div class="swap-frame-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div class="swap-frame-eyebrow">🦴 고정 뼈대 공식 (이 틀은 그대로 유지!)</div>
          <span style="font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace">${counterLabel}</span>
        </div>
        <div class="swap-frame-formula">${swapSet.frame}</div>
        <div class="swap-base-row">
          <div class="swap-base-texts">
            <div class="swap-base-kr">원문: ${rawKr}</div>
            <div class="swap-base-en">${rawEn}</div>
          </div>
          <button class="tts-btn small" data-speak="${escAttr(rawEn)}" onclick="speakEl(this)">🔊 원문</button>
        </div>
      </div>

      <div class="swap-list">${itemsHtml}</div>

      <div class="my-swap-box">
        <div class="my-swap-title">
          <span>✍️ 내 일상 단어로 직접 갈아끼우기</span>
          <button class="swap-reveal-all-btn" style="padding:3px 8px;font-size:10px"
            data-starter="${escAttr(swapSet.starter)}"
            onclick="swapFillStarter(this)">+ 뼈대 채우기</button>
        </div>
        <div class="my-swap-row">
          <input id="mySwapInput" class="my-swap-input" type="text"
            value="${escAttr(userCustom)}"
            placeholder="예: ${escAttr(swapSet.starter)}..."
            onchange="SlotSwapEngine.saveUserSwap('${itemKey}', this.value)" />
          <button class="tts-btn small" onclick="swapPlayMySentence('${itemKey}', this)">🔊 내 문장 발음</button>
        </div>
      </div>

      <div class="card-nav" style="margin-top:2px">
        <button class="cnav-btn" onclick="${prevFn}" ${!hasPrev ? 'disabled' : ''}>← 이전</button>
        <button class="cnav-btn primary" onclick="${nextFn}">다음 문장 변주 →</button>
      </div>
    </div>
  `;
}

function renderSwapMode(ch) {
  const cv = state.chapterView;
  const s = ch.sentences[cv.sentIdx];
  const srsKey = getCurrentSrsKey();
  return renderSwapDrillUI(
    s.en, s.kr, srsKey,
    { chapterPattern: ch.pattern },
    `${cv.sentIdx + 1}/${ch.sentences.length}`,
    'swapChPrev()', 'swapChNext()', cv.sentIdx > 0,
    'chapter'
  );
}

function swapRevealOne(idx, scope) {
  stopAutoShadow();
  const revMap = getActiveSwapRevealedMap();
  revMap[idx] = true;

  let rawEn = '', rawKr = '', ctx = {};
  if (scope === 'pattern') {
    const pv = state.patternView;
    const p = PATTERNS[pv.dayIdx];
    const card = p.cards[pv.cardIdx];
    rawEn = card.en.replace('🔀 ', '');
    rawKr = card.kr.replace('🔀 ', '');
    ctx = { patternTitle: p.pattern, siblingCards: p.cards };
  } else {
    const cv = state.chapterView;
    const { ch, completed } = getChapterData();
    const s = ch.sentences[cv.sentIdx];
    rawEn = s.en;
    rawKr = s.kr;
    ctx = { chapterPattern: ch.pattern };
    if (cv.type !== 'review' && revMap[0] && revMap[1] && revMap[2]) {
      completed[`${cv.chIdx}-${cv.sentIdx}`] = true;
    }
  }
  const swapSet = SlotSwapEngine.getSwapSet(rawEn, rawKr, ctx);
  recordStudyActivity();

  if (scope === 'pattern') renderPatternStudy();
  else renderChapterStudy();

  if (swapSet.swaps[idx]) {
    AudioEngine.speak(swapSet.swaps[idx].en);
  }
}

function swapToggleAll(scope, count) {
  stopAutoShadow();
  const revMap = getActiveSwapRevealedMap();
  const allOn = Array.from({ length: count }, (_, i) => !!revMap[i]).every(Boolean);
  for (let i = 0; i < count; i++) revMap[i] = !allOn;
  if (scope === 'pattern') renderPatternStudy();
  else renderChapterStudy();
}

function swapFillStarter(btn) {
  const inp = document.getElementById('mySwapInput');
  if (!inp) return;
  const starter = btn.getAttribute('data-starter') || '';
  if (!inp.value.trim()) inp.value = starter;
  inp.focus();
}

function swapPlayMySentence(itemKey, btn) {
  const inp = document.getElementById('mySwapInput');
  if (!inp || !inp.value.trim()) {
    alert('먼저 나만의 응용 영어 문장을 입력해보세요!');
    return;
  }
  const val = inp.value.trim();
  SlotSwapEngine.saveUserSwap(itemKey, val);
  recordStudyActivity();
  AudioEngine.speak(val, btn);
}

function swapChPrev() {
  stopAutoShadow();
  if (state.chapterView.sentIdx > 0) {
    state.chapterView.sentIdx--;
    state.chapterView.swapRevealed = {};
    renderChapterStudy();
  }
}

function swapChNext() {
  stopAutoShadow();
  const { ch, completed } = getChapterData();
  const cv = state.chapterView;
  if (cv.type !== 'review') {
    completed[`${cv.chIdx}-${cv.sentIdx}`] = true;
    save();
  }
  if (cv.sentIdx < ch.sentences.length - 1) {
    cv.sentIdx++;
    cv.swapRevealed = {};
    renderChapterStudy();
  } else {
    const body = document.getElementById('study-body');
    if (body) body.innerHTML = `<div class="study-complete">
      <div class="study-complete-icon">🔄</div>
      <div class="study-complete-title">단어 갈아끼우기 완주!</div>
      <div class="study-complete-sub">모든 문장의 뼈대에 새 단어를 끼워 실전 응용력을 완성했어요!</div>
      <button class="shadow-btn next" style="margin:0 auto" onclick="state.chapterView.sentIdx=0;state.chapterView.swapRevealed={};renderChapterStudy()">🔄 처음부터 다시</button>
    </div>`;
  }
}

async function toggleAutoSwapLoop(scope) {
  if (_autoShadow.running && _autoShadow.swapLoop) {
    stopAutoShadow();
    if (scope === 'pattern') renderPatternStudy();
    else renderChapterStudy();
    return;
  }

  stopAutoShadow();
  _autoShadow.running = true;
  _autoShadow.swapLoop = true;
  _autoShadow.activeSwapIdx = -1;
  const myToken = ++_autoShadow.token;

  while (_autoShadow.running && _autoShadow.token === myToken) {
    let rawEn = '', rawKr = '', ctx = {};
    if (scope === 'pattern') {
      const pv = state.patternView;
      if (!pv) break;
      const p = PATTERNS[pv.dayIdx];
      const card = p.cards[pv.cardIdx];
      rawEn = card.en.replace('🔀 ', '');
      rawKr = card.kr.replace('🔀 ', '');
      ctx = { patternTitle: p.pattern, siblingCards: p.cards };
    } else {
      const cv = state.chapterView;
      if (!cv) break;
      const { ch } = getChapterData();
      const s = ch.sentences[cv.sentIdx];
      rawEn = s.en;
      rawKr = s.kr;
      ctx = { chapterPattern: ch.pattern };
    }

    const swapSet = SlotSwapEngine.getSwapSet(rawEn, rawKr, ctx);
    const revMap = getActiveSwapRevealedMap();

    // 0. Speak Base Anchor first
    _autoShadow.activeSwapIdx = -1;
    if (scope === 'pattern') renderPatternStudy(); else renderChapterStudy();
    const baseInfo = await AudioEngine.speak(rawEn);
    if (!_autoShadow.running || _autoShadow.token !== myToken) break;
    const baseWait = Math.max(2100, Math.min(7000, ((baseInfo && baseInfo.duration) || 2.3) * 1150));
    const okBase = await waitWithMeter(Math.round(baseWait), '👄 원문 뼈대를 먼저 큰 소리로 말해보세요!', myToken);
    if (!okBase) break;

    // 1..3. Iterate through the 3 Slot Swaps!
    for (let i = 0; i < swapSet.swaps.length; i++) {
      if (!_autoShadow.running || _autoShadow.token !== myToken) break;
      _autoShadow.activeSwapIdx = i;
      revMap[i] = true;
      if (scope === 'pattern') renderPatternStudy(); else renderChapterStudy();

      const swInfo = await AudioEngine.speak(swapSet.swaps[i].en);
      if (!_autoShadow.running || _autoShadow.token !== myToken) break;
      const swWait = Math.max(2100, Math.min(7000, ((swInfo && swInfo.duration) || 2.3) * 1200));
      const okSw = await waitWithMeter(Math.round(swWait), `👄 변주 ${i + 1}/3 — 단어를 갈아끼워 바로 말하세요!`, myToken);
      if (!okSw) break;
    }

    if (!_autoShadow.running || _autoShadow.token !== myToken) break;
    recordStudyActivity();

    // Advance to next sentence!
    if (scope === 'pattern') {
      const pv = state.patternView;
      const p = PATTERNS[pv.dayIdx];
      if (pv.cardIdx < p.cards.length - 1) {
        pv.cardIdx++;
        pv.swapRevealed = {};
        _autoShadow.activeSwapIdx = -1;
        renderPatternStudy();
      } else {
        stopAutoShadow();
        if (!state.completedP.includes(p.id)) { state.completedP.push(p.id); save(); }
        renderPatternHome();
        break;
      }
    } else {
      const cv = state.chapterView;
      const { ch, completed } = getChapterData();
      if (cv.type !== 'review') {
        completed[`${cv.chIdx}-${cv.sentIdx}`] = true;
        save();
      }
      if (cv.sentIdx < ch.sentences.length - 1) {
        cv.sentIdx++;
        cv.swapRevealed = {};
        _autoShadow.activeSwapIdx = -1;
        renderChapterStudy();
      } else {
        stopAutoShadow();
        swapChNext();
        break;
      }
    }
  }
}

// ════════════════════════════════════════════════════════
// 2. 🎙 실전 자동 쉐도잉 스튜디오 (Auto-Loop + Voice Lab)
// ════════════════════════════════════════════════════════
function renderShadowMode(ch) {
  const cv = state.chapterView;
  const s = ch.sentences[cv.sentIdx];
  const pct = Math.round(((cv.sentIdx + 1) / ch.sentences.length) * 100);
  const step = cv.shadowStep || 1;
  const srsKey = getCurrentSrsKey();
  const hasRec = VoiceRecorder.hasRecording(srsKey);
  const isRec = VoiceRecorder.isRecording(srsKey);

  const stepMeta = {
    1: { desc: '1단계: 자막 없이 장면과 소리 리듬에만 귀를 집중하세요 👂' },
    2: { desc: '2단계: 영어 청크 어순을 눈으로 따라가며 원어민과 동시에/직후에 소리 내어 읽으세요 👄' },
    3: { desc: '3단계: 영어를 가리고 장면+한국어만 보며 내 입으로 직접 뱉어보세요 🙈' }
  };

  const sceneHtml = VisualEngine.renderSceneCardHTML(s.en, s.kr, srsKey, {
    compact: true,
    showChunks: step === 2
  });

  return `
    <div class="shadow-wrap">
      <div class="auto-loop-bar">
        <button id="autoShadowBtn" class="auto-loop-btn ${_autoShadow.running ? 'running' : ''}" onclick="toggleAutoShadow('chapter')">
          ${_autoShadow.running ? '⏹ 자동 쉐도잉 중지' : '▶ 실전 자동 쉐도잉 시작'}
        </button>
        <div class="loop-repeat-chips">
          <span style="font-size:10.5px;color:var(--text2);margin-right:2px">반복:</span>
          ${[1, 2, 3].map(n => `<button class="loop-rep-chip ${state.shadowRepeat === n ? 'active' : ''}" onclick="setShadowRepeat(${n})">${n}회</button>`).join('')}
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="shadow-counter">문장 ${cv.sentIdx + 1} / ${ch.sentences.length}</span>
        <span style="font-size:11px;color:var(--cyan);font-weight:700" id="shadowLoopStatus">${_autoShadow.running ? '🔄 자동 코스 진행 중...' : '수동/자동 선택 가능'}</span>
      </div>
      <div class="shadow-progress-bar"><div class="shadow-progress-fill" style="width:${pct}%"></div></div>

      ${sceneHtml}

      <div class="shadow-card">
        <div class="shadow-step-tabs">
          <button class="shadow-step-tab ${step === 1 ? 'active' : ''}" onclick="setShadowStep(1)">👂 1. 소리집중</button>
          <button class="shadow-step-tab ${step === 2 ? 'active' : ''}" onclick="setShadowStep(2)">👄 2. 보고따라</button>
          <button class="shadow-step-tab ${step === 3 ? 'active' : ''}" onclick="setShadowStep(3)">🙈 3. 안보고말하기</button>
        </div>

        <div class="shadow-kr">${s.kr}</div>

        ${step === 2
          ? `<div class="shadow-en" id="shadowEnText">${s.en}</div>`
          : `<div class="shadow-blind-mask">${step === 1 ? '🎧 영어 자막 숨김 — 원어민 소리와 연음에 집중해보세요' : '🙈 영어 가림 — 위 장면을 떠올리며 큰 소리로 말해보세요!'}</div>`}

        <div class="shadow-speak-meter" id="shadowSpeakMeter">
          <div class="ssm-label" id="shadowSpeakLabel">👄 지금 소리 내어 따라 말하세요!</div>
          <div class="ssm-track"><div class="ssm-fill" id="shadowSpeakFill"></div></div>
        </div>

        <div class="shadow-tip">${stepMeta[step].desc}</div>
      </div>

      <div class="shadow-btns">
        <button class="shadow-btn prev" onclick="shadowPrev()" ${cv.sentIdx === 0 ? 'disabled' : ''}>←</button>
        <button class="shadow-btn listen" data-speak="${escAttr(s.en)}" onclick="stopAutoShadow();speakEl(this)">🔊 원어민 듣기</button>
        ${step < 3
          ? `<button class="shadow-btn next" onclick="stopAutoShadow();shadowNextStep()">다음 단계 →</button>`
          : `<button class="shadow-btn next" onclick="stopAutoShadow();shadowDone()">✅ 다음 문장 →</button>`}
      </div>

      <div class="voice-lab">
        <div class="voice-lab-title">
          <span>🎙 내 발음 녹음 & 원어민 직접 비교</span>
          <span style="color:var(--gold)">${hasRec ? '녹음 준비됨 ✓' : '녹음 전'}</span>
        </div>
        <div class="voice-lab-btns">
          <button class="vlab-btn rec ${isRec ? 'recording' : ''}" onclick="handleVoiceRecord('${srsKey}', 'chapter')">
            ${isRec ? '⏹ 녹음 완료' : '🎙 내 발음 녹음'}
          </button>
          <button class="vlab-btn" ${!hasRec ? 'disabled' : ''} onclick="VoiceRecorder.playUserRecording('${srsKey}', this)">
            ▶️ 내 목소리
          </button>
          <button class="vlab-btn compare" ${!hasRec ? 'disabled' : ''} data-speak="${escAttr(s.en)}"
            onclick="VoiceRecorder.compareWithNative(this.getAttribute('data-speak'), '${srsKey}', this)">
            🔄 원어민↔내발음 비교
          </button>
        </div>
      </div>
    </div>
  `;
}

function setShadowRepeat(n) {
  state.shadowRepeat = n;
  localStorage.setItem('uni_shadow_rep', String(n));
  if (state.currentTab === 'pattern' && state.patternView) renderPatternStudy();
  else if (state.chapterView) renderChapterStudy();
}

function setShadowStep(step) {
  stopAutoShadow();
  if (state.currentTab === 'pattern' && state.patternView) {
    state.patternView.shadowStep = step;
    renderPatternStudy();
  } else if (state.chapterView) {
    state.chapterView.shadowStep = step;
    renderChapterStudy();
  }
}

function handleVoiceRecord(recKey, context) {
  stopAutoShadow();
  VoiceRecorder.toggleRecord(recKey, () => {
    if (context === 'pattern') renderPatternStudy();
    else if (context === 'speaking') renderSpeakingPage();
    else renderChapterStudy();
  });
}

function waitWithMeter(ms, labelText, myToken) {
  return new Promise((resolve) => {
    if (!_autoShadow.running || _autoShadow.token !== myToken) return resolve(false);
    const meter = document.getElementById('shadowSpeakMeter');
    const lbl = document.getElementById('shadowSpeakLabel');
    const fill = document.getElementById('shadowSpeakFill');
    if (meter && lbl && fill) {
      lbl.textContent = labelText;
      meter.classList.add('active');
      fill.style.transition = 'none';
      fill.style.width = '0%';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.transition = `width ${ms}ms linear`;
          fill.style.width = '100%';
        });
      });
    }
    _autoShadow.timerId = setTimeout(() => {
      if (meter) meter.classList.remove('active');
      resolve(_autoShadow.running && _autoShadow.token === myToken);
    }, ms);
  });
}

async function toggleAutoShadow(context) {
  if (_autoShadow.running) {
    stopAutoShadow();
    if (context === 'pattern') renderPatternStudy();
    else renderChapterStudy();
    return;
  }

  VoiceRecorder.stopRecord();
  _autoShadow.running = true;
  const myToken = ++_autoShadow.token;

  while (_autoShadow.running && _autoShadow.token === myToken) {
    let rawEn = '';
    if (context === 'pattern') {
      const pv = state.patternView;
      if (!pv) break;
      const p = PATTERNS[pv.dayIdx];
      rawEn = p.cards[pv.cardIdx].en;
    } else {
      const cv = state.chapterView;
      if (!cv) break;
      const { ch } = getChapterData();
      rawEn = ch.sentences[cv.sentIdx].en;
    }

    const reps = state.shadowRepeat || 2;
    for (let r = 1; r <= reps; r++) {
      if (!_autoShadow.running || _autoShadow.token !== myToken) break;

      // Phase 1: Blind Listen
      if (context === 'pattern') { state.patternView.shadowStep = 1; renderPatternStudy(); }
      else { state.chapterView.shadowStep = 1; renderChapterStudy(); }
      const st1 = document.getElementById('shadowLoopStatus');
      if (st1) st1.textContent = `🔄 반복 ${r}/${reps} · 👂 원어민 듣기`;

      const info1 = await AudioEngine.speak(rawEn);
      if (!_autoShadow.running || _autoShadow.token !== myToken) break;
      const clipDurMs = Math.max(2200, Math.min(8500, ((info1 && info1.duration) || 2.4) * 1000));
      await new Promise(res => { _autoShadow.timerId = setTimeout(res, 420); });
      if (!_autoShadow.running || _autoShadow.token !== myToken) break;

      // Phase 2: Read & Shadow Out Loud
      if (context === 'pattern') { state.patternView.shadowStep = 2; renderPatternStudy(); }
      else { state.chapterView.shadowStep = 2; renderChapterStudy(); }
      const st2 = document.getElementById('shadowLoopStatus');
      if (st2) st2.textContent = `🔄 반복 ${r}/${reps} · 👄 보고 따라말하기`;

      await AudioEngine.speak(rawEn);
      if (!_autoShadow.running || _autoShadow.token !== myToken) break;
      const ok2 = await waitWithMeter(Math.round(clipDurMs * 1.25), '👄 영어를 보며 큰 소리로 따라 말하세요!', myToken);
      if (!ok2) break;

      // Phase 3: Blind Recall Out Loud
      if (context === 'pattern') { state.patternView.shadowStep = 3; renderPatternStudy(); }
      else { state.chapterView.shadowStep = 3; renderChapterStudy(); }
      const st3 = document.getElementById('shadowLoopStatus');
      if (st3) st3.textContent = `🔄 반복 ${r}/${reps} · 🙈 안 보고 말하기`;

      const ok3 = await waitWithMeter(Math.round(clipDurMs * 1.3), '🙈 장면을 떠올리며 안 보고 영어로 말해보세요!', myToken);
      if (!ok3) break;

      // Final confirmation play on last rep
      if (r === reps) {
        await AudioEngine.speak(rawEn);
        if (!_autoShadow.running || _autoShadow.token !== myToken) break;
        await new Promise(res => { _autoShadow.timerId = setTimeout(res, 550); });
      }
    }

    if (!_autoShadow.running || _autoShadow.token !== myToken) break;

    // Advance to next sentence automatically
    recordStudyActivity();
    if (context === 'pattern') {
      const pv = state.patternView;
      const p = PATTERNS[pv.dayIdx];
      if (pv.cardIdx < p.cards.length - 1) {
        pv.cardIdx++;
        pv.shadowStep = 1;
        renderPatternStudy();
      } else {
        stopAutoShadow();
        patShadowDone();
        break;
      }
    } else {
      const cv = state.chapterView;
      const { ch, completed } = getChapterData();
      if (cv.type !== 'review') {
        completed[`${cv.chIdx}-${cv.sentIdx}`] = true;
        save();
      }
      if (cv.sentIdx < ch.sentences.length - 1) {
        cv.sentIdx++;
        cv.shadowStep = 1;
        renderChapterStudy();
      } else {
        stopAutoShadow();
        shadowDone();
        break;
      }
    }
  }
}

function shadowNextStep() {
  if (!state.chapterView.shadowStep) state.chapterView.shadowStep = 1;
  if (state.chapterView.shadowStep < 3) {
    state.chapterView.shadowStep++;
    renderChapterStudy();
  }
}
function shadowDone() {
  const { ch, completed } = getChapterData();
  const cv = state.chapterView;
  if (cv.type !== 'review') {
    completed[`${cv.chIdx}-${cv.sentIdx}`] = true;
  }
  recordStudyActivity();
  if (cv.sentIdx < ch.sentences.length - 1) {
    cv.sentIdx++;
    cv.shadowStep = 1;
    renderChapterStudy();
  } else {
    const body = document.getElementById('study-body');
    if (body) body.innerHTML = `<div class="study-complete">
      <div class="study-complete-icon">🎉</div>
      <div class="study-complete-title">쉐도잉 완주 성공!</div>
      <div class="study-complete-sub">총 ${ch.sentences.length}문장을 입으로 체화했어요!</div>
      <button class="shadow-btn next" style="margin:0 auto" onclick="state.chapterView.sentIdx=0;state.chapterView.shadowStep=1;renderChapterStudy()">🔄 처음부터 다시</button>
    </div>`;
  }
}
function shadowPrev() {
  stopAutoShadow();
  if (state.chapterView.sentIdx > 0) {
    state.chapterView.sentIdx--;
    state.chapterView.shadowStep = 1;
    renderChapterStudy();
  }
}

// ════════════════════════════════════════════════════════
// 3. 🧩 어순 블록 조립 모드 (Conclusion-First Chunk Builder)
// ════════════════════════════════════════════════════════
function ensureChunkState(rawEn, key) {
  let cs = (state.currentTab === 'pattern' && state.patternView)
    ? state.patternView.chunkState
    : state.chapterView.chunkState;

  if (!cs || cs.key !== key) {
    const target = VisualEngine.buildPuzzleChunks(rawEn);
    const pool = [...target];
    // Deterministic-feel shuffle that guarantees non-identical order when length >= 2
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    if (pool.length >= 2 && pool.every((b, idx) => b.id === idx)) {
      [pool[0], pool[1]] = [pool[1], pool[0]];
    }
    cs = { key, target, pool, picked: [], solved: false, wrong: false };
    if (state.currentTab === 'pattern' && state.patternView) state.patternView.chunkState = cs;
    else state.chapterView.chunkState = cs;
  }
  return cs;
}

function renderChunkBuilderUI(rawEn, rawKr, key, counterLabel, prevFn, nextFn, hasPrev) {
  const cs = ensureChunkState(rawEn, key);
  const sceneHtml = VisualEngine.renderSceneCardHTML(rawEn, rawKr, key, {
    compact: true,
    showChunks: cs.solved
  });

  const pickedHtml = cs.picked.length === 0
    ? '<span class="cb-placeholder">👇 아래 영어 청크를 [결론 → 디테일 → 배경] 순서로 터치하세요</span>'
    : cs.picked.map((pIdx, pos) => {
        const block = cs.pool[pIdx];
        return `<button class="chunk-chip selected" onclick="chunkUnpick(${pos})">${block.text}</button>`;
      }).join('');

  const poolHtml = cs.pool.map((block, pIdx) => {
    const used = cs.picked.includes(pIdx);
    return `<button class="chunk-chip ${used ? 'used' : ''}" onclick="chunkPick(${pIdx})">${block.text}</button>`;
  }).join('');

  return `
    ${sceneHtml}
    <div class="chunk-builder-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;font-weight:800;color:var(--gold)">🧩 영어 어순 블록 조립</span>
        <span style="font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace">${counterLabel}</span>
      </div>
      <div class="cb-kr">${rawKr}</div>

      <div class="cb-answer-tray ${cs.solved ? 'done' : cs.wrong ? 'wrong' : ''}">
        ${pickedHtml}
      </div>

      ${cs.solved ? `
        <div style="padding:10px 12px;border-radius:10px;background:rgba(111,207,151,0.12);color:var(--green);font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <span>🌟 정답! 결론부터 자연스럽게 연결됐어요!</span>
          <button class="tts-btn small" data-speak="${escAttr(rawEn)}" onclick="speakEl(this)">🔊 다시 듣기</button>
        </div>
      ` : cs.wrong ? `
        <div style="font-size:12px;color:var(--red);font-weight:700">😅 어순이 살짝 달라요! 위 노란 블록을 탭해 수정하거나 힌트를 들어보세요.</div>
      ` : ''}

      <div class="cb-pool">${poolHtml}</div>

      <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
        ${hasPrev ? `<button class="shadow-btn prev" onclick="${prevFn}">←</button>` : ''}
        <button class="tts-btn" data-speak="${escAttr(rawEn)}" onclick="speakEl(this)">🎧 소리 힌트 듣기</button>
        <button class="shadow-btn prev" onclick="chunkReset()">↺ 섞기</button>
        <button class="shadow-btn next" onclick="${nextFn}">${cs.solved ? '다음 문장 →' : '건너뛰기 →'}</button>
      </div>
    </div>
  `;
}

function renderChunkMode(ch) {
  const cv = state.chapterView;
  const s = ch.sentences[cv.sentIdx];
  const srsKey = getCurrentSrsKey();
  return renderChunkBuilderUI(
    s.en, s.kr, srsKey,
    `${cv.sentIdx + 1}/${ch.sentences.length}`,
    'chunkChPrev()', 'chunkChNext()', cv.sentIdx > 0
  );
}

function chunkPick(poolIdx) {
  const cs = (state.currentTab === 'pattern' && state.patternView)
    ? state.patternView.chunkState
    : state.chapterView.chunkState;
  if (!cs || cs.solved || cs.picked.includes(poolIdx)) return;

  cs.picked.push(poolIdx);
  cs.wrong = false;

  if (cs.picked.length === cs.pool.length) {
    const assembled = cs.picked.map(i => cs.pool[i].text).join(' ').toLowerCase();
    const expected = cs.target.map(t => t.text).join(' ').toLowerCase();
    if (assembled === expected) {
      cs.solved = true;
      recordStudyActivity();
      let fullRawEn = cs.target.map(t => t.text).join(' ');
      if (state.currentTab === 'pattern' && state.patternView) {
        fullRawEn = patCurrentCard();
      } else if (state.chapterView) {
        const { ch, completed } = getChapterData();
        fullRawEn = ch.sentences[state.chapterView.sentIdx].en;
        if (state.chapterView.type !== 'review') {
          completed[`${state.chapterView.chIdx}-${state.chapterView.sentIdx}`] = true;
          save();
        }
      }
      AudioEngine.speak(fullRawEn);
    } else {
      cs.wrong = true;
    }
  }

  if (state.currentTab === 'pattern' && state.patternView) renderPatternStudy();
  else renderChapterStudy();
}

function chunkUnpick(pos) {
  const cs = (state.currentTab === 'pattern' && state.patternView)
    ? state.patternView.chunkState
    : state.chapterView.chunkState;
  if (!cs || cs.solved) return;
  cs.picked.splice(pos, 1);
  cs.wrong = false;
  if (state.currentTab === 'pattern' && state.patternView) renderPatternStudy();
  else renderChapterStudy();
}

function chunkReset() {
  if (state.currentTab === 'pattern' && state.patternView) {
    state.patternView.chunkState = null;
    renderPatternStudy();
  } else if (state.chapterView) {
    state.chapterView.chunkState = null;
    renderChapterStudy();
  }
}

function chunkChPrev() {
  if (state.chapterView.sentIdx > 0) {
    state.chapterView.sentIdx--;
    state.chapterView.chunkState = null;
    renderChapterStudy();
  }
}
function chunkChNext() {
  const { ch } = getChapterData();
  if (state.chapterView.sentIdx < ch.sentences.length - 1) {
    state.chapterView.sentIdx++;
    state.chapterView.chunkState = null;
    renderChapterStudy();
  } else {
    const body = document.getElementById('study-body');
    if (body) body.innerHTML = `<div class="study-complete">
      <div class="study-complete-icon">🧩</div>
      <div class="study-complete-title">어순 조립 마스터!</div>
      <div class="study-complete-sub">모든 문장의 영어식 결론 우선 어순을 완성했어요!</div>
      <button class="shadow-btn next" style="margin:0 auto" onclick="state.chapterView.sentIdx=0;state.chapterView.chunkState=null;renderChapterStudy()">🔄 다시 연습</button>
    </div>`;
  }
}

// ════════════════════════════════════════════════════════
// 4. 📋 전체 보기 + 챕터 연속 라디오 모드
// ════════════════════════════════════════════════════════
function renderListMode(ch) {
  const { completed } = getChapterData();
  const rows = ch.sentences.map((s, i) => {
    const key = `${state.chapterView.chIdx}-${i}`;
    const done = !!completed[key];
    return `<tr id="list-row-${i}">
      <td class="list-num" style="${done ? 'color:var(--green)' : ''}">${done ? '✓' : String(i + 1).padStart(2, '0')}</td>
      <td class="list-kr">${s.kr}</td>
      <td class="list-en" style="vertical-align:middle">
        ${s.en}<br>
        <button class="tts-btn small" style="margin-top:6px" data-speak="${escAttr(s.en)}" onclick="speakEl(this)">🔊 듣기</button>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="list-radio-bar">
      <div>
        <div style="font-size:13px;font-weight:800;color:var(--text)">📻 챕터 연속 라디오 듣기</div>
        <div style="font-size:11px;color:var(--text2)">전체 ${ch.sentences.length}문장을 순서대로 연속 재생해요</div>
      </div>
      <button class="tts-btn" onclick="playChapterRadio(this)">▶ 전체 재생</button>
    </div>
    <table class="list-table"><thead><tr><th>#</th><th>한국어</th><th>English</th></tr></thead><tbody>${rows}</tbody></table>
  `;
}

function playChapterRadio(btn) {
  const { ch } = getChapterData();
  const items = ch.sentences.map(s => ({ text: s.en, pauseMs: 850 }));
  AudioEngine.speakSequence(items, btn, (idx) => {
    document.querySelectorAll('.list-table tr.playing-row').forEach(r => r.classList.remove('playing-row'));
    if (idx >= 0) {
      const row = document.getElementById('list-row-' + idx);
      if (row) {
        row.classList.add('playing-row');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });
}

// ════════════════════════════════════════════════════════
// 5. VOCAB / QUIZ / LISTEN / TRANS / FLASH / PRONUN
// ════════════════════════════════════════════════════════
function renderVocabMode(ch) {
  if (!ch.vocab || !ch.vocab.length) {
    return '<div style="padding:30px;text-align:center;color:var(--text2)">이 코스에는 별도 단어장이 없습니다.</div>';
  }
  return `<div class="vocab-grid">${ch.vocab.map(v => `<div class="vocab-card">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:4px">
      <div class="v-en">${v.en}</div>
      <button class="tts-btn small" data-speak="${escAttr(v.en)}" onclick="speakEl(this)">🔊</button>
    </div>
    <div class="v-kr">${v.kr}</div>
    <div class="v-ex">"${v.ex}"</div>
    <button class="tts-btn small" style="margin-top:8px;width:100%" data-speak="${escAttr(v.ex)}" onclick="speakEl(this)">🔊 예문 듣기</button>
  </div>`).join('')}</div>`;
}

function renderQuizMode(ch) {
  const cv = state.chapterView;
  const s = ch.sentences[cv.sentIdx];
  const plain = AudioEngine.toSpokenEnglish(s.en);
  const words = plain.split(' ');
  const hint = words.slice(0, 2).join(' ') + '...';
  return `
    ${VisualEngine.renderSceneCardHTML(s.en, s.kr, getCurrentSrsKey(), { compact: true, showChunks: false })}
    <div class="quiz-card">
      <div class="quiz-label">Quiz ${cv.sentIdx + 1} / ${ch.sentences.length} — 한국어 → 영어 타이핑</div>
      <div class="quiz-kr">${s.kr}</div>
      <div class="quiz-hint">첫 마디(결론) 힌트: ${hint}</div>
      <div>
        <input class="quiz-input" id="qInput" placeholder="영어 문장을 입력하세요..." onkeydown="if(event.key==='Enter')chCheck()" />
      </div>
      <div class="quiz-result" id="qResult">
        <div id="qResText"></div>
        <div class="answer-text" id="qAnsText"></div>
        <button class="tts-btn small" id="qTtsBtn" style="margin-top:8px;display:none" data-speak="${escAttr(s.en)}" onclick="speakEl(this)">🔊 정답 발음 듣기</button>
      </div>
      <div class="quiz-btns">
        <button class="quiz-check" onclick="chCheck()">✓ 확인</button>
        <button class="quiz-ans-btn" onclick="chShowAns('${encodeURIComponent(plain)}')">정답 보기</button>
      </div>
    </div>
    <div class="card-nav">
      <button class="cnav-btn" onclick="chPrevQuiz()" ${cv.sentIdx === 0 ? 'disabled' : ''}>← 이전</button>
      <button class="cnav-btn primary" onclick="chNextQuiz()" ${cv.sentIdx === ch.sentences.length - 1 ? 'disabled' : ''}>다음 →</button>
    </div>`;
}

function chCheck() {
  const cv = state.chapterView;
  const { ch, completed } = getChapterData();
  const s = ch.sentences[cv.sentIdx];
  const ans = AudioEngine.toSpokenEnglish(s.en);
  const inp = document.getElementById('qInput');
  if (!inp || !inp.value.trim()) return;
  const userVal = inp.value.toLowerCase().trim();
  const words = ans.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const score = words.length ? (words.filter(w => userVal.includes(w.replace(/[.,!?]/g, ''))).length / words.length) : 1;
  const res = document.getElementById('qResult');
  res.style.display = 'block';
  const ttsBtn = document.getElementById('qTtsBtn');
  if (ttsBtn) ttsBtn.style.display = 'inline-flex';
  document.getElementById('qAnsText').textContent = '정답: ' + ans;
  if (score >= 0.55) {
    res.className = 'quiz-result correct';
    document.getElementById('qResText').textContent = '✓ 정확해요! 소리로도 확인해보세요.';
    if (cv.type !== 'review') completed[`${cv.chIdx}-${cv.sentIdx}`] = true;
    recordStudyActivity();
    AudioEngine.speak(s.en);
  } else {
    res.className = 'quiz-result wrong';
    document.getElementById('qResText').textContent = '✗ 핵심 동사부터 다시 도전해보세요.';
  }
}

function chShowAns(enc) {
  const res = document.getElementById('qResult');
  res.style.display = 'block';
  res.className = 'quiz-result correct';
  document.getElementById('qResText').textContent = '정답 확인';
  const ans = decodeURIComponent(enc);
  document.getElementById('qAnsText').textContent = '정답: ' + ans;
  const ttsBtn = document.getElementById('qTtsBtn');
  if (ttsBtn) ttsBtn.style.display = 'inline-flex';
  AudioEngine.speak(ans);
}
function chPrevQuiz() { if (state.chapterView.sentIdx > 0) { state.chapterView.sentIdx--; renderChapterStudy(); } }
function chNextQuiz() {
  const { ch } = getChapterData();
  if (state.chapterView.sentIdx < ch.sentences.length - 1) { state.chapterView.sentIdx++; renderChapterStudy(); }
}

function renderListenMode(ch) {
  const cv = state.chapterView;
  const s = ch.sentences[cv.sentIdx];
  const phase = cv.listenPhase || 'listen';

  let phaseHtml = '', cardHtml = '', btnsHtml = '';
  if (phase === 'listen') {
    phaseHtml = `<div class="listen-phase phase-listen">👂 STEP 1 · 소리만으로 장면 상상하기</div>`;
    cardHtml = `<div class="listen-card">
      <div class="listen-hidden">🎧 ♪ ♪</div>
      <div class="listen-reveal-text">자막 없이 원어민 문장을 듣고 어떤 상황인지 그려보세요</div>
    </div>`;
    btnsHtml = `<button class="listen-btn play" data-speak="${escAttr(s.en)}" onclick="speakEl(this)">🔊 문장 듣기</button>
      <button class="listen-btn next" onclick="listenNextPhase()">말해볼게요 →</button>`;
  } else if (phase === 'speak') {
    phaseHtml = `<div class="listen-phase phase-speak">🎤 STEP 2 · 한국어 보고 입으로 말하기</div>`;
    cardHtml = `${VisualEngine.renderSceneCardHTML(s.en, s.kr, getCurrentSrsKey(), { compact: true })}
      <div class="listen-card">
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px">${s.kr}</div>
        <div style="font-size:12px;color:var(--text2)">들었던 원어민 억양을 떠올리며 영어로 말해보세요</div>
      </div>`;
    btnsHtml = `<button class="listen-btn play" data-speak="${escAttr(s.en)}" onclick="speakEl(this)">🔊 다시 듣기</button>
      <button class="listen-btn show" onclick="listenNextPhase()">✅ 정답 확인</button>`;
  } else {
    phaseHtml = `<div class="listen-phase phase-check">✅ STEP 3 · 정답 & 어순 확인</div>`;
    cardHtml = `${VisualEngine.renderSceneCardHTML(s.en, s.kr, getCurrentSrsKey(), { compact: true, showChunks: true })}
      <div class="listen-card">
        <div class="listen-answer-en">${s.en}</div>
        <div class="listen-answer-kr">${s.kr}</div>
      </div>`;
    btnsHtml = `<button class="listen-btn play" data-speak="${escAttr(s.en)}" onclick="speakEl(this)">🔊 듣기</button>
      ${cv.sentIdx < ch.sentences.length - 1
        ? `<button class="listen-btn next" onclick="listenNextSent()">다음 문장 →</button>`
        : `<button class="listen-btn next" onclick="listenFinish()">🎉 완료!</button>`}`;
  }

  return `
    <div class="listen-wrap">
      <div style="display:flex;align-items:center;justify-content:space-between">
        ${phaseHtml}
        <span style="font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace">${cv.sentIdx + 1}/${ch.sentences.length}</span>
      </div>
      ${cardHtml}
      <div class="listen-btns">${btnsHtml}</div>
      ${cv.sentIdx > 0 ? `<div style="text-align:center"><button class="listen-btn prev" onclick="listenPrev()">← 이전</button></div>` : ''}
    </div>`;
}

function listenNextPhase() {
  const cv = state.chapterView;
  const p = cv.listenPhase || 'listen';
  cv.listenPhase = p === 'listen' ? 'speak' : 'check';
  if (cv.listenPhase === 'check') {
    const { ch, completed } = getChapterData();
    if (cv.type !== 'review') completed[`${cv.chIdx}-${cv.sentIdx}`] = true;
    recordStudyActivity();
    AudioEngine.speak(ch.sentences[cv.sentIdx].en);
  }
  renderChapterStudy();
}
function listenNextSent() { state.chapterView.sentIdx++; state.chapterView.listenPhase = 'listen'; renderChapterStudy(); }
function listenFinish() {
  const body = document.getElementById('study-body');
  const { ch } = getChapterData();
  if (body) body.innerHTML = `<div class="study-complete">
    <div class="study-complete-icon">👂</div>
    <div class="study-complete-title">듣고말하기 완료!</div>
    <div class="study-complete-sub">총 ${ch.sentences.length}문장을 귀와 입으로 익혔어요!</div>
    <button class="listen-btn next" style="margin:0 auto" onclick="state.chapterView.sentIdx=0;state.chapterView.listenPhase='listen';renderChapterStudy()">🔄 다시하기</button>
  </div>`;
}
function listenPrev() {
  if (state.chapterView.sentIdx > 0) { state.chapterView.sentIdx--; state.chapterView.listenPhase = 'listen'; renderChapterStudy(); }
}

function renderTransMode(ch) {
  const cv = state.chapterView;
  const s = ch.sentences[cv.sentIdx];
  const revealed = cv.transRevealed || false;
  return `
    <div class="trans-wrap">
      ${VisualEngine.renderSceneCardHTML(s.en, s.kr, getCurrentSrsKey(), { compact: true, showChunks: revealed })}
      <div class="trans-card">
        <div class="trans-badge">🔄 1초 순발력 번역 챌린지</div>
        <div class="trans-kr">${s.kr}</div>
        <div class="trans-counter">${cv.sentIdx + 1} / ${ch.sentences.length}</div>
        <div style="font-size:12px;color:var(--text2);text-align:center;margin-bottom:8px">결론 동사부터 바로 입 밖으로 꺼내보세요 ⚡</div>
        <div class="trans-answer-box ${revealed ? 'show' : ''}">
          <div class="trans-answer-label">✅ 원어민 표현</div>
          <div class="trans-answer-en">${s.en}</div>
          <button class="tts-btn small" data-speak="${escAttr(s.en)}" onclick="speakEl(this)">🔊 듣기</button>
        </div>
        <div class="trans-self-check ${revealed ? 'show' : ''}">
          <button class="self-btn correct" onclick="transNext(true)">😊 바로 나왔어요!</button>
          <button class="self-btn wrong" onclick="transNext(false)">😅 막혔어요 (복습추가)</button>
        </div>
      </div>
      <div class="trans-btns">
        ${!revealed ? `<button class="trans-btn reveal" onclick="transReveal()">💡 정답 + 발음 확인</button>` : ''}
        ${cv.sentIdx > 0 ? `<button class="trans-btn prev" onclick="transPrev()">← 이전</button>` : ''}
      </div>
    </div>`;
}
function transReveal() {
  state.chapterView.transRevealed = true;
  const { ch } = getChapterData();
  renderChapterStudy();
  AudioEngine.speak(ch.sentences[state.chapterView.sentIdx].en);
}
function transNext(correct) {
  const { ch, completed } = getChapterData();
  const cv = state.chapterView;
  const srsKey = getCurrentSrsKey();
  if (correct) {
    if (cv.type !== 'review') completed[`${cv.chIdx}-${cv.sentIdx}`] = true;
    rateSRS(srsKey, 'good');
  } else {
    rateSRS(srsKey, 'hard');
  }
  if (cv.sentIdx < ch.sentences.length - 1) {
    cv.sentIdx++;
    cv.transRevealed = false;
    renderChapterStudy();
  } else {
    const body = document.getElementById('study-body');
    if (body) body.innerHTML = `<div class="study-complete">
      <div class="study-complete-icon">🔄</div>
      <div class="study-complete-title">번역 챌린지 완료!</div>
      <div class="study-complete-sub">막혔던 문장은 홈 화면 [스마트 복습]에 자동 저장되었어요!</div>
      <button class="trans-btn next" style="margin:0 auto" onclick="state.chapterView.sentIdx=0;state.chapterView.transRevealed=false;renderChapterStudy()">🔄 다시하기</button>
    </div>`;
  }
}
function transPrev() {
  if (state.chapterView.sentIdx > 0) { state.chapterView.sentIdx--; state.chapterView.transRevealed = false; renderChapterStudy(); }
}

function renderFlashMode(ch) {
  const cv = state.chapterView;
  const s = ch.sentences[cv.sentIdx];
  const flipped = cv.flashFlipped || false;
  const { completed } = getChapterData();
  const maxDots = Math.min(ch.sentences.length, 20);
  const dots = Array.from({ length: maxDots }, (_, i) => {
    const cls = i === cv.sentIdx ? 'current' : completed[`${cv.chIdx}-${i}`] ? 'done' : '';
    return `<div class="fc-dot ${cls}"></div>`;
  }).join('');

  return `
    <div class="flash3d-wrap">
      <div class="flashcard-progress">${dots}${ch.sentences.length > 20 ? '<span style="font-size:10px;color:var(--text2)">...</span>' : ''}</div>
      <div class="flip-scene" onclick="flashFlip()">
        <div class="flip-card ${flipped ? 'flipped' : ''}">
          <div class="flip-face flip-front">
            <div class="flip-face-label">🇰🇷 한국어</div>
            <div class="flip-main-text">${s.kr}</div>
            <div class="flip-tap-hint">탭해서 뒤집기 + 발음 듣기 👆</div>
          </div>
          <div class="flip-face flip-back">
            <div class="flip-face-label">🇺🇸 English</div>
            <div class="flip-main-text">${s.en}</div>
            <div class="flip-sub-text">${s.kr}</div>
          </div>
        </div>
      </div>
      <div class="flash3d-btns">
        <button class="flash3d-btn prev" onclick="flashPrev()" ${cv.sentIdx === 0 ? 'disabled' : ''}>← 이전</button>
        <button class="flash3d-btn flip" onclick="flashFlip()">🔄 뒤집기</button>
        <button class="flash3d-btn next" style="background:var(--cyan);color:#000" data-speak="${escAttr(s.en)}" onclick="speakEl(this)">🔊 듣기</button>
        <button class="flash3d-btn next" onclick="flashNext()" ${cv.sentIdx === ch.sentences.length - 1 ? 'disabled' : ''}>다음 →</button>
      </div>
      <div style="text-align:center;font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace">${cv.sentIdx + 1} / ${ch.sentences.length}</div>
    </div>`;
}
function flashFlip() {
  const cv = state.chapterView;
  cv.flashFlipped = !cv.flashFlipped;
  const { ch, completed } = getChapterData();
  if (cv.flashFlipped) {
    if (cv.type !== 'review') completed[`${cv.chIdx}-${cv.sentIdx}`] = true;
    recordStudyActivity();
    AudioEngine.speak(ch.sentences[cv.sentIdx].en);
  }
  renderChapterStudy();
}
function flashNext() {
  const { ch } = getChapterData();
  const cv = state.chapterView;
  if (cv.sentIdx < ch.sentences.length - 1) {
    cv.sentIdx++;
    cv.flashFlipped = false;
    renderChapterStudy();
  }
}
function flashPrev() {
  if (state.chapterView.sentIdx > 0) { state.chapterView.sentIdx--; state.chapterView.flashFlipped = false; renderChapterStudy(); }
}

function renderChPronunMode(ch) {
  const cv = state.chapterView;
  const s = ch.sentences[cv.sentIdx];
  const srsKey = getCurrentSrsKey();
  return `<div class="pat-shadow-wrap">
    ${VisualEngine.renderSceneCardHTML(s.en, s.kr, srsKey, { compact: true, showChunks: true })}
    <div class="pronun-box">
      <div style="font-size:13px;color:var(--text2);text-align:center;margin-bottom:8px">${s.kr}</div>
      <div class="pronun-target" id="pronunTarget">${s.en}</div>
      <div class="pronun-wave" id="pronunWave">
        <span style="height:8px"></span><span style="height:16px"></span>
        <span style="height:22px"></span><span style="height:14px"></span>
        <span style="height:20px"></span><span style="height:10px"></span>
        <span style="height:18px"></span><span style="height:24px"></span>
        <span style="height:12px"></span>
      </div>
      <div class="pronun-status" id="pronunStatus">🎤 원어민 발음을 듣고 음성인식으로 정확도를 체크해보세요</div>
      <div class="pronun-btns">
        <button class="pronun-btn listen" data-speak="${escAttr(s.en)}" onclick="speakEl(this)">🔊 원어민 듣기</button>
        <button class="pronun-btn record" id="pronunRecBtn" onclick="chPronunRec()">🎤 AI 발음 채점</button>
      </div>
      <div class="pronun-result" id="pronunResult"></div>
    </div>
    <div class="shadow-btns" style="margin-top:4px">
      ${cv.sentIdx > 0 ? `<button class="shadow-btn prev" onclick="chPronunPrev()">← 이전</button>` : ''}
      <button class="shadow-btn next" onclick="chPronunNext()">다음 →</button>
    </div>
  </div>`;
}
function chPronunRec() {
  const { ch } = getChapterData();
  const s = ch.sentences[state.chapterView.sentIdx];
  pronunStart(AudioEngine.toSpokenEnglish(s.en));
}
function chPronunNext() {
  const { ch } = getChapterData();
  if (state.chapterView.sentIdx < ch.sentences.length - 1) {
    state.chapterView.sentIdx++;
    renderChapterStudy();
  }
}
function chPronunPrev() {
  if (state.chapterView.sentIdx > 0) { state.chapterView.sentIdx--; renderChapterStudy(); }
}

// ════════════════════════════════════════════════════════
// PATTERN 30 DAYS (Upgraded with Scene, Auto-Shadowing, Chunk Builder)
// ════════════════════════════════════════════════════════
function renderPatternHome() {
  stopAutoShadow();
  const patPageHeader = document.querySelector('#page-pattern > .inner-header');
  if (patPageHeader) patPageHeader.style.display = 'flex';
  const done = state.completedP.length;
  const pct = Math.round((done / 30) * 100);
  const nextDayIdx = done > 0 ? Math.min(Math.max(...state.completedP), 29) : 0;
  const todayP = PATTERNS[nextDayIdx];

  const listHtml = PATTERNS.map((p, i) => {
    const isDone = state.completedP.includes(i + 1);
    return `<div class="pat-day-item ${isDone ? 'completed' : ''}" onclick="patStartDay(${i})">
      <div class="pat-day-num">D-${String(p.id).padStart(2, '0')}</div>
      <div style="flex:1;min-width:0">
        <div class="pat-day-pattern">${p.pattern}</div>
        <div class="pat-day-meaning">${p.meaning} · ${p.cards.length}문장</div>
      </div>
      ${isDone ? '<div class="pat-done-badge">✓</div>' : ''}
    </div>`;
  }).join('');

  document.getElementById('pattern-content').innerHTML = `
    <div class="pattern-home fade-in">
      <div class="pat-hero" onclick="patStartDay(${nextDayIdx})">
        <div class="pat-eyebrow">TODAY · DAY ${todayP.id}</div>
        <div class="pat-hero-pattern">${todayP.pattern}</div>
        <div class="pat-hero-meaning">${todayP.meaning}</div>
        <div class="pat-hero-start">연상 + 자동쉐도잉 시작 →</div>
      </div>
      <div class="pat-stats">
        <div class="pat-stat cyan"><div class="pat-stat-num">${done}</div><div class="pat-stat-lbl">완료일</div></div>
        <div class="pat-stat purple"><div class="pat-stat-num">${30 - done}</div><div class="pat-stat-lbl">남은일</div></div>
        <div class="pat-stat gold"><div class="pat-stat-num">${pct}%</div><div class="pat-stat-lbl">달성률</div></div>
      </div>
      <div class="pat-prog-bar"><div class="pat-prog-fill" style="width:${pct}%"></div></div>
      <div class="pat-day-list">${listHtml}</div>
    </div>`;
}

function patStartDay(dayIdx) {
  stopAutoShadow();
  state.patternView = { dayIdx, cardIdx: 0, flipped: false, mode: 'kr', studyMode: 'card', shadowStep: 1 };
  renderPatternStudy();
}

function renderPatternStudy() {
  const patPageHeader = document.querySelector('#page-pattern > .inner-header');
  if (patPageHeader) patPageHeader.style.display = 'none';
  const pv = state.patternView;
  const p = PATTERNS[pv.dayIdx];
  const card = p.cards[pv.cardIdx];
  const isDone = state.completedP.includes(p.id);
  const sm = pv.studyMode || 'card';
  const isCombo = card.kr.startsWith('🔀');
  const cleanKr = card.kr.replace('🔀 ', '');
  const cleanEn = card.en.replace('🔀 ', '');
  const recKey = `pat-${pv.dayIdx}-${pv.cardIdx}`;

  const modeLabels = {
    card: '🎨 연상카드',
    swap: '🔄 갈아끼우기',
    shadow: '🎙 자동쉐도잉',
    chunk: '🧩 어순조립',
    pronun: '🎤 발음체크',
    flash: '⚡ 3D카드'
  };
  const modebar = '<div class="pat-mode-bar">' +
    Object.entries(modeLabels).map(([m, l]) => `<button class="pat-mode-pill ${sm === m ? 'active' : ''}" onclick="patStudyMode('${m}')">${l}</button>`).join('') +
    '</div>';

  let bodyHtml = '';
  if (sm === 'card') {
    const frontText = pv.mode === 'kr' ? cleanKr : cleanEn;
    const backText = pv.mode === 'kr' ? cleanEn : cleanKr;
    const showEn = (pv.mode === 'kr' && pv.flipped) || (pv.mode === 'en' && !pv.flipped);

    bodyHtml = `<div class="pat-study-wrap">
      ${VisualEngine.renderSceneCardHTML(cleanEn, cleanKr, recKey, { pattern: p.pattern, showChunks: showEn })}
      <div class="pat-mode-toggle">
        <button class="pat-mode-btn ${pv.mode === 'kr' ? 'active' : ''}" onclick="patSetMode('kr')">🇰🇷 한국어 보고 영어로</button>
        <button class="pat-mode-btn ${pv.mode === 'en' ? 'active' : ''}" onclick="patSetMode('en')">🇺🇸 영어 보고 뜻 파악</button>
      </div>
      <div class="pat-card ${pv.flipped ? 'flipped' : ''}" onclick="patFlip()">
        ${isCombo ? '<div class="pat-card-hint" style="color:var(--gold)">🔀 복합 응용 문장</div>' : `<div class="pat-card-hint">${pv.mode === 'kr' ? '한국어 → 영어' : 'ENGLISH → 한국어'}</div>`}
        <div class="pat-card-kr">${frontText}</div>
        <div class="pat-card-en">${backText}</div>
        ${!pv.flipped
          ? '<div class="pat-tap">탭하여 뒤집기 + 원어민 발음 듣기 👆</div>'
          : `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:14px;width:100%">
              <button class="tts-btn" data-speak="${escAttr(cleanEn)}" onclick="event.stopPropagation();speakEl(this)">🔊 원어민 발음 듣기</button>
              <button class="card-swap-jump-btn" style="margin-top:2px" onclick="event.stopPropagation();patStudyMode('swap')">🔄 이 패턴 단어 갈아끼우기 (3연속) →</button>
            </div>`}
      </div>
      <div class="pat-nav">
        <button class="pat-prev" onclick="patPrev()" ${pv.cardIdx === 0 ? 'disabled' : ''}>←</button>
        <button class="pat-next" onclick="patNext()">${pv.cardIdx === p.cards.length - 1 ? (isDone ? '✓ 완료됨' : '오늘 패턴 완료 🎉') : '다음 예문 →'}</button>
      </div>
    </div>`;
  } else if (sm === 'swap') {
    bodyHtml = renderSwapDrillUI(
      cleanEn, cleanKr, recKey,
      { patternTitle: p.pattern, siblingCards: p.cards },
      `${pv.cardIdx + 1}/${p.cards.length}`,
      'patSwapPrev()', 'patSwapNext()', pv.cardIdx > 0,
      'pattern'
    );
  } else if (sm === 'shadow') {
    const step = pv.shadowStep || 1;
    const hasRec = VoiceRecorder.hasRecording(recKey);
    const isRec = VoiceRecorder.isRecording(recKey);

    bodyHtml = `<div class="pat-shadow-wrap">
      <div class="auto-loop-bar">
        <button id="autoShadowBtn" class="auto-loop-btn ${_autoShadow.running ? 'running' : ''}" onclick="toggleAutoShadow('pattern')">
          ${_autoShadow.running ? '⏹ 자동 쉐도잉 중지' : '▶ 실전 자동 쉐도잉 시작'}
        </button>
        <div class="loop-repeat-chips">
          <span style="font-size:10.5px;color:var(--text2)">반복:</span>
          ${[1, 2, 3].map(n => `<button class="loop-rep-chip ${state.shadowRepeat === n ? 'active' : ''}" onclick="setShadowRepeat(${n})">${n}회</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="shadow-counter">${pv.cardIdx + 1} / ${p.cards.length}</span>
        <span style="font-size:11px;color:var(--cyan);font-weight:700" id="shadowLoopStatus">${_autoShadow.running ? '🔄 자동 진행 중...' : p.pattern}</span>
      </div>

      ${VisualEngine.renderSceneCardHTML(cleanEn, cleanKr, recKey, { compact: true, showChunks: step === 2 })}

      <div class="pat-shadow-card">
        <div class="shadow-step-tabs">
          <button class="shadow-step-tab ${step === 1 ? 'active' : ''}" onclick="setShadowStep(1)">👂 1. 소리집중</button>
          <button class="shadow-step-tab ${step === 2 ? 'active' : ''}" onclick="setShadowStep(2)">👄 2. 보고따라</button>
          <button class="shadow-step-tab ${step === 3 ? 'active' : ''}" onclick="setShadowStep(3)">🙈 3. 안보고말하기</button>
        </div>
        <div class="shadow-kr">${cleanKr}</div>
        ${step === 2
          ? `<div class="shadow-en">${cleanEn}</div>`
          : `<div class="shadow-blind-mask">${step === 1 ? '🎧 원어민 소리와 연음 리듬에 집중하세요' : '🙈 패턴으로 문장을 시작해 끝까지 말해보세요!'}</div>`}

        <div class="shadow-speak-meter" id="shadowSpeakMeter">
          <div class="ssm-label" id="shadowSpeakLabel">👄 따라 말하세요!</div>
          <div class="ssm-track"><div class="ssm-fill" id="shadowSpeakFill"></div></div>
        </div>
      </div>

      <div class="shadow-btns">
        <button class="shadow-btn prev" onclick="patShadowPrev()" ${pv.cardIdx === 0 ? 'disabled' : ''}>←</button>
        <button class="shadow-btn listen" data-speak="${escAttr(cleanEn)}" onclick="stopAutoShadow();speakEl(this)">🔊 듣기</button>
        ${step < 3
          ? '<button class="shadow-btn next" onclick="stopAutoShadow();patShadowNext()">다음 단계 →</button>'
          : '<button class="shadow-btn next" onclick="stopAutoShadow();patShadowDone()">✅ 다음 예문 →</button>'}
      </div>

      <div class="voice-lab">
        <div class="voice-lab-title">
          <span>🎙 내 발음 녹음 & 원어민 비교</span>
          <span style="color:var(--gold)">${hasRec ? '녹음됨 ✓' : ''}</span>
        </div>
        <div class="voice-lab-btns">
          <button class="vlab-btn rec ${isRec ? 'recording' : ''}" onclick="handleVoiceRecord('${recKey}', 'pattern')">
            ${isRec ? '⏹ 녹음 완료' : '🎙 내 발음 녹음'}
          </button>
          <button class="vlab-btn" ${!hasRec ? 'disabled' : ''} onclick="VoiceRecorder.playUserRecording('${recKey}', this)">▶️ 내 목소리</button>
          <button class="vlab-btn compare" ${!hasRec ? 'disabled' : ''} data-speak="${escAttr(cleanEn)}"
            onclick="VoiceRecorder.compareWithNative(this.getAttribute('data-speak'), '${recKey}', this)">🔄 원어민↔내발음</button>
        </div>
      </div>
    </div>`;
  } else if (sm === 'chunk') {
    bodyHtml = renderChunkBuilderUI(
      cleanEn, cleanKr, recKey,
      `${pv.cardIdx + 1}/${p.cards.length}`,
      'patChunkPrev()', 'patChunkNext()', pv.cardIdx > 0
    );
  } else if (sm === 'pronun') {
    bodyHtml = `<div class="pat-shadow-wrap">
      ${VisualEngine.renderSceneCardHTML(cleanEn, cleanKr, recKey, { compact: true, showChunks: true })}
      <div class="pronun-box">
        <div class="pat-pattern-badge">📐 ${p.pattern}</div>
        <div style="font-size:13px;color:var(--text2);text-align:center;margin-bottom:8px">${cleanKr}</div>
        <div class="pronun-target" id="pronunTarget">${cleanEn}</div>
        <div class="pronun-wave" id="pronunWave">
          <span style="height:8px"></span><span style="height:16px"></span>
          <span style="height:22px"></span><span style="height:14px"></span>
          <span style="height:20px"></span><span style="height:10px"></span>
          <span style="height:18px"></span><span style="height:24px"></span>
          <span style="height:12px"></span>
        </div>
        <div class="pronun-status" id="pronunStatus">🎤 아래 버튼을 눌러 발음해보세요</div>
        <div class="pronun-btns">
          <button class="pronun-btn listen" data-speak="${escAttr(cleanEn)}" onclick="speakEl(this)">🔊 원어민 듣기</button>
          <button class="pronun-btn record" id="pronunRecBtn" onclick="patPronunRec()">🎤 AI 발음 채점</button>
        </div>
        <div class="pronun-result" id="pronunResult"></div>
      </div>
      <div class="shadow-btns">
        ${pv.cardIdx > 0 ? '<button class="shadow-btn prev" onclick="patPronunPrev()">← 이전</button>' : ''}
        <button class="shadow-btn next" onclick="patPronunNext()">다음 →</button>
      </div>
    </div>`;
  } else if (sm === 'flash') {
    const flipped = pv.flashFlipped || false;
    bodyHtml = `<div class="flash3d-wrap">
      <div class="pat-flash-scene" onclick="patFlashFlip()">
        <div class="pat-flip-card ${flipped ? 'flipped' : ''}">
          <div class="pat-flip-face pat-flip-front">
            <div class="flip-face-label">📐 ${p.pattern}</div>
            <div class="flip-main-text">${cleanKr}</div>
            <div class="flip-tap-hint">탭해서 영어 + 발음 확인 👆</div>
          </div>
          <div class="pat-flip-face pat-flip-back">
            <div class="flip-face-label">🇺🇸 English</div>
            <div class="flip-main-text">${cleanEn}</div>
            <div class="flip-sub-text">${cleanKr}</div>
          </div>
        </div>
      </div>
      <div class="flash3d-btns">
        <button class="flash3d-btn prev" onclick="patFlashPrev()" ${pv.cardIdx === 0 ? 'disabled' : ''}>← 이전</button>
        <button class="flash3d-btn flip" onclick="patFlashFlip()">🔄 뒤집기</button>
        <button class="flash3d-btn next" style="background:var(--cyan);color:#000" data-speak="${escAttr(cleanEn)}" onclick="speakEl(this)">🔊 듣기</button>
        <button class="flash3d-btn next" onclick="patFlashNext()">다음 →</button>
      </div>
      <div style="text-align:center;font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace">${pv.cardIdx + 1} / ${p.cards.length}</div>
    </div>`;
  }

  document.getElementById('pattern-content').innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div class="inner-header">
        <button class="back-btn" onclick="stopAutoShadow();renderPatternHome()">←</button>
        <div style="flex:1;min-width:0">
          <div style="font-size:10px;letter-spacing:0.15em;color:var(--cyan);text-transform:uppercase">DAY ${p.id} · ${pv.cardIdx + 1}/${p.cards.length}</div>
          <div style="font-size:14px;font-weight:900;color:var(--cyan);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.pattern} (${p.meaning})</div>
        </div>
      </div>
      ${p.review ? `<div style="padding:7px 16px;background:rgba(111,207,151,0.08);border-bottom:1px solid rgba(111,207,151,0.15);font-size:11px;color:var(--green);flex-shrink:0">${p.review}</div>` : ''}
      ${modebar}
      <div class="study-body fade-in" id="pat-study-body">${bodyHtml}</div>
    </div>`;
}

function patFlip() {
  const pv = state.patternView;
  pv.flipped = !pv.flipped;
  renderPatternStudy();
  if (pv.flipped && state.autoSpeakCard) {
    AudioEngine.speak(patCurrentCard());
  }
}
function patSetMode(m) { state.patternView.mode = m; state.patternView.flipped = false; renderPatternStudy(); }
function patPrev() { if (state.patternView.cardIdx > 0) { state.patternView.cardIdx--; state.patternView.flipped = false; renderPatternStudy(); } }
function patNext() {
  const pv = state.patternView;
  const p = PATTERNS[pv.dayIdx];
  recordStudyActivity();
  if (pv.cardIdx < p.cards.length - 1) {
    pv.cardIdx++;
    pv.flipped = false;
    renderPatternStudy();
  } else {
    if (!state.completedP.includes(p.id)) { state.completedP.push(p.id); save(); }
    renderPatternHome();
  }
}
function patCurrentCard() {
  const pv = state.patternView;
  const p = PATTERNS[pv.dayIdx];
  return p.cards[pv.cardIdx].en.replace('🔀 ', '').replace(/<[^>]+>/g, '');
}
function patStudyMode(m) {
  stopAutoShadow();
  VoiceRecorder.stopRecord();
  state.patternView.studyMode = m;
  state.patternView.flipped = false;
  state.patternView.shadowStep = 1;
  state.patternView.flashFlipped = false;
  state.patternView.chunkState = null;
  state.patternView.swapRevealed = {};
  renderPatternStudy();
}
function patSwapPrev() {
  stopAutoShadow();
  const pv = state.patternView;
  if (pv.cardIdx > 0) { pv.cardIdx--; pv.swapRevealed = {}; renderPatternStudy(); }
}
function patSwapNext() {
  stopAutoShadow();
  const pv = state.patternView;
  const p = PATTERNS[pv.dayIdx];
  recordStudyActivity();
  if (pv.cardIdx < p.cards.length - 1) {
    pv.cardIdx++;
    pv.swapRevealed = {};
    renderPatternStudy();
  } else {
    if (!state.completedP.includes(p.id)) { state.completedP.push(p.id); save(); }
    renderPatternHome();
  }
}
function patShadowNext() {
  const pv = state.patternView;
  if (!pv.shadowStep) pv.shadowStep = 1;
  if (pv.shadowStep < 3) { pv.shadowStep++; renderPatternStudy(); }
}
function patShadowDone() {
  const pv = state.patternView;
  const p = PATTERNS[pv.dayIdx];
  recordStudyActivity();
  if (pv.cardIdx < p.cards.length - 1) {
    pv.cardIdx++;
    pv.shadowStep = 1;
    renderPatternStudy();
  } else {
    if (!state.completedP.includes(p.id)) { state.completedP.push(p.id); save(); }
    const body = document.getElementById('pat-study-body');
    if (body) body.innerHTML = `<div class="study-complete">
      <div class="study-complete-icon">🎙</div>
      <div class="study-complete-title">DAY ${p.id} 쉐도잉 완주!</div>
      <div class="study-complete-sub">전체 ${p.cards.length}문장을 완벽하게 소화했어요 🎉</div>
      <button class="shadow-btn next" style="margin:0 auto" onclick="state.patternView.cardIdx=0;state.patternView.shadowStep=1;renderPatternStudy()">🔄 다시하기</button>
    </div>`;
  }
}
function patShadowPrev() {
  stopAutoShadow();
  const pv = state.patternView;
  if (pv.cardIdx > 0) { pv.cardIdx--; pv.shadowStep = 1; renderPatternStudy(); }
}
function patChunkPrev() {
  const pv = state.patternView;
  if (pv.cardIdx > 0) { pv.cardIdx--; pv.chunkState = null; renderPatternStudy(); }
}
function patChunkNext() {
  const pv = state.patternView;
  const p = PATTERNS[pv.dayIdx];
  if (pv.cardIdx < p.cards.length - 1) {
    pv.cardIdx++;
    pv.chunkState = null;
    renderPatternStudy();
  } else {
    if (!state.completedP.includes(p.id)) { state.completedP.push(p.id); save(); }
    renderPatternHome();
  }
}
function patPronunRec() { pronunStart(AudioEngine.toSpokenEnglish(patCurrentCard())); }
function patPronunNext() {
  const pv = state.patternView;
  const p = PATTERNS[pv.dayIdx];
  if (pv.cardIdx < p.cards.length - 1) { pv.cardIdx++; renderPatternStudy(); }
  else {
    if (!state.completedP.includes(p.id)) { state.completedP.push(p.id); save(); }
    renderPatternHome();
  }
}
function patPronunPrev() { if (state.patternView.cardIdx > 0) { state.patternView.cardIdx--; renderPatternStudy(); } }
function patFlashFlip() {
  state.patternView.flashFlipped = !state.patternView.flashFlipped;
  renderPatternStudy();
  if (state.patternView.flashFlipped) AudioEngine.speak(patCurrentCard());
}
function patFlashNext() {
  const pv = state.patternView;
  const p = PATTERNS[pv.dayIdx];
  if (pv.cardIdx < p.cards.length - 1) { pv.cardIdx++; pv.flashFlipped = false; renderPatternStudy(); }
  else {
    if (!state.completedP.includes(p.id)) { state.completedP.push(p.id); save(); }
    renderPatternHome();
  }
}
function patFlashPrev() { if (state.patternView.cardIdx > 0) { state.patternView.cardIdx--; state.patternView.flashFlipped = false; renderPatternStudy(); } }

// ════════════════════════════════════════════════════════
// SPEECH RECOGNITION SCORING
// ════════════════════════════════════════════════════════
let _pronunRec = null, _pronunListening = false;
function pronunStart(targetText) {
  AudioEngine.stop();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('음성인식 채점은 Chrome 또는 Safari에서 지원됩니다. (쉐도잉 모드의 [내 발음 녹음]은 모든 브라우저에서 작동해요!)'); return; }
  if (_pronunListening) { pronunStop(); return; }

  _pronunRec = new SR();
  _pronunRec.lang = 'en-US';
  _pronunRec.continuous = false;
  _pronunRec.interimResults = false;

  const wave = document.getElementById('pronunWave');
  const status = document.getElementById('pronunStatus');
  const btn = document.getElementById('pronunRecBtn');
  const result = document.getElementById('pronunResult');

  _pronunRec.onstart = () => {
    _pronunListening = true;
    if (wave) wave.classList.add('active');
    if (status) { status.className = 'pronun-status recording'; status.textContent = '🔴 듣고 있어요... 문장을 말해보세요!'; }
    if (btn) btn.textContent = '⏹ 중지';
    if (result) { result.className = 'pronun-result'; result.innerHTML = ''; }
  };
  _pronunRec.onresult = (e) => {
    const said = e.results[0][0].transcript.toLowerCase().trim();
    const target = targetText.toLowerCase().replace(/[.,!?]/g, '').trim();
    pronunStop();
    pronunScore(said, target, targetText);
  };
  _pronunRec.onerror = () => {
    pronunStop();
    if (status) { status.className = 'pronun-status'; status.textContent = '마이크 인식 실패 — 다시 눌러 또렷하게 말해보세요.'; }
  };
  _pronunRec.onend = () => {
    pronunStop();
    AudioEngine.ensurePlaybackSession();
  };

  try { _pronunRec.start(); }
  catch (_) { if (status) status.textContent = '마이크 시작 오류. 잠시 후 다시 시도해주세요.'; }
}

function pronunStop() {
  _pronunListening = false;
  if (_pronunRec) { try { _pronunRec.stop(); } catch (_) {} _pronunRec = null; }
  const wave = document.getElementById('pronunWave');
  const btn = document.getElementById('pronunRecBtn');
  if (wave) wave.classList.remove('active');
  if (btn) btn.textContent = '🎤 AI 발음 채점';
}

function pronunScore(said, target, targetText) {
  const targetWords = target.split(/\s+/).filter(w => w.length > 1);
  const saidWords = said.split(/\s+/);
  const matched = targetWords.filter(tw => saidWords.some(sw => sw.includes(tw) || tw.includes(sw) || levenDist(tw, sw) <= 1));
  const score = targetWords.length > 0 ? matched.length / targetWords.length : 0;

  const result = document.getElementById('pronunResult');
  const status = document.getElementById('pronunStatus');
  if (!result) return;

  let cls, emoji, msg;
  if (score >= 0.82) { cls = 'great'; emoji = '🌟'; msg = `완벽해요! (${Math.round(score * 100)}점)`; recordStudyActivity(); }
  else if (score >= 0.55) { cls = 'ok'; emoji = '👍'; msg = `좋아요! 조금만 더 매끄럽게! (${Math.round(score * 100)}점)`; }
  else { cls = 'retry'; emoji = '💪'; msg = `원어민 소리를 다시 듣고 따라해보세요 (${Math.round(score * 100)}점)`; }

  result.className = 'pronun-result show ' + cls;
  result.innerHTML = `<div style="font-size:20px;margin-bottom:4px">${emoji}</div>
    <div style="font-weight:800;margin-bottom:4px">${msg}</div>
    <div class="pronun-transcript"><strong>인식된 발음:</strong> ${said || '(인식 안됨)'}<br><strong>목표 문장:</strong> ${targetText}</div>`;
  if (status) { status.className = 'pronun-status'; status.textContent = ''; }
}

function levenDist(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i || j));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// ════════════════════════════════════════════════════════
// 5-MINUTE SPEAKING (with Full HD Script Sequence & Self Recording)
// ════════════════════════════════════════════════════════
let _currentScriptSections = [];

function renderSpeakingPage() {
  const t = state.speakingTopic || { en: '(주제를 선택해주세요)', kr: '아래에서 고르거나 [랜덤]을 눌러보세요' };
  const tm = state.timer;
  const spkRecKey = 'spk-5min';
  const isRec = VoiceRecorder.isRecording(spkRecKey);
  const hasRec = VoiceRecorder.hasRecording(spkRecKey);

  const topicGrid = SPEAKING_TOPICS.map((tp, i) => `
    <div class="topic-item" onclick="spkSetTopic(${i})">
      <span class="t-num">TOPIC ${String(i + 1).padStart(2, '0')}</span>
      <div class="t-en">${tp.en}</div>
      <div class="t-kr">${tp.kr}</div>
    </div>`).join('');

  const fillerChips = FILLERS.map(f => `<span class="filler-chip" data-speak="${escAttr(f)}" onclick="speakEl(this)">${f}</span>`).join('');

  document.getElementById('speaking-content').innerHTML = `
    <div class="speaking-page fade-in">
      <div class="spk-timer-sec">
        <div class="spk-timer ${tm.remaining <= 30 && tm.remaining > 0 ? 'warning pulse' : ''}" id="spkTimer">${fmtTime(tm.remaining)}</div>
        <div class="spk-prog-bar"><div class="spk-prog-fill" id="spkProg" style="width:${((tm.total - tm.remaining) / tm.total) * 100}%"></div></div>
        <div class="spk-btns">
          <button class="spk-btn success" onclick="spkStart()">▶ 타이머 시작</button>
          <button class="spk-btn outline" onclick="spkPause()">⏸ 일시정지</button>
          <button class="spk-btn danger" onclick="spkReset()">↺ 초기화</button>
        </div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap">
          <button class="vlab-btn rec ${isRec ? 'recording' : ''}" style="max-width:180px" onclick="handleVoiceRecord('${spkRecKey}', 'speaking')">
            ${isRec ? '⏹ 스피킹 녹음 종료' : '🎙 내 스피킹 녹음'}
          </button>
          ${hasRec ? `<button class="vlab-btn" style="max-width:160px" onclick="VoiceRecorder.playUserRecording('${spkRecKey}', this)">▶️ 내 스피킹 들어보기</button>` : ''}
        </div>
      </div>

      <div class="spk-topic-card">
        <div class="spk-topic-lbl">🎯 TODAY'S TOPIC</div>
        <div class="spk-topic-en" id="spkTopicEn">${t.en}</div>
        <div class="spk-topic-kr" id="spkTopicKr">${t.kr}</div>
        <div class="spk-topic-btns">
          <button class="spk-topic-btn primary" onclick="spkRandom()">🎲 랜덤 주제</button>
          <button class="spk-topic-btn" onclick="spkListenTopic(this)">🔊 주제 발음</button>
          <button class="spk-topic-btn" onclick="spkGenScript()">📝 모범 스크립트</button>
        </div>
      </div>

      <div id="spkScriptDisplay" class="script-display"></div>

      <div class="spk-fillers">
        <div class="spk-filler-title">💬 원어민 추임새 · 필러 (탭하면 HD 원어민 발음)</div>
        <div class="filler-chips">${fillerChips}</div>
      </div>

      <div class="spk-topic-list">
        <div class="spk-topic-list-title">📋 실전 스피킹 주제 (${SPEAKING_TOPICS.length}개)</div>
        <div class="topic-grid">${topicGrid}</div>
      </div>
    </div>`;
}

function spkListenTopic(btn) {
  if (!state.speakingTopic) { spkRandom(); }
  AudioEngine.speak(state.speakingTopic.en, btn);
}
function spkSetTopic(i) {
  state.speakingTopic = SPEAKING_TOPICS[i];
  const enEl = document.getElementById('spkTopicEn');
  const krEl = document.getElementById('spkTopicKr');
  const disp = document.getElementById('spkScriptDisplay');
  if (enEl) enEl.textContent = state.speakingTopic.en;
  if (krEl) krEl.textContent = state.speakingTopic.kr;
  if (disp) disp.style.display = 'none';
}
function spkRandom() {
  spkSetTopic(Math.floor(Math.random() * SPEAKING_TOPICS.length));
}
function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function spkStart() {
  if (state.timer.running) return;
  state.timer.running = true;
  state.timer.id = setInterval(() => {
    if (state.timer.remaining > 0) {
      state.timer.remaining--;
      const el = document.getElementById('spkTimer');
      const pg = document.getElementById('spkProg');
      if (el) {
        el.textContent = fmtTime(state.timer.remaining);
        if (state.timer.remaining <= 30) el.classList.add('warning', 'pulse');
        else el.classList.remove('warning', 'pulse');
      }
      if (pg) pg.style.width = ((state.timer.total - state.timer.remaining) / state.timer.total) * 100 + '%';
    } else {
      clearInterval(state.timer.id);
      state.timer.running = false;
      const el = document.getElementById('spkTimer');
      if (el) { el.textContent = 'DONE!'; el.style.color = 'var(--green)'; el.classList.remove('pulse'); }
      recordStudyActivity();
      AudioEngine.speak('Great job! You made it!');
    }
  }, 1000);
}
function spkPause() { clearInterval(state.timer.id); state.timer.running = false; }
function spkReset() {
  clearInterval(state.timer.id);
  state.timer.running = false;
  state.timer.remaining = state.timer.total;
  const el = document.getElementById('spkTimer');
  const pg = document.getElementById('spkProg');
  if (el) { el.textContent = fmtTime(state.timer.remaining); el.classList.remove('warning', 'pulse'); el.style.color = ''; }
  if (pg) pg.style.width = '0%';
}

function spkGenScript() {
  if (!state.speakingTopic) spkRandom();
  const t = state.speakingTopic;
  const disp = document.getElementById('spkScriptDisplay');
  disp.style.display = 'block';

  const scriptVersions = SPEAKING_SCRIPTS[t.en];
  const lastKey = 'spk_last_' + t.en.replace(/\s+/g, '_');
  const lastIdx = parseInt(localStorage.getItem(lastKey) || '-1', 10);
  let nextIdx = 0;
  if (scriptVersions && scriptVersions.length > 1) {
    do { nextIdx = Math.floor(Math.random() * scriptVersions.length); } while (nextIdx === lastIdx);
  }
  localStorage.setItem(lastKey, String(nextIdx));
  const scriptData = scriptVersions ? scriptVersions[nextIdx] : null;
  const versionLabel = scriptVersions ? `버전 ${nextIdx + 1}/${scriptVersions.length}` : '';

  _currentScriptSections = scriptData ? scriptData.sections : [
    {
      time: '0:00–1:00', tech: '🎯 인트로',
      en: `Today I want to talk about ${t.en}. This is a topic that is very important to me. Let me share my thoughts and experiences with you.`,
      kr: `오늘은 ${t.kr || t.en}에 대해 이야기하려고 해요. 저에게 중요한 주제예요.`
    },
    {
      time: '1:00–2:30', tech: '⭐ 구체적인 경험',
      en: `I have had many experiences related to this topic. One memory that stands out is when I really thought deeply about it. It changed my perspective a lot.`,
      kr: `이 주제와 관련된 경험이 많아요. 깊이 생각했던 기억이 특히 남아요.`
    },
    {
      time: '2:30–4:00', tech: '⏳ 변화와 생각',
      en: `My view on this has changed over the years. I used to think differently, but now I understand it better. I think we all grow and change over time.`,
      kr: `이에 대한 시각이 시간이 지나면서 바뀌었어요. 예전과 달리 지금은 더 잘 이해해요.`
    },
    {
      time: '4:00–5:00', tech: '💭 마무리',
      en: `To wrap up, this topic means a lot to me. I'm still learning every day. I hope to keep growing. Thank you for listening to me today.`,
      kr: `마무리하자면 이 주제는 저에게 소중해요. 매일 배우고 있어요. 들어줘서 감사해요.`
    }
  ];

  disp.innerHTML = `
    <div class="script-header">
      <div class="script-title">📝 "${t.en}" <span style="font-size:10px;opacity:0.7;font-weight:400">${versionLabel}</span></div>
      <div class="script-meta-btns">
        <button class="script-meta-btn" style="border-color:var(--cyan);color:var(--cyan)" onclick="playFullScript(this)">🔊 전체 연속듣기</button>
        <button class="script-meta-btn stop" onclick="AudioEngine.stop()">⏹</button>
        <button class="script-meta-btn" onclick="spkGenScript()" style="background:var(--purple);color:#fff;border-color:var(--purple)">🔀 다른 버전</button>
        <button class="script-meta-btn" onclick="AudioEngine.stop();document.getElementById('spkScriptDisplay').style.display='none'">✕</button>
      </div>
    </div>
    ${_currentScriptSections.map((s, idx) => `
      <div class="script-section" id="spk-sec-${idx}">
        <div class="script-time">[${s.time}]</div>
        <div class="script-tech">${s.tech}</div>
        <div class="script-en-text">🇺🇸 ${s.en}</div>
        <button class="tts-btn small" style="margin:2px 0 8px" data-speak="${escAttr(s.en)}" onclick="speakEl(this)">🔊 구간 원어민 듣기</button>
        <div class="script-kr-text">🇰🇷 ${s.kr}</div>
      </div>`).join('')}`;

  setTimeout(() => disp.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function playFullScript(btn) {
  if (!_currentScriptSections.length) return;
  const items = _currentScriptSections.map(s => ({ text: s.en, pauseMs: 650 }));
  AudioEngine.speakSequence(items, btn, (idx) => {
    document.querySelectorAll('.script-section.playing-sec').forEach(el => el.classList.remove('playing-sec'));
    if (idx >= 0) {
      const el = document.getElementById('spk-sec-' + idx);
      if (el) {
        el.classList.add('playing-sec');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });
}

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  AudioEngine.setRate(AudioEngine.getRate());
  renderHome();
});
