import type { EngineResults } from '@ludora/engine';
import type { AppDeps } from '../app.ts';
import { errorReports } from '../db/schema.ts';
import { roomCode } from '../lib/crypto.ts';
import { Room, type RoomHooks, type RoomInit } from './room.ts';
import { persistGame } from './persist.ts';
// The game server is the only place cheat definitions are loaded; the web app never imports them.
import '@ludora/engine/chaos-cheats';

const SWEEP_MS = 5000;
export const MAX_ROOMS_PER_HOST = 6;

/** All live rooms in this process. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly pending = new Set<Promise<unknown>>();
  private sweeper: ReturnType<typeof setInterval> | null;
  private lastErrorAt = 0;

  constructor(
    private readonly deps: AppDeps,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_MS);
    this.sweeper.unref?.();
  }

  private hooks(): RoomHooks {
    return {
      now: this.now,
      persist: (room, results) => this.track(this.persist(room, results)),
      onError: (err, where, room) => this.reportError(err, where, room),
      onClosed: (room) => {
        if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
      },
    };
  }

  private async persist(room: Room, results: EngineResults) {
    try {
      return await persistGame(this.deps, room, results);
    } catch (err) {
      this.reportError(err, 'persist', room);
      return null;
    }
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.pending.add(p);
    p.finally(() => this.pending.delete(p)).catch(() => {});
    return p;
  }

  reportError(err: unknown, where: string, room: Room | null) {
    this.deps.log?.error({ err, where, room: room?.code }, 'room error');
    // Throttle stored reports so a crashing mode cannot flood the table.
    const now = this.now();
    if (now - this.lastErrorAt < 1000) return;
    this.lastErrorAt = now;
    const e = err as Error;
    void this.deps.db
      .insert(errorReports)
      .values({ source: 'realtime', message: `${where}: ${String(e?.message ?? err)}`.slice(0, 500), stack: String(e?.stack ?? '').slice(0, 4000), context: { room: room?.code ?? null, mode: room?.mode.meta.id ?? null } })
      .catch(() => {});
  }

  create(init: Omit<RoomInit, 'code'>): Room {
    let code = roomCode();
    for (let i = 0; this.rooms.has(code) && i < 50; i++) code = roomCode();
    if (this.rooms.has(code)) throw new Error('No free room codes');
    const room = new Room({ ...init, code }, this.hooks());
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    const room = this.rooms.get(code);
    return room && !room.isClosed() ? room : undefined;
  }

  hostedBy(userId: string): Room[] {
    return [...this.rooms.values()].filter((r) => r.hostUserId === userId && !r.isClosed());
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }

  /**
   * Take an account out of every live room: rooms it hosts close (saving
   * any game in progress), and it is removed from rooms it plays in.
   * Returns how many rooms were affected.
   */
  removeUser(userId: string, notice: string): number {
    let affected = 0;
    for (const room of this.list()) {
      if (room.isClosed()) continue;
      if (room.hostUserId === userId) {
        room.close(notice);
        affected++;
      } else if (room.removeUser(userId, notice)) {
        affected++;
      }
    }
    return affected;
  }

  sweep() {
    for (const room of [...this.rooms.values()]) {
      try {
        if (!room.sweep()) room.close('This room closed after a period of inactivity.');
      } catch (err) {
        this.reportError(err, 'sweep', room);
      }
    }
  }

  /** Close every room, saving games in progress, and wait for saves to finish. */
  async shutdown(reason = 'The server is restarting. Your game was saved.') {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
    for (const room of [...this.rooms.values()]) room.close(reason);
    await Promise.allSettled([...this.pending]);
  }

  async idle() {
    await Promise.allSettled([...this.pending]);
  }
}
