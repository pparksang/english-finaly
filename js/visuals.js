// ════════════════════════════════════════════════════════
// VISUAL SCENE ASSOCIATION & CHUNK ORDER ENGINE (js/visuals.js)
// Dual-Coding (Mental Movie Scene) + Camera Zoom-Out Chunking
// (1. 핵심 결론 클로즈업 -> 2. 대상/디테일 -> 3. 배경/조건/시간 줌아웃)
// ════════════════════════════════════════════════════════

const VisualEngine = (() => {
  const MEMO_KEY = 'uni_scene_memos';
  let _memos = {};
  try {
    _memos = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(MEMO_KEY)) || '{}');
  } catch (_) { _memos = {}; }

  const SCENE_RULES = [
    { re: /step outside|walk out|go out|outside/i, emoji: '🚪🚶‍♂️🌤️', tag: '공간 이동', hue: 'cyan', cue: '문을 열고 바깥 공기를 마시며 한 걸음 나가는 장면을 클로즈업하세요' },
    { re: /quit.*job|office|work\b|colleague|supplier|project|business/i, emoji: '💼🏢📊', tag: '일·비즈니스', hue: 'gold', cue: '사무실 책상 앞 표정과 행동(결론)을 먼저 떠올린 뒤 상황 조건으로 넓혀보세요' },
    { re: /marry|married|girlfriend|boyfriend|divorce|kiss|forehead/i, emoji: '💍💑✨', tag: '관계·감정', hue: 'pink', cue: '두 사람 사이의 결정적 순간(행동/감정)을 영화 한 장면처럼 먼저 찍어보세요' },
    { re: /coffee|cafe|lunch|breakfast|eat|chicken|food|hungry|water|tender/i, emoji: '☕🍽️😋', tag: '식사·일상', hue: 'gold', cue: '김이 모락모락 나는 잔이나 음식을 앞에 둔 내 행동을 먼저 떠올리세요' },
    { re: /gym|work out|exercise|belly|stretch|legs.*shaking/i, emoji: '🏋️‍♂️💦🔥', tag: '운동·컨디션', hue: 'green', cue: '몸을 움직이는 역동적인 동작을 먼저 머릿속에 그린 뒤 이유·시간을 붙이세요' },
    { re: /airport|flight|bus|drive|trip|abroad|jeju|check in|reservation/i, emoji: '✈️🧳🗺️', tag: '여행·이동', hue: 'cyan', cue: '캐리어를 끌고 이동하거나 카운터 앞에 선 내 모습을 1인칭 시점으로 그려보세요' },
    { re: /money|credit card|bill|bank|wire|account|purchase|cost|dollars|free/i, emoji: '💳💸🏦', tag: '결제·금융', hue: 'gold', cue: '카드 명세서나 계좌 화면을 보며 말하는 핵심 용건을 첫마디로 던지세요' },
    { re: /phone|laptop|iphone|website|download|app|button|screen/i, emoji: '📱💻⚡', tag: '디지털·기기', hue: 'cyan', cue: '손에 쥔 스마트폰·화면을 조작하는 동작부터 먼저 떠올리세요' },
    { re: /light.*blink|light.*flicker|ac\b|volume|heat|stain/i, emoji: '💡🎛️👀', tag: '주변 상태', hue: 'purple', cue: '눈앞에서 깜빡이거나 변하는 사물의 상태를 가리키며 바로 묘사해보세요' },
    { re: /conversation|talk|tell|say hi|speak|ask|recommend|told/i, emoji: '🗣️💬🤝', tag: '대화·소통', hue: 'purple', cue: '상대 눈을 바라보며 입을 떼는 첫 핵심 동사(말하다/묻다)에 집중하세요' },
    { re: /remember|forgot|find|found|lost|notice|know/i, emoji: '🧠💡🔍', tag: '기억·발견', hue: 'gold', cue: '머릿속 전구가 켜지듯 떠오르는 대상(명사)을 먼저 찍고 설명을 뒤에 붙이세요' },
    { re: /scared|worried|concerned|afraid|shocked|offended|annoying|hate|sensitive|problem/i, emoji: '😮💓⚡', tag: '감정·반응', hue: 'pink', cue: '내 표정과 감정 상태를 먼저 선언한 뒤, 무엇 때문인지 카메라를 이동하세요' },
    { re: /motivat|dream|positive|grow|admire|gift|promise|smooth/i, emoji: '🌟🚀🎁', tag: '성장·다짐', hue: 'green', cue: '가슴이 뛰는 변화나 선물의 이미지를 선명하게 먼저 떠올려 보세요' },
    { re: /sleep|wake up|morning|alarm|snooze|bed|tuck.*in|night|tired/i, emoji: '🌅🛏️⏰', tag: '아침·수면', hue: 'purple', cue: '침대와 창가 빛이 보이는 방 안에서 일어나는 동작을 순서대로 그려보세요' },
    { re: /dress|pants|jeans|necklace|buy|get|shop|convenience store/i, emoji: '🛍️👕✨', tag: '쇼핑·아이템', hue: 'pink', cue: '손으로 직접 고르거나 입고 있는 아이템의 색감과 장면을 떠올려 보세요' },
    { re: /park|weekend|hang out|friend|family|mother-in-law|home/i, emoji: '🏡🌳😊', tag: '모임·여가', hue: 'green', cue: '함께 있는 사람과 공간의 따뜻한 분위기를 떠올리며 주인공부터 말해보세요' }
  ];

  function detectActor(plainEn) {
    const s = plainEn.trim();
    if (/^(can you|could you|would you|will you|do you|did you|are you|were you|have you|should you|why are you|what are you|where did you)/i.test(s)) {
      return { icon: '👉🙂', label: '상대에게 질문·요청' };
    }
    if (/^(i'm|i am|i've|i have|i'd|i'll|i |my |let me)/i.test(s)) {
      return { icon: '🙋‍♂️✨', label: '나의 행동·상태 선언' };
    }
    if (/^(we|let's|our)/i.test(s)) {
      return { icon: '🤝👥', label: '우리 함께 행동' };
    }
    if (/^(don't|never|please|tell|give|stay|look|have a)/i.test(s)) {
      return { icon: '📣⚡', label: '직접 행동 유도' };
    }
    return { icon: '🎬💡', label: '핵심 상황 묘사' };
  }

  function stripHtml(str) {
    return String(str || '').replace(/<[^>]+>/g, '').replace(/🔀\s*/g, '').replace(/\s+/g, ' ').trim();
  }

  // Split English sentence into Camera-Zoom-Out Chunks (Conclusion -> Detail -> Condition/Time)
  function splitCameraChunks(rawEn) {
    const spoken = (typeof AudioEngine !== 'undefined' && AudioEngine.toSpokenEnglish)
      ? AudioEngine.toSpokenEnglish(rawEn)
      : stripHtml(rawEn);
    if (!spoken) return [];

    // Split before clause connectors / scene-setting prepositions when preceded by at least 2 words
    const connectorRe = /\s+(?=(?:if|before|after|when|while|until|because|since|although|though|just in case|unless|so that|whether|where|that|which|who)\b)/i;
    const prepRe = /\s+(?=(?:for a second|for lunch|for free|in \d|in a |in an |in the |on the way|on my |at night|at home|every morning|last week|last year|the other night|right now|with me|with him|with her|with my|without |through |from )\b)/i;

    let parts = [];
    // First split by sentence boundaries if multiple short sentences
    const sentences = spoken.split(/(?<=[.!?])\s+/).filter(Boolean);
    for (const sent of sentences) {
      // Split by comma or major clause connector
      const sub = sent.split(/,\s+|(?=\bbut\b|\band\b\s+(?:wait|strike|make|my|tears))/i).map(x => x.trim()).filter(Boolean);
      for (const piece of sub) {
        const cSplit = piece.split(connectorRe).map(x => x.trim()).filter(Boolean);
        for (const cp of cSplit) {
          if (cp.split(/\s+/).length >= 6) {
            const pSplit = cp.split(prepRe).map(x => x.trim()).filter(Boolean);
            parts.push(...pSplit);
          } else {
            parts.push(cp);
          }
        }
      }
    }

    // If still only 1 chunk and >= 5 words, split neatly after core verb phrase (first 3-4 words)
    if (parts.length === 1) {
      const words = parts[0].split(/\s+/);
      if (words.length >= 5) {
        // Find natural split after verb / object
        let cut = Math.min(4, Math.ceil(words.length / 2));
        const prepIdx = words.findIndex((w, idx) => idx >= 2 && /^(to|for|with|in|on|at|about|after|before|if|from|of|around|into)$/i.test(w));
        if (prepIdx >= 2 && prepIdx < words.length - 1) cut = prepIdx;
        parts = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
      }
    }

    // Cap at 4 visual chunks for clean mobile diagram
    if (parts.length > 4) {
      const merged = parts.slice(0, 3);
      merged.push(parts.slice(3).join(' '));
      parts = merged;
    }

    const roles = [
      { badge: '1️⃣ 결론·핵심동작', cls: 'chunk-core' },
      { badge: '2️⃣ 대상·디테일', cls: 'chunk-detail' },
      { badge: '3️⃣ 조건·배경·시간', cls: 'chunk-context' },
      { badge: '4️⃣ 추가 상황', cls: 'chunk-extra' }
    ];

    return parts.map((text, idx) => {
      let role = roles[Math.min(idx, roles.length - 1)];
      if (idx >= 1 && /^(if|when|before|after|while|until|because|just in case|unless)\b/i.test(text)) {
        role = { badge: `${idx + 1}️⃣ 조건·시간 배경`, cls: 'chunk-context' };
      } else if (idx >= 1 && /^(that|which|who|where)\b/i.test(text)) {
        role = { badge: `${idx + 1}️⃣ 앞 명사 설명`, cls: 'chunk-detail' };
      }
      return { text, badge: role.badge, cls: role.cls };
    });
  }

  // Build 3~6 interactive puzzle blocks for Chunk Assembly Training (🧩 어순조립)
  function buildPuzzleChunks(rawEn) {
    const spoken = (typeof AudioEngine !== 'undefined' && AudioEngine.toSpokenEnglish)
      ? AudioEngine.toSpokenEnglish(rawEn)
      : stripHtml(rawEn);
    const words = spoken.split(/\s+/).filter(Boolean);
    if (words.length <= 4) {
      return words.map((w, i) => ({ id: i, text: w }));
    }

    // Start from camera chunks, then split any chunk > 4 words into 2-3 word blocks
    const cam = splitCameraChunks(rawEn).map(c => c.text);
    const blocks = [];
    for (const c of cam) {
      const cw = c.split(/\s+/).filter(Boolean);
      if (cw.length <= 3) {
        blocks.push(cw.join(' '));
      } else if (cw.length <= 6) {
        const mid = Math.ceil(cw.length / 2);
        blocks.push(cw.slice(0, mid).join(' '), cw.slice(mid).join(' '));
      } else {
        for (let i = 0; i < cw.length; i += 3) {
          blocks.push(cw.slice(i, i + 3).join(' '));
        }
      }
    }
    return blocks.map((text, id) => ({ id, text }));
  }

  function analyzeScene(rawEn, rawKr, extraHint) {
    const plainEn = stripHtml(rawEn);
    const plainKr = stripHtml(rawKr);
    const actor = detectActor(plainEn);
    const matched = SCENE_RULES.find(r => r.re.test(plainEn + ' ' + (extraHint || '')));
    const scene = matched || {
      emoji: `${actor.icon} 💬`,
      tag: actor.label,
      hue: 'gold',
      cue: '주인공의 핵심 동작(결론)을 클로즈업으로 먼저 말하고, 상황·이유를 뒤에 자연스럽게 이어 붙여보세요'
    };
    const chunks = splitCameraChunks(rawEn);
    return {
      emoji: scene.emoji,
      tag: scene.tag,
      actorLabel: actor.label,
      hue: scene.hue,
      cue: scene.cue,
      chunks,
      plainEn,
      plainKr
    };
  }

  function getMemo(itemId) {
    return _memos[itemId] || '';
  }

  function saveMemo(itemId, text) {
    const val = String(text || '').trim();
    if (val) _memos[itemId] = val;
    else delete _memos[itemId];
    try {
      localStorage.setItem(MEMO_KEY, JSON.stringify(_memos));
    } catch (_) {}
  }

  function renderInlineChunksHTML(rawEn) {
    const chunks = splitCameraChunks(rawEn);
    if (!chunks || chunks.length < 2) return '';
    return `
      <div class="inline-chunks" onclick="event.stopPropagation()">
        ${chunks.map((c, idx) => `
          <button type="button" class="ichunk ${c.cls}"
            data-speak="${c.text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"
            onclick="event.stopPropagation();speakEl(this)">${c.text}</button>${idx < chunks.length - 1 ? '<span class="ichunk-sep">/</span>' : ''}
        `).join('')}
      </div>
    `;
  }

  function toggleMemoBox(btn, itemId) {
    const wrap = btn && btn.closest('.scene-cinema');
    if (!wrap) return;
    const row = wrap.querySelector('.memo-row');
    if (!row) return;
    const isHidden = row.style.display === 'none';
    row.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      const inp = row.querySelector('.memo-input');
      if (inp) inp.focus();
    }
  }

  // Render Scene Cinema Card HTML (reusable in Card, Shadowing, Chunk Builder, Pattern)
  function renderSceneCardHTML(rawEn, rawKr, itemId, opts = {}) {
    const info = analyzeScene(rawEn, rawKr, opts.pattern || '');
    const memo = itemId ? getMemo(itemId) : '';
    const showChunks = !!opts.showChunks;
    const compact = !!opts.compact;

    const chunksHtml = showChunks && info.chunks.length > 0 ? `
      <div class="camera-flow">
        <div class="camera-flow-track">
          ${info.chunks.map((c, idx) => `
            <div class="cam-chunk ${c.cls}" data-speak="${c.text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" onclick="event.stopPropagation();speakEl(this)">
              <span class="cam-badge">${c.badge}</span>
              <span class="cam-text">${c.text}</span>
            </div>
            ${idx < info.chunks.length - 1 ? '<span class="cam-arrow">→</span>' : ''}
          `).join('')}
        </div>
      </div>
    ` : '';

    const memoBtnHtml = (!compact && itemId) ? `
      <button type="button" class="scene-memo-btn ${memo ? 'has-memo' : ''}"
        onclick="event.stopPropagation();VisualEngine.toggleMemoBox(this, '${itemId}')">
        💭 ${memo ? '메모수정' : '메모'}
      </button>
    ` : '';

    const memoHtml = (!compact && itemId) ? `
      ${memo ? `<div class="memo-saved-pill" onclick="event.stopPropagation();VisualEngine.toggleMemoBox(this, '${itemId}')">💭 ${memo}</div>` : ''}
      <div class="memo-row" style="display:none" onclick="event.stopPropagation()">
        <input class="memo-input" type="text" value="${memo.replace(/"/g, '&quot;')}"
          placeholder="나만의 연상 장면 메모 입력 후 엔터"
          onchange="VisualEngine.saveMemo('${itemId}', this.value)" />
      </div>
    ` : (memo ? `<div class="memo-saved-pill">💭 ${memo}</div>` : '');

    return `
      <div class="scene-cinema hue-${info.hue} ${compact ? 'compact' : ''}">
        <div class="scene-top">
          <div class="scene-emojis">${info.emoji}</div>
          <div class="scene-meta">
            <div class="scene-tags">
              <span class="scene-tag">${info.tag}</span>
              <span class="scene-actor">${info.actorLabel}</span>
              ${memoBtnHtml}
            </div>
            <div class="scene-cue">${info.cue}</div>
          </div>
        </div>
        ${chunksHtml}
        ${memoHtml}
      </div>
    `;
  }

  return {
    analyzeScene,
    splitCameraChunks,
    buildPuzzleChunks,
    renderInlineChunksHTML,
    toggleMemoBox,
    renderSceneCardHTML,
    getMemo,
    saveMemo
  };
})();
