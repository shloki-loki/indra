import { type Card, type Suit, rankLabel } from '@indra/engine';

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const isRed = (card: Card): boolean => card.suit === 'H' || card.suit === 'D';
export const cardName = (card: Card): string => `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;

/** Half-points → "12½", "−3", "0". */
export function pts(halves: number): string {
  const sign = halves < 0 ? '−' : '';
  const abs = Math.abs(halves);
  const whole = Math.floor(abs / 2);
  const half = abs % 2 === 1;
  if (whole === 0 && half) return `${sign}½`;
  return `${sign}${whole}${half ? '½' : ''}`;
}

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };

export type SortMode = 'suit' | 'rank';

/** 2s go to the right end (they're your wild cards). Aces sort high. */
export function sortHand(cards: readonly Card[], mode: SortMode): Card[] {
  const r = (c: Card) => (c.rank === 1 ? 14 : c.rank);
  return [...cards].sort((a, b) => {
    const wa = a.rank === 2 ? 1 : 0;
    const wb = b.rank === 2 ? 1 : 0;
    if (wa !== wb) return wa - wb;
    if (mode === 'suit') return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || r(a) - r(b);
    return r(a) - r(b) || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
  });
}
