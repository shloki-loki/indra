/** Usage: npx tsx scripts/expert-vs.ts <opponent> <from> <count> [sims] — Expert vs a heuristic level, 1 vs 1, alternating seats. */
import { type HeuristicLevel, planBotTurn } from '../src/bot';
import { planExpertTurn } from '../src/expert';
import { applyAction, newRound, scoreRound, type RoundState } from '../src/round';
const [opp, from, count, sims] = [process.argv[2] as HeuristicLevel, Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5] ?? 160)];
let me = 0, them = 0, wins = 0;
for (let i = from; i < from + count; i++) {
  const expertSeat = i % 2;
  let s: RoundState = newRound({ players: 2, starter: (i >> 1) % 2, seed: 5000 + i });
  for (let turns = 0; s.phase !== 'over' && turns < 400; turns++) {
    const seat = s.turn;
    const plan = seat === expertSeat ? planExpertTurn(s, seat, { sims }) : planBotTurn(s, seat, opp);
    for (const a of plan) { const r = applyAction(s, seat, a); if (!r.ok) throw new Error(r.error); s = r.state; }
  }
  const sc = scoreRound(s);
  const a = sc[expertSeat].total / 2, b = sc[1 - expertSeat].total / 2;
  me += a; them += b; if (a > b) wins++;
}
console.log(JSON.stringify({ opp, count, me, them, wins }));
