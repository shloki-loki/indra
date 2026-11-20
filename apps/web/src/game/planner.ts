import { type Action, type BotLevel, type RoundState, planBotTurn } from '@indra/engine';
import type { PlanReply, PlanRequest } from './botWorker';

/**
 * Ask a bot for its next actions. The quick levels answer on the spot; Expert thinks in a Web
 * Worker (falling back to the main thread if workers aren't available).
 */
let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, (actions: Action[]) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./botWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PlanReply>) => {
      waiting.get(e.data.id)?.(e.data.actions);
      waiting.delete(e.data.id);
    };
    worker.onerror = () => {
      // Answer anything still pending on the main thread and stop using the worker.
      worker = null;
      for (const resolve of waiting.values()) resolve([]);
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function planFor(state: RoundState, seat: number, level: BotLevel): Promise<Action[]> {
  const w = level === 'expert' ? getWorker() : null;
  if (!w) return Promise.resolve(planBotTurn(state, seat, level));
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, (actions) => resolve(actions.length ? actions : planBotTurn(state, seat, level)));
    w.postMessage({ id, state, seat, level } satisfies PlanRequest);
  });
}
