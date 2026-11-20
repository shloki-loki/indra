import { type MotionStyle, motion } from 'framer-motion';
import { type Card as CardT, rankLabel } from '@indra/engine';
import { SUIT_SYMBOL, cardName, isRed } from '../game/format';

export type CardSize = 'hand' | 'mini' | 'tiny';

const spring = { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 } as const;
/** Face-down cards (an opponent's draw) glide slowly enough to follow from the pile to their seat. */
const glide = { type: 'tween', duration: 0.6, ease: [0.22, 1, 0.36, 1] } as const;

export function Bolt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 20" aria-hidden="true">
      <path d="M7.5 0 L1 11 H5.5 L3.5 20 L11 7.5 H6.5 L8.5 0 Z" fill="currentColor" />
    </svg>
  );
}

export function Vajra({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 80" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <ellipse cx="20" cy="40" rx="5" ry="7" fill="currentColor" />
      <path d="M20 33 V10 M20 47 V70" />
      <path d="M20 31 C9 28 8 16 14 8 M20 31 C31 28 32 16 26 8" />
      <path d="M20 49 C9 52 8 64 14 72 M20 49 C31 52 32 64 26 72" />
      <circle cx="20" cy="6" r="2.6" fill="currentColor" />
      <circle cx="20" cy="74" r="2.6" fill="currentColor" />
    </svg>
  );
}

interface FaceProps {
  card: CardT;
  size?: CardSize;
  selected?: boolean;
  joker?: boolean;
  onClick?: () => void;
  style?: MotionStyle;
  layout?: boolean;
  /** Let the card be dragged (to rearrange a hand). Reports where it was dropped, in viewport coordinates. */
  draggable?: boolean;
  onDragStart?: () => void;
  onDrop?: (point: { x: number; y: number }) => void;
}

export function CardFace({ card, size = 'hand', selected, joker, onClick, style, layout = true, draggable, onDragStart, onDrop }: FaceProps) {
  const cls = ['card', 'face', size, isRed(card) ? 'red' : 'black', selected && 'selected', joker && 'joker', onClick && 'tappable']
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      <span className="idx">
        <span className="rank">{rankLabel(card.rank)}</span>
        <span className="suit">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      {size === 'hand' && <span className="pip">{SUIT_SYMBOL[card.suit]}</span>}
      {card.rank === 2 && <Bolt className="wild" />}
    </>
  );
  if (onClick) {
    return (
      <motion.button
        type="button"
        layoutId={layout ? card.id : undefined}
        transition={spring}
        className={cls}
        style={style}
        onClick={onClick}
        drag={draggable}
        dragSnapToOrigin
        dragMomentum={false}
        dragElastic={1}
        whileDrag={{ scale: 1.12, zIndex: 60 }}
        onDragStart={onDragStart}
        onDragEnd={(event) => {
          const e = event as PointerEvent;
          onDrop?.({ x: e.clientX, y: e.clientY });
        }}
        aria-pressed={selected}
        aria-label={`${cardName(card)}${card.rank === 2 ? ', wild' : ''}`}
      >
        {content}
      </motion.button>
    );
  }
  return (
    <motion.div layoutId={layout ? card.id : undefined} transition={spring} className={cls} style={style} aria-label={cardName(card)}>
      {content}
    </motion.div>
  );
}

export function CardBack({ id, size = 'hand', style }: { id?: string; size?: CardSize; style?: MotionStyle }) {
  return <motion.div layoutId={id} transition={glide} className={`card back ${size}`} style={style} aria-hidden="true" />;
}
