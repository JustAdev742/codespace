#!/usr/bin/env node
/*
 * Class-size load test: one host, many players over real WebSockets, plus
 * the server's own practice bots, against a running Ludora server.
 *
 *   node scripts/load-test.mjs [--base http://localhost:8787] [--mode classic]
 *        [--players 40] [--bots 20] [--seconds 90] [--pid <server pid>] [--insecure]
 *
 * Players answer every question they are shown after a human-like delay
 * (0.8 to 5 seconds), from whatever the question type is. Reports answer
 * round trips, how long one update takes to reach every player, errors, and
 * the server's CPU and memory when --pid is given. It creates a teacher
 * account and a room on the target, so point it at a test server, not a
 * school's live one. --insecure accepts a self-signed certificate, for a
 * test server behind HTTPS on your own machine.
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { io } from 'socket.io-client';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((p) => p.trim().split(/\s+/))
    .map(([k, v]) => [k, v ?? 'true']),
);
const BASE = args.base ?? 'http://localhost:8787';
const MODE = args.mode ?? 'classic';
const PLAYERS = Number(args.players ?? 40);
const BOTS = Number(args.bots ?? 20);
const SECONDS = Number(args.seconds ?? 90);
const PID = args.pid ? Number(args.pid) : null;
const INSECURE = args.insecure === 'true';
if (INSECURE) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const H = { 'content-type': 'application/json', 'x-ludora-csrf': '1', origin: BASE };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : null);
const id = () => randomBytes(8).toString('hex');

async function http(path, body, cookie) {
  const res = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, body: await res.json().catch(() => null), cookie: setCookie.map((c) => c.split(';')[0]).join('; ') };
}

function connect(cookie) {
  return io(BASE, { path: '/socket.io', transports: ['websocket'], extraHeaders: { origin: BASE, ...(cookie ? { cookie } : {}) }, forceNew: true, reconnection: false, rejectUnauthorized: !INSECURE });
}

const emit = (s, ev, payload) =>
  new Promise((resolve) => {
    const t0 = performance.now();
    const timer = setTimeout(() => resolve({ ack: { ok: false, error: { code: 'timeout' } }, ms: 10_000 }), 10_000);
    s.emit(ev, payload, (ack) => {
      clearTimeout(timer);
      resolve({ ack, ms: performance.now() - t0 });
    });
  });

/** The question a player is being asked right now, wherever the mode puts it in the view. */
function findQuestion(v, depth = 0) {
  if (!v || typeof v !== 'object' || depth > 5) return null;
  if (typeof v.iid === 'string' && v.q && typeof v.q.type === 'string') return v;
  for (const k of Object.keys(v)) {
    const found = findQuestion(v[k], depth + 1);
    if (found) return found;
  }
  return null;
}

function answerFor(q) {
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
  switch (q.type) {
    case 'mcq':
      return { type: 'mcq', choiceId: pick(q.choices).id };
    case 'multi':
      return { type: 'multi', choiceIds: [pick(q.choices).id] };
    case 'truefalse':
      return { type: 'truefalse', value: Math.random() < 0.5 };
    case 'short':
      return { type: 'short', text: 'answer' };
    case 'numeric':
      return { type: 'numeric', value: Math.round(Math.random() * 100) };
    case 'order':
      return { type: 'order', itemIds: (q.items ?? []).map((i) => i.id) };
    case 'match':
      return { type: 'match', pairs: Object.fromEntries((q.left ?? []).map((l, i) => [l.id, (q.right ?? [])[i]?.id ?? l.id])) };
    case 'flashcard':
      return { type: 'flashcard', knew: true };
    default:
      return null;
  }
}

function cpuTicks(pid) {
  const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
  return Number(f[11]) + Number(f[12]);
}
const rssMb = (pid) => Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))[1]) / 1024;

async function main() {
  const teacher = await http('/api/auth/register', { username: `load${id().slice(0, 8)}`, password: 'correct horse battery staple', accountType: 'teacher' });
  if (teacher.status !== 200) throw new Error(`register failed: ${teacher.status} ${JSON.stringify(teacher.body)}`);
  const sets = await http('/api/sets', null, teacher.cookie);
  const room = await http('/api/rooms', { setId: sets.body.sets[0].id, modeId: MODE, common: { timeLimitSec: SECONDS + 60 }, options: { maxPlayers: Math.min(200, PLAYERS + BOTS + 5) } }, teacher.cookie);
  if (room.status !== 200) throw new Error(`room failed: ${room.status} ${JSON.stringify(room.body)}`);
  const code = room.body.code;
  console.log(`room ${code}: ${MODE}, ${PLAYERS} players + ${BOTS} bots, ${SECONDS}s`);

  const host = connect(teacher.cookie);
  await emit(host, 'room:join', { code });

  const stats = { answers: [], errors: {}, views: 0, fanout: [] };
  const firstSeen = new Map(); // view version -> [first arrival time, arrivals]
  const players = [];
  for (let i = 0; i < PLAYERS; i++) {
    const s = connect();
    const p = { s, lastIid: null, busy: false };
    s.on('room:view', (v) => {
      stats.views++;
      const now = performance.now();
      const f = firstSeen.get(v.version) ?? [now, 0];
      f[1]++;
      firstSeen.set(v.version, f);
      if (f[1] === PLAYERS) stats.fanout.push(now - f[0]);
      const q = findQuestion(v.state ?? v);
      if (!q || q.iid === p.lastIid || p.busy) return;
      p.lastIid = q.iid;
      p.busy = true;
      setTimeout(async () => {
        const answer = answerFor(q.q);
        if (answer) {
          const { ack, ms } = await emit(s, 'room:action', { actionId: id(), action: { type: 'answer', iid: q.iid, answer } });
          if (ack?.ok) stats.answers.push(ms);
          else {
            const key = `${ack?.error?.code ?? 'unknown'}: ${ack?.error?.message ?? ''}`;
            stats.errors[key] = (stats.errors[key] ?? 0) + 1;
          }
        }
        p.busy = false;
      }, 800 + Math.random() * 4200);
    });
    const { ack } = await emit(s, 'room:join', { code, name: `Player ${i + 1}` });
    if (!ack?.ok) stats.errors[`join:${ack?.error?.code}`] = (stats.errors[`join:${ack?.error?.code}`] ?? 0) + 1;
    players.push(p);
  }
  for (let added = 0; added < BOTS; added += 3) await emit(host, 'room:host', { cmd: 'addBots', count: Math.min(3, BOTS - added) });
  const start = await emit(host, 'room:host', { cmd: 'start' });
  if (!start.ack?.ok) throw new Error(`start failed: ${JSON.stringify(start.ack)}`);

  const samples = [];
  let lastTicks = PID ? cpuTicks(PID) : 0;
  const t0 = Date.now();
  while (Date.now() - t0 < SECONDS * 1000) {
    await sleep(1000);
    // Host-paced modes wait for the host between questions; press next as a teacher would,
    // every 7 seconds (self-paced modes refuse it, harmlessly).
    if (Math.round((Date.now() - t0) / 1000) % 7 === 0) await emit(host, 'room:host', { cmd: 'next' });
    if (PID) {
      const ticks = cpuTicks(PID);
      samples.push({ cpu: (ticks - lastTicks) /* clock ticks per second at 100 Hz = percent */, rss: rssMb(PID) });
      lastTicks = ticks;
    }
  }
  await emit(host, 'room:host', { cmd: 'end' });
  await sleep(1500);
  for (const p of players) p.s.disconnect();
  host.disconnect();

  const r = (x) => (x === null ? 'n/a' : `${Math.round(x)} ms`);
  console.log(`answers accepted: ${stats.answers.length}; round trip p50 ${r(pct(stats.answers, 50))}, p95 ${r(pct(stats.answers, 95))}, p99 ${r(pct(stats.answers, 99))}, max ${r(pct(stats.answers, 100))}`);
  console.log(`views received: ${stats.views}; one update reaching all ${PLAYERS} players: p50 ${r(pct(stats.fanout, 50))}, p95 ${r(pct(stats.fanout, 95))}, max ${r(pct(stats.fanout, 100))}`);
  console.log(`errors: ${JSON.stringify(stats.errors)}`);
  if (samples.length) {
    const cpus = samples.map((s) => s.cpu);
    console.log(`server CPU (one core = 100%): mean ${Math.round(cpus.reduce((a, b) => a + b, 0) / cpus.length)}%, p95 ${pct(cpus, 95)}%, max ${Math.max(...cpus)}%; memory ${Math.round(samples[0].rss)} -> ${Math.round(samples.at(-1).rss)} MB`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
