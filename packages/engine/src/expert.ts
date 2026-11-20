/**
 * Expert computer player: decides by simulation instead of rules of thumb.
 *
 * At each decision (which pile to draw from; what to lay down and what to throw):
 *   1. List a handful of sensible options (built from the Advanced bot's ideas plus alternatives:
 *      hold melds back, lay everything down, throw a different card).
 *   2. Imagine the cards it cannot see many different ways ("determinizations"): every unseen
 *      card is dealt at random into the other hands, the pit and Indra, keeping each zone's size
 *      and keeping cards an opponent is known to have picked up from the discard pile in their hand.
 *   3. For each imagined deal, play every option and then the whole rest of the round with fast
 *      Advanced-level players, and score it (our side's round total minus theirs).
 *   4. Pick the option with the best average. Every option is tried on the SAME imagined deals,
 *      so luck cancels out and only the decision makes the difference.
 *
 * It only reads what a player in its seat can see: the sampling seed comes from visible facts,
 * never from the hidden cards or the game's own random seed.
 */
import { type Card, makeDoubleDeck } from './cards';
import { meldCards } from './melds';
import { random, shuffle } from './rng';
import { type Action, type RoundState, applyAction, cloneRound, scoreRound, sideOf } from './round';
import { type HeuristicLevel, chooseAdd, chooseLayDown, discardRanking, planBotTurn } from './bot';

export interface ExpertOptions {
  /** Simulated rounds to spend on one decision (more = stronger and slower). */
  sims?: number;
  /** Extra salt for the sampling seed. */
  salt?: number;
  /** How the simulated players play. */
  rolloutLevel?: HeuristicLevel;
}

export const EXPERT_DEFAULTS = { sims: 300, rolloutLevel: 'advanced' as HeuristicLevel };

// ---------------------------------------------------------------- imagining the hidden cards

function hashVisible(s: RoundState, seat: number, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  const mix = (str: string) => {
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  };
  mix(s.hands[seat].map((c) => c.id).join(','));
  mix(s.discard.map((c) => c.id).join(','));
  mix(s.melds.map((m) => meldCards(m).map((c) => c.id).join('.')).join('|'));
  mix(`${seat}:${s.turn}:${s.phase}:${s.pit.length}:${s.indra.length}:${s.pickups.length}:${s.hands.map((x) => x.length).join(',')}`);
  return h | 0;
}

/** One random deal of the cards `seat` cannot see, consistent with everything it can see. */
export function determinize(s: RoundState, seat: number, seed: number): RoundState {
  const visible = new Set([...s.hands[seat], ...s.discard, ...s.melds.flatMap(meldCards)].map((c) => c.id));
  const hiddenCards = makeDoubleDeck().filter((c) => !visible.has(c.id));
  const byId = new Map(hiddenCards.map((c) => [c.id, c]));

  const hands: Card[][] = s.hands.map((h, i) => (i === seat ? h.slice() : []));
  // Cards an opponent (or partner) took from the discard pile and hasn't played are in their hand.
  for (let i = s.pickups.length - 1; i >= 0; i--) {
    const { seat: who, cardId } = s.pickups[i];
    const card = byId.get(cardId);
    if (who === seat || !card || hands[who].length >= s.hands[who].length) continue;
    hands[who].push(card);
    byId.delete(cardId);
  }

  const pool = shuffle([...byId.values()], seed);
  const rest = pool.items;
  let k = 0;
  for (let i = 0; i < hands.length; i++) {
    if (i === seat) continue;
    const need = s.hands[i].length - hands[i].length;
    hands[i].push(...rest.slice(k, (k += need)));
  }
  const pit = rest.slice(k, (k += s.pit.length));
  const indra = rest.slice(k, (k += s.indra.length));
  return { ...cloneRound(s), hands, pit, indra, seed: random(pool.seed).seed };
}

// ---------------------------------------------------------------- playing it out

function playOut(start: RoundState, level: HeuristicLevel): RoundState {
  let s = start;
  for (let turns = 0; s.phase !== 'over' && turns < 300; turns++) {
    const seat = s.turn;
    const plan = planBotTurn(s, seat, level);
    if (!plan.length) break;
    for (const a of plan) {
      const r = applyAction(s, seat, a);
      if (!r.ok) return s;
      s = r.state;
    }
  }
  return s;
}

/** Our side's round total minus theirs, in half-points. */
function margin(s: RoundState, side: number): number {
  const score = scoreRound(s);
  return score[side].total - score[1 - side].total;
}

function applyAll(s: RoundState, seat: number, actions: readonly Action[]): RoundState | null {
  let cur = s;
  for (const a of actions) {
    const r = applyAction(cur, seat, a);
    if (!r.ok) return null;
    cur = r.state;
  }
  return cur;
}

// ---------------------------------------------------------------- options

type MeldMode = 'advanced' | 'greedy' | 'adds-only' | 'hold';

function meldPhase(state: RoundState, seat: number, mode: MeldMode): { s: RoundState; actions: Action[] } {
  let s = state;
  const actions: Action[] = [];
  if (mode === 'hold') return { s, actions };
  for (let guard = 0; guard < 20; guard++) {
    let progressed = false;
    if (mode !== 'adds-only') {
      const groups = chooseLayDown(s, seat, mode === 'greedy' ? 'medium' : 'advanced');
      if (groups.length) {
        const a: Action = { type: 'meld', melds: groups.map((g) => ({ cardIds: g.map((c) => c.id) })) };
        const r = applyAction(s, seat, a);
        if (r.ok) {
          s = r.state;
          actions.push(a);
          progressed = true;
        }
      }
    }
    const add = chooseAdd(s, seat, 'advanced');
    if (add) {
      const r = applyAction(s, seat, add);
      if (r.ok) {
        s = r.state;
        actions.push(add);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return { s, actions };
}

const face = (c: Card) => `${c.rank}${c.suit}`;

/** Sensible ways to finish this turn (up to and including the discard). The first is Advanced's own choice. */
export function playOptions(s: RoundState, seat: number, avoidDiscardId?: string): Action[][] {
  const options: Action[][] = [];
  const seen = new Set<string>();
  for (const mode of ['advanced', 'greedy', 'adds-only', 'hold'] as MeldMode[]) {
    const { s: after, actions } = meldPhase(s, seat, mode);
    const ranked = discardRanking(after, seat, 'advanced');
    const faces = new Set<string>();
    let taken = 0;
    for (const card of ranked) {
      if (taken >= (mode === 'advanced' ? 3 : 2)) break;
      if (card.id === avoidDiscardId && ranked.length > 1) continue;
      if (faces.has(face(card))) continue;
      faces.add(face(card));
      const plan: Action[] = [...actions, { type: 'discard', cardId: card.id }];
      if (!applyAll(s, seat, plan)) continue;
      const key = JSON.stringify(plan);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(plan);
      taken++;
    }
  }
  return options;
}

// ---------------------------------------------------------------- choosing

/**
 * Score each option by playing it out on shared imagined deals. Starts wide, then spends the
 * remaining budget on the most promising few (successive halving).
 */
function pickBest(
  s: RoundState,
  seat: number,
  options: { evaluate: (det: RoundState) => RoundState | null }[],
  sims: number,
  level: HeuristicLevel,
  salt: number,
): number {
  if (options.length <= 1) return 0;
  const side = sideOf(seat);
  let seed = hashVisible(s, seat, salt);
  const dets: RoundState[] = [];
  const det = (i: number) => {
    while (dets.length <= i) {
      seed = random(seed).seed;
      dets.push(determinize(s, seat, seed));
    }
    return dets[i];
  };
  const totals = options.map(() => 0);
  const counts = options.map(() => 0);
  const run = (o: number, from: number, to: number) => {
    for (let i = from; i < to; i++) {
      const after = options[o].evaluate(det(i));
      totals[o] += after ? margin(playOut(after, level), side) : -1e4;
      counts[o]++;
    }
  };
  const mean = (o: number) => totals[o] / Math.max(1, counts[o]);

  let alive = options.map((_, i) => i);
  let used = 0;
  let depth = 0;
  while (alive.length > 1) {
    const rounds = Math.ceil(Math.log2(alive.length));
    const per = Math.max(4, Math.floor((sims - used) / (alive.length * Math.max(1, rounds))));
    for (const o of alive) run(o, depth, depth + per);
    used += per * alive.length;
    depth += per;
    if (used >= sims) break;
    alive = [...alive].sort((a, b) => mean(b) - mean(a) || a - b).slice(0, Math.ceil(alive.length / 2));
  }
  return [...alive].sort((a, b) => mean(b) - mean(a) || a - b)[0];
}

/** Plan the Expert's next actions, up to the point where it learns something new. */
export function planExpertTurn(state: RoundState, seat: number, opts: ExpertOptions = {}): Action[] {
  const sims = opts.sims ?? EXPERT_DEFAULTS.sims;
  const level = opts.rolloutLevel ?? EXPERT_DEFAULTS.rolloutLevel;
  const salt = opts.salt ?? 0;
  if (state.phase === 'over' || state.turn !== seat) return [];

  if (state.phase === 'draw') {
    const top = state.discard[state.discard.length - 1];
    const fromPit: Action = { type: 'draw', from: 'pit' };
    const fromDiscard: Action = { type: 'draw', from: 'discard' };
    const pitOk = applyAction(state, seat, fromPit).ok;
    const takeOk = !!top && state.hands[seat].length > 0 && applyAction(state, seat, fromDiscard).ok;
    if (!takeOk) return pitOk ? [fromPit] : [];

    // Taking the discard: the follow-up is known now, so plan the whole turn (never throw it straight back).
    const afterTake = applyAction(state, seat, fromDiscard);
    const takeOptions = afterTake.ok ? playOptions(afterTake.state, seat, top.id) : [];
    if (!pitOk) return [fromDiscard, ...(takeOptions[0] ?? [])];

    const choices = [
      { evaluate: (det: RoundState) => applyAll(det, seat, [fromPit, ...followUp(det, seat)]) },
      {
        evaluate: (det: RoundState) => {
          const r = applyAction(det, seat, fromDiscard);
          return r.ok ? applyAll(r.state, seat, advancedPlay(r.state, seat, top.id)) : null;
        },
      },
    ];
    const best = pickBest(state, seat, choices, Math.max(16, Math.round(sims * 0.5)), level, salt);
    if (best === 0) return [fromPit];
    if (!afterTake.ok) return [fromPit];
    return [fromDiscard, ...choosePlay(afterTake.state, seat, sims, level, salt, top.id)];
  }

  return choosePlay(state, seat, sims, level, salt);
}

/** What we'd do after a pit draw inside a simulation: Advanced's plan for the rest of the turn. */
function followUp(beforeDraw: RoundState, seat: number): Action[] {
  const r = applyAction(beforeDraw, seat, { type: 'draw', from: 'pit' });
  return r.ok ? advancedPlay(r.state, seat) : [];
}

/** Advanced's way to finish the turn: its lay-downs and adds, then its favourite discard. */
function advancedPlay(s: RoundState, seat: number, avoid?: string): Action[] {
  const { s: after, actions } = meldPhase(s, seat, 'advanced');
  const ranked = discardRanking(after, seat, 'advanced');
  const card = ranked.find((c) => c.id !== avoid) ?? ranked[0];
  return card ? [...actions, { type: 'discard', cardId: card.id }] : actions;
}

function choosePlay(s: RoundState, seat: number, sims: number, level: HeuristicLevel, salt: number, avoid?: string): Action[] {
  const options = playOptions(s, seat, avoid);
  if (!options.length) return planBotTurn(s, seat, 'advanced');
  const i = pickBest(s, seat, options.map((plan) => ({ evaluate: (det: RoundState) => applyAll(det, seat, plan) })), sims, level, salt + 1);
  return options[i];
}
