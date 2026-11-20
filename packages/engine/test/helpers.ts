import { type Card, parseCard } from '../src/cards';
import type { RoundState } from '../src/round';

export const cards = (codes: string): Card[] => codes.trim().split(/\s+/).map(parseCard);
export const ids = (codes: string): string[] => cards(codes).map((c) => c.id);

/** Build a round directly from card codes (top of a pile = last code). */
export function makeRound(opts: {
  players?: 2 | 4;
  hands: string[];
  pit?: string;
  discard?: string;
  indra?: string;
  turn?: number;
  phase?: RoundState['phase'];
  openingRequired?: boolean[];
}): RoundState {
  const players = opts.players ?? 2;
  return {
    players,
    phase: opts.phase ?? 'draw',
    turn: opts.turn ?? 0,
    hands: opts.hands.map((h) => (h.trim() ? cards(h) : [])),
    pit: opts.pit ? cards(opts.pit) : [],
    discard: opts.discard ? cards(opts.discard) : [],
    indra: opts.indra ? cards(opts.indra) : [],
    indraHolder: null,
    indraTurn: false,
    melds: [],
    openingRequired: opts.openingRequired ?? [false, false],
    opened: [false, false],
    shows: [],
    pickups: [],
    nextMeldId: 1,
    seed: 42,
  };
}
