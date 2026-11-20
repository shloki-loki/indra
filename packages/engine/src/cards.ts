/**
 * Cards, decks and card values.
 *
 * All points inside the engine are stored in HALF-POINTS (integers) so that
 * ½-point cards never cause floating-point drift. Use `toPoints` for display.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

/** rank: 1 = Ace, 2..10, 11 = J, 12 = Q, 13 = K */
export interface Card {
  readonly id: string;
  readonly suit: Suit;
  readonly rank: number;
}

const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function rankLabel(rank: number): string {
  return RANK_LABELS[rank];
}

/** Two decks are in play, so every card exists as copy 'a' and copy 'b'. */
export function makeCard(rank: number, suit: Suit, copy: 'a' | 'b' = 'a'): Card {
  return { id: `${RANK_LABELS[rank]}${suit}${copy}`, suit, rank };
}

export function makeDoubleDeck(): Card[] {
  const deck: Card[] = [];
  for (const copy of ['a', 'b'] as const) {
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) deck.push(makeCard(rank, suit, copy));
    }
  }
  return deck;
}

/** Parse "7H", "10S", "AD"; append ' for the second copy ("7H'"). */
export function parseCard(code: string): Card {
  const copy = code.endsWith("'") ? 'b' : 'a';
  const body = copy === 'b' ? code.slice(0, -1) : code;
  const suit = body.slice(-1) as Suit;
  const rank = RANK_LABELS.indexOf(body.slice(0, -1));
  if (rank < 1 || !SUITS.includes(suit)) throw new Error(`Bad card code: ${code}`);
  return makeCard(rank, suit, copy);
}

export const isTwo = (card: Card): boolean => card.rank === 2;

/** Card value in half-points: 3–7 = ½, 8–K = 1, 2 = 1, A = 1½. */
export function cardValue(card: Card): number {
  if (card.rank === 1) return 3;
  if (card.rank === 2) return 2;
  if (card.rank <= 7) return 1;
  return 2;
}

export function cardsValue(cards: readonly Card[]): number {
  return cards.reduce((sum, c) => sum + cardValue(c), 0);
}

/** Half-points → points (e.g. 7 → 3.5). */
export const toPoints = (halves: number): number => halves / 2;
/** Points → half-points (e.g. 10 → 20). */
export const halves = (points: number): number => Math.round(points * 2);
