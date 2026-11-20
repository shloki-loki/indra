/**
 * One round of INDRA: deal, turns (draw → play → discard), shows, the Indra deck,
 * and round scoring. Pure functions over plain, JSON-serialisable state.
 */
import { type Card, cardsValue, makeDoubleDeck } from './cards';
import {
  type Meld,
  type MeldShape,
  MIN_MELD,
  addOptions,
  chooseOption,
  meldBonus,
  meldCards,
  meldValue,
  newMeldOptions,
  describeMeld,
} from './melds';
import { shuffle } from './rng';

export const HAND_SIZE = 13;
export const INDRA_SIZE = 13;
/** Half-points. */
export const SHOW_BONUS = 20;
export const INDRA_BONUS = 20;
export const OPENING_MINIMUM = 20;

export type Phase = 'draw' | 'play' | 'over';

export interface RoundState {
  players: 2 | 4;
  phase: Phase;
  /** Seat whose turn it is. */
  turn: number;
  hands: Card[][];
  /** Draw pile; the top card is the LAST element. */
  pit: Card[];
  /** Discard pile; the top card is the LAST element. */
  discard: Card[];
  indra: Card[];
  indraHolder: number | null;
  /** True during the bonus turn right after taking Indra (no draw, no show). */
  indraTurn: boolean;
  melds: Meld[];
  /** Per side: must the first lay-down this round be worth 10+? */
  openingRequired: boolean[];
  /** Per side: has the side laid down anything this round? */
  opened: boolean[];
  /** Seats in the order they showed. */
  shows: number[];
  /** Public log of cards taken from the discard pile (everyone saw them). */
  pickups: { seat: number; cardId: string }[];
  nextMeldId: number;
  seed: number;
}

export type Action =
  | { type: 'draw'; from: 'pit' | 'discard' }
  | { type: 'meld'; melds: { cardIds: string[]; start?: number }[] }
  | { type: 'add'; meldId: string; cardIds: string[]; start?: number }
  | { type: 'discard'; cardId: string };

export type Result = { ok: true; state: RoundState } | { ok: false; error: string };

export const sideOf = (seat: number): number => seat % 2;
export const seatsOfSide = (players: number, side: number): number[] =>
  players === 4 ? [side, side + 2] : [side];

const fail = (error: string): Result => ({ ok: false, error });

export interface NewRoundOptions {
  players: 2 | 4;
  starter: number;
  seed: number;
  openingRequired?: boolean[];
}

export function newRound({ players, starter, seed, openingRequired = [false, false] }: NewRoundOptions): RoundState {
  const shuffled = shuffle(makeDoubleDeck(), seed);
  const deck = shuffled.items;
  const hands: Card[][] = Array.from({ length: players }, () => []);
  for (let i = 0; i < HAND_SIZE * players; i++) hands[(starter + i) % players].push(deck.pop()!);
  const indra = deck.splice(deck.length - INDRA_SIZE, INDRA_SIZE);
  const discard = [deck.pop()!];
  return {
    players,
    phase: 'draw',
    turn: starter,
    hands,
    pit: deck,
    discard,
    indra,
    indraHolder: null,
    indraTurn: false,
    melds: [],
    openingRequired: [...openingRequired],
    opened: [false, false],
    shows: [],
    pickups: [],
    nextMeldId: 1,
    seed: shuffled.seed,
  };
}

function takeFromHand(hand: Card[], ids: readonly string[]): Card[] | null {
  if (new Set(ids).size !== ids.length) return null;
  const taken: Card[] = [];
  for (const id of ids) {
    const card = hand.find((c) => c.id === id);
    if (!card) return null;
    taken.push(card);
  }
  return taken;
}

function removeFromHand(hand: Card[], ids: readonly string[]): Card[] {
  const drop = new Set(ids);
  return hand.filter((c) => !drop.has(c.id));
}

/** Cards a player must keep after laying down: 1 to discard, 2 on the Indra turn (no showing). */
function minimumKept(s: RoundState): number {
  return s.indraTurn ? 2 : 1;
}

function keepError(s: RoundState): string {
  return s.indraTurn
    ? "You can't show on the turn you take Indra; keep at least one card after your discard."
    : 'Keep one card to discard: you must finish your turn with a discard.';
}

export function applyAction(state: RoundState, seat: number, action: Action): Result {
  if (state.phase === 'over') return fail('The round is over.');
  if (seat !== state.turn) return fail('It is not your turn.');
  const s: RoundState = structuredClone(state);
  const side = sideOf(seat);
  const hand = s.hands[seat];

  switch (action.type) {
    case 'draw': {
      if (s.phase !== 'draw') return fail('You have already drawn this turn.');
      if (action.from === 'discard') {
        const card = s.discard.pop();
        if (!card) return fail('The discard pile is empty.');
        hand.push(card);
        s.pickups.push({ seat, cardId: card.id });
      } else {
        if (s.pit.length === 0) refillPit(s);
        const card = s.pit.pop();
        if (!card) return fail('The pit deck is empty; take the top discard.');
        hand.push(card);
      }
      s.phase = 'play';
      return { ok: true, state: s };
    }

    case 'meld': {
      if (s.phase !== 'play') return fail('Draw a card first.');
      if (action.melds.length === 0) return fail('Nothing to lay down.');
      const allIds = action.melds.flatMap((m) => m.cardIds);
      if (!takeFromHand(hand, allIds)) return fail('Those cards are not all in your hand.');
      const shapes: MeldShape[] = [];
      for (const m of action.melds) {
        if (m.cardIds.length < MIN_MELD) return fail(`A meld needs at least ${MIN_MELD} cards.`);
        const cards = takeFromHand(hand, m.cardIds)!;
        const shape = chooseOption(newMeldOptions(cards), m.start);
        if (!shape) return fail('Those cards do not make a valid set or run.');
        shapes.push(shape);
      }
      if (s.openingRequired[side] && !s.opened[side]) {
        const total = shapes.reduce((sum, m) => sum + meldValue(m), 0);
        if (total < OPENING_MINIMUM) {
          return fail(`Your opening lay-down must be worth at least 10 points (this one is ${total / 2}).`);
        }
      }
      const rest = removeFromHand(hand, allIds);
      if (rest.length < minimumKept(s)) return fail(keepError(s));
      s.hands[seat] = rest;
      for (const shape of shapes) s.melds.push({ ...shape, id: `m${s.nextMeldId++}`, side, owner: seat });
      s.opened[side] = true;
      return { ok: true, state: s };
    }

    case 'add': {
      if (s.phase !== 'play') return fail('Draw a card first.');
      const index = s.melds.findIndex((m) => m.id === action.meldId);
      if (index < 0) return fail('No such meld.');
      const meld = s.melds[index];
      if (meld.side !== side) return fail("You can only add to your own side's melds.");
      if (s.openingRequired[side] && !s.opened[side]) return fail('Your side must open with 10 points first.');
      const cards = takeFromHand(hand, action.cardIds);
      if (!cards || cards.length === 0) return fail('Those cards are not all in your hand.');
      const shape = chooseOption(addOptions(meld, cards), action.start);
      if (!shape) return fail('Those cards do not fit that meld.');
      const rest = removeFromHand(hand, action.cardIds);
      if (rest.length < minimumKept(s)) return fail(keepError(s));
      s.hands[seat] = rest;
      s.melds[index] = { ...shape, id: meld.id, side: meld.side, owner: meld.owner };
      return { ok: true, state: s };
    }

    case 'discard': {
      if (s.phase !== 'play') return fail('Draw a card first.');
      const card = hand.find((c) => c.id === action.cardId);
      if (!card) return fail('That card is not in your hand.');
      const rest = removeFromHand(hand, [card.id]);
      if (rest.length === 0 && s.indraTurn) return fail(keepError(s));
      s.hands[seat] = rest;
      s.discard.push(card);

      if (rest.length > 0) {
        s.indraTurn = false;
        s.turn = (s.turn + 1) % s.players;
        s.phase = 'draw';
        return { ok: true, state: s };
      }

      // Show!
      s.shows.push(seat);
      if (s.indraHolder === null) {
        s.indraHolder = seat;
        s.hands[seat] = s.indra;
        s.indra = [];
        s.indraTurn = true;
        s.phase = 'play'; // same player plays on with the Indra cards, no draw
      } else {
        s.phase = 'over';
      }
      return { ok: true, state: s };
    }
  }
}

/** Pit deck empty: shuffle the discard pile (except its top card) into a new pit deck. */
function refillPit(s: RoundState): void {
  if (s.discard.length <= 1) return;
  const top = s.discard.pop()!;
  const shuffled = shuffle(s.discard, s.seed);
  s.pit = shuffled.items;
  s.seed = shuffled.seed;
  s.discard = [top];
}

// ---------------------------------------------------------------- scoring

export interface SideScore {
  /** Value of the side's cards on the table. */
  table: number;
  /** 7-card meld bonuses + shows + Indra. */
  bonus: number;
  /** Value of cards still in the side's hands (subtracted). */
  hand: number;
  /** table + bonus − hand. */
  total: number;
  /** table + bonus: the live counter shown during play. */
  live: number;
}

export function scoreRound(s: RoundState): SideScore[] {
  return [0, 1].map((side) => {
    const melds = s.melds.filter((m) => m.side === side);
    const table = melds.reduce((sum, m) => sum + cardsValue(meldCards(m)), 0);
    let bonus = melds.reduce((sum, m) => sum + meldBonus(m), 0);
    bonus += s.shows.filter((seat) => sideOf(seat) === side).length * SHOW_BONUS;
    if (s.indraHolder !== null && sideOf(s.indraHolder) === side) bonus += INDRA_BONUS;
    const hand = seatsOfSide(s.players, side).reduce((sum, seat) => sum + cardsValue(s.hands[seat]), 0);
    return { table, bonus, hand, total: table + bonus - hand, live: table + bonus };
  });
}

export interface BonusItem {
  side: number;
  /** The seat that earned it (the meld's owner for 7-card bonuses). */
  seat: number;
  kind: 'show' | 'indra' | 'meld';
  /** Plain description, e.g. "Showed first", "Took the Indra deck", "run 3♥–9♥, 7 cards, no wild 2". */
  label: string;
  /** Half-points. */
  points: number;
}

/** Every bonus in the round, one line each, so players can see exactly where points came from. */
export function bonusBreakdown(s: RoundState): BonusItem[] {
  const items: BonusItem[] = [];
  s.shows.forEach((seat, i) => {
    items.push({ side: sideOf(seat), seat, kind: 'show', label: i === 0 ? 'Showed first' : 'Showed second and ended the round', points: SHOW_BONUS });
    if (i === 0 && s.indraHolder === seat) {
      items.push({ side: sideOf(seat), seat, kind: 'indra', label: 'Took the Indra deck', points: INDRA_BONUS });
    }
  });
  for (const m of s.melds) {
    const bonus = meldBonus(m);
    if (!bonus) continue;
    const n = meldCards(m).length;
    items.push({
      side: m.side,
      seat: m.owner,
      kind: 'meld',
      label: `${describeMeld(m)}: ${n} cards ${m.jokerId ? 'with a wild 2' : 'with no wild 2'}`,
      points: bonus,
    });
  }
  return items;
}

// ---------------------------------------------------------------- hidden information

export interface RoundView extends Omit<RoundState, 'hands' | 'pit' | 'indra' | 'seed'> {
  you: number;
  hand: Card[];
  handCounts: number[];
  pitCount: number;
  indraCount: number;
}

/** What one seat is allowed to see. Other hands, the pit and Indra stay hidden. */
export function viewFor(s: RoundState, seat: number): RoundView {
  const { hands, pit, indra, seed: _seed, ...rest } = s;
  return {
    ...structuredClone(rest),
    you: seat,
    hand: structuredClone(hands[seat]),
    handCounts: hands.map((h) => h.length),
    pitCount: pit.length,
    indraCount: indra.length,
  };
}

/** Total cards across all zones (should always be 104). */
export function countCards(s: RoundState): number {
  return (
    s.hands.reduce((n, h) => n + h.length, 0) +
    s.pit.length +
    s.discard.length +
    s.indra.length +
    s.melds.reduce((n, m) => n + meldCards(m).length, 0)
  );
}
