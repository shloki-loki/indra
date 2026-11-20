import { describe, expect, it } from 'vitest';
import { cardsValue, makeDoubleDeck } from '../src/cards';
import { type RunShape, addOptions, meldBonus, newMeldOptions, rankAtPosition, readSet, runLayouts } from '../src/melds';
import { cards } from './helpers';

const runRanks = (r: RunShape) => r.slots.map((_, k) => rankAtPosition(r.start + k));

describe('deck and values', () => {
  it('has 104 unique cards worth 88 points', () => {
    const deck = makeDoubleDeck();
    expect(deck).toHaveLength(104);
    expect(new Set(deck.map((c) => c.id)).size).toBe(104);
    expect(cardsValue(deck)).toBe(176); // half-points
  });

  it('values: 3-7 = ½, 8-K = 1, 2 = 1, A = 1½', () => {
    expect(cardsValue(cards('3H 7S'))).toBe(2);
    expect(cardsValue(cards('8H KS'))).toBe(4);
    expect(cardsValue(cards('2C'))).toBe(2);
    expect(cardsValue(cards('AD'))).toBe(3);
  });
});

describe('sets', () => {
  it('accepts same rank in any suits, duplicates included', () => {
    expect(readSet(cards('7S 7H 7D'))).not.toBeNull();
    expect(readSet(cards("7H 7H' 7S"))).not.toBeNull();
  });
  it('accepts one joker', () => {
    expect(readSet(cards('7S 7H 2C'))?.jokerId).toBe('2Ca');
  });
  it('rejects two jokers and mixed ranks', () => {
    expect(readSet(cards('7S 7H 2C 2D'))).toBeNull();
    expect(readSet(cards('7S 8H 7D'))).toBeNull();
  });
  it('needs at least 3 cards for a new meld', () => {
    expect(newMeldOptions(cards('7S 7H'))).toHaveLength(0);
  });
});

describe('runs', () => {
  it('accepts a same-suit sequence', () => {
    const [r] = runLayouts(cards('5H 6H 7H 8H 9H'));
    expect(r.jokerId).toBeNull();
    expect(runRanks(r)).toEqual([5, 6, 7, 8, 9]);
  });
  it('rejects mixed suits', () => {
    expect(runLayouts(cards('5H 6S 7H'))).toHaveLength(0);
  });
  it('ace can be high or low', () => {
    expect(runLayouts(cards('QH KH AH'))).toHaveLength(1);
    const [low] = runLayouts(cards('AH 2H 3H'));
    expect(low.jokerId).toBeNull(); // 2♥ is a real 2 here
  });
  it('does not wrap around K-A-2', () => {
    expect(runLayouts(cards('KH AH 2H 3H'))).toHaveLength(0);
  });
  it('allows one real 2 plus one joker 2', () => {
    const [r] = runLayouts(cards('AH 2H 3H 4H 5H 6H 2C'));
    expect(r.jokerId).toBe('2Ca');
    expect(runRanks(r)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('rejects two jokers in one run', () => {
    expect(runLayouts(cards('5H 2C 2S 8H'))).toHaveLength(0);
  });
  it('a joker at an end can stand for either neighbour', () => {
    const layouts = runLayouts(cards('7S 8S 2D'));
    expect(layouts.map((r) => r.start)).toEqual([5, 6]); // 6-7-8 or 7-8-9
  });
  it('a full A-to-A run is 14 cards', () => {
    expect(runLayouts(cards("AH 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH'"))).toHaveLength(1);
  });
});

describe('adding and swapping', () => {
  it('extends a run at either end', () => {
    const [run] = runLayouts(cards('5H 6H 7H'));
    expect(addOptions(run, cards('4H'))).toHaveLength(1);
    expect(addOptions(run, cards('8H 9H'))).toHaveLength(1);
    expect(addOptions(run, cards('9H'))).toHaveLength(0);
    expect(addOptions(run, cards('8S'))).toHaveLength(0);
  });

  it('swapping the real card frees the joker to either end (7-2-9 + 8)', () => {
    const [run] = runLayouts(cards('7S 2D 9S'));
    expect(runRanks(run)).toEqual([7, 8, 9]);
    const options = addOptions(run, cards('8S')) as RunShape[];
    expect(options.map(runRanks)).toEqual([
      [6, 7, 8, 9],
      [7, 8, 9, 10],
    ]);
    expect(options.every((o) => o.jokerId === '2Da')).toBe(true); // joker stays on the table
  });

  it('an unswapped joker keeps its place', () => {
    const [run] = runLayouts(cards('7S 8S 2D'), new Map([['2Da', 8]])); // 7-8-(9)
    const options = addOptions(run, cards('6S')) as RunShape[];
    expect(options.map(runRanks)).toEqual([[6, 7, 8, 9]]);
  });

  it('cannot add a second joker', () => {
    const [run] = runLayouts(cards('7S 2D 9S'));
    expect(addOptions(run, cards('2C'))).toHaveLength(0);
    const set = readSet(cards('7S 7H 2C'))!;
    expect(addOptions(set, cards('2D'))).toHaveLength(0);
    expect(addOptions(set, cards('7D'))).toHaveLength(1);
  });
});

describe('7-card bonus', () => {
  it('pure 7+ meld = 20, impure = 10, short = 0', () => {
    expect(meldBonus(runLayouts(cards('3H 4H 5H 6H 7H 8H 9H'))[0])).toBe(40);
    expect(meldBonus(runLayouts(cards('3H 4H 5H 2C 7H 8H 9H'))[0])).toBe(20);
    expect(meldBonus(runLayouts(cards('3H 4H 5H'))[0])).toBe(0);
  });
  it('sets of 7+ also get the bonus', () => {
    expect(meldBonus(readSet(cards("9S 9H 9D 9C 9S' 9H' 9D'"))!)).toBe(40);
    expect(meldBonus(readSet(cards("9S 9H 9D 9C 9S' 9H' 2C"))!)).toBe(20);
  });
});
