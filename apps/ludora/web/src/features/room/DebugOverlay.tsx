import { useState } from 'react';
import { Bug } from 'lucide-react';
import type { RoomHandle } from '../../lib/useRoom.ts';
import { useNow } from '../../lib/useNow.ts';

/**
 * Connection and state readout for staff testing a room. Shown only when
 * the debug.overlay feature flag is on for the viewer (testers and
 * administrators by default); it reads what this browser already has and
 * asks the server for nothing extra.
 */
export function DebugOverlay({ handle }: { handle: RoomHandle }) {
  const [open, setOpen] = useState(false);
  const now = useNow(500, open);
  const v = handle.view;
  if (!v) return null;
  const rows: [string, string][] = [
    ['Room', `${v.room.code} (${v.room.status}${v.paused ? ', paused' : ''})`],
    ['Mode', v.room.variantId ?? v.room.modeId],
    ['Role', `${v.me.role}${v.me.playerId ? ` ${v.me.playerId}` : ''}`],
    ['View version', String(v.version)],
    ['Views received', String(handle.debug.views)],
    ['Last view', `${Math.max(0, now - handle.receivedAt)} ms ago`],
    ['Clock offset', `${v.serverNow - handle.receivedAt} ms`],
    ['Game clock', `${Math.round(handle.gameNow())} ms`],
    ['Transport', `${handle.debug.transport}${handle.online ? '' : ' (offline)'}`],
    ['Reconnects', String(handle.debug.reconnects)],
    ['Last action round trip', handle.debug.lastAckMs === null ? '-' : `${handle.debug.lastAckMs} ms`],
    ['Players', `${v.players.length} (${v.players.filter((p) => p.connected).length} connected)`],
  ];
  return (
    <div className="fixed bottom-20 left-3 z-40 lg:bottom-3">
      {open ? (
        <div className="w-72 rounded-[14px] border border-line-strong bg-sunken/95 p-3 font-mono text-[11px] text-text shadow-xl backdrop-blur" role="region" aria-label="Debug overlay">
          <div className="mb-2 flex items-center justify-between font-sans text-xs font-semibold">
            <span>Debug</span>
            <button type="button" className="text-text-3 hover:text-text" onClick={() => setOpen(false)}>
              Hide
            </button>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {rows.map(([k, val]) => (
              <div key={k} className="contents">
                <dt className="text-text-3">{k}</dt>
                <dd className="truncate text-right">{val}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-full border border-line-strong bg-sunken/90 text-text-2 hover:text-text" aria-label="Show debug overlay" title="Debug overlay">
          <Bug className="size-4" />
        </button>
      )}
    </div>
  );
}
