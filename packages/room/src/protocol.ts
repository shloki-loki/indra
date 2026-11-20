/** Messages between a player's browser and a room. Everything is plain JSON. */
import type { Action, BotLevel, MatchSettings, MatchState } from '@indra/engine';

export interface RoomSettings extends MatchSettings {
  /** Seconds a person has for each turn. */
  turnSeconds: number;
}

export const TURN_SECONDS = [30, 60, 90, 120] as const;
export const DEFAULT_ROOM_SETTINGS: RoomSettings = { players: 2, target: 200, openingRule: true, turnSeconds: 60 };

/** Room codes: 4 letters, no look-alikes (no I, L, O). */
export const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

export type ClientMessage =
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'swap'; a: number; b: number }
  | { t: 'bot'; seat: number; level: BotLevel }
  | { t: 'start' }
  | { t: 'act'; action: Action }
  | { t: 'next' }
  | { t: 'lobby' }
  | { t: 'chat'; text: string }
  | { t: 'replace'; yes: boolean }
  | { t: 'leave' }
  | { t: 'rename'; name: string };

export interface SeatView {
  kind: 'human' | 'bot' | 'open';
  name: string;
  /** Bot level (bots, and the level that will fill an open seat). */
  level?: BotLevel;
  connected: boolean;
  isYou: boolean;
  isHost: boolean;
  /** A bot that took over from a person who left. */
  standIn: boolean;
}

export interface ChatLine {
  id: number;
  seat: number | null;
  name: string;
  text: string;
  at: number;
}

export interface LastAction {
  seat: number;
  type: Action['type'];
  /** Cards moved (for the sound). */
  count: number;
  at: number;
}

export interface RoomView {
  code: string;
  /** Your seat, or null if you have none. */
  you: number | null;
  isHost: boolean;
  settings: RoomSettings;
  seats: SeatView[];
  phase: 'lobby' | 'playing' | 'ended';
  /** The match as your seat may see it (other hands, the pit and Indra are face-down placeholders). */
  match: MatchState | null;
  chat: ChatLine[];
  /** When the current person's turn runs out (server clock), if a person is to play. */
  turnDeadline: number | null;
  /** Server clock when this view was made, to correct for clock differences. */
  now: number;
  /** A player left (or kept timing out): replace them with a bot, or end the game? */
  drop: { seat: number; name: string; reason: 'left' | 'timeouts' } | null;
  endedReason: string | null;
  lastAction: LastAction | null;
  /** A bot is working out its move. */
  botThinking: boolean;
}

export type ServerMessage = { t: 'state'; room: RoomView } | { t: 'error'; message: string };
