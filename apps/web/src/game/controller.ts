import type { Action, MatchState } from '@indra/engine';
import type { ChatLine, RoomView } from '@indra/room';

export interface IndraMoment {
  seat: number;
  key: number;
}

/** Online-only parts of the table: timer, chat, drop-outs, connection. Seats are rotated (you = 0). */
export interface OnlineTable {
  code: string;
  /** When the current turn runs out, on this device's clock. */
  deadline: number | null;
  turnSeconds: number;
  chat: ChatLine[];
  sendChat: (text: string) => void;
  /** Rotated seat index of a chat line's author (null for room notices). */
  chatSeat: (line: ChatLine) => number | null;
  /** Messages from others you haven't opened the chat to see. */
  unread: number;
  markRead: () => void;
  drop: (RoomView['drop'] & { seat: number }) | null;
  answerDrop: (yes: boolean) => void;
  isHost: boolean;
  ended: string | null;
  backToLobby: () => void;
  connected: boolean;
}

/** Everything the table needs, whether the game runs on this device or in an online room. */
export interface TableController {
  /** Seen from seat 0 (you). */
  match: MatchState;
  names: string[];
  act: (action: Action) => boolean;
  error: string | null;
  clearError: () => void;
  indra: IndraMoment | null;
  /** Name of a player who is visibly thinking, or null. */
  thinking: string | null;
  nextRound: () => void;
  restart: () => void;
  online?: OnlineTable;
}
