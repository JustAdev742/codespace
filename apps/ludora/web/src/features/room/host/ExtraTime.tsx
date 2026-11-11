import { toast } from 'sonner';
import type { RoomPlayerView, RoomView } from '@ludora/shared';
import type { RoomHandle } from '../../../lib/useRoom.ts';

/*
 * Extra time for chosen players: a quarter, half or double the time on timed questions, from the
 * next question. The server keeps their question open for them alone; no other player is told.
 */

export const EXTRA_SHARES = [
  { share: 0, label: 'No extra time', short: 'None' },
  { share: 0.25, label: 'A quarter more time', short: '+25%' },
  { share: 0.5, label: 'Half as much again', short: '+50%' },
  { share: 1, label: 'Double time', short: 'Double' },
] as const;

export type ExtraShare = (typeof EXTRA_SHARES)[number]['share'];

export function extraOf(room: RoomView, playerId: string): number {
  return room.host?.extraTime?.[playerId] ?? 0;
}

export async function setExtraTime(handle: RoomHandle, p: RoomPlayerView, share: ExtraShare) {
  const ack = await handle.host({ cmd: 'extraTime', playerId: p.id, share });
  if (!ack.ok) toast.error(ack.error.message);
  else toast.success(share ? `${p.name} has extra time from the next question. Only you can see this.` : `${p.name} is back to the usual time.`);
}

/** A compact picker for a row in the players list. */
export function ExtraTimeSelect({ room, handle, p }: { room: RoomView; handle: RoomHandle; p: RoomPlayerView }) {
  if (p.isBot) return null;
  // One clock shared by everyone: more time for one player would be more for all, so it is not offered.
  if (room.host?.extraTimeKind?.kind === 'none') return <span className="text-xs text-text-3">Extra time does not apply</span>;
  const value = extraOf(room, p.id);
  return (
    <select
        aria-label={`Extra time for ${p.name}`}
        value={String(value)}
        onChange={(e) => void setExtraTime(handle, p, Number(e.target.value) as ExtraShare)}
        className="h-11 cursor-pointer rounded-[var(--radius-m)] border border-line-strong bg-raised px-2 text-sm font-semibold text-text sm:h-9"
      >
        {EXTRA_SHARES.map((s) => (
          <option key={s.share} value={String(s.share)}>
            {s.share ? `Time ${s.short}` : 'Usual time'}
          </option>
        ))}
    </select>
  );
}
