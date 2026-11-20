import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Action,
  type BotLevel,
  type MatchSettings,
  type MatchState,
  applyMatchAction,
  newMatch,
  startNextRound,
} from '@indra/engine';
import { planFor } from './planner';
import { fan, snap, thunder } from './sound';

export const HUMAN = 0;

export function seatNames(players: 2 | 4): string[] {
  return players === 2 ? ['You', 'Arjun'] : ['You', 'Arjun', 'Meera', 'Kabir'];
}

export interface IndraMoment {
  seat: number;
  key: number;
}

const BOT_DELAY = { draw: 750, meld: 650, add: 450, discard: 600 } as const;
const FLASH_MS = 2600;

function playSound(action: Action) {
  if (action.type === 'meld') fan(action.melds.reduce((n, m) => n + m.cardIds.length, 0));
  else if (action.type === 'add') fan(action.cardIds.length);
  else snap(action.type === 'draw' ? 1.1 : 0.85);
}

export function useLocalMatch(settings: MatchSettings, level: BotLevel) {
  const [match, setMatch] = useState<MatchState>(() => newMatch(settings, (Date.now() ^ (Math.random() * 1e9)) | 0));
  const [error, setError] = useState<string | null>(null);
  const [indra, setIndra] = useState<IndraMoment | null>(null);
  /** A bot is working out its move (only noticeable for Expert). */
  const [thinking, setThinking] = useState(false);
  /** Bumped to re-run the bot loop when a planned action turns out to be stale. */
  const [retry, setRetry] = useState(0);
  const queue = useRef<Action[]>([]);
  const matchRef = useRef(match);
  matchRef.current = match;

  const commit = useCallback((seat: number, action: Action): boolean => {
    const before = matchRef.current;
    const result = applyMatchAction(before, seat, action);
    if (!result.ok) {
      if (seat === HUMAN) setError(result.error);
      return false;
    }
    setError(null);
    playSound(action);
    const tookIndra = before.round.indraHolder === null && result.state.round.indraHolder !== null;
    if (tookIndra) {
      thunder();
      setIndra({ seat: result.state.round.indraHolder!, key: Date.now() });
    }
    matchRef.current = result.state;
    setMatch(result.state);
    return true;
  }, []);

  const act = useCallback((action: Action) => commit(HUMAN, action), [commit]);

  // Bots plan, then play one action at a time so every card movement is visible.
  useEffect(() => {
    if (match.status !== 'playing' || match.round.turn === HUMAN || indra) return;
    const seat = match.round.turn;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const play = (wait: number) => {
      const next = queue.current.shift();
      if (!next) return setRetry((n) => n + 1);
      timer = setTimeout(() => {
        if (cancelled) return;
        if (!commit(seat, next)) {
          queue.current = [];
          setRetry((n) => n + 1);
        }
      }, wait);
    };
    if (queue.current.length) play(BOT_DELAY[queue.current[0].type]);
    else {
      const started = Date.now();
      setThinking(true);
      planFor(match.round, seat, level).then((actions) => {
        if (cancelled) return;
        setThinking(false);
        if (!actions.length) return;
        queue.current = actions;
        play(Math.max(150, BOT_DELAY[actions[0].type] - (Date.now() - started)));
      });
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [match, indra, commit, level, retry]);

  // Let the Indra moment play out before anyone moves again.
  useEffect(() => {
    if (!indra) return;
    const timer = setTimeout(() => setIndra(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [indra]);

  const nextRound = useCallback(() => {
    const next = startNextRound(matchRef.current);
    queue.current = [];
    matchRef.current = next;
    setMatch(next);
    fan(6);
  }, []);

  const restart = useCallback(() => {
    const fresh = newMatch(settings, (Date.now() ^ (Math.random() * 1e9)) | 0);
    queue.current = [];
    setThinking(false);
    matchRef.current = fresh;
    setMatch(fresh);
  }, [settings]);

  return { match, act, error, clearError: () => setError(null), indra, thinking, nextRound, restart };
}
