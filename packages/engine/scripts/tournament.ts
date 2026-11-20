/** Usage: npx tsx scripts/tournament.ts [rounds]  — pits bot levels against each other (1 vs 1). */
import { type BotLevel, planBotTurn } from '../src/bot';
import { applyAction, newRound, scoreRound, type RoundState } from '../src/round';

function playRound(levels: [BotLevel, BotLevel], seed: number, starter: number) {
  let s: RoundState = newRound({ players: 2, starter, seed });
  let turns = 0;
  while (s.phase !== 'over' && turns < 2000) {
    const seat = s.turn;
    for (const a of planBotTurn(s, seat, levels[seat])) {
      const r = applyAction(s, seat, a);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    turns++;
  }
  const sc = scoreRound(s);
  return { a: sc[0].total / 2, b: sc[1].total / 2, turns, firstShow: s.shows[0] };
}

const rounds = Number(process.argv[2] ?? 200);
const pairs: [BotLevel, BotLevel][] = [
  ['medium', 'beginner'],
  ['advanced', 'beginner'],
  ['advanced', 'medium'],
];
for (const [x, y] of pairs) {
  let sx = 0, sy = 0, wins = 0, turns = 0, shows = 0;
  for (let i = 0; i < rounds; i++) {
    const swap = i % 2 === 1; // alternate seats and starters
    const levels: [BotLevel, BotLevel] = swap ? [y, x] : [x, y];
    const r = playRound(levels, 1000 + i, i % 2);
    const mine = swap ? r.b : r.a;
    const theirs = swap ? r.a : r.b;
    sx += mine; sy += theirs; turns += r.turns;
    if (mine > theirs) wins++;
    if ((r.firstShow === 0) !== swap) shows++;
  }
  console.log(`${x} vs ${y}: avg ${(sx / rounds).toFixed(1)} – ${(sy / rounds).toFixed(1)}, ${x} wins ${((wins / rounds) * 100).toFixed(0)}% of rounds, takes Indra ${((shows / rounds) * 100).toFixed(0)}%, avg ${(turns / rounds).toFixed(0)} turns`);
}
