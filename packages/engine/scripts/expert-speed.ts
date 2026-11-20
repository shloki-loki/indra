import { planBotTurn } from '../src/bot';
import { planExpertTurn } from '../src/expert';
import { applyAction, newRound, type RoundState } from '../src/round';
const sims = Number(process.argv[2] ?? 160);
let decisions = 0, worst = 0; const t0 = performance.now();
for (let i = 0; i < 3; i++) {
  let s: RoundState = newRound({ players: 2, starter: 0, seed: 900 + i });
  while (s.phase !== 'over') {
    const seat = s.turn;
    let plan;
    if (seat === 0) { const t = performance.now(); plan = planExpertTurn(s, seat, { sims }); worst = Math.max(worst, performance.now() - t); decisions++; plan = plan.slice(0, 99); }
    else plan = planBotTurn(s, seat, 'advanced');
    for (const a of plan) { const r = applyAction(s, seat, a); if (!r.ok) throw new Error(r.error + JSON.stringify(a)); s = r.state; }
  }
}
console.log(`sims ${sims}: ${((performance.now() - t0) / decisions).toFixed(0)} ms/decision avg, worst ${worst.toFixed(0)} ms, ${decisions} decisions`);
