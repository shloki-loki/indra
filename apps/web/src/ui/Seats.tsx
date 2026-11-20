import type { Card } from '@indra/engine';
import { CardBack, CardFace } from './Card';

interface SeatProps {
  name: string;
  hand: Card[];
  active: boolean;
  partner?: boolean;
  holdsIndra?: boolean;
  /** Round over: show the cards they were left holding. */
  reveal?: boolean;
}

function Seat({ name, hand, active, partner, holdsIndra, reveal }: SeatProps) {
  const n = hand.length;
  const spread = reveal ? Math.min(13, 104 / Math.max(n, 1)) : Math.min(7, 110 / Math.max(n, 1));
  return (
    <div className={`seat ${active ? 'active' : ''} ${partner ? 'partner' : ''}`}>
      <div className={`seat-fan ${reveal ? 'revealed' : ''}`} style={{ width: `calc(var(${reveal ? '--mw' : '--tw'}) + ${spread * Math.max(n - 1, 0)}px)` }}>
        {hand.map((c, i) =>
          reveal ? (
            <CardFace key={c.id} card={c} size="mini" style={{ position: 'absolute', left: i * spread, top: 0 }} />
          ) : (
            <CardBack key={c.id} id={c.id} size="tiny" style={{ position: 'absolute', left: i * spread, top: 0 }} />
          ),
        )}
      </div>
      <div className="seat-name">
        <span className="avatar" aria-hidden="true">
          {name[0]}
        </span>
        <span>{name}</span>
      </div>
      <div className="seat-meta">
        {partner && <span className="seat-tag">Partner</span>}
        {reveal ? (n ? `${n} left in hand` : 'Hand empty') : `${n} ${n === 1 ? 'card' : 'cards'}`}
        {holdsIndra && <span className="indra-chip">Indra</span>}
        {active && <span className="thinking" aria-label="thinking" />}
      </div>
    </div>
  );
}

interface Props {
  players: 2 | 4;
  names: string[];
  hands: Card[][];
  turn: number;
  indraHolder: number | null;
  reveal?: boolean;
}

/** Everyone except you, in seat order around the table. */
export function Seats({ players, names, hands, turn, indraHolder, reveal }: Props) {
  const seats = players === 2 ? [1] : [1, 2, 3];
  return (
    <div className={`seats seats-${players}`}>
      {seats.map((s) => (
        <Seat key={s} name={names[s]} hand={hands[s]} active={turn === s} partner={players === 4 && s === 2} holdsIndra={indraHolder === s} reveal={reveal} />
      ))}
    </div>
  );
}
