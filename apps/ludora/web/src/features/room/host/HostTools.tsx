import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import { BellRing, Coffee, Expand, Keyboard, Minimize, MoreHorizontal, Settings2, Smartphone, Timer, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { HostCommand, RoomView } from '@ludora/shared';
import type { RoomHandle } from '../../../lib/useRoom.ts';
import { sound } from '../../../lib/sound/engine.ts';
import { useSoundState } from '../../../lib/sound/react.tsx';
import { IconButton } from '../../../ui/Button.tsx';
import { PlayersDialog, PreviewDialog, RemoteDialog, ShortcutsDialog, StillAnsweringDialog } from './panels.tsx';
import { RoomSettings } from './RoomSettings.tsx';
import { useFullscreen, useShortcuts, withKey, type Shortcut } from './tools.ts';

/*
 * Everything the host reaches beyond the game's main buttons: one menu in the header bar, the
 * panels it opens, and the keyboard shortcuts. Kept in one place so the bar and the lobby stay
 * calm: the main actions are buttons, the rest is one clear menu away.
 */

export type Panel = 'settings' | 'waiting' | 'players' | 'remote' | 'shortcuts' | 'preview' | null;

interface Tools {
  open: (p: Panel) => void;
  fullscreen: ReturnType<typeof useFullscreen>;
  shortcuts: Shortcut[];
}

const ToolsContext = createContext<Tools | null>(null);
export const useHostTools = () => useContext(ToolsContext);

const MENU_ITEM = 'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--radius-m)] px-3 text-sm font-semibold text-text-2 outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 data-[highlighted]:text-text';

async function send(handle: RoomHandle, cmd: HostCommand) {
  const ack = await handle.host(cmd);
  if (!ack.ok) toast.error(ack.error.message);
  return ack.ok;
}

/** The host's panels and shortcuts, around the room page. */
export function HostTools({ room, handle, enabled, children }: { room: RoomView; handle: RoomHandle; enabled: boolean; children: ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  const fullscreen = useFullscreen();
  const { muted } = useSoundState();
  const status = room.room.status;
  const live = status === 'running' || status === 'paused';
  const sync = (room.game as { sync?: { phase: string } } | null)?.sync;
  const shortcuts: Shortcut[] = [
    { key: 'n', label: 'N', does: 'Next (or skip ahead)', when: live && Boolean(sync), run: () => void send(handle, { cmd: 'next' }) },
    { key: 'p', label: 'P', does: 'Pause or resume', when: live, run: () => void send(handle, { cmd: status === 'paused' ? 'resume' : 'pause' }) },
    { key: '+', label: '+', does: 'Add 10 seconds to the question', when: live && room.room.pacing === 'host', run: () => void send(handle, { cmd: 'addTime', seconds: 10 }) },
    { key: 'w', label: 'W', does: 'Who is still answering', when: live, run: () => setPanel('waiting') },
    { key: 'l', label: 'L', does: 'Lock or unlock the room', when: !room.room.solo, run: () => void send(handle, { cmd: 'lock', locked: !room.room.locked }) },
    { key: 'f', label: 'F', does: 'Full screen', when: fullscreen.supported, run: fullscreen.toggle },
    { key: 'm', label: 'M', does: muted ? 'Sound on' : 'Mute sound', run: () => sound.setMuted(!muted) },
    { key: '?', label: '?', does: 'This list', run: () => setPanel('shortcuts') },
  ];
  useShortcuts(shortcuts, enabled);
  const tools = useMemo(() => ({ open: setPanel, fullscreen, shortcuts }), [fullscreen, shortcuts]);
  const close = (v: boolean) => (v ? null : setPanel(null));
  return (
    <ToolsContext.Provider value={tools}>
      {children}
      <RoomSettings room={room} handle={handle} open={panel === 'settings'} onOpenChange={close} />
      <StillAnsweringDialog room={room} handle={handle} open={panel === 'waiting'} onOpenChange={close} />
      <PlayersDialog room={room} handle={handle} open={panel === 'players'} onOpenChange={close} />
      <RemoteDialog code={room.room.code} open={panel === 'remote'} onOpenChange={close} />
      <ShortcutsDialog shortcuts={shortcuts} open={panel === 'shortcuts'} onOpenChange={close} />
      <PreviewDialog handle={handle} open={panel === 'preview'} onOpenChange={close} />
    </ToolsContext.Provider>
  );
}

/** The full-screen button for the big screen. */
export function FullscreenButton({ className = '' }: { className?: string }) {
  const tools = useHostTools();
  if (!tools?.fullscreen.supported) return null;
  const { on, toggle } = tools.fullscreen;
  return (
    <IconButton label={withKey(on ? 'Leave full screen' : 'Full screen', 'F')} aria-keyshortcuts="F" size="sm" className={className} onClick={toggle}>
      {on ? <Minimize className="size-4" aria-hidden /> : <Expand className="size-4" aria-hidden />}
    </IconButton>
  );
}

/** The one menu in the host's bar during a game. */
export function HostMenu({ room, handle, className = '' }: { room: RoomView; handle: RoomHandle; className?: string }) {
  const tools = useHostTools();
  if (!tools) return null;
  const waiting = room.host?.waiting ?? null;
  const away = room.players.filter((p) => !p.connected && !p.isBot).length;
  const canAddTime = Boolean(room.host?.canAddTime);
  const hostPaced = room.room.pacing === 'host';
  const onBreak = Boolean(room.room.breakEndsAt);
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <IconButton label={waiting?.length ? `Host menu, ${waiting.length} still answering` : 'Host menu'} size="sm" className={`relative ${className}`}>
          <MoreHorizontal className="size-5" aria-hidden />
          {waiting?.length ? (
            <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-lantern px-1 font-display text-xs font-bold text-on-accent tabular" aria-hidden>
              {waiting.length}
            </span>
          ) : null}
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 max-h-[80dvh] min-w-64 overflow-y-auto rounded-[var(--radius-l)] border border-line bg-raised p-1.5 shadow-[0_18px_40px_-12px_rgb(2_5_20/0.6)]">
          {hostPaced ? (
            <DropdownMenu.Item className={MENU_ITEM} disabled={!canAddTime} onSelect={() => void send(handle, { cmd: 'addTime', seconds: 10 })} aria-keyshortcuts="+">
              <Timer className="size-4" aria-hidden />
              <span className="flex-1">{canAddTime ? 'Add 10 seconds' : 'Add 10 seconds (while a question is open)'}</span>
              <kbd className="text-xs text-text-3">+</kbd>
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item className={MENU_ITEM} onSelect={() => tools.open('waiting')} aria-keyshortcuts="W">
            <BellRing className="size-4" aria-hidden />
            <span className="flex-1">{waiting === null ? 'Still answering' : `Still answering: ${waiting.length}`}</span>
            <kbd className="text-xs text-text-3">W</kbd>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={MENU_ITEM} onSelect={() => tools.open('players')}>
            <Users className="size-4" aria-hidden />
            <span className="flex-1">{away ? `Players (${away} reconnecting)` : 'Players'}</span>
          </DropdownMenu.Item>
          {!onBreak ? (
            <>
              <DropdownMenu.Item className={MENU_ITEM} onSelect={() => void send(handle, { cmd: 'break', seconds: 30 })}>
                <Coffee className="size-4" aria-hidden />
                Brain break, 30 seconds
              </DropdownMenu.Item>
              <DropdownMenu.Item className={MENU_ITEM} onSelect={() => void send(handle, { cmd: 'break', seconds: 60 })}>
                <Coffee className="size-4" aria-hidden />
                Brain break, 1 minute
              </DropdownMenu.Item>
            </>
          ) : null}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={MENU_ITEM} onSelect={() => tools.open('settings')}>
            <Settings2 className="size-4" aria-hidden />
            Room settings
          </DropdownMenu.Item>
          <DropdownMenu.Item className={MENU_ITEM} onSelect={() => tools.open('remote')}>
            <Smartphone className="size-4" aria-hidden />
            Use your phone as a remote
          </DropdownMenu.Item>
          <DropdownMenu.Item className={MENU_ITEM} onSelect={() => tools.open('shortcuts')} aria-keyshortcuts="?">
            <Keyboard className="size-4" aria-hidden />
            <span className="flex-1">Keyboard shortcuts</span>
            <kbd className="text-xs text-text-3">?</kbd>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
