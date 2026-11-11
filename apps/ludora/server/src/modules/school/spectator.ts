import type { RoomView } from '@ludora/shared';

/*
 * The spectator screen's view: the big screen's (names hidden when the host hides them), without
 * anything only the host sees (still answering, the waiting room, the class summary). Pure, so the
 * room can call it wherever it runs.
 */
export function spectatorView(v: RoomView): RoomView {
  const { host: _host, ...rest } = v as RoomView & { host?: unknown };
  const results = rest.results ? (({ report: _report, ...r }) => r)(rest.results as typeof rest.results & { report?: unknown }) : rest.results;
  return { ...rest, results, me: { playerId: null, role: 'host', name: rest.room.hostName, teamId: null, reconnectToken: null } } as RoomView;
}
