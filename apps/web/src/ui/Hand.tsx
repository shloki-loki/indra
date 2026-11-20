import { useLayoutEffect, useRef, useState } from 'react';
import type { Card } from '@indra/engine';
import { CardFace } from './Card';

interface Props {
  cards: Card[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Move a card to a new position in the hand (index into `cards`). */
  onMove: (id: string, toIndex: number) => void;
  disabled?: boolean;
}

const LIFT = 16;

/**
 * Your hand: an overlapping fan that splits into two rows when it gets long (e.g. after Indra).
 * Tap a card to select it; drag it sideways (or to the other row) to rearrange.
 */
export function Hand({ cards, selected, onToggle, onMove, disabled }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [width, setWidth] = useState(360);
  const [cardWidth, setCardWidth] = useState(56);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      setWidth(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      // Mirrors --cw in styles.css: clamp(46px, 12.6vw, 74px).
      setCardWidth(Math.min(74, Math.max(46, window.innerWidth * 0.126)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const split = cards.length > 15 ? Math.ceil(cards.length / 2) : cards.length;
  const rows: Card[][] = split < cards.length ? [cards.slice(0, split), cards.slice(split)] : [cards];
  const layout = rows.map((row) => {
    const n = row.length;
    const step = n > 1 ? Math.min(cardWidth * 0.66, (width - cardWidth) / (n - 1)) : 0;
    const start = (width - (step * (n - 1) + cardWidth)) / 2;
    return { n, step, start };
  });

  const drop = (id: string, point: { x: number; y: number }) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const padLeft = parseFloat(getComputedStyle(el).paddingLeft);
    const r = rows.length > 1 && point.y > rect.top + rect.height / 2 ? 1 : 0;
    const { n, step, start } = layout[r];
    const x = point.x - rect.left - padLeft - start - cardWidth / 2;
    const slot = step > 0 ? Math.round(x / step) : 0;
    const index = (r === 1 ? split : 0) + Math.max(0, Math.min(n - 1, slot));
    if (cards[index]?.id !== id) onMove(id, index);
  };

  return (
    <div className={`hand ${disabled ? 'waiting' : ''}`} ref={ref}>
      {rows.map((row, r) => {
        const { n, step, start } = layout[r];
        return (
          <div className="hand-row" key={r} style={{ height: `calc(var(--cw) * 1.4 + ${LIFT}px)` }}>
            {row.map((card, i) => {
              const t = n > 1 ? i / (n - 1) - 0.5 : 0;
              return (
                <CardFace
                  key={card.id}
                  card={card}
                  selected={selected.has(card.id)}
                  onClick={() => {
                    if (!dragging.current) onToggle(card.id);
                  }}
                  draggable
                  onDragStart={() => {
                    dragging.current = true;
                  }}
                  onDrop={(point) => {
                    drop(card.id, point);
                    setTimeout(() => {
                      dragging.current = false;
                    }, 0);
                  }}
                  style={{
                    position: 'absolute',
                    left: start + i * step,
                    top: LIFT + Math.abs(t) * 10 - (selected.has(card.id) ? LIFT : 0),
                    rotate: rows.length === 1 ? t * 8 : 0,
                    zIndex: i + 1,
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
