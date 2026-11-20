/**
 * A match: rounds in sequence, a running score sheet, opening rule, target and winner.
 */
import { randomInt } from './rng';
import {
  type Action,
  type RoundState,
  type SideScore,
  applyAction,
  newRound,
  scoreRound,
  seatsOfSide,
} from './round';

/** Half-points: the 10-point opening rule starts at 100 match points. */
export const OPENING_THRESHOLD = 200;

export interface MatchSettings {
  players: 2 | 4;
  /** Points to win (default 200), or null for an open-ended score sheet. */
  target: number | null;
  /** The 10-point opening rule after 100 points. */
  openingRule: boolean;
}

export const DEFAULT_SETTINGS: MatchSettings = { players: 2, target: 200, openingRule: true };

export type MatchStatus = 'playing' | 'round-over' | 'match-over';

export interface RoundRecord {
  starter: number;
  scores: SideScore[];
}

export interface MatchState {
  settings: MatchSettings;
  status: MatchStatus;
  /** Running totals per side, in half-points. */
  scores: number[];
  history: RoundRecord[];
  round: RoundState;
  starter: number;
  winner: number | null;
  seed: number;
}

export type MatchResult = { ok: true; state: MatchState } | { ok: false; error: string };

function openingFor(settings: MatchSettings, scores: number[]): boolean[] {
  return scores.map((score) => settings.openingRule && score >= OPENING_THRESHOLD);
}

export function newMatch(settings: MatchSettings, seed: number): MatchState {
  const pick = randomInt(settings.players, seed);
  const scores = [0, 0];
  return {
    settings,
    status: 'playing',
    scores,
    history: [],
    round: newRound({ players: settings.players, starter: pick.value, seed: pick.seed, openingRequired: openingFor(settings, scores) }),
    starter: pick.value,
    winner: null,
    seed: pick.seed + 1,
  };
}

export function applyMatchAction(m: MatchState, seat: number, action: Action): MatchResult {
  if (m.status !== 'playing') return { ok: false, error: 'No round in progress.' };
  const result = applyAction(m.round, seat, action);
  if (!result.ok) return result;
  const next: MatchState = { ...m, round: result.state };
  return { ok: true, state: result.state.phase === 'over' ? closeRound(next) : next };
}

/** Score a finished round onto the sheet and decide whether the match is over. */
export function closeRound(m: MatchState): MatchState {
  const scores = scoreRound(m.round);
  const totals = m.scores.map((t, side) => t + scores[side].total);
  let winner: number | null = null;
  const target = m.settings.target;
  if (target !== null && totals.some((t) => t >= target * 2) && totals[0] !== totals[1]) {
    winner = totals[0] > totals[1] ? 0 : 1;
  }
  return {
    ...m,
    scores: totals,
    history: [...m.history, { starter: m.starter, scores }],
    status: winner === null ? 'round-over' : 'match-over',
    winner,
  };
}

/** Deal the next round. The winner of the last round starts it. */
export function startNextRound(m: MatchState): MatchState {
  if (m.status !== 'round-over') return m;
  const last = m.history[m.history.length - 1].scores;
  let seed = m.seed;
  let starter: number;
  if (last[0].total === last[1].total) {
    starter = (m.starter + 1) % m.settings.players;
  } else {
    const side = last[0].total > last[1].total ? 0 : 1;
    const seats = seatsOfSide(m.settings.players, side);
    const pick = randomInt(seats.length, seed);
    seed = pick.seed;
    starter = seats[pick.value];
  }
  return {
    ...m,
    status: 'playing',
    starter,
    round: newRound({ players: m.settings.players, starter, seed, openingRequired: openingFor(m.settings, m.scores) }),
    seed: seed + 1,
  };
}
