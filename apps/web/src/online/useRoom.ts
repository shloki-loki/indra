import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Action, type MatchState, applyMatchAction } from '@indra/engine';
import { type ChatLine, type ClientMessage, type RoomView, type ServerMessage, rotateMatch, rotateSeats } from '@indra/room';
import type { IndraMoment, TableController } from '../game/controller';
import { fan, snap, thunder } from '../game/sound';
import { roomInfo, roomSocketUrl } from './api';
import { clientId } from './identity';

export type ConnectionStatus = 'connecting' | 'open' | 'retrying';

export interface RoomConnection {
  view: RoomView | null;
  status: ConnectionStatus;
  /** The room refused us (full, already started…). Stop and show this. */
  refused: string | null;
  /** Last error message from the server, with a counter so repeats show again. */
  error: { message: string; n: number } | null;
  /** Server clock minus ours, in ms. */
  offset: number;
  send: (msg: ClientMessage) => void;
}

/** A live connection to one room, reconnecting by itself when the network blips. */
export function useRoom(code: string, name: string): RoomConnection {
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [refused, setRefused] = useState<string | null>(null);
  const [error, setError] = useState<RoomConnection['error']>(null);
  const [offset, setOffset] = useState(0);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let lastError: string | null = null;

    const connect = () => {
      if (stopped) return;
      started = true;
      const ws = new WebSocket(roomSocketUrl(`/api/rooms/${code}/ws?cid=${clientId()}&name=${encodeURIComponent(name)}`));
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
      };
      ws.onmessage = (e) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.t === 'state') {
          setOffset(msg.room.now - Date.now());
          setView(msg.room);
        } else {
          lastError = msg.message;
          setError((prev) => ({ message: msg.message, n: (prev?.n ?? 0) + 1 }));
        }
      };
      ws.onclose = (e) => {
        if (socket.current === ws) socket.current = null;
        if (stopped) return;
        if (e.code === 4000) {
          setRefused(e.reason || lastError || "You can't join this room.");
          return;
        }
        setStatus('retrying');
        retry = setTimeout(connect, Math.min(8000, 800 * 2 ** attempt++));
      };
    };
    // Check the room exists and has a seat for us before opening the socket.
    roomInfo(code, clientId())
      .then((info) => {
        if (stopped) return;
        if (!info.exists || !info.joinable) setRefused(info.exists ? info.reason ?? "You can't join this room." : `No room has the code ${code}.`);
        else connect();
      })
      .catch(() => connect());

    // Coming back to the tab or the network: reconnect straight away.
    let started = false;
    const wake = () => {
      if (socket.current || stopped || !started) return;
      clearTimeout(retry);
      connect();
    };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      stopped = true;
      clearTimeout(retry);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
      socket.current?.close(1000);
    };
  }, [code, name]);

  const send = useCallback((msg: ClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(msg));
  }, []);

  return { view, status, refused, error, offset, send };
}

const FLASH_MS = 2600;

/** Turn a room connection into what the table needs, seen from your own seat. */
export function useOnlineTable(conn: RoomConnection): TableController | null {
  const { view, send, offset, status } = conn;
  const [optimistic, setOptimistic] = useState<{ base: RoomView; match: MatchState } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [indra, setIndra] = useState<IndraMoment | null>(null);
  const [seenChat, setSeenChat] = useState(0);
  const prev = useRef<{ holder: number | null; rounds: number; lastAt: number } | null>(null);

  const me = view?.you ?? null;
  const players = view?.settings.players ?? 2;
  const served = useMemo(() => (view?.match && me !== null ? rotateMatch(view.match, me) : null), [view, me]);
  const match = optimistic && optimistic.base === view ? optimistic.match : served;

  useEffect(() => {
    if (conn.error) setServerError(conn.error.message);
  }, [conn.error]);

  // Sounds and the Indra moment, from the server's updates.
  useEffect(() => {
    if (!served || !view) return;
    const p = prev.current;
    const holder = served.round.indraHolder;
    const rounds = served.history.length;
    const last = view.lastAction;
    if (p && last && last.at !== p.lastAt) {
      if (last.type === 'meld' || last.type === 'add') fan(last.count);
      else snap(last.type === 'draw' ? 1.1 : 0.85);
    }
    if (p && p.rounds === rounds && p.holder === null && holder !== null) {
      thunder();
      setIndra({ seat: holder, key: Date.now() });
    }
    if (p && rounds === 0 && p.rounds > 0) setSeenChat(0);
    prev.current = { holder, rounds, lastAt: last?.at ?? 0 };
  }, [served, view]);

  useEffect(() => {
    if (!indra) return;
    const t = setTimeout(() => setIndra(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [indra]);

  const act = useCallback(
    (action: Action): boolean => {
      if (!match || !view) return false;
      const r = applyMatchAction(match, 0, action);
      if (!r.ok) {
        setLocalError(r.error);
        return false;
      }
      setLocalError(null);
      setServerError(null);
      // Show your own meld/add/discard at once; draws and shows wait for the server (they reveal cards).
      const reveals = action.type === 'draw' || r.state.status !== 'playing' || r.state.round.indraHolder !== match.round.indraHolder;
      if (!reveals) setOptimistic({ base: view, match: r.state });
      send({ t: 'act', action });
      return true;
    },
    [match, view, send],
  );

  if (!view || !match || me === null) return null;

  const seats = rotateSeats(view.seats, me, players);
  const names = seats.map((s) => s.name);
  const turnSeat = seats[match.round.turn];
  const rotate = (seat: number) => (seat - me + players) % players;
  const chat = view.chat;
  const latest = chat.length ? chat[chat.length - 1].id : 0;

  return {
    match,
    names,
    act,
    error: localError ?? serverError,
    clearError: () => {
      setLocalError(null);
      setServerError(null);
    },
    indra,
    thinking: view.botThinking && turnSeat?.kind === 'bot' && turnSeat.level === 'expert' && match.status === 'playing' ? turnSeat.name : null,
    nextRound: () => send({ t: 'next' }),
    restart: () => send({ t: 'next' }),
    online: {
      code: view.code,
      deadline: view.turnDeadline === null ? null : view.turnDeadline - offset,
      turnSeconds: view.settings.turnSeconds,
      chat,
      sendChat: (text: string) => send({ t: 'chat', text }),
      chatSeat: (line: ChatLine) => (line.seat === null ? null : rotate(line.seat)),
      unread: chat.filter((c) => c.id > seenChat && c.seat !== null && c.seat !== me).length,
      markRead: () => setSeenChat(latest),
      drop: view.drop ? { ...view.drop, seat: rotate(view.drop.seat) } : null,
      answerDrop: (yes: boolean) => send({ t: 'replace', yes }),
      isHost: view.isHost,
      ended: view.phase === 'ended' ? view.endedReason ?? 'The game ended.' : null,
      backToLobby: () => send({ t: 'lobby' }),
      connected: status === 'open',
    },
  };
}
