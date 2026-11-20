import { describe, expect, it } from 'vitest';
import { type MatchState, closeRound, newMatch, startNextRound } from '../src/match';
import { makeRound } from './helpers';

/** A finished round where side 0 scores `a` points and side 1 scores `b` (only hand penalties/cards). */
function finished(m: MatchState, a: number, b: number): MatchState {
  const round = makeRound({ players: m.settings.players, hands: Array(m.settings.players).fill(''), phase: 'over' });
  const closed = closeRound({ ...m, round });
  const delta = [a * 2, b * 2];
  return {
    ...closed,
    scores: m.scores.map((t, i) => t + delta[i]),
    history: [...m.history, { starter: m.starter, scores: delta.map((d) => ({ table: d, bonus: 0, hand: 0, total: d, live: d })) }],
    ...decide(m, delta),
  };
}
function decide(m: MatchState, delta: number[]) {
  const totals = m.scores.map((t, i) => t + delta[i]);
  const target = m.settings.target;
  const winner = target !== null && totals.some((t) => t >= target * 2) && totals[0] !== totals[1] ? (totals[0] > totals[1] ? 0 : 1) : null;
  return { winner, status: winner === null ? ('round-over' as const) : ('match-over' as const) };
}

describe('match', () => {
  it('starts a fresh round with a random starter', () => {
    const m = newMatch({ players: 4, target: 200, openingRule: true }, 5);
    expect(m.status).toBe('playing');
    expect(m.round.hands).toHaveLength(4);
    expect(m.starter).toBeGreaterThanOrEqual(0);
    expect(m.round.openingRequired).toEqual([false, false]);
  });

  it('closeRound adds the round onto the score sheet', () => {
    const m = newMatch({ players: 2, target: 200, openingRule: true }, 1);
    const round = makeRound({ hands: ['5H 6H', 'KD'], phase: 'over' });
    const closed = closeRound({ ...m, round });
    expect(closed.scores).toEqual([-2, -2]);
    expect(closed.history).toHaveLength(1);
    expect(closed.status).toBe('round-over');
  });

  it('first side past the target wins; higher total wins if both pass', () => {
    let m = newMatch({ players: 2, target: 200, openingRule: true }, 1);
    m = finished(m, 150, 120);
    expect(m.winner).toBeNull();
    m = finished(m, 55, 90); // 205 vs 210
    expect(m.winner).toBe(1);
    expect(m.status).toBe('match-over');
  });

  it('closeRound declares the winner from real round scores', () => {
    const m = newMatch({ players: 2, target: 1, openingRule: false }, 1);
    const round = makeRound({ hands: ['', 'KD KS KC'], phase: 'over' });
    round.shows = [0, 0];
    const closed = closeRound({ ...m, round });
    expect(closed.scores).toEqual([40, -6]);
    expect(closed.winner).toBe(0);
  });

  it('no-limit target never ends', () => {
    const m = newMatch({ players: 2, target: null, openingRule: true }, 1);
    const round = makeRound({ hands: ['', ''], phase: 'over' });
    round.shows = [0, 0];
    expect(closeRound({ ...m, scores: [5000, 0], round }).winner).toBeNull();
  });

  it('the round winner starts the next round', () => {
    let m = newMatch({ players: 4, target: 200, openingRule: true }, 9);
    m = finished(m, 10, 40);
    const next = startNextRound(m);
    expect([1, 3]).toContain(next.starter);
    expect(next.round.turn).toBe(next.starter);
    expect(next.status).toBe('playing');
  });

  it('the 10-point opening rule switches on at 100 for that side only, and only if enabled', () => {
    let m = newMatch({ players: 2, target: 200, openingRule: true }, 3);
    m = finished(m, 100, 99.5);
    expect(startNextRound(m).round.openingRequired).toEqual([true, false]);

    let off = newMatch({ players: 2, target: 200, openingRule: false }, 3);
    off = finished(off, 150, 150);
    expect(startNextRound(off).round.openingRequired).toEqual([false, false]);
  });
});
