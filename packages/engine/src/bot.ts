/**
 * Computer players: Beginner, Medium, Advanced.
 *
 * Every bot plans its turn by trying actions against the real engine, so it can never break a rule.
 * Bots only READ what a human in that seat could see: their own hand, the melds, the discard pile,
 * card counts and the public log of discard pickups. They never look at other hands, the pit or Indra.
 *
 *   Beginner  – plays the obvious: grabs a discard only if it uses it now, discards by feel and
 *               sometimes throws a useful card, hoards its 2s.
 *   Medium    – scores every card by how close it is to a meld and how many of the cards it needs
 *               are still out there (counting its hand and the table), dumps high cards when the
 *               round is about to end. Lays down greedily, biggest melds first.
 *   Advanced  – also remembers the whole discard pile and what opponents picked up, compares the
 *               top discard against the average pit draw, won't feed the opponents' melds, saves
 *               2s for when they matter, searches for the best set of melds to lay down, and
 *               protects pure 7-card bonuses.
 *   Expert    – see expert.ts: imagines the hidden cards many ways and plays the rest of the round
 *               out for each option, then picks what scores best on average.
 *
 * Measured (scripts/tournament.ts, 1 vs 1, 400 rounds): each level beats the one below by roughly
 * 8–10 points a round and wins about 56–62% of rounds against it.
 */
import { type Card, SUITS, cardValue, isTwo } from './cards';
import { type MeldShape, addOptions, meldCards, meldValue, newMeldOptions, rankAtPosition } from './melds';
import { type Action, type RoundState, OPENING_MINIMUM, applyAction, seatsOfSide, sideOf } from './round';
import { planExpertTurn } from './expert';

export type BotLevel = 'beginner' | 'medium' | 'advanced' | 'expert';
/** The rule-of-thumb levels (Expert builds on Advanced by simulating). */
export type HeuristicLevel = Exclude<BotLevel, 'expert'>;
/** Tuning switches (used by scripts/tournament.ts experiments). */
export const TUNE = { danger: 0.25, hoard: true, jokerCost: 3, takeMargin: 3, urgentAt: 3, sevenFirst: true, mediumGreedy: true };
export const BOT_LEVELS: readonly BotLevel[] = ['beginner', 'medium', 'advanced', 'expert'];

// ---------------------------------------------------------------- meld candidates

/** Groups of cards in `hand` that could be laid down as new melds (may overlap). */
export function meldCandidates(hand: readonly Card[], allowJokers = true): Card[][] {
  const out: Card[][] = [];
  const seen = new Set<string>();
  const push = (g: Card[]) => {
    const k = g.map((c) => c.id).sort().join(',');
    if (seen.has(k)) return;
    seen.add(k);
    out.push(g);
  };
  const twos = allowJokers ? hand.filter(isTwo) : [];
  const naturals = hand.filter((c) => !isTwo(c));

  const byRank = new Map<number, Card[]>();
  for (const c of naturals) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  // A set made only of 2s counts as real 2s.
  const allTwos = hand.filter(isTwo);
  if (allowJokers && allTwos.length >= 3) push(allTwos.slice(0, Math.max(3, allTwos.length)));
  for (const group of byRank.values()) {
    if (group.length >= 3) {
      push(group);
      if (group.length > 3) for (let i = 0; i < group.length; i++) push(group.filter((_, j) => j !== i));
    } else if (group.length === 2 && twos.length) push([...group, twos[0]]);
  }

  for (const suit of SUITS) {
    for (const aceHigh of [false, true]) {
      const occ: (Card | null)[] = new Array(14).fill(null);
      for (const c of hand) {
        if (c.suit !== suit) continue;
        if (c.rank === 1) occ[aceHigh ? 13 : 0] ??= c;
        else if (c.rank !== 2) occ[c.rank - 1] ??= c;
      }
      const natural2 = hand.find((c) => c.rank === 2 && c.suit === suit) ?? null;
      if (natural2) occ[1] = natural2;
      for (let start = 0; start < 14; start++) {
        if (!occ[start] && !(twos.length && occ[start + 1])) continue;
        const run: Card[] = [];
        let joker: Card | null = null;
        for (let p = start; p < 14; p++) {
          const card = occ[p];
          if (card) run.push(card);
          else {
            const spare = twos.find((t) => t !== natural2 && !run.includes(t));
            if (joker || !spare) break;
            joker = spare;
            run.push(spare);
          }
          if (run.length >= 3) push([...run]);
        }
      }
    }
  }
  return out.filter((g) => newMeldOptions(g).length > 0);
}

// ---------------------------------------------------------------- what the bot knows

const key = (rank: number, suit: string) => `${rank}${suit}`;

interface Knowledge {
  /** Copies of each natural card (rank 3..K, A) that could still turn up. */
  unseen: Map<string, number>;
  unseenTwos: number;
  /** Ranks/suits the opponents seem to be collecting (from their discard pickups). */
  wanted: Map<string, number>;
}

function knowledge(s: RoundState, seat: number, level: HeuristicLevel): Knowledge {
  const seen = new Map<string, number>();
  const see = (c: Card) => seen.set(key(c.rank, c.suit), (seen.get(key(c.rank, c.suit)) ?? 0) + 1);
  s.hands[seat].forEach(see);
  s.melds.forEach((m) => meldCards(m).forEach(see));
  const top = s.discard[s.discard.length - 1];
  const wanted = new Map<string, number>();

  if (level === 'advanced') {
    s.discard.forEach(see);
    const visible = new Set([...s.discard, ...s.melds.flatMap(meldCards)].map((c) => c.id));
    const mySide = sideOf(seat);
    for (const p of s.pickups) {
      if (sideOf(p.seat) === mySide || visible.has(p.cardId)) continue;
      // An opponent picked this up and hasn't played it: they're holding it.
      const [rank, suit] = parseId(p.cardId);
      seen.set(key(rank, suit), (seen.get(key(rank, suit)) ?? 0) + 1);
      wanted.set(`r${rank}`, (wanted.get(`r${rank}`) ?? 0) + 1);
      for (const d of [-2, -1, 1, 2]) wanted.set(key(rank + d, suit), (wanted.get(key(rank + d, suit)) ?? 0) + 1);
    }
  } else if (level === 'medium' && top) {
    see(top);
  }

  const unseen = new Map<string, number>();
  let unseenTwos = 0;
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      const left = Math.max(0, 2 - (seen.get(key(rank, suit)) ?? 0));
      if (rank === 2) unseenTwos += left;
      else unseen.set(key(rank, suit), left);
    }
  }
  return { unseen, unseenTwos, wanted };
}

function parseId(id: string): [number, string] {
  const body = id.slice(0, -1); // drop deck copy
  const suit = body.slice(-1);
  const label = body.slice(0, -1);
  const rank = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].indexOf(label);
  return [rank, suit];
}

// ---------------------------------------------------------------- situation

interface Situation {
  level: HeuristicLevel;
  /** Weight on a card's point value when deciding to keep it (risk of being stuck with it). */
  risk: number;
  /** The round could end any moment: dump points, use 2s freely. */
  urgent: boolean;
}

function situation(s: RoundState, seat: number, level: HeuristicLevel): Situation {
  const opponents = seatsOfSide(s.players, 1 - sideOf(seat));
  const fewest = Math.min(...opponents.map((o) => s.hands[o].length));
  const roundCanEnd = s.indraHolder !== null; // next show ends it
  const urgent = level !== 'beginner' && roundCanEnd && fewest <= (level === 'advanced' ? TUNE.urgentAt : 2);
  const side = sideOf(seat);
  const mustOpen = s.openingRequired[side] && !s.opened[side];
  // Needing 10 points to open: high cards are what get you there, so keep them.
  const risk = urgent ? 3 : mustOpen ? -0.6 : roundCanEnd ? 1 : 0.5;
  return { level, risk, urgent };
}

// ---------------------------------------------------------------- card evaluation

function positionsOf(c: Card): number[] {
  return c.rank === 1 ? [0, 13] : [c.rank - 1];
}

/** How much a card is worth keeping in this hand (higher = keep). */
function keepValue(c: Card, hand: readonly Card[], k: Knowledge, sit: Situation): number {
  if (isTwo(c)) return sit.urgent ? 6 : 40;
  const others = hand.filter((o) => o.id !== c.id && !isTwo(o));
  const out = (pos: number) => (pos < 0 || pos > 13 ? 0 : k.unseen.get(key(rankAtPosition(pos), c.suit)) ?? 0);
  const jokerHelp = Math.min(k.unseenTwos, 4) * 0.25;
  let v = 0;

  // Set potential.
  const sameRank = others.filter((o) => o.rank === c.rank).length;
  let setScore = 0;
  if (sameRank >= 2) setScore = 22;
  else if (sameRank === 1) {
    let outs = 0;
    for (const suit of SUITS) outs += k.unseen.get(key(c.rank, suit)) ?? 0;
    setScore = 4 + outs * 1.6 + jokerHelp;
  }

  // Run potential (best over ace-low / ace-high).
  let runScore = 0;
  for (const p of positionsOf(c)) {
    const has = (q: number) => q >= 0 && q <= 13 && others.some((o) => o.suit === c.suit && positionsOf(o).includes(q));
    let score = 0;
    if ((has(p - 1) && has(p + 1)) || (has(p + 1) && has(p + 2)) || (has(p - 1) && has(p - 2))) score = 22;
    else if (has(p + 1)) score = 4 + (out(p - 1) + out(p + 2)) * 1.6 + jokerHelp;
    else if (has(p - 1)) score = 4 + (out(p - 2) + out(p + 1)) * 1.6 + jokerHelp;
    else if (has(p + 2)) score = 2 + out(p + 1) * 1.6 + jokerHelp;
    else if (has(p - 2)) score = 2 + out(p - 1) * 1.6 + jokerHelp;
    runScore = Math.max(runScore, score);
  }

  v = Math.max(setScore, runScore) + Math.min(setScore, runScore) * 0.3;
  return v - cardValue(c) * sit.risk;
}

/** How much discarding `c` would help the other side (Advanced only). */
function danger(c: Card, s: RoundState, seat: number, k: Knowledge): number {
  const theirs = s.melds.filter((m) => m.side !== sideOf(seat));
  let d = 0;
  if (theirs.some((m) => addOptions(m, [c]).length > 0)) d += 14 + cardValue(c) * 2;
  if (isTwo(c)) d += 10;
  d += (k.wanted.get(`r${c.rank}`) ?? 0) * 3 + (k.wanted.get(key(c.rank, c.suit)) ?? 0) * 2;
  return d;
}

/** A tiny deterministic "coin" so Beginner's slips are reproducible. */
function coin(s: RoundState, seat: number, salt: number): number {
  let h = (s.seed ^ (seat * 2654435761) ^ (salt * 40503)) >>> 0;
  for (const c of s.hands[seat]) for (let i = 0; i < c.id.length; i++) h = Math.imul(h ^ c.id.charCodeAt(i), 16777619) >>> 0;
  return (h % 10000) / 10000;
}

// ---------------------------------------------------------------- decisions

function fitsOwnMeld(s: RoundState, seat: number, card: Card): boolean {
  const side = sideOf(seat);
  if (s.openingRequired[side] && !s.opened[side]) return false;
  return s.melds.some((m) => m.side === side && addOptions(m, [card]).length > 0);
}

function shouldTakeDiscard(s: RoundState, seat: number, level: HeuristicLevel): boolean {
  const top = s.discard[s.discard.length - 1];
  if (!top) return false;
  const hand = s.hands[seat];
  if (fitsOwnMeld(s, seat, top)) return true;
  // With 1–2 cards left you can only go out by adding to your melds; anything else is a swap.
  if (hand.length <= 2) return false;
  if (meldCandidates([...hand, top], level !== 'beginner').some((g) => g.some((c) => c.id === top.id))) return true;
  if (level === 'beginner') return false;
  if (isTwo(top)) return true;

  const k = knowledge(s, seat, level);
  const sit = situation(s, seat, level);
  const value = keepValue(top, [...hand, top], k, sit);
  if (level === 'medium') return value >= 9;

  // Advanced: compare with the average card the pit would give us.
  let total = 0;
  let count = 0;
  for (const [id, left] of k.unseen) {
    if (!left) continue;
    const [rank, suit] = [parseInt(id, 10), id.replace(/^\d+/, '')];
    const card: Card = { id: `x${id}`, rank, suit: suit as Card['suit'] };
    total += keepValue(card, [...hand, card], k, sit) * left;
    count += left;
  }
  total += 40 * k.unseenTwos;
  count += k.unseenTwos;
  const average = count ? total / count : 0;
  return value > average + TUNE.takeMargin;
}

/** Cards in the order this level would rather throw them (first = best discard). */
export function discardRanking(s: RoundState, seat: number, level: HeuristicLevel): Card[] {
  const hand = s.hands[seat];
  const k = knowledge(s, seat, level);
  const sit = situation(s, seat, level);
  const score = (c: Card) => keepValue(c, hand, k, sit) + (level === 'advanced' ? danger(c, s, seat, k) * TUNE.danger : 0);
  const scores = new Map(hand.map((c) => [c.id, score(c)]));
  return [...hand].sort((a, b) => scores.get(a.id)! - scores.get(b.id)! || cardValue(b) - cardValue(a));
}

function chooseDiscard(s: RoundState, seat: number, level: HeuristicLevel): Card {
  const hand = s.hands[seat];
  if (hand.length === 1) return hand[0];
  if (level === 'beginner') {
    const naturals = hand.filter((c) => !isTwo(c));
    if (naturals.length && coin(s, seat, 7) < 0.3) return naturals[Math.floor(coin(s, seat, 11) * naturals.length)];
  }
  return discardRanking(s, seat, level)[0];
}

/** Choose melds to lay down now. Returns groups of cards (each becomes one meld). */
export function chooseLayDown(s: RoundState, seat: number, level: HeuristicLevel): Card[][] {
  const hand = s.hands[seat];
  const side = sideOf(seat);
  const sit = situation(s, seat, level);
  const keep = s.indraTurn ? 2 : 1;
  const needOpening = s.openingRequired[side] && !s.opened[side];
  const hoardJokers = level === 'beginner' ? hand.length > 4 : level === 'advanced' && TUNE.hoard && !sit.urgent && hand.length > 6;
  const candidates = meldCandidates(hand, !hoardJokers || needOpening).map((g) => ({ g, shape: newMeldOptions(g)[0] as MeldShape }));

  if (level === 'beginner' || (level === 'medium' && TUNE.mediumGreedy)) {
    // Greedy: biggest groups first, no look-ahead.
    const chosen: Card[][] = [];
    const used = new Set<string>();
    let cards = 0;
    let value = 0;
    for (const { g, shape } of [...candidates].sort((a, b) => b.g.length - a.g.length)) {
      if (g.some((c) => used.has(c.id)) || hand.length - cards - g.length < keep) continue;
      chosen.push(g);
      g.forEach((c) => used.add(c.id));
      cards += g.length;
      value += meldValue(shape);
    }
    return needOpening && value < OPENING_MINIMUM ? [] : chosen;
  }

  let best: Card[][] = [];
  let bestScore = 0;
  let nodes = 0;
  const pick = (i: number, used: Set<string>, chosen: Card[][], score: number, cards: number, value: number) => {
    if (++nodes > 4000) return;
    const valid = !needOpening || value >= OPENING_MINIMUM;
    if (valid && score > bestScore) {
      bestScore = score;
      best = chosen.slice();
    }
    for (let j = i; j < candidates.length; j++) {
      const { g, shape } = candidates[j];
      if (g.some((c) => used.has(c.id)) || hand.length - cards - g.length < keep) continue;
      const usesJoker = !!shape.jokerId && g.some((c) => c.id === shape.jokerId);
      const jokerCost = usesJoker && level === 'advanced' && !sit.urgent && g.length === 3 ? TUNE.jokerCost : 0;
      g.forEach((c) => used.add(c.id));
      chosen.push(g);
      pick(j + 1, used, chosen, score + meldValue(shape) + g.length * 1.5 - jokerCost, cards + g.length, value + meldValue(shape));
      chosen.pop();
      g.forEach((c) => used.delete(c.id));
    }
  };
  pick(0, new Set(), [], 0, 0, 0);
  return best;
}

/** Find one card to add to one of our side's melds, or null. */
export function chooseAdd(s: RoundState, seat: number, level: HeuristicLevel): Action | null {
  const side = sideOf(seat);
  if (s.openingRequired[side] && !s.opened[side]) return null;
  const hand = s.hands[seat];
  const keep = s.indraTurn ? 2 : 1;
  if (hand.length <= keep) return null;
  const sit = situation(s, seat, level);
  const ours = s.melds.filter((m) => m.side === side);
  // Advanced grows melds that are closest to the 7-card bonus first.
  const order =
    level === 'advanced' && TUNE.sevenFirst ? [...ours].sort((a, b) => Math.abs(6 - meldCards(a).length) - Math.abs(6 - meldCards(b).length)) : ours;

  const naturals = hand.filter((c) => !isTwo(c));
  for (const card of naturals) {
    for (const m of order) {
      const options = addOptions(m, [card]);
      if (options.length) return { type: 'add', meldId: m.id, cardIds: [card.id], start: options[0].kind === 'run' ? options[0].start : undefined };
    }
  }

  // Wild 2s: Beginner hoards them; others spend them when the hand is nearly done or time is short,
  // and never on a pure meld that would lose (or never earn) its +20.
  const twos = hand.filter(isTwo);
  const spend = level === 'beginner' ? hand.length <= 2 : sit.urgent || hand.length <= 3;
  if (!spend) return null;
  for (const card of twos) {
    for (const m of order) {
      const len = meldCards(m).length;
      if (level !== 'beginner' && !m.jokerId && len + 1 >= 7 && hand.length - 1 > keep) continue;
      const options = addOptions(m, [card]);
      if (options.length) return { type: 'add', meldId: m.id, cardIds: [card.id], start: options[0].kind === 'run' ? options[0].start : undefined };
    }
  }
  return null;
}

// ---------------------------------------------------------------- the turn

/** Plan a full turn for `seat` at `level`. Returns the actions in order. */
export function planBotTurn(state: RoundState, seat: number, level: BotLevel = 'beginner'): Action[] {
  if (level === 'expert') return planExpertTurn(state, seat);
  const plan = planTurn(state, seat, level, false);
  // Taking the top discard only to throw the same card back wastes the turn (and two bots can loop
  // on it forever). Draw from the pit instead.
  const [first] = plan;
  const last = plan[plan.length - 1];
  const top = state.discard[state.discard.length - 1];
  if (first?.type === 'draw' && first.from === 'discard' && last?.type === 'discard' && top && last.cardId === top.id) {
    return planTurn(state, seat, level, true);
  }
  return plan;
}

function planTurn(state: RoundState, seat: number, level: HeuristicLevel, forcePit: boolean): Action[] {
  const actions: Action[] = [];
  let s = state;
  const tryAction = (a: Action): boolean => {
    const r = applyAction(s, seat, a);
    if (!r.ok) return false;
    s = r.state;
    actions.push(a);
    return true;
  };

  if (s.phase === 'draw') {
    if (!tryAction({ type: 'draw', from: !forcePit && shouldTakeDiscard(s, seat, level) ? 'discard' : 'pit' })) {
      tryAction({ type: 'draw', from: 'pit' }) || tryAction({ type: 'draw', from: 'discard' });
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let guard = 0; guard < 20; guard++) {
      const groups = chooseLayDown(s, seat, level);
      const laid = groups.length > 0 && tryAction({ type: 'meld', melds: groups.map((g) => ({ cardIds: g.map((c) => c.id) })) });
      const add = chooseAdd(s, seat, level);
      const added = add ? tryAction(add) : false;
      if (!laid && !added) break;
    }
    tryAction({ type: 'discard', cardId: chooseDiscard(s, seat, level).id });
    // Still our turn only if we just showed and took Indra: play the Indra turn too.
    if (!(s.phase === 'play' && s.turn === seat)) break;
  }
  return actions;
}
