/// <reference lib="webworker" />
/** Runs the Expert bot's simulations off the main thread so the table never freezes. */
import { type Action, type BotLevel, type RoundState, planBotTurn } from '@indra/engine';

export interface PlanRequest {
  id: number;
  state: RoundState;
  seat: number;
  level: BotLevel;
}
export interface PlanReply {
  id: number;
  actions: Action[];
}

self.onmessage = (e: MessageEvent<PlanRequest>) => {
  const { id, state, seat, level } = e.data;
  const actions = planBotTurn(state, seat, level);
  (self as unknown as Worker).postMessage({ id, actions } satisfies PlanReply);
};
