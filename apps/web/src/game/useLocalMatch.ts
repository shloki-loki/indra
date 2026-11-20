import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Action,
  type BotLevel,
  type MatchSettings,
  type MatchState,
  applyMatchAction,
  newMatch,
  planBotTurn,
  startNextRound,
} from '@indra/engine';
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

  // Bots play one action at a time so every card movement is visible.
  useEffect(() => {
    if (match.status !== 'playing' || match.round.turn === HUMAN || indra) return;
    const seat = match.round.turn;
    const [next] = planBotTurn(match.round, seat, level);
    if (!next) return;
    const timer = setTimeout(() => commit(seat, next), BOT_DELAY[next.type]);
    return () => clearTimeout(timer);
  }, [match, indra, commit, level]);

  // Let the Indra moment play out before anyone moves again.
  useEffect(() => {
    if (!indra) return;
    const timer = setTimeout(() => setIndra(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [indra]);

  const nextRound = useCallback(() => {
    const next = startNextRound(matchRef.current);
    matchRef.current = next;
    setMatch(next);
    fan(6);
  }, []);

  const restart = useCallback(() => {
    const fresh = newMatch(settings, (Date.now() ^ (Math.random() * 1e9)) | 0);
    matchRef.current = fresh;
    setMatch(fresh);
  }, [settings]);

  return { match, act, error, clearError: () => setError(null), indra, nextRound, restart };
}
