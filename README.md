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

## Online rooms

- `packages/room`: the rules of an online room (lobby, seats, bots filling empty seats, turn timer, chat, drop-outs), pure TypeScript with tests.
- `apps/server`: a Cloudflare Worker that serves the site and runs each room in a Durable Object (free plan). Bots, Expert included, play on the server, so nobody's browser ever receives another player's cards.

Run it locally (site and rooms on one port, reachable from phones on the same Wi-Fi):

```bash
npm install
npm run build -w @indra/web
npm run dev -w @indra/server   # http://localhost:8787 and http://<your-LAN-IP>:8787
```

For UI work, run `npm run dev` (Vite on 5183) alongside the server; Vite forwards `/api` to port 8787.

Deploy: `npm run build -w @indra/web && npx wrangler deploy` from `apps/server` (needs `npx wrangler login` once).
