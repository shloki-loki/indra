import { useEffect, useState } from 'react';
import { type BotLevel, BOT_LEVELS } from '@indra/engine';
import { type RoomSettings, type RoomView, TURN_SECONDS } from '@indra/room';
import { Game } from '../screens/Game';
import { Segmented } from '../screens/Setup';
import { ONLINE_AVAILABLE, cleanCode, createRoom, inviteLink, isCode, roomInfo } from './api';
import { clientId, saveName, savedName } from './identity';
import { ChatInput, ChatLog } from './TableExtras';
import { type RoomConnection, useOnlineTable, useRoom } from './useRoom';

const LEVEL_NAME: Record<BotLevel, string> = { beginner: 'Beginner', medium: 'Medium', advanced: 'Advanced', expert: 'Expert' };

function setRoomInUrl(code: string | null) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

/** Play online: pick a name, make or join a room, wait in the lobby, play. */
export function OnlineScreen({ onBack, initialCode }: { onBack: () => void; initialCode: string | null }) {
  if (!ONLINE_AVAILABLE) return <OnlineUnavailable onBack={onBack} />;
  return <OnlineRooms onBack={onBack} initialCode={initialCode} />;
}

function OnlineUnavailable({ onBack }: { onBack: () => void }) {
  return (
    <main className="page">
      <button type="button" className="back-link" onClick={onBack}>
        Back
      </button>
      <h1 className="page-title">Play online</h1>
      <p className="lede">Online rooms aren't switched on for this site yet. Soon you'll make a room, share its code, and play 1 vs 1 or 2 vs 2 with friends, with bots filling any empty seat.</p>
      <p className="lede">Until then, play against the computer from the home screen.</p>
    </main>
  );
}

function OnlineRooms({ onBack, initialCode }: { onBack: () => void; initialCode: string | null }) {
  // Opening an invite link (or refreshing mid-game) with a saved name goes straight back into the room.
  const [joined, setJoined] = useState<{ code: string; name: string } | null>(() => (initialCode && savedName().trim() ? { code: initialCode, name: savedName().trim() } : null));
  const leave = () => {
    setRoomInUrl(null);
    setJoined(null);
  };
  if (joined) return <RoomScreen key={joined.code} code={joined.code} name={joined.name} onLeave={leave} />;
  return (
    <Entry
      initialCode={initialCode}
      onBack={() => {
        setRoomInUrl(null);
        onBack();
      }}
      onJoin={(code, name) => {
        setRoomInUrl(code);
        setJoined({ code, name });
      }}
    />
  );
}

function Entry({ onBack, onJoin, initialCode }: { onBack: () => void; onJoin: (code: string, name: string) => void; initialCode: string | null }) {
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const go = async (mode: 'create' | 'join') => {
    if (!trimmed) return setError('Type the name the others will see.');
    saveName(trimmed);
    setBusy(mode);
    setError(null);
    try {
      if (mode === 'create') onJoin(await createRoom(), trimmed);
      else {
        const info = await roomInfo(code, clientId());
        if (!info.exists) setError(`No room has the code ${code}. Check it with whoever shared it.`);
        else if (!info.joinable) setError(info.reason ?? "You can't join this room.");
        else onJoin(code, trimmed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="page online-entry">
      <button type="button" className="back-link" onClick={onBack}>
        Back
      </button>
      <h1 className="page-title">Play online</h1>
      <p className="lede">Make a room and share its code, or join a friend's room. 1 vs 1 or 2 vs 2, and bots can fill any empty seat.</p>

      <label className="text-field">
        <span>Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="e.g. Shlok" autoComplete="nickname" />
      </label>

      <div className="entry-actions">
        <section className="entry-card">
          <h2>Join a room</h2>
          <form
            className="code-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (isCode(code)) go('join');
            }}
          >
            <input
              className="code-input"
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              placeholder="CODE"
              aria-label="Room code"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
            />
            <button type="submit" className="btn primary" disabled={!isCode(code) || !!busy}>
              {busy === 'join' ? 'Joining…' : 'Join'}
            </button>
          </form>
        </section>
        <section className="entry-card">
          <h2>Start a new room</h2>
          <button type="button" className="btn" disabled={!!busy} onClick={() => go('create')}>
            {busy === 'create' ? 'Making a room…' : 'Make a room'}
          </button>
        </section>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

function RoomScreen({ code, name, onLeave }: { code: string; name: string; onLeave: () => void }) {
  const conn = useRoom(code, name);
  const table = useOnlineTable(conn);
  const { view } = conn;

  const leave = () => {
    conn.send({ t: 'leave' });
    onLeave();
  };

  if (conn.refused)
    return (
      <main className="page">
        <h1 className="page-title">Can't join {code}</h1>
        <p className="lede">{conn.refused}</p>
        <button type="button" className="btn primary" onClick={onLeave}>
          Back
        </button>
      </main>
    );
  if (!view)
    return (
      <main className="page">
        <p className="lede">{conn.status === 'retrying' ? 'Trying to reach the room…' : `Joining room ${code}…`}</p>
        <button type="button" className="btn ghost small" onClick={onLeave}>
          Cancel
        </button>
      </main>
    );
  if (view.phase !== 'lobby' && table) return <Game controller={table} settings={view.settings} onExit={leave} />;
  return <Lobby view={view} conn={conn} onLeave={leave} />;
}

function Lobby({ view, conn, onLeave }: { view: RoomView; conn: RoomConnection; onLeave: () => void }) {
  const { send } = conn;
  const host = view.isHost;
  const [picked, setPicked] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [target, setTarget] = useState(String(view.settings.target ?? 200));
  const s = view.settings;
  const setting = (settings: Partial<RoomSettings>) => send({ t: 'settings', settings });
  const open = view.seats.filter((x) => x.kind === 'open').length;
  const hostName = view.seats.find((x) => x.isHost)?.name ?? 'the host';

  // Push the typed target after a pause.
  useEffect(() => {
    if (!host || s.target === null) return;
    const n = parseInt(target, 10);
    if (!Number.isFinite(n) || n === s.target) return;
    const t = setTimeout(() => setting({ target: Math.max(20, Math.min(5000, n)) }), 500);
    return () => clearTimeout(t);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const share = async () => {
    const link = inviteLink(view.code);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Play Indra with me', text: `Join my Indra table. Room code ${view.code}.`, url: link });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* clipboard blocked: the code is on screen anyway */
    }
  };

  const tapSeat = (i: number) => {
    if (!host) return;
    if (picked === null) setPicked(i);
    else {
      if (picked !== i) send({ t: 'swap', a: picked, b: i });
      setPicked(null);
    }
  };

  const seatRow = (i: number) => {
    const seat = view.seats[i];
    const tags = [seat.isYou && 'You', seat.isHost && 'Host', seat.kind === 'human' && !seat.connected && 'Away'].filter(Boolean).join(', ');
    return (
      <li key={i} className={`lobby-seat ${seat.kind} ${picked === i ? 'picked' : ''}`}>
        <button type="button" className="lobby-seat-main" onClick={() => tapSeat(i)} disabled={!host} aria-pressed={picked === i}>
          <span className="lobby-avatar" aria-hidden="true">
            {seat.kind === 'human' ? seat.name.slice(0, 1).toUpperCase() : seat.kind === 'bot' ? '◆' : '+'}
          </span>
          <span className="lobby-who">
            <span className="lobby-name">{seat.kind === 'open' ? `${LEVEL_NAME[seat.level ?? 'medium']} bot` : seat.name}</span>
            <span className="lobby-tag">{seat.kind === 'open' ? 'Plays here unless someone joins' : tags || 'Ready'}</span>
          </span>
        </button>
        {seat.kind === 'open' && host && (
          <select className="level-select" value={seat.level} onChange={(e) => send({ t: 'bot', seat: i, level: e.target.value as BotLevel })} aria-label={`Bot level for seat ${i + 1}`}>
            {BOT_LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_NAME[l]}
              </option>
            ))}
          </select>
        )}
      </li>
    );
  };

  const teams = s.players === 4 ? [[0, 2], [1, 3]] : [[0], [1]];

  return (
    <main className="page lobby">
      <button type="button" className="back-link" onClick={onLeave}>
        Leave room
      </button>
      <div className="room-code-block">
        <span className="room-code-label">Room code</span>
        <span className="room-code" aria-label={`Room code ${view.code.split('').join(' ')}`}>
          {view.code}
        </span>
        <button type="button" className="btn small" onClick={share}>
          {copied ? 'Link copied' : 'Share invite link'}
        </button>
      </div>

      <div className="teams">
        {teams.map((team, t) => (
          <section key={t} className="team">
            <h2 className="team-title">{s.players === 4 ? `Team ${t + 1}` : t === 0 ? 'Seat 1' : 'Seat 2'}</h2>
            <ul className="lobby-seats">{team.map(seatRow)}</ul>
          </section>
        ))}
      </div>
      {host && <p className="hint">{picked === null ? 'Tap two seats to swap them.' : 'Now tap the seat to swap with.'}</p>}

      {host ? (
        <>
          <Segmented
            label="Table"
            value={s.players}
            onChange={(players) => setting({ players })}
            options={[
              { value: 2, label: '1 vs 1' },
              { value: 4, label: '2 vs 2', note: 'Partners sit opposite' },
            ]}
          />
          <Segmented
            label="Turn timer"
            value={s.turnSeconds}
            onChange={(turnSeconds) => setting({ turnSeconds })}
            options={TURN_SECONDS.map((n) => ({ value: n, label: `${n}s` }))}
          />
          <Segmented
            label="Play to"
            value={s.target === null ? 'none' : 'custom'}
            onChange={(mode) => setting({ target: mode === 'none' ? null : Math.max(20, parseInt(target, 10) || 200) })}
            options={[
              { value: 'custom', label: 'Custom target' },
              { value: 'none', label: 'No limit' },
            ]}
          />
          {s.target !== null && (
            <label className="number-field">
              <span>Target score</span>
              <input type="number" inputMode="numeric" min={20} max={5000} step={10} value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
          )}
          <label className="toggle">
            <input type="checkbox" checked={s.openingRule} onChange={(e) => setting({ openingRule: e.target.checked })} />
            <span className="toggle-track" aria-hidden="true" />
            <span className="toggle-text">
              <span>10-point opening after 100</span>
            </span>
          </label>
          <button type="button" className="btn primary big deal" onClick={() => send({ t: 'start' })}>
            {open ? `Start with ${open} bot${open > 1 ? 's' : ''}` : 'Start the game'}
          </button>
        </>
      ) : (
        <>
          <p className="lobby-summary">
            {s.players === 4 ? '2 vs 2' : '1 vs 1'}, {s.target === null ? 'no target' : `first to ${s.target}`}, {s.turnSeconds}-second turns
            {s.openingRule ? ', 10-point opening after 100.' : '.'}
          </p>
          <p className="lede waiting">Waiting for {hostName} to start the game.</p>
        </>
      )}

      {conn.error && <p className="form-error">{conn.error.message}</p>}

      <section className="lobby-chat">
        <h2 className="team-title">Chat</h2>
        <ChatLog lines={view.chat} seatOf={(l) => l.seat} mine={view.you ?? -1} />
        <ChatInput onSend={(text) => send({ t: 'chat', text })} />
      </section>
    </main>
  );
}
