# Indra

A 6–8 minute card game for two players or two teams: two decks, wild 2s, and a sealed 13-card Indra deck for whoever goes out first. The full rules are in [RULES.md](RULES.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:5183
npm test           # rules engine + bot tests
```

## Layout

- `packages/engine`: the rules engine (pure TypeScript), scoring, and the Beginner / Medium / Advanced computer players. `scripts/tournament.ts` pits the levels against each other.
- `apps/web`: the table (Vite + React + framer-motion): play against the computer in 1 vs 1 or 2 vs 2.

Online rooms are next.
