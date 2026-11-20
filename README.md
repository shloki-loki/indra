# Indra

A 6–8 minute card game for two players or two teams: two decks, wild 2s, and a sealed 13-card Indra deck for whoever goes out first. The full rules are in [RULES.md](RULES.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:5183
npm test           # rules engine + bot tests
```

## Layout

- `packages/engine`: the rules engine (pure TypeScript), scoring, and the Beginner / Medium / Advanced / Expert computer players. Expert (`src/expert.ts`) imagines the hidden cards a few hundred ways, plays each option out to the end of the round, and picks the best average; in the app it thinks in a Web Worker. `scripts/tournament.ts` pits the rule-of-thumb levels against each other; `scripts/expert-vs.ts` measures Expert.
- `apps/web`: the table (Vite + React + framer-motion): play against the computer in 1 vs 1 or 2 vs 2.

Online rooms are next.
