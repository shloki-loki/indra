/** Hiding cards a seat may not see, and turning the table so "you" sit at seat 0. */
import { type Card, type MatchState, type RoundState } from '@indra/engine';

/** A face-down placeholder. Its id says nothing about the real card. */
export const hiddenCard = (id: string): Card => ({ id, suit: 'S', rank: 0 });
export const isHidden = (c: Card): boolean => c.rank === 0;

/**
 * The match as `seat` may see it: other hands, the pit and Indra become face-down placeholders, and
 * the random seeds (which would predict the deck) are dropped. Once a round is over, every hand is
 * shown, as at a real table; the pit and Indra stay hidden.
 */
export function redactMatch(m: MatchState, seat: number | null): MatchState {
  const r = m.round;
  const reveal = m.status !== 'playing';
  const round: RoundState = {
    ...r,
    hands: r.hands.map((h, i) => (reveal || i === seat ? h : h.map((_, k) => hiddenCard(`h${i}-${k}`)))),
    pit: r.pit.map((_, k) => hiddenCard(`p${k}`)),
    indra: r.indra.map((_, k) => hiddenCard(`i${k}`)),
    seed: 0,
  };
  return { ...m, round, seed: 0 };
}

/**
 * Renumber seats so that `me` becomes seat 0 (and my side becomes side 0). The table UI is drawn
 * from seat 0's point of view, so this lets every player use it unchanged.
 */
export function rotateMatch(m: MatchState, me: number): MatchState {
  const n = m.settings.players;
  if (me === 0) return m;
  const seat = (s: number) => (s - me + n) % n;
  const flip = me % 2 === 1;
  const side = (x: number) => (flip ? 1 - x : x);
  const bySide = <T,>(pair: T[]): T[] => (flip ? [pair[1], pair[0]] : pair);
  const r = m.round;
  const hands: Card[][] = [];
  r.hands.forEach((h, s) => (hands[seat(s)] = h));
  return {
    ...m,
    scores: bySide(m.scores),
    history: m.history.map((h) => ({ starter: seat(h.starter), scores: bySide(h.scores) })),
    starter: seat(m.starter),
    winner: m.winner === null ? null : side(m.winner),
    round: {
      ...r,
      hands,
      turn: seat(r.turn),
      indraHolder: r.indraHolder === null ? null : seat(r.indraHolder),
      melds: r.melds.map((x) => ({ ...x, side: side(x.side), owner: seat(x.owner) })),
      openingRequired: bySide(r.openingRequired),
      opened: bySide(r.opened),
      shows: r.shows.map(seat),
      pickups: r.pickups.map((p) => ({ ...p, seat: seat(p.seat) })),
    },
  };
}

/** Put a per-seat list in the rotated order (index 0 = `me`). */
export function rotateSeats<T>(items: readonly T[], me: number, players: number): T[] {
  return Array.from({ length: players }, (_, i) => items[(i + me) % players]);
}
