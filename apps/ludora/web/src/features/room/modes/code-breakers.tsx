import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BellRing, Cpu, Eye, EyeOff, KeyRound, Landmark, Lock, RotateCcw, Shield, ShieldCheck, Trophy, Zap, type LucideIcon } from 'lucide-react';
import type { Answer } from '@ludora/shared';
import {
  EVENT_INFO,
  KIND_INFO,
  SHOP,
  type CodeBreakersHostView,
  type CodeBreakersPlayerView,
  type HackNewsView,
  type HackResultView,
  type IncidentView,
  type NewsView,
  type PacketKind,
  type ShopItem,
  type TargetRow,
  type YouView,
} from '@ludora/engine/code-breakers';
import type { ModeScreenProps } from './registry.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores } from '../game/Leaderboard.tsx';
import { Explanation, ModeTitle } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { Pill, StagePanel, fallbackArt } from '../game/stage.tsx';
import { Dialog } from '../../../ui/primitives.tsx';
import { Button } from '../../../ui/Button.tsx';
import { formatNumber } from '../../../lib/format.ts';
import { playSfx, useSfx, useSharedSounds } from '../../../lib/sound/react.tsx';
import { Stage3D, lookFor } from '../../../three/index.ts';
import { CitySkylineScene, CodeBreakersScene, PACKET_FLIGHT_MS, type CityPacket, type CityState, type CityTower, type PacketOutcome } from './code-breakers-scene.ts';

/*
 * Code Breakers screens. The 3D city is the picture; the game is played on
 * the terminal beside it, all ordinary buttons: pick a passphrase, open a
 * packet, choose a rival and pick which of four options is their password,
 * buy defences. With 3D off a row of bars stands in for the city.
 */

/* --------------------------------- helpers -------------------------------- */

const bits = (n: number) => `${formatNumber(n)} bits`;
const pct = (p: number) => (p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`);

const KIND_ICON: Record<PacketKind, LucideIcon> = { bits: Cpu, boost: Zap, hack: KeyRound, defence: Shield };
const KIND_TEXT: Record<PacketKind, string> = { bits: 'text-sky', boost: 'text-lantern', hack: 'text-ember', defence: 'text-glim' };

/** A steady colour per player for their tower's roof. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function resultTone(r: HackResultView): 'good' | 'bad' | 'info' {
  return r.outcome === 'stolen' ? 'good' : r.outcome === 'wrong' || r.outcome === 'firewall' || r.outcome === 'twoFactor' ? 'bad' : 'info';
}

function resultSound(r: HackResultView) {
  if (r.outcome === 'stolen') return 'steal' as const;
  if (r.outcome === 'firewall' || r.outcome === 'twoFactor') return 'shield' as const;
  if (r.outcome === 'wrong') return 'wrong' as const;
  return 'tap' as const;
}

const OUTCOME: Partial<Record<HackResultView['outcome'], PacketOutcome>> = { stolen: 'stolen', firewall: 'firewall', twoFactor: 'twoFactor', wrong: 'wrong' };
const INCIDENT: Record<IncidentView['kind'], PacketOutcome> = { hacked: 'stolen', firewall: 'firewall', twoFactor: 'twoFactor', intrusion: 'wrong' };

/** Hold a hack's result back until its packet lands in the 3D city, so the words never get ahead of the picture. */
function useResultFlow(result: HackResultView | null, withPicture: boolean) {
  const [shown, setShown] = useState<HackResultView | null>(null);
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!result || result.seq === seen.current) return;
    const first = seen.current === null;
    seen.current = result.seq;
    if (first) {
      setShown(result);
      return;
    }
    const flies = withPicture && OUTCOME[result.outcome] !== undefined;
    const t = setTimeout(() => {
      setShown(result);
      playSfx(resultSound(result));
    }, flies ? PACKET_FLIGHT_MS : 0);
    return () => clearTimeout(t);
  }, [result, withPicture]);
  return shown;
}

/* ---------------------------------- parts --------------------------------- */

function Stat({ label, value, icon: Icon, tone = 'calm' }: { label: string; value: ReactNode; icon: LucideIcon; tone?: 'calm' | 'gold' | 'safe' }) {
  const colours = tone === 'gold' ? 'bg-lantern text-on-accent' : tone === 'safe' ? 'bg-glim text-on-accent' : 'bg-black/45 text-white';
  return (
    <div className={`flex min-w-0 items-center gap-1.5 rounded-[var(--radius-m)] px-2.5 py-1.5 backdrop-blur-sm ${colours}`}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{label}:</span>
      <span className="truncate font-display text-lg leading-none font-extrabold tabular">{value}</span>
    </div>
  );
}

/** The skyline as bars, for when there is no 3D. */
function SkylineBars({ towers, me }: { towers: CityTower[]; me?: string }) {
  const top = towers.slice(0, 12);
  const max = Math.max(1, ...top.map((t) => t.bits));
  return (
    <div className="flex h-full items-end gap-1.5 rounded-[var(--radius-l)] bg-[linear-gradient(180deg,#050824,#1a2563)] p-3" role="img" aria-label={`The city: ${top.map((t) => `${t.name} ${bits(t.bits)}`).join(', ')}.`}>
      {top.map((t) => (
        <div key={t.playerId} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex gap-0.5 text-glim">
            {t.firewall ? <Shield className="size-3" aria-hidden /> : null}
            {t.twoFactor ? <Lock className="size-3" aria-hidden /> : null}
          </div>
          <div className={`w-full rounded-t-[4px] ${t.playerId === me ? 'ring-2 ring-lantern' : ''}`} style={{ height: `${Math.max(6, (t.bits / max) * 100)}%`, minHeight: 8, background: `hsl(${t.hue} 70% 55%)` }} />
          <span className="w-full truncate text-center text-[10px] font-bold text-white/80">{t.name}</span>
        </div>
      ))}
    </div>
  );
}

function Defences({ d }: { d: YouView['defences'] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm font-bold">
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${d.firewall ? 'bg-glim/20 text-glim' : 'bg-white/[0.08] text-text-2'}`}>
        <Shield className="size-4" aria-hidden /> Firewall {d.firewall}/{d.firewallMax}
      </span>
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${d.twoFactor ? 'bg-glim/20 text-glim' : 'bg-white/[0.08] text-text-2'}`}>
        <Lock className="size-4" aria-hidden /> 2FA {d.twoFactor ? 'on' : 'off'}
      </span>
      {d.backup ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-glim/20 px-2.5 py-1 text-glim">
          <RotateCcw className="size-4" aria-hidden /> Backup
        </span>
      ) : null}
      {d.exposed ? <span className="rounded-full bg-ember/20 px-2.5 py-1 text-ember">{d.exposed === 1 ? '1 rival knows your password' : `${d.exposed} rivals know your password`}</span> : null}
    </span>
  );
}

function OddsDialog({ open, onOpenChange, you, event }: { open: boolean; onOpenChange: (v: boolean) => void; you: YouView; event: CodeBreakersPlayerView['event'] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="What's in a packet?" description="Each of the three packets is drawn on its own: first its kind, then what is inside. Your level, boosts and any event are worked in.">
      <div className="flex flex-col gap-3">
        {you.odds.map((g) => {
          const Icon = KIND_ICON[g.kind];
          return (
            <section key={g.kind}>
              <h3 className="mb-1 flex items-center gap-2 font-bold">
                <Icon className={`size-5 ${KIND_TEXT[g.kind]}`} aria-hidden /> {KIND_INFO[g.kind].label} <span className="font-display tabular">{pct(g.percent)}</span>
              </h3>
              <table className="w-full text-left text-sm">
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-1">{r.label}</td>
                      <td className="py-1 text-right font-display font-bold tabular">{pct(r.percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
      {event ? <p className="mt-3 text-sm text-text-2">{`${EVENT_INFO[event.id].label} is on: ${EVENT_INFO[event.id].blurb}`}</p> : null}
    </Dialog>
  );
}

function ShopDialog({ open, onOpenChange, you, onBuy, busy }: { open: boolean; onOpenChange: (v: boolean) => void; you: YouView; onBuy: (item: ShopItem) => void; busy: boolean }) {
  const ICON: Record<ShopItem, LucideIcon> = { firewall: Shield, twoFactor: Lock, password: KeyRound };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Defences" description={`Paid for with bits, so each one lowers your score. You have ${bits(you.bits)}.`}>
      <ul className="flex flex-col gap-2">
        {you.shop.map((row) => {
          const Icon = ICON[row.item];
          return (
            <li key={row.item} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-white/[0.06] p-3">
              <Icon className="size-6 shrink-0 text-glim" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{SHOP[row.item].label}</p>
                <p className="text-sm text-text-2">{row.reason ?? SHOP[row.item].blurb}</p>
              </div>
              <Button size="sm" disabled={!row.can || busy} onClick={() => onBuy(row.item)} aria-label={`Buy ${SHOP[row.item].label} for ${row.cost} bits`}>
                {formatNumber(row.cost)}
              </Button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/** Your own passphrase, hidden until you ask, so a neighbour cannot read it off your screen. */
function PasswordChip({ password }: { password: string }) {
  const [show, setShow] = useState(false);
  return (
    <button type="button" onClick={() => setShow((s) => !s)} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-white/[0.08] px-3 font-bold" aria-pressed={show}>
      {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      <span className="font-mono">{show ? password : 'Your password: hidden'}</span>
    </button>
  );
}

function TargetButton({ t, onPick, busy, gameNow }: { t: TargetRow; onPick: () => void; busy: boolean; gameNow: () => number }) {
  const blocked = t.blocked !== null;
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={blocked || busy}
        className="flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-m)] bg-white/[0.07] px-3 py-2 text-left hover:bg-white/[0.12] disabled:opacity-50"
        aria-label={`${t.name}, ${bits(t.bits)}${t.firewall ? `, firewall ${t.firewall}` : ''}${t.twoFactor ? ', 2FA on' : ''}${t.cracked ? ', you know their password' : t.crossed ? `, ${t.crossed} options crossed off` : ''}${blocked ? (t.blocked === 'setup' ? ', still picking a passphrase' : ', tried recently') : ''}`}
      >
        {t.vault ? <Landmark className="size-5 shrink-0 text-lantern" aria-hidden /> : <span className="size-3 shrink-0 rounded-full" style={{ background: `hsl(${hueOf(t.playerId)} 70% 55%)` }} aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{t.name}</span>
          <span className="block text-xs text-text-2">
            {t.cracked ? 'You know their password' : t.crossed ? `${t.crossed} crossed off` : 'Nothing known yet'}
            {t.blocked === 'recent' && t.until ? (
              <>
                {' '}
                · again in <Countdown until={t.until} gameNow={gameNow} />
              </>
            ) : t.blocked === 'setup' ? ' · picking a passphrase' : ''}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-glim">
          {t.firewall ? <Shield className="size-4" aria-label={`Firewall ${t.firewall}`} /> : null}
          {t.twoFactor ? <Lock className="size-4" aria-label="2FA" /> : null}
        </span>
        <span className="shrink-0 font-display text-lg font-bold tabular">{formatNumber(t.bits)}</span>
      </button>
    </li>
  );
}

/** The terminal: whatever step you are on. */
function Terminal({ you, busy, send, gameNow, onOdds }: { you: YouView; busy: boolean; send: (a: unknown) => Promise<boolean>; gameNow: () => number; onOdds: () => void }) {
  if (you.choosing) {
    return (
      <StagePanel className="flex flex-col gap-3 p-4" label="Pick your passphrase">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xl font-extrabold">Pick your passphrase</h3>
          <Pill>
            <Countdown until={you.choosing.deadline} gameNow={gameNow} />
          </Pill>
        </div>
        <p className="text-sm text-text-2">Rivals will try to guess it. The other two become decoys that look just like it.</p>
        <div className="grid gap-2">
          {you.choosing.options.map((o, i) => (
            <Button
              key={o}
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => {
                playSfx('select');
                void send({ type: 'choosePassword', index: i });
              }}
            >
              <span className="font-mono">{o}</span>
            </Button>
          ))}
        </div>
      </StagePanel>
    );
  }
  const h = you.hack;
  if (h?.stage === 'target') {
    return (
      <StagePanel className="flex flex-col gap-3 p-4" label="Choose who to hack">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xl font-extrabold">{h.source === 'back' ? 'Hack back' : h.source === 'hint' ? 'Hint: pick a rival' : 'Who will you hack?'}</h3>
          <Pill tone="ember">
            <Countdown until={h.deadline} gameNow={gameNow} />
          </Pill>
        </div>
        <p className="text-sm text-text-2">{h.source === 'hint' ? 'A hint crosses off one wrong option before you guess.' : 'Firewalls stop a right guess once. 2FA asks you one more question.'}</p>
        <ul className="flex max-h-[42vh] flex-col gap-1.5 overflow-y-auto">
          {h.targets.map((t) => (
            <TargetButton
              key={t.playerId}
              t={t}
              busy={busy}
              gameNow={gameNow}
              onPick={() => {
                playSfx('select');
                void send({ type: 'target', playerId: t.playerId });
              }}
            />
          ))}
        </ul>
        {h.total > h.targets.length ? <p className="text-xs text-text-3">Showing the richest {h.targets.length} of {h.total}.</p> : null}
      </StagePanel>
    );
  }
  if (h?.stage === 'guess') {
    return (
      <StagePanel className="flex flex-col gap-3 p-4" label={`Guess ${h.target.name}'s password`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xl font-extrabold">Which is {h.target.name}'s password?</h3>
          <Pill tone="ember">
            <Countdown until={h.deadline} gameNow={gameNow} />
          </Pill>
        </div>
        {h.auto ? <p className="text-sm text-text-2">Time ran out, so the richest rival you can hack was picked for you.</p> : null}
        <div className="grid gap-2">
          {h.options.map((o, i) => (
            <Button
              key={o.text}
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => {
                playSfx('lockIn');
                void send({ type: 'guess', seq: h.seq, index: i });
              }}
            >
              <span className="font-mono">{o.text}</span>
            </Button>
          ))}
        </div>
        {h.crossed.length ? (
          <p className="text-sm text-text-3">
            Crossed off:{' '}
            {h.crossed.map((c, i) => (
              <span key={c}>
                {i ? ', ' : ''}
                <s className="font-mono">{c}</s>
              </span>
            ))}
          </p>
        ) : null}
      </StagePanel>
    );
  }
  if (h?.stage === 'verify') {
    return (
      <StagePanel className="flex items-center gap-3 border-dusk/60 p-4" label="2FA">
        <Lock className="size-7 shrink-0 text-dusk" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-bold">Right guess! {h.target.name} has 2FA.</p>
          <p className="text-sm text-text-2">Answer the question right to finish the hack.</p>
        </div>
        <Pill tone="dusk">
          <Countdown until={h.deadline} gameNow={gameNow} />
        </Pill>
      </StagePanel>
    );
  }
  if (you.offer) {
    const offer = you.offer;
    return (
      <StagePanel className="flex flex-col gap-3 p-4" label="Pick a packet">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xl font-extrabold">Pick a packet</h3>
          <button type="button" onClick={onOdds} className="min-h-9 rounded-full px-3 text-sm font-bold text-lantern underline-offset-2 hover:underline">
            What's inside?
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {offer.packets.map((p, i) => {
            const Icon = KIND_ICON[p.kind];
            return (
              <button
                key={i}
                type="button"
                disabled={busy}
                onClick={() => {
                  playSfx(p.kind === 'hack' ? 'powerUp' : 'select');
                  void send({ type: 'pick', offer: offer.seq, index: i });
                }}
                className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-[var(--radius-m)] border-2 border-white/15 bg-white/[0.06] p-2 hover:border-white/40 hover:bg-white/[0.1] disabled:opacity-50"
                aria-label={`${KIND_INFO[p.kind].label} packet: ${KIND_INFO[p.kind].blurb}`}
              >
                <Icon className={`size-9 ${KIND_TEXT[p.kind]}`} aria-hidden />
                <span className="font-display text-lg font-extrabold">{KIND_INFO[p.kind].label}</span>
              </button>
            );
          })}
        </div>
      </StagePanel>
    );
  }
  return null;
}

/* --------------------------------- player --------------------------------- */

export function CodeBreakersPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<CodeBreakersPlayerView>) {
  const you = view.you ?? null;
  const myId = room.me.playerId ?? '';
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [threeD, setThreeD] = useState(true);
  const scene = useRef<CodeBreakersScene | null>(null);
  const me = room.players.find((p) => p.id === myId);
  const look = useMemo(() => lookFor(me?.avatar, fallbackArt(myId || 'me')), [me?.avatar, myId]);
  const shown = useResultFlow(you?.result ?? null, threeD);
  const shared = useSharedSounds();

  const eventKey = view.event ? `${view.event.id}|${view.event.endsAt}` : null;
  useAnnounce(view.event ? `${EVENT_INFO[view.event.id].label}. ${EVENT_INFO[view.event.id].blurb}` : null, eventKey);
  useSfx('event', eventKey, shared && view.event !== null);
  useAnnounce(shown ? `${shown.title}${shown.detail ? ` ${shown.detail}` : ''}` : null, shown?.seq);
  const incident = you?.incidents[0];
  useAnnounce(incident?.text ?? null, incident?.id);
  useSfx(incident?.kind === 'hacked' ? 'stolen' : incident?.kind === 'intrusion' ? 'coin' : 'shield', incident?.id ?? null, Boolean(incident));
  const opened = you?.opened;
  useAnnounce(opened ? `${opened.title}${opened.detail ? ` ${opened.detail}` : ''}` : null, opened?.seq);
  useSfx(opened?.kind === 'bits' ? 'coin' : opened?.kind === 'defence' ? 'upgrade' : 'powerUp', opened?.seq ?? null, Boolean(opened));

  // Towers for everyone this screen has heard of: the board, the target list and whoever hacked you.
  const known = useRef(new Map<string, CityTower>());
  const towers = useMemo(() => {
    const map = known.current;
    const put = (t: Omit<CityTower, 'hue'>) => map.set(t.playerId, { ...map.get(t.playerId), ...t, hue: hueOf(t.playerId) });
    for (const r of view.board) put({ playerId: r.playerId, name: r.name, bits: r.bits, firewall: r.firewall, twoFactor: r.twoFactor, me: r.playerId === myId });
    if (you?.hack?.stage === 'target') for (const t of you.hack.targets) if (!t.vault) put({ playerId: t.playerId, name: t.name, bits: t.bits, firewall: t.firewall, twoFactor: t.twoFactor });
    for (const i of you?.incidents ?? []) if (!map.has(i.by)) put({ playerId: i.by, name: i.name, bits: 0, firewall: 0, twoFactor: false });
    if (you) put({ playerId: myId, name: me?.name ?? 'You', bits: you.bits, firewall: you.defences.firewall, twoFactor: you.defences.twoFactor, me: true });
    return [...map.values()].sort((a, b) => b.bits - a.bits);
  }, [view.board, you, myId, me?.name]);

  const packets = useMemo(() => {
    const out: CityPacket[] = [];
    const r = you?.result;
    const outcome = r ? OUTCOME[r.outcome] : undefined;
    if (r && r.target && outcome) out.push({ id: `r${r.seq}`, from: myId, to: r.target, outcome, bits: r.bits });
    for (const i of you?.incidents ?? []) out.push({ id: `i${i.id}`, from: i.by, to: myId, outcome: INCIDENT[i.kind], bits: i.bits });
    return out.sort((a, b) => (b.id > a.id ? 1 : -1));
  }, [you?.result, you?.incidents, myId]);

  const state = you
    ? { me: myId, hacking: Boolean(you.hack), towers, packets, vault: view.vault ? { bits: view.vault.bits, cracks: view.vault.cracks } : null, event: view.event?.id ?? null, bounty: view.bounty }
    : null;
  useEffect(() => {
    if (state) scene.current?.setState(state);
  });
  const onWorld = useCallback(
    (w: CodeBreakersScene | null) => {
      scene.current = w;
      setThreeD(Boolean(w));
      if (w && state) w.setState(state);
    },
    // The scene reads the newest state through the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!you) return <p className="font-semibold text-text-2">Watching the city.</p>;

  const send = async (a: unknown) => {
    setBusy(true);
    const ack = await act(a);
    setBusy(false);
    setNote(ack.ok ? null : ack.error.message);
    return ack.ok;
  };
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const canBuy = you.shop.some((s) => s.can);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section className="flex flex-col gap-2" aria-label="Your desk">
        <div className="relative">
          <Stage3D<CodeBreakersScene>
            label={`Your desk in the data city. You have ${bits(you.bits)}${you.rank ? `, rank ${you.rank}` : ''}.`}
            create={(env) => new CodeBreakersScene(env, look, view.heist)}
            onWorld={onWorld}
            className="h-[30vh] min-h-[200px] rounded-[var(--radius-l)] sm:h-[36vh] lg:h-[46vh]"
            fallback={<SkylineBars towers={towers} me={myId} />}
          />
          <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1.5">
            <Stat label="Bits" value={formatNumber(you.bits)} icon={Cpu} tone="gold" />
            {you.rank ? <Stat label="Rank" value={`#${you.rank}`} icon={Trophy} /> : null}
            <Stat label="Level" value={`Lv ${you.level}`} icon={Zap} />
            {you.boosts.double || you.boosts.surge ? <Stat label="Boosts" value={`${you.boosts.double ? `×2 ${you.boosts.double}` : ''}${you.boosts.double && you.boosts.surge ? ' ' : ''}${you.boosts.surge ? `+25% ${you.boosts.surge}` : ''}`} icon={Zap} tone="safe" /> : null}
          </div>
          {view.event ? (
            <div className="pointer-events-none absolute bottom-2 left-2">
              <Pill tone="lantern" className="px-3 py-1 text-sm">
                {EVENT_INFO[view.event.id].label} <Countdown until={view.event.endsAt} gameNow={gameNow} />
              </Pill>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Defences d={you.defences} />
          {you.password ? <PasswordChip password={you.password} /> : null}
          <button type="button" onClick={() => setShopOpen(true)} className="min-h-9 rounded-full px-3 text-sm font-bold text-lantern underline-offset-2 hover:underline">
            Defences{canBuy ? ' (you can buy)' : ''}
          </button>
        </div>
        {you.hackBack ? (
          <Button
            variant="danger"
            size="lg"
            disabled={busy || paused}
            onClick={() => {
              playSfx('powerUp');
              void send({ type: 'hackBack' });
            }}
          >
            <KeyRound className="size-5" aria-hidden /> Hack back {you.hackBack.name}
            <span className="ml-1 rounded-full bg-black/20 px-2 font-display tabular">
              <Countdown until={you.hackBack.until} gameNow={gameNow} />
            </span>
          </Button>
        ) : null}
        <Terminal you={you} busy={busy || paused} send={send} gameNow={gameNow} onOdds={() => setOddsOpen(true)} />
        {shown ? (
          <StagePanel className={`flex items-center gap-3 px-4 py-3 ${resultTone(shown) === 'good' ? 'border-glim/60' : resultTone(shown) === 'bad' ? 'border-ember/60' : ''}`}>
            <KeyRound className={`size-7 shrink-0 ${resultTone(shown) === 'good' ? 'text-glim' : resultTone(shown) === 'bad' ? 'text-ember' : 'text-lantern'}`} aria-hidden />
            <div>
              <p className="font-bold">{shown.title}</p>
              {shown.detail ? <p className="text-sm text-text-2">{shown.detail}</p> : null}
            </div>
          </StagePanel>
        ) : null}
        {opened && !you.hack ? (
          <p className="flex items-center gap-2 text-sm font-semibold">
            {(() => {
              const Icon = KIND_ICON[opened.kind];
              return <Icon className={`size-4 ${KIND_TEXT[opened.kind]}`} aria-hidden />;
            })()}
            {opened.title}
            {opened.detail ? <span className="font-normal text-text-2">{opened.detail}</span> : null}
          </p>
        ) : null}
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : null}
      </section>
      <section className="flex flex-col gap-3" aria-label="Questions">
        {you.incidents.length ? (
          <ul className="flex flex-col gap-1.5" aria-label="Alerts">
            {you.incidents.slice(0, 3).map((i) => (
              <li key={i.id} className={`flex items-center gap-2 rounded-[var(--radius-m)] px-3 py-2 text-sm font-bold ${i.kind === 'hacked' ? 'bg-ember/20 text-ember' : 'bg-glim/15 text-glim'}`}>
                <BellRing className="size-4 shrink-0" aria-hidden /> {i.text}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-sm font-semibold text-text-2">{you.question ? `Right answers open packets. Level ${you.level + 1} in ${you.toNext} more.` : you.hack?.stage === 'verify' ? 'Answer this to get past their 2FA.' : 'Finish on the terminal to get your next question.'}</p>
        {you.last && !you.last.correct && you.question ? (
          <div className="flex flex-col gap-2">
            <ResultBanner key={you.last.iid} correct={false} partial={you.last.partial} />
            <Explanation text={you.last.explanation} />
          </div>
        ) : you.last?.correct ? (
          <ResultBanner key={you.last.iid} correct />
        ) : null}
        {you.question ? (
          <>
            <QuestionCard q={you.question.q} />
            <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused} compact />
          </>
        ) : null}
        {you.notes.length ? (
          <div className="text-sm">
            <h3 className="mb-1 font-bold">What you know</h3>
            <ul className="flex flex-col gap-0.5 text-text-2">
              {you.notes.slice(0, 5).map((n) => (
                <li key={n.playerId}>
                  {n.name}: {n.cracked ? <span className="font-bold text-glim">password known</span> : `${n.crossed} crossed off`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <OddsDialog open={oddsOpen} onOpenChange={setOddsOpen} you={you} event={view.event} />
      <ShopDialog
        open={shopOpen}
        onOpenChange={setShopOpen}
        you={you}
        busy={busy}
        onBuy={(item) => {
          playSfx('upgrade');
          void send({ type: 'buy', item });
        }}
      />
    </div>
  );
}

/* ---------------------------------- host ---------------------------------- */

function newsLine(n: NewsView): string {
  switch (n.kind) {
    case 'bigHack':
      return `${n.name} cracked ${n.target ?? 'a rival'} for ${bits(n.bits)}!`;
    case 'vault':
      return `${n.name} cracked the vault: ${bits(n.bits)}!`;
    case 'bigBits':
      return `${n.name} opened ${bits(n.bits)}.`;
    case 'goal':
      return `${n.name} reached the goal!`;
    case 'event':
      return n.event ? `${EVENT_INFO[n.event].label}: ${EVENT_INFO[n.event].blurb}` : 'An event started.';
  }
}

const hackPacket = (h: HackNewsView): CityPacket => ({ id: `h${h.id}`, from: h.by, to: h.to, outcome: h.outcome, bits: h.bits });

export function CodeBreakersHost({ view, gameNow, room }: ModeScreenProps<CodeBreakersHostView>) {
  const scene = useRef<CitySkylineScene | null>(null);
  const state: CityState = useMemo(
    () => ({
      towers: view.towers.map((t) => ({ playerId: t.playerId, name: t.name, bits: t.bits, firewall: t.firewall, twoFactor: t.twoFactor, hue: hueOf(t.playerId) })),
      packets: view.hacks.map(hackPacket),
      vault: view.vault ? { bits: view.vault.bits, cracks: view.vault.cracks } : null,
      event: view.event?.id ?? null,
      bounty: view.bounty,
    }),
    [view.towers, view.hacks, view.vault, view.event, view.bounty],
  );
  useEffect(() => {
    scene.current?.setState(state);
  }, [state]);
  const eventKey = view.event ? `${view.event.id}|${view.event.endsAt}` : null;
  useSfx('event', eventKey, view.event !== null);
  const topHack = view.hacks[0];
  useSfx(topHack?.outcome === 'stolen' ? 'steal' : topHack?.outcome === 'wrong' ? 'wrong' : 'shield', topHack?.id ?? null, Boolean(topHack));
  const rows = view.board.map((r) => ({ playerId: r.playerId, name: r.name, score: r.bits, rank: r.rank, teamId: r.teamId }));

  return (
    <div className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          <ModeTitle>Code Breakers</ModeTitle>
          <p className="font-semibold text-text-2">Right answers open packets. Guess a rival's password to take some of their bits.</p>
        </div>
        <div className="flex items-center gap-2 text-[clamp(1.1rem,1.8vw,2rem)]">
          {view.goal ? <Pill tone="lantern" className="px-5 py-1.5">First to {formatNumber(view.goal)}</Pill> : null}
          <Pill className="px-5 py-1.5 text-[1.15em]">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        <div className="relative min-h-[50vh]">
          <Stage3D<CitySkylineScene>
            label={`The data city: ${view.players} towers${view.vault ? ' around the vault' : ''}.`}
            create={(env) => new CitySkylineScene(env)}
            onWorld={(w) => {
              scene.current = w;
              w?.setState(state);
            }}
            className="absolute inset-0 rounded-[var(--radius-l)]"
            fallback={<SkylineBars towers={state.towers} />}
          />
          <div className="absolute top-3 left-3 flex flex-col items-start gap-2">
            {view.event ? (
              <Pill tone="lantern" className="px-4 py-1.5 text-[clamp(1rem,1.6vw,1.6rem)]">
                {EVENT_INFO[view.event.id].label}: {EVENT_INFO[view.event.id].blurb} <Countdown until={view.event.endsAt} gameNow={gameNow} />
              </Pill>
            ) : null}
            {view.vault ? (
              <Pill className="px-4 py-1.5 text-[clamp(1rem,1.5vw,1.5rem)]">
                <Landmark className="size-[1em]" aria-hidden /> {view.vault.name}: {bits(view.vault.bits)}
              </Pill>
            ) : null}
          </div>
          {view.news.length ? (
            <ul className="absolute bottom-3 left-3 flex max-w-[min(32rem,70%)] flex-col gap-1.5" aria-label="City news">
              {view.news.slice(0, 3).map((n) => (
                <li key={n.id} className="rounded-[var(--radius-m)] bg-black/55 px-3 py-1.5 font-bold text-white backdrop-blur-sm">
                  {newsLine(n)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <StagePanel className="flex flex-col gap-3 p-3" as="aside" label="Most bits">
          <h3 className="font-display text-xl font-extrabold">Most bits</h3>
          {view.teams ? <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.average, members: t.members }))} /> : null}
          <Leaderboard rows={rows} players={room.players} teams={room.room.teams} big dense label={(r) => bits(r.score)} />
          <p className="flex items-center gap-1.5 text-sm font-semibold text-text-2">
            <ShieldCheck className="size-4 text-glim" aria-hidden />
            {formatNumber(view.totals.landed)} of {formatNumber(view.totals.attempts)} hacks cracked a password; {formatNumber(view.totals.blocked)} were stopped by a firewall or 2FA.
          </p>
        </StagePanel>
      </div>
    </div>
  );
}

