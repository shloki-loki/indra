import { describe, expect, it } from 'vitest';
import { cardsValue } from '../src/cards';
import { type Action, type RoundState, applyAction, bonusBreakdown, countCards, minimalLayDown, newRound, scoreRound, viewFor } from '../src/round';
import { cards, ids, makeRound } from './helpers';

function play(state: RoundState, seat: number, action: Action): RoundState {
  const r = applyAction(state, seat, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
function reject(state: RoundState, seat: number, action: Action): string {
  const r = applyAction(state, seat, action);
  if (r.ok) throw new Error('expected the action to be rejected');
  return r.error;
}

const INDRA = '3S 4S 5S 6S 8D 9D 10D JC QC KC 9S 9H 9C';

describe('deal', () => {
  it.each([2, 4] as const)('deals 13 each, 13 Indra, 1 discard (%i players)', (players) => {
    const s = newRound({ players, starter: 0, seed: 7 });
    expect(s.hands.every((h) => h.length === 13)).toBe(true);
    expect(s.indra).toHaveLength(13);
    expect(s.discard).toHaveLength(1);
    expect(s.pit).toHaveLength(104 - 13 * players - 14);
    expect(countCards(s)).toBe(104);
  });
});

describe('turn flow', () => {
  it('draw → play → discard, then next seat', () => {
    let s = makeRound({ hands: ['5H 6H', '9C 9D'], pit: '3C KD', discard: '7S' });
    expect(reject(s, 1, { type: 'draw', from: 'pit' })).toMatch(/not your turn/);
    expect(reject(s, 0, { type: 'discard', cardId: '5Ha' })).toMatch(/Draw a card first/);
    s = play(s, 0, { type: 'draw', from: 'discard' });
    expect(s.hands[0].map((c) => c.id)).toContain('7Sa');
    expect(reject(s, 0, { type: 'draw', from: 'pit' })).toMatch(/already drawn/);
    s = play(s, 0, { type: 'discard', cardId: '7Sa' }); // throwing it straight back is allowed
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('draw');
  });

  it('must keep one card to discard', () => {
    let s = makeRound({ hands: ['5H 6H', ''], pit: '7H' });
    s = play(s, 0, { type: 'draw', from: 'pit' });
    expect(reject(s, 0, { type: 'meld', melds: [{ cardIds: ids('5H 6H 7H') }] })).toMatch(/Keep one card/);
  });

  it('reshuffles the discard pile (except its top) when the pit is empty', () => {
    let s = makeRound({ hands: ['5H', '6H'], pit: '', discard: '3C 4C 5C 9S' });
    s = play(s, 0, { type: 'draw', from: 'pit' });
    expect(s.discard.map((c) => c.id)).toEqual(['9Sa']);
    expect(s.pit).toHaveLength(2);
    expect(s.hands[0]).toHaveLength(2);
  });
});

describe('melding', () => {
  it('lays down several melds at once', () => {
    let s = makeRound({ hands: ['5H 6H 7H 9S 9D 9C KD', ''], pit: 'QS' });
    s = play(s, 0, { type: 'draw', from: 'pit' });
    s = play(s, 0, { type: 'meld', melds: [{ cardIds: ids('5H 6H 7H') }, { cardIds: ids('9S 9D 9C') }] });
    expect(s.melds).toHaveLength(2);
    expect(s.hands[0]).toHaveLength(2);
  });

  it("cannot add to the opponent's melds; partner can add to yours", () => {
    let s = makeRound({ players: 4, hands: ['5H 6H 7H KD', '8H QS', '8H QD', ''], pit: 'JC JD JS' });
    s = play(s, 0, { type: 'draw', from: 'pit' });
    s = play(s, 0, { type: 'meld', melds: [{ cardIds: ids('5H 6H 7H') }] });
    s = play(s, 0, { type: 'discard', cardId: 'KDa' });
    s = play(s, 1, { type: 'draw', from: 'pit' });
    expect(reject(s, 1, { type: 'add', meldId: 'm1', cardIds: ['8Ha'] })).toMatch(/own side/);
    s = play(s, 1, { type: 'discard', cardId: 'QSa' });
    s = play(s, 2, { type: 'draw', from: 'pit' });
    s = play(s, 2, { type: 'add', meldId: 'm1', cardIds: ['8Ha'] });
    expect(s.melds[0].kind === 'run' && s.melds[0].slots).toHaveLength(4);
  });
});

describe('10-point opening rule', () => {
  it('rejects an opening under 10 and accepts 10+', () => {
    let s = makeRound({
      hands: ['5H 6H 7H KS KD KC QS QD QC JS JD JC 10S 10D 10C 4C', ''],
      pit: '9D',
      openingRequired: [true, false],
    });
    s = play(s, 0, { type: 'draw', from: 'pit' });
    expect(reject(s, 0, { type: 'meld', melds: [{ cardIds: ids('5H 6H 7H') }] })).toMatch(/at least 10/);
    s = play(s, 0, {
      type: 'meld',
      melds: [{ cardIds: ids('KS KD KC') }, { cardIds: ids('QS QD QC') }, { cardIds: ids('JS JD JC') }, { cardIds: ids('10S 10D 10C') }],
    });
    expect(s.opened[0]).toBe(true);
    s = play(s, 0, { type: 'meld', melds: [{ cardIds: ids('5H 6H 7H') }] }); // after opening, anything goes
  });

  it('a 7-card bonus counts toward the 10', () => {
    let s = makeRound({ hands: ['3H 4H 5H 6H 7H 8H 9H KC', ''], pit: 'QD', openingRequired: [true, false] });
    s = play(s, 0, { type: 'draw', from: 'pit' });
    play(s, 0, { type: 'meld', melds: [{ cardIds: ids('3H 4H 5H 6H 7H 8H 9H') }] }); // 4½ + 20
  });

  it('once one partner opens, the other partner is free', () => {
    let s = makeRound({
      players: 4,
      hands: ['KS KD KC QS QD QC JS JD JC 10S 10D 10C 4C', '8S 3D', '5H 6H 7H 9C', '8C 3C'],
      pit: '2S 4D 9H 8D',
      openingRequired: [true, true],
    });
    s = play(s, 0, { type: 'draw', from: 'pit' });
    s = play(s, 0, {
      type: 'meld',
      melds: [{ cardIds: ids('KS KD KC') }, { cardIds: ids('QS QD QC') }, { cardIds: ids('JS JD JC') }, { cardIds: ids('10S 10D 10C') }],
    });
    s = play(s, 0, { type: 'discard', cardId: '4Ca' });
    s = play(s, 1, { type: 'draw', from: 'pit' });
    s = play(s, 1, { type: 'discard', cardId: '3Da' });
    s = play(s, 2, { type: 'draw', from: 'pit' });
    s = play(s, 2, { type: 'meld', melds: [{ cardIds: ids('5H 6H 7H') }] }); // only 1½ points, allowed
    expect(s.melds).toHaveLength(5);
  });
});

describe('shows and the Indra deck', () => {
  function toFirstShow(): RoundState {
    let s = makeRound({ hands: ['5H 6H 7H', '8C 8D 8S 4D 5D KD'], pit: '6D KS', discard: '3C', indra: INDRA });
    s = play(s, 0, { type: 'draw', from: 'pit' }); // KS
    s = play(s, 0, { type: 'meld', melds: [{ cardIds: ids('5H 6H 7H') }] });
    return play(s, 0, { type: 'discard', cardId: 'KSa' }); // hand empty → show
  }

  it('first show takes Indra and plays on without drawing', () => {
    const s = toFirstShow();
    expect(s.shows).toEqual([0]);
    expect(s.indraHolder).toBe(0);
    expect(s.hands[0]).toHaveLength(13);
    expect(s.indra).toHaveLength(0);
    expect(s.turn).toBe(0);
    expect(s.phase).toBe('play');
    expect(s.indraTurn).toBe(true);
    expect(reject(s, 0, { type: 'draw', from: 'pit' })).toMatch(/already drawn/);
  });

  it('the Indra holder cannot empty their hand on the Indra turn', () => {
    let s = toFirstShow();
    s = play(s, 0, { type: 'meld', melds: [{ cardIds: ids('3S 4S 5S 6S') }, { cardIds: ids('8D 9D 10D') }, { cardIds: ids('JC QC KC') }] });
    expect(s.hands[0]).toHaveLength(3); // 9S 9H 9C
    expect(reject(s, 0, { type: 'meld', melds: [{ cardIds: ids('9S 9H 9C') }] })).toMatch(/can't show/);
    s = play(s, 0, { type: 'discard', cardId: '9Ca' });
    expect(s.turn).toBe(1);
    expect(s.hands[0]).toHaveLength(2);
  });

  it('second show ends the round; scoring adds bonuses and subtracts hands', () => {
    let s = toFirstShow();
    s = play(s, 0, { type: 'discard', cardId: '9Ca' }); // Indra holder keeps 12 cards
    expect(s.turn).toBe(1);
    expect(s.indraTurn).toBe(false);
    s = play(s, 1, { type: 'draw', from: 'pit' }); // 6D
    s = play(s, 1, { type: 'meld', melds: [{ cardIds: ids('8C 8D 8S') }, { cardIds: ids('4D 5D 6D') }] });
    s = play(s, 1, { type: 'discard', cardId: 'KDa' }); // second show
    expect(s.phase).toBe('over');
    expect(s.shows).toEqual([0, 1]);

    const [mine, theirs] = scoreRound(s);
    expect(mine).toEqual({ table: 3, bonus: 20, hand: 20, total: 3, live: 23 }); // 1½ + 10 (showing first = taking Indra) − 10
    expect(theirs).toEqual({ table: 9, bonus: 20, hand: 0, total: 29, live: 29 }); // 4½ + 10
    expect(reject(s, 0, { type: 'draw', from: 'pit' })).toMatch(/over/);

    // Showing first and taking Indra are one event worth 10; the second show is another 10.
    const items = bonusBreakdown(s);
    expect(items.map((b) => [b.seat, b.kind, b.points / 2, b.label])).toEqual([
      [0, 'indra', 10, 'Showed first and took the Indra deck'],
      [1, 'show', 10, 'Showed second and ended the round'],
    ]);
    for (const side of [0, 1]) {
      const fromItems = items.filter((b) => b.side === side).reduce((n, b) => n + b.points, 0);
      expect(fromItems).toBe(scoreRound(s)[side].bonus);
    }
  });
});

describe('hidden information', () => {
  it("a player's view hides other hands, the pit and Indra", () => {
    const s = newRound({ players: 4, starter: 0, seed: 3 });
    const v = viewFor(s, 2) as unknown as Record<string, unknown>;
    expect(v.hands).toBeUndefined();
    expect(v.pit).toBeUndefined();
    expect(v.indra).toBeUndefined();
    expect(v.seed).toBeUndefined();
    expect((v.hand as unknown[]).length).toBe(13);
    expect(v.handCounts).toEqual([13, 13, 13, 13]);
  });
});

describe('long random games keep all 104 cards', () => {
  it('draw/discard randomly for 2000 turns', () => {
    let s = newRound({ players: 4, starter: 1, seed: 99 });
    let rnd = 12345;
    const next = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < 2000; t++) {
      if (s.phase === 'over') s = newRound({ players: 4, starter: t % 4, seed: 99 + t });
      if (s.phase === 'play') {
        // Indra turn after a show: no draw, just keep the game moving.
        const h = s.hands[s.turn];
        s = play(s, s.turn, { type: 'discard', cardId: h[0].id });
        continue;
      }
      const wantDiscard = next() < 0.3;
      const took = wantDiscard ? applyAction(s, s.turn, { type: 'draw', from: 'discard' }) : null;
      s = took?.ok ? took.state : play(s, s.turn, { type: 'draw', from: 'pit' });
      if (s.mustLay) s = play(s, s.turn, minimalLayDown(s, s.turn)!);
      const hand = s.hands[s.turn];
      s = play(s, s.turn, { type: 'discard', cardId: hand[Math.floor(next() * hand.length)].id });
      expect(countCards(s)).toBe(104);
    }
    expect(cardsValue(cards('2C'))).toBe(2);
  });
});

describe('bonus breakdown', () => {
  it('lists 7-card meld bonuses with the meld owner, and always adds up to the bonus total', () => {
    let s = makeRound({ hands: ['3H 4H 5H 6H 7H 8H 9H KC', ''], pit: 'QD' });
    s = play(s, 0, { type: 'draw', from: 'pit' });
    s = play(s, 0, { type: 'meld', melds: [{ cardIds: ids('3H 4H 5H 6H 7H 8H 9H') }] });
    const [item] = bonusBreakdown(s);
    expect(item).toMatchObject({ seat: 0, kind: 'meld', points: 40 });
    expect(item.label).toBe('run 3♥–9♥: 7 cards with no wild 2');
    expect(item.points).toBe(scoreRound(s)[0].bonus);
  });
});

describe('taking the discard means laying down', () => {
  const take: Action = { type: 'draw', from: 'discard' };

  it('the round\'s very first move is exempt', () => {
    let s = makeRound({ hands: ['3H 9C KD', '4S'], discard: '7D', pit: 'QS QH', turns: 0 });
    s = play(s, 0, take);
    expect(s.mustLay).toBe(false);
    s = play(s, 0, { type: 'discard', cardId: '7Da' });
    expect(s.turn).toBe(1);
  });

  it('after that, you must lay down or add at least one card before discarding (any card counts)', () => {
    let s = makeRound({ hands: ['8C 8D 8S KD', '4S'], discard: '2H', pit: 'QS', turns: 3 });
    s = play(s, 0, take);
    expect(s.mustLay).toBe(true);
    expect(reject(s, 0, { type: 'discard', cardId: '2Ha' })).toMatch(/lay down or add at least one card/);
    s = play(s, 0, { type: 'meld', melds: [{ cardIds: ids('8C 8D 8S') }] }); // not using the 2♥ is fine
    expect(s.mustLay).toBe(false);
    s = play(s, 0, { type: 'discard', cardId: '2Ha' });
    expect(s.turn).toBe(1);
  });

  it("you can't take it if nothing could be laid down", () => {
    const s = makeRound({ hands: ['3H 9C KD', '4S'], discard: '7S', pit: 'QS', turns: 2 });
    expect(reject(s, 0, take)).toMatch(/only take the discard if you can lay down/);
  });

  it('with the 10-point opening rule, you can take it only if you can open', () => {
    const weak = makeRound({ hands: ['3H 4H 9C', '4S'], discard: '5H', pit: 'QS', turns: 2, openingRequired: [true, false] });
    expect(reject(weak, 0, take)).toMatch(/open with 10 points/);
    // Aces 4½ + kings 3 + four queens 4 = 11½ points: enough to open.
    let strong = makeRound({ hands: ['AH AD AS KH KD KS QS QD QC 9C', '4S'], discard: 'QH', pit: 'JH', turns: 2, openingRequired: [true, false] });
    strong = play(strong, 0, take);
    expect(minimalLayDown(strong, 0)).toMatchObject({ type: 'meld' });
  });

  it('when the pit is used up, taking the last discard is always allowed', () => {
    const s = makeRound({ hands: ['3H 9C KD', '4S'], discard: '7S', turns: 5 });
    const r = applyAction(s, 0, take);
    expect(r.ok && !r.state.mustLay).toBe(true);
  });
});
