import type { BotLevel, MatchSettings } from '@indra/engine';
import { useLocalMatch } from '../game/useLocalMatch';
import { Game } from './Game';

/** A match against the computer, played entirely on this device. */
export function LocalGame({ settings, level, onExit }: { settings: MatchSettings; level: BotLevel; onExit: () => void }) {
  const controller = useLocalMatch(settings, level);
  return <Game controller={controller} settings={settings} onExit={onExit} />;
}
