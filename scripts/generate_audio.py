#!/usr/bin/env python3
"""
Pre-generates high-clarity Neural TTS MP3 files (en-US-AvaNeural) into ../audio/<hash>.mp3
using the exact normalization & 64-bit hash function defined in ../js/audio.js.
"""
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "audio"
VOICE = "en-US-AvaNeural"

NODE_EXTRACT = r"""
const fs = require('fs');
const path = require('path');
const root = process.argv[1];
const dataCode = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');
const { AudioEngine } = require(path.join(root, 'js/audio.js'));
const { SlotSwapEngine } = require(path.join(root, 'js/swaps.js'));

const fn = new Function(dataCode + '\nreturn { GYEOLLON_CHAPTERS, MOUSE_CHAPTERS, PATTERNS, SPEAKING_TOPICS, SPEAKING_SCRIPTS, FILLERS };');
const d = fn();

const jobs = new Map();
function add(raw) {
  if (!raw) return;
  const spoken = AudioEngine.toSpokenEnglish(raw);
  const hash = AudioEngine.audioHash(spoken);
  if (spoken && hash && !jobs.has(hash)) {
    jobs.set(hash, spoken);
  }
}

// Sound test & timer completion phrases
add("Sound check complete! Let's master English step by step.");
add("Great job! You made it!");

// Gyeollon & Mouse chapters (sentences + vocab words + vocab examples)
for (const ch of [...d.GYEOLLON_CHAPTERS, ...d.MOUSE_CHAPTERS]) {
  for (const s of (ch.sentences || [])) add(s.en);
  for (const v of (ch.vocab || [])) {
    add(v.en);
    add(v.ex);
  }
}

// Pattern 30 days (pattern titles + all cards)
for (const p of d.PATTERNS) {
  add(p.pattern);
  for (const c of (p.cards || [])) add(c.en || c);
}

// Speaking topics, fillers, and all script sections
for (const t of d.SPEAKING_TOPICS) add(t.en);
for (const f of d.FILLERS) add(f);
for (const vers of Object.values(d.SPEAKING_SCRIPTS)) {
  for (const v of vers) {
    for (const sec of (v.sections || [])) {
      add(sec.en);
    }
  }
}

// Fallback generic speaking script sections (for topics without custom scripts)
for (const t of d.SPEAKING_TOPICS) {
  if (!d.SPEAKING_SCRIPTS[t.en]) {
    add(`Today I want to talk about ${t.en}. This is a topic that is very important to me. Let me share my thoughts and experiences with you.`);
  }
}
add("I have had many experiences related to this topic. One memory that stands out is when I really thought deeply about it. It changed my perspective a lot.");
add("My view on this has changed over the years. I used to think differently, but now I understand it better. I think we all grow and change over time.");
add("To wrap up, this topic means a lot to me. I'm still learning every day. I hope to keep growing. Thank you for listening to me today.");

// Slot-Swapping curated variation sentences
for (const swEn of SlotSwapEngine.getAllCuratedSpokenPhrases()) {
  add(swEn);
}

console.log(JSON.stringify(Array.from(jobs.entries())));
"""


async def generate_one(sem: asyncio.Semaphore, h: str, text: str, counters: dict):
    out_path = AUDIO_DIR / f"{h}.mp3"
    if out_path.exists() and out_path.stat().st_size > 200:
        counters["skipped"] += 1
        return
    async with sem:
        for attempt in range(4):
            try:
                comm = edge_tts.Communicate(text, VOICE)
                tmp_path = AUDIO_DIR / f".{h}.tmp.mp3"
                await comm.save(str(tmp_path))
                if tmp_path.exists() and tmp_path.stat().st_size > 200:
                    tmp_path.replace(out_path)
                    counters["done"] += 1
                    total_done = counters["done"] + counters["skipped"]
                    if total_done % 150 == 0:
                        print(f"[progress] {total_done}/{counters['total']} ready...", flush=True)
                    return
            except Exception as e:
                if attempt == 3:
                    counters["failed"] += 1
                    print(f"[warn] failed {h} ({text[:40]}): {e}", file=sys.stderr, flush=True)
                else:
                    await asyncio.sleep(0.8 * (attempt + 1))


async def main():
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        ["node", "-e", NODE_EXTRACT, str(ROOT)],
        capture_output=True,
        text=True,
        check=True,
    )
    entries = json.loads(proc.stdout)
    counters = {"total": len(entries), "done": 0, "skipped": 0, "failed": 0}
    print(f"Total unique spoken phrases to generate: {len(entries)}", flush=True)

    sem = asyncio.Semaphore(18)
    await asyncio.gather(*(generate_one(sem, h, txt, counters) for h, txt in entries))
    print(
        f"Completed! done={counters['done']}, skipped={counters['skipped']}, failed={counters['failed']}, total={counters['total']}",
        flush=True,
    )


if __name__ == "__main__":
    asyncio.run(main())
