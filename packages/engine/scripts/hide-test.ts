/** Does hiding melds help? Advanced holding melds until it can nearly go out, vs normal Advanced. Measured 2026-11-20: holding to 1–3 cards loses 4–8 pts/round; 5–9 is a wash. */
import { TUNE, planBotTurn } from '../src/bot';
import { applyAction, newRound, scoreRound, type RoundState } from '../src/round';
const rounds = Number(process.argv[2] ?? 400);
for (const holdUntil of [5, 6, 7, 9]) {
  let diff = 0, wins = 0;
  for (let i = 0; i < rounds; i++) {
    const hider = i % 2;
    let s: RoundState = newRound({ players: 2, starter: (i >> 1) % 2, seed: 7000 + i });
    for (let t = 0; t < 600 && s.phase !== 'over'; t++) {
      const seat = s.turn;
      TUNE.holdUntil = seat === hider ? holdUntil : 0;
      for (const a of planBotTurn(s, seat, 'advanced')) { const r = applyAction(s, seat, a); if (!r.ok) throw new Error(r.error); s = r.state; }
    }
    const sc = scoreRound(s);
    const d = (sc[hider].total - sc[1 - hider].total) / 2;
    diff += d; if (d > 0) wins++;
  }
  console.log(`hold until ${holdUntil} cards left: ${(diff / rounds).toFixed(1)} pts/round vs normal, wins ${((wins / rounds) * 100).toFixed(0)}%`);
}
