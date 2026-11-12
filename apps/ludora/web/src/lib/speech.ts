import { useEffect, useState } from 'react';
import type { PublicQuestion } from '@ludora/shared';
import { mathToWords } from '../features/sets/math/parse.ts';
import { devicePrefs } from './prefs.ts';

/*
 * Read aloud, with the browser's own speech: no network service, nothing leaves the device.
 * Off unless the player turns it on in Settings. Browsers without voices (some headless ones,
 * some older Chromebooks) simply show no speaker button.
 */

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

function allVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

/** The voices this browser has, English ones first. They can arrive after the page loads. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [list, setList] = useState(allVoices);
  useEffect(() => {
    if (!speechSupported()) return;
    const update = () => setList(allVoices());
    update();
    window.speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, []);
  return [...list].sort((a, b) => Number(b.lang.startsWith('en')) - Number(a.lang.startsWith('en')) || a.name.localeCompare(b.name));
}

/** Says `text`, stopping anything already being said. Returns false when this browser cannot speak. */
export function speak(text: string, opts: { rate?: number; voice?: string | null; lang?: string; onEnd?: () => void } = {}): boolean {
  if (!speechSupported() || !text.trim()) return false;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const name = opts.voice ?? devicePrefs().voice;
    // A language asked for (a "Say it" sound in French, say) picks a voice for it over the chosen one.
    const want = opts.lang?.toLowerCase();
    const forLang = want ? (allVoices().find((v) => v.lang.toLowerCase() === want) ?? allVoices().find((v) => v.lang.toLowerCase().startsWith(want.slice(0, 2)))) : undefined;
    const chosen = name ? allVoices().find((v) => v.name === name) : undefined;
    const voice = want ? (chosen && chosen.lang.toLowerCase().startsWith(want.slice(0, 2)) ? chosen : forLang) : chosen;
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? opts.lang ?? document.documentElement.lang ?? 'en-GB';
    u.rate = opts.rate ?? 1;
    if (opts.onEnd) {
      u.onend = opts.onEnd;
      u.onerror = opts.onEnd;
    }
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* nothing to stop */
  }
}

const words = (t: string) => mathToWords(t).trim();
const list = (items: string[]) => items.map((t) => words(t)).join(', ');

/** What read aloud says for a question: its number, the prompt, then the answers with their letters. */
export function spokenQuestion(q: PublicQuestion, index?: number, total?: number): string {
  const parts: string[] = [];
  if (index !== undefined && total) parts.push(`Question ${index + 1} of ${total}.`);
  parts.push(/[.?!:]$/.test(q.prompt.trim()) ? words(q.prompt) : `${words(q.prompt)}.`);
  switch (q.type) {
    case 'mcq':
    case 'poll':
    case 'multi':
      if (q.type === 'multi') parts.push(q.selectCount ? `Pick ${q.selectCount}.` : 'Pick every correct answer.');
      q.choices.forEach((c, i) => parts.push(`${LETTERS[i] ?? i + 1}: ${c.text ? words(c.text) : (c.media?.alt ?? 'a picture')}.`));
      break;
    case 'truefalse':
      parts.push('True or false?');
      break;
    case 'numeric':
      parts.push(q.unit ? `Type a number, in ${q.unit}.` : 'Type a number.');
      break;
    case 'short':
      parts.push('Type your answer.');
      break;
    case 'order':
      parts.push(`Put these in order: ${list(q.items.map((i) => i.text))}.`);
      break;
    case 'match':
      parts.push(`Match ${list(q.left.map((l) => l.text))}, with ${list(q.right.map((r) => r.text))}.`);
      break;
    case 'blanks':
      {
        const sentence = q.pieces.map((p) => words(p)).join(' ___ ').replace(/\s*___\s*/g, ' blank ').replace(/\s+([.,?!])/g, '$1').trim();
        parts.push(/[.?!]$/.test(sentence) ? sentence : `${sentence}.`);
      }
      if (q.bank?.length) parts.push(`Words to use: ${list(q.bank)}.`);
      break;
    case 'sort':
      parts.push(`Sort ${list(q.items.map((i) => i.text))}, into ${list(q.groups.map((g) => g.label))}.`);
      break;
    case 'flashcard':
      break;
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
