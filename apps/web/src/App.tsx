import { useState } from 'react';
import type { BotLevel, MatchSettings } from '@indra/engine';
import { Game } from './screens/Game';
import { Home, Online, type Screen } from './screens/Home';
import { HowToPlay } from './screens/HowToPlay';
import { Setup } from './screens/Setup';

export function App() {
  const [screen, setScreen] = useState<Screen | 'game'>('home');
  const [settings, setSettings] = useState<MatchSettings | null>(null);
  const [level, setLevel] = useState<BotLevel>('medium');
  const home = () => setScreen('home');

  if (screen === 'game' && settings) return <Game key={JSON.stringify(settings) + level} settings={settings} level={level} onExit={home} />;
  if (screen === 'setup')
    return (
      <Setup
        onBack={home}
        onStart={(s, l) => {
          setSettings(s);
          setLevel(l);
          setScreen('game');
        }}
      />
    );
  if (screen === 'rules') return <HowToPlay onBack={home} />;
  if (screen === 'online') return <Online onBack={home} />;
  return <Home go={setScreen} />;
}
