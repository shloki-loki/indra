/**
 * Meld rules: sets, runs, jokers (2s), joker swaps and the 7-card bonus.
 *
 * Run positions: 0 = low ace, 1..12 = ranks 2..K, 13 = high ace.
 * A card is NATURAL at a position when its suit is the run's suit and its rank
 * is the rank of that position. Any other card in a run must be a 2 (a joker),
 * and a meld may hold at most one joker.
 */
import { type Card, type Suit, cardsValue, isTwo } from './cards';

export const MIN_MELD = 3;
export const RUN_POSITIONS = 14;
export const BONUS_LENGTH = 7;
/** Half-points: pure 7+ meld = 20 pts, impure = 10 pts. */
export const PURE_BONUS = 40;
export const IMPURE_BONUS = 20;

export interface SetShape {
  kind: 'set';
  rank: number;
  cards: Card[];
  jokerId: string | null;
}

export interface RunShape {
  kind: 'run';
  suit: Suit;
  /** Position of slots[0]. */
  start: number;
  slots: Card[];
  jokerId: string | null;
}

export type MeldShape = SetShape | RunShape;
export type Meld = MeldShape & { id: string; side: number; owner: number };

export function rankAtPosition(pos: number): number {
  return pos === 0 || pos === 13 ? 1 : pos + 1;
}

export function meldCards(m: MeldShape): Card[] {
  return m.kind === 'set' ? m.cards : m.slots;
}

export function meldBonus(m: MeldShape): number {
  if (meldCards(m).length < BONUS_LENGTH) return 0;
  return m.jokerId ? IMPURE_BONUS : PURE_BONUS;
}

/** Cards + 7-card bonus, in half-points. */
export function meldValue(m: MeldShape): number {
  return cardsValue(meldCards(m)) + meldBonus(m);
}

// ---------------------------------------------------------------- sets

export function readSet(cards: readonly Card[]): SetShape | null {
  if (cards.length === 0) return null;
  const twos = cards.filter(isTwo);
  const others = cards.filter((c) => !isTwo(c));
  if (others.length === 0) return { kind: 'set', rank: 2, cards: [...cards], jokerId: null };
  const rank = others[0].rank;
  if (others.some((c) => c.rank !== rank)) return null;
  if (twos.length > 1) return null;
  return { kind: 'set', rank, cards: [...others, ...twos], jokerId: twos[0]?.id ?? null };
}

// ---------------------------------------------------------------- runs

function naturalPositions(card: Card, suit: Suit): number[] {
  if (card.suit !== suit) return [];
  if (card.rank === 1) return [0, 13];
  return [card.rank - 1];
}

function isNaturalAt(card: Card, suit: Suit, pos: number): boolean {
  return card.suit === suit && card.rank === rankAtPosition(pos);
}

/**
 * Every valid way to lay `cards` out as one run.
 * `pinned` fixes some cards to a position (used when adding to an existing run).
 */
export function runLayouts(cards: readonly Card[], pinned?: ReadonlyMap<string, number>): RunShape[] {
  const n = cards.length;
  if (n === 0 || n > RUN_POSITIONS) return [];
  const anchor = cards.find((c) => !isTwo(c));
  if (!anchor) return [];
  const suit = anchor.suit;
  if (cards.some((c) => !isTwo(c) && c.suit !== suit)) return [];
  const twos = cards.filter(isTwo);
  if (twos.length > 2) return []; // at most one real 2 + one joker

  const results: RunShape[] = [];
  const seen = new Set<string>();

  for (let start = 0; start + n <= RUN_POSITIONS; start++) {
    for (const joker of [null, ...twos]) {
      const naturals = cards.filter((c) => c !== joker);
      const slots: (Card | null)[] = new Array(n).fill(null);

      const place = (i: number): void => {
        if (i === naturals.length) {
          const free = slots.flatMap((c, k) => (c === null ? [k] : []));
          if (joker === null ? free.length !== 0 : free.length !== 1) return;
          const filled = slots.slice();
          if (joker) {
            const pos = start + free[0];
            if (isNaturalAt(joker, suit, pos)) return; // that's the jokerless layout
            const pin = pinned?.get(joker.id);
            if (pin !== undefined && pin !== pos) return;
            filled[free[0]] = joker;
          }
          const key = `${start}|${filled.map((c) => c!.id.slice(0, -1)).join(",")}`; // ignore which deck copy
          if (seen.has(key)) return;
          seen.add(key);
          results.push({ kind: 'run', suit, start, slots: filled as Card[], jokerId: joker?.id ?? null });
          return;
        }
        const card = naturals[i];
        const pin = pinned?.get(card.id);
        for (const pos of naturalPositions(card, suit)) {
          const k = pos - start;
          if (k < 0 || k >= n || slots[k] !== null) continue;
          if (pin !== undefined && pin !== pos) continue;
          slots[k] = card;
          place(i + 1);
          slots[k] = null;
        }
      };
      place(0);
    }
  }
  // Prefer jokerless layouts, then the lowest start.
  return results.sort((a, b) => Number(!!a.jokerId) - Number(!!b.jokerId) || a.start - b.start);
}

// ---------------------------------------------------------------- reading melds

/** All valid shapes for a brand-new meld (set and/or run layouts). */
export function newMeldOptions(cards: readonly Card[]): MeldShape[] {
  if (cards.length < MIN_MELD) return [];
  const options: MeldShape[] = [];
  const set = readSet(cards);
  if (set) options.push(set);
  options.push(...runLayouts(cards));
  return options;
}

/** All valid shapes after adding `added` to `meld` (existing cards keep their places). */
export function addOptions(meld: MeldShape, added: readonly Card[]): MeldShape[] {
  if (added.length === 0) return [];
  if (meld.kind === 'set') {
    const next = readSet([...meld.cards, ...added]);
    return next && next.rank === meld.rank ? [next] : [];
  }
  const pinned = new Map<string, number>();
  meld.slots.forEach((card, k) => {
    const pos = meld.start + k;
    if (card.id === meld.jokerId) {
      // The joker only moves if one of the new cards is the real card it stands for.
      const swapped = added.some((c) => isNaturalAt(c, meld.suit, pos));
      if (!swapped) pinned.set(card.id, pos);
    } else {
      pinned.set(card.id, pos);
    }
  });
  return runLayouts([...meld.slots, ...added], pinned).filter((r) => r.suit === meld.suit);
}

/** Pick an option, honouring an explicit run start when given. */
export function chooseOption(options: MeldShape[], start?: number): MeldShape | null {
  if (start === undefined) return options[0] ?? null;
  return options.find((o) => o.kind === 'run' && o.start === start) ?? null;
}

/** Human-readable description of a meld shape, e.g. "run 5♥–9♥". */
export function describeMeld(m: MeldShape): string {
  const SYM: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const label = (r: number) => ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][r];
  if (m.kind === 'set') return `set of ${label(m.rank)}s`;
  const lo = label(rankAtPosition(m.start));
  const hi = label(rankAtPosition(m.start + m.slots.length - 1));
  return `run ${lo}${SYM[m.suit]}–${hi}${SYM[m.suit]}`;
}
