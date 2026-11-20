import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { type MatchState, type SideScore, bonusBreakdown, seatsOfSide } from '@indra/engine';
import { pts } from '../game/format';
import { Vajra } from './Card';

/** The one big moment: lightning, the seal breaks, Indra is claimed. */
export function IndraFlash({ name, show }: { name: string | null; show: boolean }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {show && name && (
        <motion.div className="indra-flash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }} role="status">
          {!reduce && (
            <>
              <motion.div className="flash-white" initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
              <svg className="flash-bolt" viewBox="0 0 200 600" preserveAspectRatio="none" aria-hidden="true">
                <motion.path
                  d="M120 0 L70 210 L118 205 L52 420 L104 410 L40 600"
                  initial={{ pathLength: 0, opacity: 1 }}
                  animate={{ pathLength: 1, opacity: [1, 1, 0.2] }}
                  transition={{ duration: 0.5, ease: 'easeIn' }}
                />
              </svg>
            </>
          )}
          <motion.div className="flash-card" initial={reduce ? { opacity: 0 } : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: reduce ? 0 : 0.35, type: 'spring', stiffness: 260, damping: 18 }}>
            <Vajra className="flash-vajra" />
            <h2 className="flash-title">Indra</h2>
            <p className="flash-sub">{name === 'You' ? 'You claim the Indra deck' : `${name} claims the Indra deck`}</p>
            <p className="flash-pts">+10 for showing, +10 for Indra</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface RoundOverProps {
  match: MatchState;
  sideNames: [string, string];
  names: string[];
  onNext: () => void;
  onRestart: () => void;
  onHome: () => void;
  onViewTable: () => void;
}

/** One line per bonus: who earned it, what for, and how much. */
function BonusList({ match, names }: { match: MatchState; names: string[] }) {
  const items = bonusBreakdown(match.round);
  if (items.length === 0) return <p className="bonus-none">No bonuses this round.</p>;
  const teamOf = (side: number) => seatsOfSide(match.settings.players, side).map((s) => names[s]).join(' & ');
  return (
    <ul className="bonus-list">
      {items.map((b, i) => (
        <li key={i}>
          <span className="bonus-who">
            {names[b.seat]}
            {match.settings.players === 4 && b.kind === 'meld' ? ` (${teamOf(b.side)})` : ''}
          </span>
          <span className="bonus-what">{b.label}</span>
          <span className="bonus-pts">+{pts(b.points)}</span>
        </li>
      ))}
    </ul>
  );
}

function Breakdown({ scores, sideNames }: { scores: SideScore[]; sideNames: [string, string] }) {
  const rows: [string, (s: SideScore) => string][] = [
    ['Cards on the table', (s) => pts(s.table)],
    ['Bonuses', (s) => `+${pts(s.bonus)}`],
    ['Left in hand', (s) => (s.hand ? `−${pts(s.hand)}` : '0')],
  ];
  return (
    <table className="breakdown">
      <thead>
        <tr>
          <th />
          <th scope="col">{sideNames[0]}</th>
          <th scope="col">{sideNames[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, f]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{f(scores[0])}</td>
            <td>{f(scores[1])}</td>
          </tr>
        ))}
        <tr className="total">
          <th scope="row">This round</th>
          <td>{pts(scores[0].total)}</td>
          <td>{pts(scores[1].total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function ScoreSheet({ match, sideNames }: { match: MatchState; sideNames: [string, string] }) {
  return (
    <table className="sheet">
      <thead>
        <tr>
          <th scope="col">Round</th>
          <th scope="col">{sideNames[0]}</th>
          <th scope="col">{sideNames[1]}</th>
        </tr>
      </thead>
      <tbody>
        {match.history.map((r, i) => (
          <tr key={i}>
            <th scope="row">{i + 1}</th>
            <td>{pts(r.scores[0].total)}</td>
            <td>{pts(r.scores[1].total)}</td>
          </tr>
        ))}
        {match.history.length === 0 && (
          <tr>
            <td colSpan={3} className="sheet-empty">
              Scores appear here after the first round.
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total</th>
          <td>{pts(match.scores[0])}</td>
          <td>{pts(match.scores[1])}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export function RoundOver({ match, sideNames, names, onNext, onRestart, onHome, onViewTable }: RoundOverProps) {
  const last = match.history[match.history.length - 1];
  if (!last) return null;
  const over = match.status === 'match-over';
  const roundWinner = last.scores[0].total === last.scores[1].total ? null : last.scores[0].total > last.scores[1].total ? 0 : 1;
  const title = over
    ? match.winner === 0
      ? sideNames[0] === 'You' ? 'You win the match' : 'Your team wins the match'
      : `${sideNames[1]} wins the match`
    : roundWinner === null
      ? 'Round tied'
      : roundWinner === 0
        ? sideNames[0] === 'You' ? 'You win the round' : 'Your team wins the round'
        : `${sideNames[1]} wins the round`;
  const target = match.settings.target;

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="modal" role="dialog" aria-modal="true" aria-labelledby="round-title" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
        <h2 id="round-title" className="modal-title">
          {title}
        </h2>
        <Breakdown scores={last.scores} sideNames={sideNames} />
        <h3 className="modal-sub">Bonuses</h3>
        <BonusList match={match} names={names} />
        <h3 className="modal-sub">Score sheet{target !== null ? `, first to ${target}` : ''}</h3>
        <ScoreSheet match={match} sideNames={sideNames} />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onViewTable}>
            See the table
          </button>
          {over ? (
            <>
              <button type="button" className="btn primary" onClick={onRestart}>
                Play again
              </button>
              <button type="button" className="btn" onClick={onHome}>
                Home
              </button>
            </>
          ) : (
            <button type="button" className="btn primary" onClick={onNext}>
              Deal next round
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
