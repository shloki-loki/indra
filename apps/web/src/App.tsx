import { useState } from 'react';
import type { BotLevel, MatchSettings } from '@indra/engine';
import { cleanCode, isCode } from './online/api';
import { OnlineScreen } from './online/OnlineScreen';
import { Home, type Screen } from './screens/Home';
import { HowToPlay } from './screens/HowToPlay';
import { LocalGame } from './screens/LocalGame';
import { Setup } from './screens/Setup';

/** An invite link (?room=ABCD) opens straight into the online screen with the code filled in. */
function codeFromUrl(): string | null {
  const code = cleanCode(new URLSearchParams(location.search).get('room') ?? '');
  return isCode(code) ? code : null;
}

export function App() {
  const [invite] = useState(codeFromUrl);
  const [screen, setScreen] = useState<Screen | 'game'>(invite ? 'online' : 'home');
  const [settings, setSettings] = useState<MatchSettings | null>(null);
  const [level, setLevel] = useState<BotLevel>('medium');
  const home = () => setScreen('home');

  if (screen === 'game' && settings) return <LocalGame key={JSON.stringify(settings) + level} settings={settings} level={level} onExit={home} />;
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
  if (screen === 'online') return <OnlineScreen onBack={home} initialCode={invite} />;
  return <Home go={setScreen} />;
}
