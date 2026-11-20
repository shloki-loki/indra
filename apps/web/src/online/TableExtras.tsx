import { useEffect, useRef, useState } from 'react';
import type { ChatLine } from '@indra/room';
import type { OnlineTable } from '../game/controller';

/** Seconds left in the current turn, as a thin bar that turns red near the end. */
export function TurnTimer({ deadline, mine, total }: { deadline: number | null; mine: boolean; total: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (deadline === null) return <div className="turn-timer idle" aria-hidden="true" />;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const share = Math.max(0, Math.min(1, (deadline - now) / (total * 1000)));
  const urgent = left <= 10;
  return (
    <div className={`turn-timer ${mine ? 'mine' : ''} ${urgent ? 'urgent' : ''}`} role="timer" aria-label={`${left} seconds left in this turn`}>
      <span className="turn-timer-bar" style={{ transform: `scaleX(${share})` }} />
      <span className="turn-timer-text">{mine ? `${left}s to play` : `${left}s`}</span>
    </div>
  );
}

export function ChatButton({ online, onOpen }: { online: OnlineTable; onOpen: () => void }) {
  return (
    <button type="button" className="icon-btn chat-btn" onClick={onOpen} aria-label={online.unread ? `Chat, ${online.unread} new` : 'Chat'}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5 H20 V16 H10 L5 20 V16 H4 Z" />
      </svg>
      {online.unread > 0 && <span className="badge">{online.unread > 9 ? '9+' : online.unread}</span>}
    </button>
  );
}

export function ChatLog({ lines, seatOf, mine }: { lines: ChatLine[]; seatOf: (l: ChatLine) => number | null; mine?: number }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);
  return (
    <div className="chat-log" aria-live="polite">
      {lines.length === 0 && <p className="chat-empty">No messages yet. Say hello.</p>}
      {lines.map((l) =>
        l.seat === null ? (
          <p key={l.id} className="chat-note">
            {l.text}
          </p>
        ) : (
          <p key={l.id} className={`chat-line ${seatOf(l) === (mine ?? 0) ? 'me' : ''}`}>
            <span className="chat-name">{l.name}</span>
            <span className="chat-text">{l.text}</span>
          </p>
        ),
      )}
      <div ref={end} />
    </div>
  );
}

export function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form
      className="chat-input"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSend(text);
        setText('');
      }}
    >
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Message the table" aria-label="Message" enterKeyHint="send" />
      <button type="submit" className="btn primary small" disabled={!text.trim()}>
        Send
      </button>
    </form>
  );
}

export function ChatSheet({ online, onClose }: { online: OnlineTable; onClose: () => void }) {
  const { markRead, chat } = online;
  useEffect(() => {
    markRead();
  }, [chat.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal chat-sheet" role="dialog" aria-modal="true" aria-labelledby="chat-title" onClick={(e) => e.stopPropagation()}>
        <div className="chat-head">
          <h2 id="chat-title" className="modal-title">
            Table chat
          </h2>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </div>
        <ChatLog lines={chat} seatOf={online.chatSeat} />
        <ChatInput onSend={online.sendChat} />
      </div>
    </div>
  );
}

/** The newest message from someone else, shown briefly over the table. */
export function ChatToast({ online, hidden }: { online: OnlineTable; hidden: boolean }) {
  const last = [...online.chat].reverse().find((l) => l.seat !== null && online.chatSeat(l) !== 0);
  const [shown, setShown] = useState<number | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (!last) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setShown(last.id);
    const t = setTimeout(() => setShown(null), 4500);
    return () => clearTimeout(t);
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (hidden || !last || shown !== last.id) return null;
  return (
    <div className="chat-toast" role="status">
      <span className="chat-name">{last.name}</span> {last.text}
    </div>
  );
}

export function DropPrompt({ online }: { online: OnlineTable }) {
  const drop = online.drop;
  if (!drop || drop.seat === 0) return null;
  return (
    <div className="modal-scrim">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="drop-title">
        <h2 id="drop-title" className="modal-title">
          {drop.reason === 'left' ? `${drop.name} left the table` : `${drop.name} keeps running out of time`}
        </h2>
        <p className="modal-note">A bot can play their seat so the game carries on{drop.reason === 'left' ? ', and they can take it back if they rejoin' : ''}. Otherwise the game ends here.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => online.answerDrop(false)}>
            End the game
          </button>
          <button type="button" className="btn primary" onClick={() => online.answerDrop(true)}>
            Let a bot play
          </button>
        </div>
      </div>
    </div>
  );
}

export function EndedOverlay({ online, onLeave }: { online: OnlineTable; onLeave: () => void }) {
  if (!online.ended) return null;
  return (
    <div className="modal-scrim">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="ended-title">
        <h2 id="ended-title" className="modal-title">
          Game over
        </h2>
        <p className="modal-note">{online.ended}</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onLeave}>
            Leave room
          </button>
          {online.isHost ? (
            <button type="button" className="btn primary" onClick={online.backToLobby}>
              Back to the lobby
            </button>
          ) : (
            <span className="modal-note">Waiting for the host…</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReconnectBanner({ online }: { online: OnlineTable }) {
  if (online.connected) return null;
  return (
    <div className="reconnect" role="status">
      Connection lost. Reconnecting…
    </div>
  );
}
