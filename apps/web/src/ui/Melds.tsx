import type { ReactNode } from 'react';
import { type Meld, meldBonus, meldCards } from '@indra/engine';
import { pts } from '../game/format';
import { CardFace } from './Card';

interface Props {
  melds: Meld[];
  emptyText: string;
  addable?: ReadonlySet<string>;
  onTapMeld?: (id: string) => void;
  label: string;
  /** This side's score, shown on its own half of the table. */
  score?: ReactNode;
}

/** One side's melds on the table. Melds you can add to glow while cards are selected. */
export function MeldArea({ melds, emptyText, addable, onTapMeld, label, score }: Props) {
  return (
    <section className="meld-area" aria-label={label}>
      {score && <div className="meld-head">{score}</div>}
      {melds.length === 0 && <p className="meld-empty">{emptyText}</p>}
      <div className="meld-grid">
        {melds.map((m) => {
          const canAdd = addable?.has(m.id);
          const bonus = meldBonus(m);
          const inner = (
            <>
              <span className="meld-cards">
                {meldCards(m).map((c) => (
                  <CardFace key={c.id} card={c} size="mini" joker={c.id === m.jokerId} />
                ))}
              </span>
              {bonus > 0 && <span className="meld-bonus">+{pts(bonus)}</span>}
            </>
          );
          return canAdd ? (
            <button type="button" key={m.id} className="meld can-add" onClick={() => onTapMeld?.(m.id)} aria-label="Add selected cards to this meld">
              {inner}
            </button>
          ) : (
            <div key={m.id} className="meld">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
