import { describe, expect, it } from 'vitest';
import { type Action, countCards, planBotTurn } from '@indra/engine';
import { DROP_GRACE_MS, Room, TIMEOUT_LIMIT, newRoomState } from '../src/room';
import { isHidden, rotateMatch } from '../src/view';

function room(): Room {
  return new Room(newRoomState('ABCD', 0, 42));
}

/** Drive the room until it's `clientId`'s turn (bots play themselves via tick). */
function runBots(r: Room, now: number, until: () => boolean, step = 1000): number {
  for (let i = 0; i < 2000 && !until(); i++) {
    now += step;
    r.tick(now);
  }
  return now;
}

/** Let a person play their turn the way a Medium bot would (planning on their own redacted view is not needed for tests). */
function playFor(r: Room, clientId: string, now: number): void {
  const seat = r.seatOf(clientId)!;
  for (let guard = 0; guard < 10 && r.s.match!.status === 'playing' && r.s.match!.round.turn === seat; guard++) {
    const plan: Action[] = planBotTurn(r.s.match!.round, seat, 'medium');
    for (const action of plan) {
      now = Math.max(now, r.s.pauseUntil); // wait out the Indra moment like a real player
      const res = r.handle(clientId, { t: 'act', action }, now);
      if (!res.ok) throw new Error(res.error);
      if (r.s.match!.status !== 'playing' || r.s.match!.round.turn !== seat) break;
    }
  }
}

describe('lobby', () => {
  it('seats people in join order, makes the first one host, and refuses a full room', () => {
    const r = room();
    expect(r.join('a', 'Shlok', 0).ok).toBe(true);
    expect(r.join('b', 'Riya', 0).ok).toBe(true);
    expect(r.join('c', 'Kunal', 0)).toEqual({ ok: false, error: 'This room is full.' });
    expect(r.s.hostId).toBe('a');
    expect(r.viewFor('a', 0).isHost).toBe(true);
    expect(r.viewFor('b', 0).seats.map((s) => s.name)).toEqual(['Shlok', 'Riya']);
  });

  it('only the host changes the table; 2 vs 2 opens two more seats; the host can swap teams', () => {
    const r = room();
    r.join('a', 'A', 0);
    r.join('b', 'B', 0);
    expect(r.handle('b', { t: 'settings', settings: { players: 4 } }, 0).ok).toBe(false);
    expect(r.handle('a', { t: 'settings', settings: { players: 4, turnSeconds: 90, target: null } }, 0).ok).toBe(true);
    r.join('c', 'C', 0);
    // A and B are partners if B moves to seat 2.
    expect(r.handle('a', { t: 'swap', a: 1, b: 2 }, 0).ok).toBe(true);
    expect(r.viewFor('a', 0).seats.map((s) => s.name)).toEqual(['A', 'C', 'B', 'Open seat']);
    expect(r.s.settings).toMatchObject({ players: 4, turnSeconds: 90, target: null });
  });

  it('the host picks each bot level; empty seats become bots on Start (3 people + 1 bot)', () => {
    const r = room();
    r.handle('a', { t: 'settings', settings: {} }, 0);
    r.join('a', 'A', 0);
    r.handle('a', { t: 'settings', settings: { players: 4 } }, 0);
    r.join('b', 'B', 0);
    r.join('c', 'C', 0);
    expect(r.handle('a', { t: 'bot', seat: 0, level: 'expert' }, 0).ok).toBe(false); // a person sits there
    expect(r.handle('a', { t: 'bot', seat: 3, level: 'expert' }, 0).ok).toBe(true);
    expect(r.handle('a', { t: 'start' }, 0).ok).toBe(true);
    const seats = r.viewFor('a', 0).seats;
    expect(seats.map((s) => s.kind)).toEqual(['human', 'human', 'human', 'bot']);
    expect(seats[3].level).toBe('expert');
    expect(r.join('d', 'D', 0).ok).toBe(false); // started
  });

  it('1 person + 3 bots, and 1 vs 1 against a bot, both start', () => {
    const solo = room();
    solo.join('a', 'A', 0);
    solo.handle('a', { t: 'settings', settings: { players: 4 } }, 0);
    expect(solo.handle('a', { t: 'start' }, 0).ok).toBe(true);
    expect(solo.viewFor('a', 0).seats.filter((s) => s.kind === 'bot')).toHaveLength(3);
    const duel = room();
    duel.join('a', 'A', 0);
    expect(duel.handle('a', { t: 'start' }, 0).ok).toBe(true);
  });

  it('the host role passes on when the host leaves the lobby', () => {
    const r = room();
    r.join('a', 'A', 0);
    r.join('b', 'B', 0);
    r.disconnect('a', 1);
    expect(r.s.hostId).toBe('b');
    expect(r.viewFor('b', 1).seats[0].kind).toBe('open');
  });
});

describe('playing online', () => {
  it('a 2 vs 2 game with three people and a bot plays legally to the end of a round', () => {
    const r = room();
    r.join('a', 'A', 0);
    r.handle('a', { t: 'settings', settings: { players: 4 } }, 0);
    r.join('b', 'B', 0);
    r.join('c', 'C', 0);
    r.handle('a', { t: 'bot', seat: 3, level: 'advanced' }, 0);
    r.handle('a', { t: 'start' }, 0);
    let now = 0;
    const people = ['a', 'b', 'c'];
    for (let turns = 0; turns < 400 && r.s.match!.status === 'playing'; turns++) {
      const turn = r.s.match!.round.turn;
      const who = people.find((p) => r.seatOf(p) === turn);
      if (who) playFor(r, who, (now += 100));
      else now = runBots(r, now, () => r.s.match!.status !== 'playing' || r.s.seats[r.s.match!.round.turn].kind !== 'bot');
      expect(countCards(r.s.match!.round)).toBe(104);
    }
    expect(r.s.match!.status).not.toBe('playing');
    expect(r.s.match!.history).toHaveLength(1);
    expect(r.handle('b', { t: 'next' }, now).ok).toBe(true); // anyone can deal the next round
    expect(r.s.match!.status).toBe('playing');
  });

  it("you never see other players' cards, the pit, Indra or the deck seed", () => {
    const r = room();
    r.join('a', 'A', 0);
    r.join('b', 'B', 0);
    r.handle('a', { t: 'start' }, 0);
    const v = r.viewFor('a', 0).match!;
    const mine = r.seatOf('a')!;
    expect(v.round.hands[mine].every((c) => !isHidden(c))).toBe(true);
    expect(v.round.hands[1 - mine].every(isHidden)).toBe(true);
    expect(v.round.pit.every(isHidden) && v.round.indra.every(isHidden)).toBe(true);
    expect(v.round.hands[1 - mine].map((c) => c.id).join()).not.toMatch(/[SHDC][ab]/);
    expect(v.seed).toBe(0);
    expect(v.round.seed).toBe(0);
  });

  it('turn timer: running out draws and throws for you; three in a row asks the others', () => {
    const r = room();
    r.join('a', 'A', 0);
    r.join('b', 'B', 0);
    r.handle('a', { t: 'start' }, 0);
    let now = 0;
    const turnOf = () => r.s.match!.round.turn;
    const slow = r.s.seats[turnOf()].kind === 'human' ? (r.s.seats[turnOf()] as { clientId: string }).clientId : 'a';
    const quick = slow === 'a' ? 'b' : 'a';
    for (let missed = 0; missed < TIMEOUT_LIMIT; missed++) {
      if (r.seatOf(slow) !== turnOf()) playFor(r, quick, (now += 10));
      const hand = r.s.match!.round.hands[r.seatOf(slow)!].length;
      now = r.s.turnDeadline! + 1;
      r.tick(now);
      expect(r.s.match!.round.hands[r.seatOf(slow)!].length).toBe(hand); // drew one, threw one
      if (r.s.match!.status !== 'playing') return;
    }
    expect(r.s.drop).toMatchObject({ seat: r.seatOf(slow), reason: 'timeouts' });
  });

  it('when someone leaves: after a grace period the others choose a bot (and the player can take the seat back)', () => {
    const r = room();
    r.join('a', 'A', 0);
    r.join('b', 'B', 0);
    r.handle('a', { t: 'start' }, 0);
    r.disconnect('b', 1000);
    r.tick(1000 + DROP_GRACE_MS - 1);
    expect(r.s.drop).toBeNull();
    r.tick(1000 + DROP_GRACE_MS);
    expect(r.s.drop).toMatchObject({ name: 'B', reason: 'left' });
    expect(r.handle('b', { t: 'replace', yes: true }, 0).ok).toBe(false); // not their call
    r.handle('a', { t: 'replace', yes: true }, 30_000);
    const seat = r.s.seats.findIndex((s) => s.kind === 'bot');
    expect(r.viewFor('a', 30_000).seats[seat]).toMatchObject({ kind: 'bot', name: 'B', standIn: true });
    expect(r.join('b', 'B', 40_000).ok).toBe(true);
    expect(r.s.seats[seat].kind).toBe('human');
  });

  it('when someone leaves and the others decline a bot, the game ends', () => {
    const r = room();
    r.join('a', 'A', 0);
    r.join('b', 'B', 0);
    r.handle('a', { t: 'start' }, 0);
    r.handle('b', { t: 'leave' }, 5);
    r.tick(6);
    expect(r.s.drop?.name).toBe('B');
    r.handle('a', { t: 'replace', yes: false }, 7);
    expect(r.s.phase).toBe('ended');
    expect(r.viewFor('a', 7).endedReason).toBe('B left, so the game ended.');
    expect(r.handle('a', { t: 'lobby' }, 8).ok).toBe(true);
    expect(r.s.phase).toBe('lobby');
  });

  it('bots stop when nobody is connected, and empty rooms expire', () => {
    const r = room();
    r.join('a', 'A', 0);
    r.handle('a', { t: 'settings', settings: { players: 4 } }, 0);
    r.handle('a', { t: 'start' }, 0);
    r.disconnect('a', 10);
    const before = JSON.stringify(r.s.match);
    r.tick(60_000);
    expect(JSON.stringify(r.s.match)).toBe(before);
    expect(r.expired(10 + 30 * 60_000)).toBe(true);
  });

  it('chat is trimmed, capped and rate-limited', () => {
    const r = room();
    r.join('a', 'A', 0);
    r.handle('a', { t: 'chat', text: '   hello    there  ' }, 0);
    expect(r.s.chat.at(-1)).toMatchObject({ name: 'A', text: 'hello there' });
    for (let i = 0; i < 4; i++) r.handle('a', { t: 'chat', text: 'x' }, 1);
    expect(r.handle('a', { t: 'chat', text: 'too fast' }, 2).ok).toBe(false);
    r.handle('a', { t: 'chat', text: 'y'.repeat(500) }, 10_000);
    expect(r.s.chat.at(-1)!.text).toHaveLength(200);
  });
});

describe('seat rotation', () => {
  it('turns the table so you are seat 0 and your side is side 0', () => {
    const r = room();
    r.join('a', 'A', 0);
    r.handle('a', { t: 'settings', settings: { players: 4 } }, 0);
    r.join('b', 'B', 0);
    r.handle('a', { t: 'start' }, 0);
    const m = r.s.match!;
    const rotated = rotateMatch(m, 1);
    expect(rotated.round.hands[0]).toBe(m.round.hands[1]);
    expect(rotated.round.hands[3]).toBe(m.round.hands[0]);
    expect(rotated.round.turn).toBe((m.round.turn + 3) % 4);
    expect(rotated.scores).toEqual([m.scores[1], m.scores[0]]);
    expect(rotateMatch(m, 0)).toBe(m);
  });
});

describe('discard pickup rule online', () => {
  it('running out of time after taking the discard still lays a card down, then throws', () => {
    const r = room();
    r.join('a', 'A', 0);
    r.join('b', 'B', 0);
    r.handle('a', { t: 'start' }, 0);
    let now = 0;
    // Play turns until someone can legally take the discard after the first move.
    for (let i = 0; i < 200 && r.s.match!.status === 'playing'; i++) {
      const seat = r.s.match!.round.turn;
      const who = r.s.seats[seat].kind === 'human' ? (r.s.seats[seat] as { clientId: string }).clientId : null;
      if (!who) break;
      now = Math.max(now + 10, r.s.pauseUntil);
      if (r.s.match!.round.phase === 'draw' && r.s.match!.round.turns > 0 && r.handle(who, { t: 'act', action: { type: 'draw', from: 'discard' } }, now).ok) {
        expect(r.s.match!.round.mustLay).toBe(true);
        const melds = r.s.match!.round.melds.length;
        const hand = r.s.match!.round.hands[seat].length;
        r.tick(r.s.turnDeadline! + 1);
        const after = r.s.match!.round;
        expect(after.mustLay).toBe(false);
        expect(after.turn !== seat || after.indraTurn || r.s.match!.status !== 'playing').toBe(true);
        expect(after.melds.length > melds || after.hands[seat].length < hand - 1).toBe(true);
        return;
      }
      playFor(r, who, now);
    }
    throw new Error('never got a chance to take the discard');
  });
});
