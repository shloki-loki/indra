import { describe, expect, it } from 'vitest';
import { BOT_LEVELS, type BotLevel, planBotTurn } from '../src/bot';
import { shuffle } from '../src/rng';
import { applyMatchAction, newMatch, startNextRound, type MatchState } from '../src/match';
import { type RoundState, applyAction, countCards, newRound, scoreRound } from '../src/round';

function playRoundWithBots(m: MatchState, levels: BotLevel[]): { match: MatchState; turns: number } {
  let turns = 0;
  while (m.status === 'playing' && turns < 300) {
    const seat = m.round.turn;
    const plan = planBotTurn(m.round, seat, levels[seat % levels.length]);
    expect(plan.length).toBeGreaterThan(0);
    for (const action of plan) {
      const r = applyMatchAction(m, seat, action);
      if (!r.ok) throw new Error(`${levels[seat % levels.length]} bot made an illegal move: ${r.error}`);
      m = r.state;
      if (m.status === 'playing') expect(countCards(m.round)).toBe(104);
    }
    turns++;
  }
  return { match: m, turns };
}

describe.each(BOT_LEVELS)('%s bot', (level) => {
  it.each([[2, 1], [2, 2], [4, 3], [4, 4], [2, 5], [4, 6]] as const)('finishes a %i-player round legally (seed %i)', (players, seed) => {
    const { match, turns } = playRoundWithBots(newMatch({ players, target: 200, openingRule: true }, seed), [level]);
    expect(match.status).not.toBe('playing');
    expect(match.round.shows).toHaveLength(2);
    expect(turns).toBeLessThan(300);
  });

  it('plays a whole match to 200 with the opening rule on', () => {
    let m = newMatch({ players: 2, target: 200, openingRule: true }, 11);
    for (let round = 0; round < 40 && m.status !== 'match-over'; round++) {
      m = playRoundWithBots(m, [level]).match;
      expect(m.status).not.toBe('playing'); // a round must never stall
      if (m.status === 'round-over') m = startNextRound(m);
    }
    expect(m.status).toBe('match-over');
  });
});

/** Shuffle every card the seat cannot see (other hands, pit, Indra), keeping each zone's size. */
function reshuffleHidden(s: RoundState, seat: number, seed: number): RoundState {
  const t = structuredClone(s);
  const others = t.hands.map((_, i) => i).filter((i) => i !== seat);
  const hidden = [...others.flatMap((i) => t.hands[i]), ...t.pit, ...t.indra];
  const mixed = shuffle(hidden, seed).items;
  let k = 0;
  for (const i of others) t.hands[i] = mixed.slice(k, (k += t.hands[i].length));
  t.pit = mixed.slice(k, (k += t.pit.length));
  t.indra = mixed.slice(k, (k += t.indra.length));
  return t;
}

describe('bots never peek at hidden cards', () => {
  it.each(BOT_LEVELS)('%s: the decision before drawing is the same whatever the hidden cards are', (level) => {
    let s = newRound({ players: 4, starter: 0, seed: 77 });
    let checked = 0;
    for (let turn = 0; turn < 60 && s.phase !== 'over'; turn++) {
      const seat = s.turn;
      if (s.phase === 'draw') {
        const first = planBotTurn(s, seat, level)[0];
        for (const seed of [1, 2, 3]) expect(planBotTurn(reshuffleHidden(s, seat, seed), seat, level)[0]).toEqual(first);
        checked++;
        // If it takes the known top discard, the turn up to its discard must be identical too.
        // (After that discard it may show and take Indra, which legitimately reveals new cards.)
        if (first.type === 'draw' && first.from === 'discard') {
          const untilDiscard = (plan: ReturnType<typeof planBotTurn>) => plan.slice(0, plan.findIndex((a) => a.type === 'discard') + 1);
          expect(untilDiscard(planBotTurn(reshuffleHidden(s, seat, 9), seat, level))).toEqual(untilDiscard(planBotTurn(s, seat, level)));
        }
      }
      for (const a of planBotTurn(s, seat, 'medium')) {
        const r = applyAction(s, seat, a);
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe('levels are ordered by strength', () => {
  function duel(x: BotLevel, y: BotLevel, rounds: number): number {
    let diff = 0;
    for (let i = 0; i < rounds; i++) {
      const swap = i % 2 === 1;
      const levels = swap ? [y, x] : [x, y];
      let s = newRound({ players: 2, starter: i % 2, seed: 9000 + i });
      for (let t = 0; t < 1000 && s.phase !== 'over'; t++) {
        const seat = s.turn;
        for (const a of planBotTurn(s, seat, levels[seat])) s = (applyAction(s, seat, a) as { ok: true; state: RoundState }).state;
      }
      const sc = scoreRound(s);
      diff += swap ? sc[1].total - sc[0].total : sc[0].total - sc[1].total;
    }
    return diff / 2 / rounds; // average points per round
  }

  it('Medium beats Beginner and Advanced beats Medium on average', () => {
    expect(duel('medium', 'beginner', 120)).toBeGreaterThan(2);
    expect(duel('advanced', 'medium', 120)).toBeGreaterThan(2);
  }, 120_000);
});
