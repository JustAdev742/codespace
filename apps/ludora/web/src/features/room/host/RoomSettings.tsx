import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { HostCommand, RoomOptions, RoomView } from '@ludora/shared';
import type { RoomHandle } from '../../../lib/useRoom.ts';
import { Button } from '../../../ui/Button.tsx';
import { Dialog, Field, Input, Select, Switch } from '../../../ui/primitives.tsx';

/*
 * The room's switches, behind one button so the lobby and the host's bar stay calm. Each change
 * goes to the server at once, which decides whether it applies; during a game only the live
 * switches (quiet room, reactions, names, who can join, the exit ticket) can change.
 */

/** Modes that keep points the catch-up rule and double points can work with. */
export const POINTS_MODES = new Set(['classic', 'confidence']);

export function RoomSettings({ room, handle, open, onOpenChange }: { room: RoomView; handle: RoomHandle; open: boolean; onOpenChange: (v: boolean) => void }) {
  const o = room.room.options;
  const lobby = room.room.status === 'lobby' || room.room.status === 'ended';
  const send = async (cmd: HostCommand) => {
    const ack = await handle.host(cmd);
    if (!ack.ok) toast.error(ack.error.message);
  };
  const set = (patch: Partial<RoomOptions>) => void send({ cmd: 'configure', options: patch });
  const [pin, setPin] = useState(room.room.pinned ?? '');
  useEffect(() => {
    if (open) setPin(room.room.pinned ?? '');
  }, [open, room.room.pinned]);
  const [auto, setAuto] = useState(String(o.autoStartAt || ''));
  const points = POINTS_MODES.has(room.room.modeId);
  const teams = room.room.teams.length > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Room settings" description={lobby ? 'Changes apply straight away.' : 'During a game, these change straight away. The rest wait until the game ends.'} size="lg">
      <div className="flex flex-col gap-5">
        {lobby ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send({ cmd: 'pin', text: pin.trim() || null });
            }}
          >
            <Field label="Message on every screen" hint="Shown in the lobby, such as “First names only”. Up to 120 characters; it goes through the name filter.">
              {(p) => <Input {...p} value={pin} maxLength={120} onChange={(e) => setPin(e.target.value)} placeholder="First names only" />}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" variant="secondary">
                {room.room.pinned ? 'Update message' : 'Pin message'}
              </Button>
              {room.room.pinned ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => void send({ cmd: 'pin', text: null })}>
                  Take it down
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}

        <section aria-labelledby="rs-room" className="flex flex-col">
          <h3 id="rs-room" className="mb-1 font-display text-xl font-bold">
            In the room
          </h3>
          <Switch checked={o.quiet} onCheckedChange={(v) => set({ quiet: v })} label="Quiet room" description="Every device in the room stays silent, the big screen too." />
          <Switch checked={o.reactions} onCheckedChange={(v) => set({ reactions: v })} label="Reactions" description="Players can send emoji reactions and make their Glim hop in the lobby." />
          <Switch checked={o.hideNames} onCheckedChange={(v) => set({ hideNames: v })} label="Hide names on the big screen" description="The big screen shows “Player 1”, “Player 2”. Each player still sees their own name and place." />
          <Switch checked={o.exitTicket} onCheckedChange={(v) => set({ exitTicket: v })} label="Exit ticket" description="At the end, players tap how the game felt. You see the counts, never who chose what." />
        </section>

        <section aria-labelledby="rs-join" className="flex flex-col">
          <h3 id="rs-join" className="mb-1 font-display text-xl font-bold">
            Joining
          </h3>
          <Switch checked={o.admit} onCheckedChange={(v) => set({ admit: v })} label="Waiting room" description="You let each new player in before they appear in the room." />
          <Switch checked={o.lateJoin} onCheckedChange={(v) => set({ lateJoin: v })} label="Allow late joining" description="Players can join after the game has started." />
          {points ? (
            <Switch checked={o.catchUp} onCheckedChange={(v) => set({ catchUp: v })} label="Catch-up for late joiners" description="Someone who joins after the start begins level with the lowest score in the game." disabled={!lobby} />
          ) : null}
        </section>

        {lobby ? (
          <section aria-labelledby="rs-start" className="flex flex-col gap-3">
            <h3 id="rs-start" className="font-display text-xl font-bold">
              Starting
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Countdown before the start" hint="“Starting in” on every screen, so stragglers see it coming. You can cancel it.">
                {(p) => (
                  <Select {...p} value={String(o.startCountdownSec)} onChange={(e) => set({ startCountdownSec: Number(e.target.value) })}>
                    <option value="0">No countdown</option>
                    {[3, 5, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} seconds
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  set({ autoStartAt: Math.max(0, Math.min(200, Math.floor(Number(auto) || 0))) });
                }}
              >
                <Field label="Start by itself at" hint={o.autoStartAt ? `Starts when ${o.autoStartAt} players are in. Empty or 0 turns it off.` : 'A number of players. Empty or 0 is off.'}>
                  {(p) => (
                    <div className="flex gap-2">
                      <Input {...p} type="number" min={0} max={200} inputMode="numeric" value={auto} onChange={(e) => setAuto(e.target.value)} className="w-24" placeholder="Off" />
                      <Button type="submit" size="md">
                        Set
                      </Button>
                    </div>
                  )}
                </Field>
              </form>
            </div>
            {teams ? <Switch checked={o.teamPick} onCheckedChange={(v) => set({ teamPick: v })} label="Players pick their team" description="Each player chooses a team on their own device. You can still move them." /> : null}
            {points ? (
              <Switch checked={room.room.common.doubleFinal} onCheckedChange={(v) => void send({ cmd: 'configure', common: { doubleFinal: v } })} label="Double points on the final question" description="Players are told before the last question starts." />
            ) : null}
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
