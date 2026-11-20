/**
 * One online room: the lobby, seats (people and bots), the match, turn timers, chat, and what
 * happens when someone leaves. Pure logic with an injected clock, so it runs the same in the
 * Cloudflare Durable Object, in tests, and anywhere else.
 *
 * Seats are numbered 0..3 (only the first `settings.players` are used); partners sit opposite
 * (seats 0 & 2 against 1 & 3), exactly like the engine.
 */
import {
  type Action,
  type BotLevel,
  type MatchState,
  BOT_LEVELS,
  applyMatchAction,
  minimalLayDown,
  newMatch,
  planBotTurn,
  planExpertTurn,
  startNextRound,
} from '@indra/engine';
import { type ChatLine, type ClientMessage, type LastAction, type RoomSettings, type RoomView, type SeatView, DEFAULT_ROOM_SETTINGS, TURN_SECONDS } from './protocol';
import { redactMatch } from './view';

export type Seat =
  | { kind: 'human'; clientId: string; name: string; connected: boolean; leftAt: number | null; timeouts: number }
  | { kind: 'bot'; level: BotLevel; name: string; standInFor: { clientId: string; name: string } | null }
  | { kind: 'open'; level: BotLevel };

export interface RoomState {
  code: string;
  createdAt: number;
  hostId: string | null;
  settings: RoomSettings;
  seats: Seat[];
  phase: 'lobby' | 'playing' | 'ended';
  match: MatchState | null;
  chat: ChatLine[];
  nextChatId: number;
  turnDeadline: number | null;
  botDueAt: number | null;
  botQueue: Action[];
  /** Nobody may move before this (the Indra moment is playing on everyone's screen). */
  pauseUntil: number;
  drop: { seat: number; name: string; reason: 'left' | 'timeouts' } | null;
  endedReason: string | null;
  lastAction: LastAction | null;
  /** Last time any person was connected; empty rooms expire. */
  lastSeen: number;
  seed: number;
}

/** How long a disconnected player has to come back before the others are asked. */
export const DROP_GRACE_MS = 20_000;
/** Missed turns in a row before the others are offered a bot instead. */
export const TIMEOUT_LIMIT = 3;
/** Rooms with nobody connected are cleared after this long. */
export const EXPIRE_MS = 30 * 60_000;
export const INDRA_PAUSE_MS = 2600;
/** Pause before each bot move, so people can follow what happened. */
const BOT_DELAY: Record<Action['type'], number> = { draw: 1750, meld: 1650, add: 1450, discard: 1600 };
const EXPERT_SIMS = 200;
const BOT_NAMES = ['Arjun', 'Meera', 'Kabir', 'Tara', 'Dev', 'Isha', 'Rohan', 'Zoya'];
export const MAX_NAME = 16;
export const MAX_CHAT = 200;

export type Outcome = { ok: true } | { ok: false; error: string };
const ok: Outcome = { ok: true };
const fail = (error: string): Outcome => ({ ok: false, error });

export function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return name || 'Player';
}

export function newRoomState(code: string, now: number, seed: number): RoomState {
  return {
    code,
    createdAt: now,
    hostId: null,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    seats: [0, 1, 2, 3].map(() => ({ kind: 'open', level: 'medium' as BotLevel })),
    phase: 'lobby',
    match: null,
    chat: [],
    nextChatId: 1,
    turnDeadline: null,
    botDueAt: null,
    botQueue: [],
    pauseUntil: 0,
    drop: null,
    endedReason: null,
    lastAction: null,
    lastSeen: now,
    seed,
  };
}

export class Room {
  constructor(public s: RoomState) {}

  // ------------------------------------------------------------------ helpers

  get players(): number {
    return this.s.settings.players;
  }

  seatOf(clientId: string): number | null {
    const i = this.s.seats.findIndex((x, i) => i < this.players && x.kind === 'human' && x.clientId === clientId);
    return i < 0 ? null : i;
  }

  private connectedHumans(): number[] {
    return this.s.seats.map((x, i) => (i < this.players && x.kind === 'human' && x.connected ? i : -1)).filter((i) => i >= 0);
  }

  private nextSeed(): number {
    this.s.seed = (Math.imul(this.s.seed ^ 0x9e3779b9, 0x85ebca6b) + 0x6d2b79f5) | 0;
    return this.s.seed;
  }

  private pickHost(): void {
    const host = this.s.hostId === null ? null : this.seatOf(this.s.hostId);
    if (host !== null && (this.s.seats[host] as { connected: boolean }).connected) return;
    const next = this.connectedHumans()[0];
    this.s.hostId = next === undefined ? this.s.hostId : (this.s.seats[next] as { clientId: string }).clientId;
  }

  private say(text: string, now: number): void {
    this.pushChat({ seat: null, name: '', text }, now);
  }

  private pushChat(line: Omit<ChatLine, 'id' | 'at'>, now: number): void {
    this.s.chat.push({ ...line, id: this.s.nextChatId++, at: now });
    if (this.s.chat.length > 80) this.s.chat.splice(0, this.s.chat.length - 80);
  }

  // ------------------------------------------------------------------ joining and leaving

  join(clientId: string, rawName: string, now: number): Outcome {
    const name = cleanName(rawName);
    this.s.lastSeen = now;
    const mine = this.seatOf(clientId);
    if (mine !== null) {
      const seat = this.s.seats[mine] as Extract<Seat, { kind: 'human' }>;
      const back = !seat.connected;
      seat.connected = true;
      seat.leftAt = null;
      if (this.s.phase === 'lobby') seat.name = name;
      if (this.s.drop?.seat === mine && this.s.drop.reason === 'left') this.s.drop = null;
      if (back && this.s.phase !== 'lobby') this.say(`${seat.name} is back.`, now);
      this.pickHost();
      return ok;
    }

    // Taking back a seat a bot was keeping warm.
    const standIn = this.s.seats.findIndex((x, i) => i < this.players && x.kind === 'bot' && x.standInFor?.clientId === clientId);
    if (standIn >= 0 && this.s.phase !== 'lobby') {
      const bot = this.s.seats[standIn] as Extract<Seat, { kind: 'bot' }>;
      this.s.seats[standIn] = { kind: 'human', clientId, name: bot.standInFor!.name, connected: true, leftAt: null, timeouts: 0 };
      this.say(`${bot.standInFor!.name} is back and takes over from the bot.`, now);
      if (this.s.match?.status === 'playing' && this.s.match.round.turn === standIn) {
        this.s.botQueue = [];
        this.s.botDueAt = null;
        this.s.turnDeadline = Math.max(now, this.s.pauseUntil) + this.s.settings.turnSeconds * 1000;
      }
      this.pickHost();
      return ok;
    }

    if (this.s.phase !== 'lobby') return fail('This game has already started.');
    const open = this.s.seats.findIndex((x, i) => i < this.players && x.kind === 'open');
    if (open < 0) return fail('This room is full.');
    this.s.seats[open] = { kind: 'human', clientId, name, connected: true, leftAt: null, timeouts: 0 };
    if (this.s.hostId === null) this.s.hostId = clientId;
    this.pickHost();
    return ok;
  }

  /** A connection closed (the player may come back). */
  disconnect(clientId: string, now: number): void {
    const i = this.seatOf(clientId);
    if (i === null) return;
    const seat = this.s.seats[i] as Extract<Seat, { kind: 'human' }>;
    if (this.s.phase === 'lobby') {
      this.s.seats[i] = { kind: 'open', level: 'medium' };
    } else {
      seat.connected = false;
      seat.leftAt = now;
    }
    if (this.s.hostId === clientId) this.pickHost();
    if (this.connectedHumans().length) this.s.lastSeen = now;
  }

  /** "Leave game": the others are asked straight away. */
  leave(clientId: string, now: number): void {
    const i = this.seatOf(clientId);
    if (i === null) return;
    const seat = this.s.seats[i] as Extract<Seat, { kind: 'human' }>;
    const name = seat.name;
    this.disconnect(clientId, now);
    if (this.s.phase === 'playing') {
      seat.leftAt = now - DROP_GRACE_MS;
      this.say(`${name} left the table.`, now);
    }
  }

  // ------------------------------------------------------------------ messages

  handle(clientId: string, msg: ClientMessage, now: number): Outcome {
    const seat = this.seatOf(clientId);
    const isHost = clientId === this.s.hostId;
    this.s.lastSeen = now;
    switch (msg.t) {
      case 'chat': {
        const text = String(msg.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT);
        if (!text) return ok;
        const recent = this.s.chat.filter((c) => c.seat === seat && now - c.at < 5000).length;
        if (recent >= 5) return fail('Slow down a little.');
        const name = seat === null ? 'Guest' : (this.s.seats[seat] as { name: string }).name;
        this.pushChat({ seat, name, text }, now);
        return ok;
      }
      case 'rename': {
        if (seat === null || this.s.phase !== 'lobby') return ok;
        (this.s.seats[seat] as { name: string }).name = cleanName(msg.name);
        return ok;
      }
      case 'leave':
        this.leave(clientId, now);
        return ok;
      case 'act':
        return seat === null ? fail('You are not seated at this table.') : this.act(seat, msg.action, now, false);
      case 'next':
        return this.next(now);
      case 'replace':
        return this.decideDrop(seat, !!msg.yes, now);
    }

    if (!isHost) return fail('Only the host can change the table.');
    switch (msg.t) {
      case 'settings':
        return this.changeSettings(msg.settings);
      case 'swap':
        return this.swap(msg.a, msg.b);
      case 'bot':
        return this.setBotLevel(msg.seat, msg.level);
      case 'start':
        return this.start(now);
      case 'lobby':
        return this.backToLobby(now);
    }
    return fail('Unknown message.');
  }

  private changeSettings(next: Partial<RoomSettings>): Outcome {
    if (this.s.phase !== 'lobby') return fail('Settings can only change in the lobby.');
    const s = { ...this.s.settings };
    if (next.players === 2 || next.players === 4) {
      if (next.players === 2) {
        // Pull everyone into the first two seats.
        const people = this.s.seats.filter((x) => x.kind === 'human');
        if (people.length > 2) return fail('Three or more people are here; 1 vs 1 needs just two.');
        const rest = this.s.seats.filter((x) => x.kind !== 'human');
        this.s.seats = [...people, ...rest];
      }
      s.players = next.players;
    }
    if (next.target === null || (typeof next.target === 'number' && next.target >= 20 && next.target <= 5000)) s.target = next.target === null ? null : Math.round(next.target);
    if (typeof next.openingRule === 'boolean') s.openingRule = next.openingRule;
    if (typeof next.turnSeconds === 'number' && (TURN_SECONDS as readonly number[]).includes(next.turnSeconds)) s.turnSeconds = next.turnSeconds;
    this.s.settings = s;
    return ok;
  }

  private swap(a: number, b: number): Outcome {
    if (this.s.phase !== 'lobby') return fail('Seats can only change in the lobby.');
    if (![a, b].every((x) => Number.isInteger(x) && x >= 0 && x < this.players) || a === b) return fail('Pick two seats.');
    [this.s.seats[a], this.s.seats[b]] = [this.s.seats[b], this.s.seats[a]];
    return ok;
  }

  private setBotLevel(i: number, level: BotLevel): Outcome {
    if (this.s.phase !== 'lobby') return fail('Bots can only change in the lobby.');
    if (!BOT_LEVELS.includes(level)) return fail('Unknown level.');
    const seat = this.s.seats[i];
    if (!seat || i >= this.players || seat.kind === 'human') return fail('That seat has a person in it.');
    this.s.seats[i] = { kind: 'open', level };
    return ok;
  }

  private start(now: number): Outcome {
    if (this.s.phase !== 'lobby') return fail('The game has already started.');
    const taken = new Set(this.s.seats.filter((x) => x.kind === 'human').map((x) => (x as { name: string }).name.toLowerCase()));
    const names = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
    for (let i = 0; i < this.players; i++) {
      const seat = this.s.seats[i];
      if (seat.kind === 'open') this.s.seats[i] = { kind: 'bot', level: seat.level, name: names.shift() ?? `Bot ${i + 1}`, standInFor: null };
    }
    const { players, target, openingRule } = this.s.settings;
    this.s.match = newMatch({ players: players as 2 | 4, target, openingRule }, this.nextSeed());
    this.s.phase = 'playing';
    this.s.endedReason = null;
    this.s.drop = null;
    this.s.lastAction = null;
    this.beginTurn(now, true);
    return ok;
  }

  private next(now: number): Outcome {
    const m = this.s.match;
    if (this.s.phase !== 'playing' || !m) return fail('No game in progress.');
    if (m.status === 'round-over') this.s.match = startNextRound(m);
    else if (m.status === 'match-over') {
      const { players, target, openingRule } = this.s.settings;
      this.s.match = newMatch({ players: players as 2 | 4, target, openingRule }, this.nextSeed());
    } else return fail('The round is still being played.');
    this.s.lastAction = null;
    this.beginTurn(now, true);
    return ok;
  }

  private backToLobby(now: number): Outcome {
    if (this.s.phase === 'lobby') return ok;
    this.s.phase = 'lobby';
    this.s.match = null;
    this.s.turnDeadline = null;
    this.s.botDueAt = null;
    this.s.botQueue = [];
    this.s.drop = null;
    this.s.endedReason = null;
    this.s.seats = this.s.seats.map((x) => {
      if (x.kind === 'human' && !x.connected) return { kind: 'open', level: 'medium' };
      if (x.kind === 'human') return { ...x, timeouts: 0 };
      if (x.kind === 'bot') return { kind: 'open', level: x.level };
      return x;
    });
    this.pickHost();
    this.s.lastSeen = now;
    return ok;
  }

  private decideDrop(seat: number | null, yes: boolean, now: number): Outcome {
    const drop = this.s.drop;
    if (!drop) return ok;
    if (seat === null || seat === drop.seat) return fail('Only the other players can decide.');
    const gone = this.s.seats[drop.seat];
    if (gone.kind !== 'human') {
      this.s.drop = null;
      return ok;
    }
    this.s.drop = null;
    if (yes) {
      this.s.seats[drop.seat] = { kind: 'bot', level: 'medium', name: gone.name, standInFor: { clientId: gone.clientId, name: gone.name } };
      this.say(`A bot is playing for ${gone.name} now.${drop.reason === 'left' ? ' They can take their seat back by rejoining.' : ''}`, now);
      if (this.s.match?.status === 'playing' && this.s.match.round.turn === drop.seat) {
        this.s.turnDeadline = null;
        this.s.botQueue = [];
        this.s.botDueAt = Math.max(now, this.s.pauseUntil) + 600;
      }
    } else {
      this.s.phase = 'ended';
      this.s.endedReason = `${gone.name} ${drop.reason === 'left' ? 'left' : 'stopped playing'}, so the game ended.`;
      this.s.turnDeadline = null;
      this.s.botDueAt = null;
      this.s.botQueue = [];
    }
    return ok;
  }

  // ------------------------------------------------------------------ playing

  private act(seat: number, action: Action, now: number, auto: boolean): Outcome {
    const m = this.s.match;
    if (this.s.phase !== 'playing' || !m) return fail('No game in progress.');
    if (now < this.s.pauseUntil && !auto) return fail('One moment…');
    const before = m.round;
    const r = applyMatchAction(m, seat, action);
    if (!r.ok) return r;
    this.s.match = r.state;
    const count = action.type === 'meld' ? action.melds.reduce((n, x) => n + x.cardIds.length, 0) : action.type === 'add' ? action.cardIds.length : 1;
    this.s.lastAction = { seat, type: action.type, count, at: now };
    const seatInfo = this.s.seats[seat];
    if (seatInfo.kind === 'human' && !auto) seatInfo.timeouts = 0;

    const after = r.state.round;
    if (before.indraHolder === null && after.indraHolder !== null) this.s.pauseUntil = now + INDRA_PAUSE_MS;
    const newTurn = after.turn !== before.turn || r.state.status !== 'playing' || (after.indraTurn && !before.indraTurn);
    this.beginTurn(now, newTurn);
    return ok;
  }

  /** Set the timer or schedule the bot for whoever is to play now. */
  private beginTurn(now: number, fresh: boolean): void {
    const m = this.s.match;
    if (this.s.phase !== 'playing' || !m || m.status !== 'playing') {
      this.s.turnDeadline = null;
      this.s.botDueAt = null;
      this.s.botQueue = [];
      return;
    }
    const seat = this.s.seats[m.round.turn];
    const start = Math.max(now, this.s.pauseUntil);
    if (seat.kind === 'bot') {
      this.s.turnDeadline = null;
      if (fresh || this.s.botDueAt === null) {
        if (fresh) this.s.botQueue = [];
        this.s.botDueAt = start + (this.s.botQueue[0] ? BOT_DELAY[this.s.botQueue[0].type] : BOT_DELAY.draw);
      }
    } else {
      this.s.botDueAt = null;
      this.s.botQueue = [];
      if (fresh || this.s.turnDeadline === null) this.s.turnDeadline = start + this.s.settings.turnSeconds * 1000;
    }
  }

  private botStep(now: number): void {
    const m = this.s.match!;
    const seatNo = m.round.turn;
    const seat = this.s.seats[seatNo];
    if (seat.kind !== 'bot') return;
    if (!this.s.botQueue.length) {
      this.s.botQueue = seat.level === 'expert' ? planExpertTurn(m.round, seatNo, { sims: EXPERT_SIMS }) : planBotTurn(m.round, seatNo, seat.level);
    }
    let action = this.s.botQueue.shift();
    let result = action ? this.act(seatNo, action, now, true) : fail('no plan');
    if (!result.ok) {
      // Should never happen; recover with a fresh Advanced plan.
      this.s.botQueue = planBotTurn(this.s.match!.round, seatNo, 'advanced');
      action = this.s.botQueue.shift();
      result = action ? this.act(seatNo, action, now, true) : result;
    }
    const after = this.s.match!;
    if (after.status === 'playing' && after.round.turn === seatNo && this.s.phase === 'playing') {
      const nextType = this.s.botQueue[0]?.type ?? 'meld';
      this.s.botDueAt = Math.max(now, this.s.pauseUntil) + BOT_DELAY[nextType];
    }
  }

  /** Out of time: draw from the pit and throw the card you drew, so the game keeps moving. */
  private autoPlay(seatNo: number, now: number): void {
    const m = this.s.match!;
    const seat = this.s.seats[seatNo] as Extract<Seat, { kind: 'human' }>;
    if (m.round.phase === 'draw') {
      if (!this.act(seatNo, { type: 'draw', from: 'pit' }, now, true).ok) this.act(seatNo, { type: 'draw', from: 'discard' }, now, true);
    }
    let round = this.s.match!.round;
    // They took the discard and then ran out of time: the rule still says lay something down first.
    if (round.turn === seatNo && round.phase === 'play' && round.mustLay) {
      const forced = minimalLayDown(round, seatNo);
      if (forced) this.act(seatNo, forced, now, true);
      round = this.s.match!.round;
    }
    if (this.s.match!.status === 'playing' && round.turn === seatNo && round.phase === 'play') {
      const hand = round.hands[seatNo];
      const last = hand[hand.length - 1];
      if (!last || !this.act(seatNo, { type: 'discard', cardId: last.id }, now, true).ok) {
        const plan = planBotTurn(round, seatNo, 'beginner').filter((a) => a.type === 'discard');
        if (plan[0]) this.act(seatNo, plan[0], now, true);
      }
    }
    seat.timeouts++;
    this.say(`${seat.name} ran out of time, so a card was drawn and thrown for them.`, now);
    if (seat.timeouts >= TIMEOUT_LIMIT && !this.s.drop && this.connectedHumans().some((i) => i !== seatNo)) {
      this.s.drop = { seat: seatNo, name: seat.name, reason: 'timeouts' };
    }
  }

  /** Run everything that is due by `now`. Call on every message and alarm. */
  tick(now: number): void {
    if (this.connectedHumans().length) this.s.lastSeen = now;
    for (let guard = 0; guard < 50; guard++) {
      if (this.s.phase !== 'playing' || !this.s.match) return;
      // Someone has been gone too long: ask the others.
      if (!this.s.drop) {
        const gone = this.s.seats.findIndex(
          (x, i) => i < this.players && x.kind === 'human' && !x.connected && x.leftAt !== null && now - x.leftAt >= DROP_GRACE_MS,
        );
        const others = this.connectedHumans();
        if (gone >= 0 && others.length) {
          const x = this.s.seats[gone] as Extract<Seat, { kind: 'human' }>;
          this.s.drop = { seat: gone, name: x.name, reason: 'left' };
        }
      }
      // Nobody is watching: don't let the bots play on alone.
      if (!this.connectedHumans().length) return;
      const m = this.s.match;
      if (m.status !== 'playing') return;
      if (this.s.turnDeadline !== null && now >= this.s.turnDeadline && this.s.seats[m.round.turn].kind === 'human') {
        this.autoPlay(m.round.turn, now);
        continue;
      }
      if (this.s.botDueAt !== null && now >= this.s.botDueAt && this.s.seats[m.round.turn].kind === 'bot') {
        this.s.botDueAt = null;
        this.botStep(now);
        continue;
      }
      return;
    }
  }

  /** When `tick` next needs to run, or null. */
  nextWake(): number | null {
    const times: number[] = [this.s.lastSeen + EXPIRE_MS];
    // With nobody connected the game is paused; only the expiry matters.
    if (this.s.phase === 'playing' && this.connectedHumans().length && this.s.match?.status === 'playing') {
      if (this.s.turnDeadline !== null) times.push(this.s.turnDeadline);
      if (this.s.botDueAt !== null) times.push(this.s.botDueAt);
      if (!this.s.drop) {
        for (const x of this.s.seats.slice(0, this.players)) if (x.kind === 'human' && !x.connected && x.leftAt !== null) times.push(x.leftAt + DROP_GRACE_MS);
      }
    }
    return Math.min(...times);
  }

  expired(now: number): boolean {
    return !this.connectedHumans().length && now - this.s.lastSeen >= EXPIRE_MS;
  }

  /** Whether a bot is due to move (for the "thinking" hint). */
  private botToMove(): boolean {
    const m = this.s.match;
    return !!m && m.status === 'playing' && this.s.seats[m.round.turn]?.kind === 'bot';
  }

  // ------------------------------------------------------------------ what each player sees

  viewFor(clientId: string, now: number): RoomView {
    const you = this.seatOf(clientId);
    const seats: SeatView[] = this.s.seats.slice(0, this.players).map((x, i) => ({
      kind: x.kind,
      name: x.kind === 'open' ? 'Open seat' : x.name,
      level: x.kind === 'human' ? undefined : x.level,
      connected: x.kind === 'human' ? x.connected : true,
      isYou: i === you,
      isHost: x.kind === 'human' && x.clientId === this.s.hostId,
      standIn: x.kind === 'bot' && !!x.standInFor,
    }));
    const m = this.s.match;
    return {
      code: this.s.code,
      you,
      isHost: clientId === this.s.hostId,
      settings: this.s.settings,
      seats,
      phase: this.s.phase,
      match: m ? redactMatch(m, you) : null,
      chat: this.s.chat,
      turnDeadline: this.s.turnDeadline,
      now,
      drop: this.s.drop,
      endedReason: this.s.endedReason,
      lastAction: this.s.lastAction,
      botThinking: this.botToMove(),
    };
  }
}
