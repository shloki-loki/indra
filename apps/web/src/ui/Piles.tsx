import type { Card } from '@indra/engine';
import { cardName } from '../game/format';
import { CardBack, CardFace, Vajra } from './Card';

interface Props {
  pit: Card[];
  discard: Card[];
  indra: Card[];
  indraHolderName: string | null;
  canDraw: boolean;
  /** The card that tapping the discard pile would throw away (one card selected during your turn). */
  discardCard: Card | null;
  onDrawPit: () => void;
  onDrawDiscard: () => void;
  onDiscard: () => void;
}

const LAYER = 1.5;

/** The centre of the table: pit deck, the sealed Indra deck, and the discard pile. */
export function Piles({ pit, discard, indra, indraHolderName, canDraw, discardCard, onDrawPit, onDrawDiscard, onDiscard }: Props) {
  const top = discard[discard.length - 1];
  const under = discard[discard.length - 2];
  const pitTop = pit[pit.length - 1];
  // Stack height reflects how many cards are there: the pit (dozens) looks thicker than Indra (13).
  const pitDepth = Math.min(7, Math.ceil(pit.length / 10));
  const indraDepth = Math.min(2, Math.ceil(indra.length / 10));
  const canDiscard = !!discardCard;
  const discardReady = (canDraw && !!top) || canDiscard;

  return (
    <div className="piles">
      <button type="button" className={`pile pit ${canDraw ? 'ready' : ''}`} onClick={onDrawPit} disabled={!canDraw || (!pit.length && discard.length < 2)} aria-label={`Draw from the pit deck, ${pit.length} cards`}>
        <span className="stack">
          {Array.from({ length: pitDepth }, (_, i) => (
            <CardBack key={i} style={{ position: 'absolute', top: -i * LAYER, left: i * LAYER }} />
          ))}
          {pitTop && <CardBack id={pitTop.id} style={{ position: 'absolute', top: -pitDepth * LAYER, left: pitDepth * LAYER }} />}
        </span>
        <span className="pile-label">Pit · {pit.length}</span>
      </button>

      <div className="indra-slot" aria-label={indraHolderName ? `Indra claimed by ${indraHolderName}` : 'Indra deck, 13 cards, sealed'}>
        <span className="stack">
          {indra.map((c, i) => {
            const layer = Math.min(i, indraDepth);
            return <CardBack key={c.id} id={c.id} style={{ position: 'absolute', top: -layer * LAYER, left: layer * LAYER }} />;
          })}
          {indra.length > 0 && (
            <span className="seal">
              <Vajra className="seal-vajra" />
            </span>
          )}
          {indra.length === 0 && <span className="indra-empty" />}
        </span>
        <span className="pile-label indra-label">{indraHolderName ? `Claimed by ${indraHolderName}` : 'Indra · 13'}</span>
      </div>

      <button
        type="button"
        className={`pile discard ${discardReady ? 'ready' : ''}`}
        onClick={canDiscard ? onDiscard : onDrawDiscard}
        disabled={!discardReady}
        aria-label={canDiscard ? `Discard the ${cardName(discardCard!)}` : top ? 'Take the top discard' : 'Discard pile is empty'}
      >
        <span className="stack">
          {under && <CardFace key={under.id} card={under} style={{ position: 'absolute', top: 2, left: -3, rotate: -5 }} />}
          {top && <CardFace key={top.id} card={top} style={{ position: 'absolute', top: 0, left: 0, rotate: 3 }} />}
          {!top && <span className="pile-empty" />}
        </span>
        <span className="pile-label">{canDiscard ? 'Tap to discard' : 'Discard'}</span>
      </button>
    </div>
  );
}
