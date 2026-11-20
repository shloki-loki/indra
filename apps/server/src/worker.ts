/**
 * INDRA on Cloudflare: serves the site (static files) and runs online rooms.
 *
 *   POST /api/rooms              → create a room, returns { code }
 *   GET  /api/rooms/:code        → { exists, joinable, reason? } before joining
 *   GET  /api/rooms/:code/ws     → WebSocket into the room (?cid=<browser id>&name=<nickname>)
 *
 * Each room is one Durable Object holding a `Room` (packages/room). It keeps its state in storage,
 * so it survives restarts, and uses an alarm for turn timers, bot moves and expiry.
 */
import { DurableObject } from 'cloudflare:workers';
import { CODE_LETTERS, CODE_PATTERN, type ClientMessage, Room, type RoomState, type ServerMessage, newRoomState } from '@indra/room';

interface Env {
  ROOMS: DurableObjectNamespace<RoomObject>;
  ASSETS: Fetcher;
}

// The site may be hosted elsewhere (e.g. Vercel) and call these endpoints cross-origin.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      for (let attempt = 0; attempt < 12; attempt++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST' });
        if (res.ok) return json({ code });
      }
      return json({ error: 'Could not make a room right now. Try again.' }, 503);
    }
    const m = url.pathname.match(/^\/api\/rooms\/([A-Za-z]{4})(\/ws)?$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE_PATTERN.test(code)) return json({ exists: false, joinable: false, reason: 'No room has that code.' }, 404);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const inner = new URL(req.url);
      inner.pathname = m[2] ? '/ws' : '/info';
      return stub.fetch(new Request(inner.toString(), req));
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

export class RoomObject extends DurableObject<Env> {
  private room: Room | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<RoomState>('room');
      if (saved) this.room = new Room(saved);
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const now = Date.now();

    if (url.pathname === '/init') {
      if (this.room) return json({ error: 'taken' }, 409);
      const seed = crypto.getRandomValues(new Int32Array(1))[0];
      this.room = new Room(newRoomState(url.searchParams.get('code') ?? '????', now, seed));
      await this.save();
      return json({ ok: true });
    }

    if (url.pathname === '/info') {
      if (!this.room) return json({ exists: false, joinable: false, reason: 'No room has that code.' }, 404);
      const cid = url.searchParams.get('cid') ?? '';
      const r = this.room;
      const seated = cid && (r.seatOf(cid) !== null || r.s.seats.some((s) => s.kind === 'bot' && s.standInFor?.clientId === cid));
      const open = r.s.phase === 'lobby' && r.s.seats.slice(0, r.players).some((s) => s.kind === 'open');
      const reason = r.s.phase !== 'lobby' ? 'This game has already started.' : 'This room is full.';
      return json({ exists: true, joinable: !!seated || open, reason: seated || open ? undefined : reason });
    }

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket.' }, 426);
      if (!this.room) return json({ error: 'No room has that code.' }, 404);
      const cid = (url.searchParams.get('cid') ?? '').slice(0, 64);
      const name = url.searchParams.get('name') ?? 'Player';
      if (!/^[\w-]{8,64}$/.test(cid)) return json({ error: 'Bad client id.' }, 400);

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, [cid]);
      const joined = this.room.join(cid, name, now);
      if (!joined.ok) {
        server.send(JSON.stringify({ t: 'error', message: joined.error } satisfies ServerMessage));
        server.close(4000, joined.error.slice(0, 120));
      } else {
        await this.update(now);
      }
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: 'Not found' }, 404);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.room || typeof raw !== 'string' || raw.length > 4000) return;
    const cid = this.ctx.getTags(ws)[0];
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const now = Date.now();
    const result = this.room.handle(cid, msg, now);
    if (!result.ok) ws.send(JSON.stringify({ t: 'error', message: result.error } satisfies ServerMessage));
    await this.update(now);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.dropSocket(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.dropSocket(ws);
  }

  private async dropSocket(ws: WebSocket): Promise<void> {
    if (!this.room) return;
    const cid = this.ctx.getTags(ws)[0];
    // Another tab of the same player may still be open.
    const stillHere = this.ctx.getWebSockets(cid).some((other) => other !== ws && other.readyState === WebSocket.OPEN);
    if (!stillHere) this.room.disconnect(cid, Date.now());
    await this.update(Date.now());
  }

  async alarm(): Promise<void> {
    if (!this.room) return;
    const now = Date.now();
    if (this.room.expired(now)) {
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.update(now);
  }

  /** Run anything due, save, tell everyone, and set the next alarm. */
  private async update(now: number): Promise<void> {
    const room = this.room!;
    room.tick(now);
    await this.save();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const cid = this.ctx.getTags(ws)[0];
      try {
        ws.send(JSON.stringify({ t: 'state', room: room.viewFor(cid, now) } satisfies ServerMessage));
      } catch {
        // Socket is going away; webSocketClose will follow.
      }
    }
    const wake = room.nextWake();
    if (wake !== null) await this.ctx.storage.setAlarm(Math.max(wake, now + 50));
  }

  private async save(): Promise<void> {
    if (this.room) await this.ctx.storage.put('room', this.room.s);
  }
}
