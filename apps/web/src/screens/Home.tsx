import { motion, useReducedMotion } from 'framer-motion';
import { Vajra } from '../ui/Card';

export type Screen = 'home' | 'setup' | 'online' | 'rules';

export function Home({ go }: { go: (s: Screen) => void }) {
  const reduce = useReducedMotion();
  return (
    <main className="home">
      <div className="home-mark">
        <motion.div
          className="home-deck"
          initial={reduce ? false : { rotate: -8, y: 12, opacity: 0 }}
          animate={{ rotate: -4, y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 120, damping: 16 }}
          aria-hidden="true"
        >
          <span className="card back hand home-back b1" />
          <span className="card back hand home-back b2" />
          <span className="card back hand home-back b3">
            <span className="seal">
              <Vajra className="seal-vajra" />
            </span>
          </span>
        </motion.div>
        <h1 className="wordmark">Indra</h1>
        <p className="tagline">A 6–8 minute card game that's easy to pick up and hard to put down.</p>
      </div>
      <nav className="home-menu" aria-label="Main menu">
        <button type="button" className="btn primary big" onClick={() => go('setup')}>
          Play against the computer
        </button>
        <button type="button" className="btn big" onClick={() => go('online')}>
          Play online with friends
        </button>
        <button type="button" className="btn ghost big" onClick={() => go('rules')}>
          How to play
        </button>
      </nav>
    </main>
  );
}
