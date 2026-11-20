import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  type MatchSettings,
  type MeldShape,
  OPENING_MINIMUM,
  addOptions,
  chooseOption,
  describeMeld,
  meldValue,
  newMeldOptions,
  scoreRound,
  sideOf,
} from '@indra/engine';
import { type SortMode, cardName, pts, sortHand } from '../game/format';
import { buzz, isMuted, setMuted } from '../game/sound';
import type { TableController } from '../game/controller';
import { HUMAN } from '../game/useLocalMatch';
import { ChatButton, ChatSheet, ChatToast, DropPrompt, EndedOverlay, ReconnectBanner, TurnTimer } from '../online/TableExtras';
import { CardFace } from '../ui/Card';
import { Hand } from '../ui/Hand';
import { MeldArea } from '../ui/Melds';
import { IndraFlash, RoundOver, ScoreSheet } from '../ui/Overlays';
import { Piles } from '../ui/Piles';
import { Seats } from '../ui/Seats';

interface Staged {
  cardIds: string[];
  start?: number;
}

type Choice = { kind: 'new'; options: MeldShape[] } | { kind: 'add'; meldId: string; options: MeldShape[] };

export function Game({ controller, settings, onExit }: { controller: TableController; settings: MatchSettings; onExit: () => void }) {
  const { match, act, error, clearError, indra, thinking, nextRound, restart, names, online } = controller;
  const round = match.round;
  const sideNames: [string, string] = settings.players === 2 ? ['You', names[1]] : ['Your team', 'Their team'];
  const mySide = sideOf(HUMAN);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [staged, setStaged] = useState<Staged[]>([]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('suit');
  /** Your own arrangement of the hand (card ids, left to right). New cards go on the right. */
  const [order, setOrder] = useState<string[]>([]);
  const [viewingTable, setViewingTable] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [chatOpen, setChatOpen] = useState(false);
  /** Says which card was just picked up, e.g. "You drew the 7♥ from the pit." */
  const [drawNote, setDrawNote] = useState<string | null>(null);
  const prevRound = useRef(round);
  const prevRounds = useRef(match.history.length);

  const myTurn = match.status === 'playing' && round.turn === HUMAN && !indra;
  const handAll = round.hands[HUMAN];
  const stagedIds = useMemo(() => new Set(staged.flatMap((s) => s.cardIds)), [staged]);
  const hand = useMemo(() => {
    const visible = handAll.filter((c) => !stagedIds.has(c.id));
    const pos = new Map(order.map((id, i) => [id, i]));
    const arranged = visible.filter((c) => pos.has(c.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
    const fresh = sortHand(
      visible.filter((c) => !pos.has(c.id)),
      sortMode,
    );
    return [...arranged, ...fresh];
  }, [handAll, stagedIds, order, sortMode]);
  const selectedCards = hand.filter((c) => selected.has(c.id));
  const needOpening = round.openingRequired[mySide] && !round.opened[mySide];

  // New round: fresh sorted hand, back to the live table.
  useEffect(() => {
    setOrder([]);
    setViewingTable(false);
  }, [match.history.length, match.status === 'playing']);

  // Reset selection whenever the turn or round changes.
  useEffect(() => {
    setSelected(new Set());
    setStaged([]);
    setChoice(null);
  }, [round.turn, match.history.length]);

  // Drop selections of cards that left the hand.
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(handAll.map((c) => c.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [handAll]);

  useEffect(() => {
    const p = prevRound.current;
    const sameRound = prevRounds.current === match.history.length;
    prevRound.current = round;
    prevRounds.current = match.history.length;
    if (p === round) return;
    if (!sameRound || round.turn !== p.turn) {
      setDrawNote(null);
      return;
    }
    if (p.phase !== 'draw' || round.phase !== 'play') return;
    const seat = round.turn;
    const fromDiscard = round.pickups.length > p.pickups.length;
    const pile = fromDiscard ? 'the discard pile' : 'the pit';
    if (seat === HUMAN) {
      const before = new Set(p.hands[HUMAN].map((c) => c.id));
      const card = round.hands[HUMAN].find((c) => !before.has(c.id));
      setDrawNote(card ? `You ${fromDiscard ? 'took' : 'drew'} the ${cardName(card)} from ${pile}.` : null);
    } else {
      const taken = p.discard[p.discard.length - 1];
      setDrawNote(fromDiscard && taken ? `${names[seat]} took the ${cardName(taken)} from the discard pile.` : `${names[seat]} drew a card from the pit.`);
    }
  }, [round, match.history.length, names]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 4200);
    return () => clearTimeout(t);
  }, [error, clearError]);

  const playing = myTurn && round.phase === 'play';
  const newOptions = playing && selectedCards.length >= 3 ? newMeldOptions(selectedCards) : [];
  const addable = useMemo(() => {
    const ids = new Set<string>();
    if (!playing || selectedCards.length === 0 || needOpening) return ids;
    for (const m of round.melds) if (m.side === mySide && addOptions(m, selectedCards).length) ids.add(m.id);
    return ids;
  }, [playing, selectedCards, needOpening, round.melds, mySide]);

  const stagedShapes = staged.map((s) => chooseOption(newMeldOptions(handAll.filter((c) => s.cardIds.includes(c.id))), s.start)).filter(Boolean) as MeldShape[];
  const stagedTotal = stagedShapes.reduce((n, m) => n + meldValue(m), 0);

  const toggle = (id: string) => {
    if (!myTurn) return;
    buzz();
    setChoice(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commitNew = (shape: MeldShape) => {
    const cardIds = selectedCards.map((c) => c.id);
    const start = shape.kind === 'run' ? shape.start : undefined;
    setChoice(null);
    if (needOpening) {
      setStaged((s) => [...s, { cardIds, start }]);
      setSelected(new Set());
      return;
    }
    if (act({ type: 'meld', melds: [{ cardIds, start }] })) setSelected(new Set());
  };

  const layDown = () => {
    const distinct = newOptions;
    if (distinct.length > 1) setChoice({ kind: 'new', options: distinct });
    else if (distinct.length === 1) commitNew(distinct[0]);
  };

  const commitAdd = (meldId: string, shape: MeldShape) => {
    setChoice(null);
    const start = shape.kind === 'run' ? shape.start : undefined;
    if (act({ type: 'add', meldId, cardIds: selectedCards.map((c) => c.id), start })) setSelected(new Set());
  };

  const tapMeld = (meldId: string) => {
    const meld = round.melds.find((m) => m.id === meldId)!;
    const options = addOptions(meld, selectedCards);
    if (options.length > 1) setChoice({ kind: 'add', meldId, options });
    else if (options.length === 1) commitAdd(meldId, options[0]);
  };

  const open = () => {
    if (act({ type: 'meld', melds: staged })) setStaged([]);
  };

  const moveCard = (id: string, toIndex: number) => {
    const ids = hand.map((c) => c.id).filter((x) => x !== id);
    ids.splice(toIndex, 0, id);
    setOrder(ids);
    buzz();
  };

  const sortNow = () => {
    const next: SortMode = sortMode === 'suit' ? 'rank' : 'suit';
    setSortMode(next);
    setOrder(sortHand(hand, next).map((c) => c.id));
  };

  const discard = () => {
    const [card] = selectedCards;
    if (card && act({ type: 'discard', cardId: card.id })) setSelected(new Set());
  };

  const live = scoreRound(round);
  const top = round.discard[round.discard.length - 1];
  const showing = playing && selectedCards.length === 1 && handAll.length === 1;

  let prompt: string;
  if (match.status !== 'playing') prompt = 'Round over. Everyone\'s leftover cards are face up.';
  else if (indra) prompt = '';
  else if (!myTurn) prompt = thinking ? `${thinking} is thinking…` : drawNote ?? `${names[round.turn]} is playing…`;
  else if (round.phase === 'draw') prompt = top ? `Your turn. Draw from the pit, or take the ${cardName(top)}.` : 'Your turn. Draw from the pit.';
  else if (round.indraTurn) prompt = "You took Indra. Lay down what you can, then discard. You can't show this turn.";
  else if (round.mustLay && needOpening) prompt = `You took the discard, so open with 10 points this turn. Stage melds, then open (${pts(stagedTotal)} of 10 staged).`;
  else if (round.mustLay && selectedCards.length === 0) prompt = `${drawNote ?? 'You took the discard.'} Now lay down or add at least one card before you discard.`;
  else if (needOpening) prompt = `Your side needs 10 points to open. Stage melds, then open (${pts(stagedTotal)} of 10 staged).`;
  else if (selectedCards.length === 0) prompt = drawNote ? `${drawNote} Lay down or add cards, then discard one.` : 'Select cards to lay down or add to a meld, then discard one card.';
  else if (addable.size) prompt = 'Tap a glowing meld to add, or lay down a new one.';
  else if (newOptions.length) prompt = `That's a ${newOptions[0].kind}. ${needOpening ? 'Stage it' : 'Lay it down'}, or select more cards.`;
  else prompt = selectedCards.length === 1 ? (showing ? 'Tap the discard pile to show!' : 'Tap the discard pile to discard it, or select more cards.') : 'Select at least 3 cards that make a set or a run.';

  const scorePill = (side: number) => (
    <button type="button" className={`score-pill ${side === mySide ? 'mine' : 'theirs'} ${round.turn % 2 === side && match.status === 'playing' ? 'on' : ''}`} onClick={() => setSheetOpen(true)} aria-label={`${sideNames[side]}: ${pts(live[side].live)} this round, ${pts(match.scores[side])} in the match. Open the score sheet.`}>
      <span className="who">{sideNames[side]}</span>
      <span className="live">{pts(live[side].live)}</span>
      <span className="total">match {pts(match.scores[side])}</span>
    </button>
  );

  const myMelds = round.melds.filter((m) => m.side === mySide);
  const theirMelds = round.melds.filter((m) => m.side !== mySide);

  return (
    <LayoutGroup>
      <div className="table">
        <header className="topbar">
          <button type="button" className="icon-btn" onClick={() => setLeaving(true)} aria-label="Leave the game">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5 L8 12 L15 19" />
            </svg>
          </button>
          <button type="button" className="sheet-btn" onClick={() => setSheetOpen(true)} aria-label="Open the score sheet">
            <span className="sheet-btn-title">Score sheet</span>
            <span className="sheet-btn-note">{settings.target === null ? 'No target' : `First to ${settings.target}`}</span>
          </button>
          {online && <ChatButton online={online} onOpen={() => setChatOpen(true)} />}
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            aria-pressed={!muted}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" />
              {muted ? <path d="M17 9 L22 14 M22 9 L17 14" /> : <path d="M16.5 8.5 C18.5 10.5 18.5 13.5 16.5 15.5 M19 6 C22.5 9.5 22.5 14.5 19 18" />}
            </svg>
          </button>
        </header>

        <Seats players={settings.players} names={names} hands={round.hands} turn={match.status === 'playing' ? round.turn : -1} indraHolder={round.indraHolder} reveal={match.status !== 'playing'} />

        <MeldArea label={`${sideNames[1]} melds`} score={scorePill(1 - mySide)} melds={theirMelds} emptyText={`${sideNames[1] === 'Their team' ? 'Their' : `${sideNames[1]}'s`} melds will appear here.`} />

        <Piles
          pit={round.pit}
          discard={round.discard}
          indra={round.indra}
          indraHolderName={round.indraHolder === null ? null : names[round.indraHolder]}
          canDraw={myTurn && round.phase === 'draw'}
          discardCard={playing && selectedCards.length === 1 ? selectedCards[0] : null}
          onDrawPit={() => act({ type: 'draw', from: 'pit' })}
          onDrawDiscard={() => act({ type: 'draw', from: 'discard' })}
          onDiscard={discard}
        />

        <MeldArea label="Your melds" score={scorePill(mySide)} melds={myMelds} emptyText={needOpening ? 'Open with at least 10 points this round.' : 'Your melds will appear here.'} addable={addable} onTapMeld={tapMeld} />

        {staged.length > 0 && (
          <div className="staging" aria-label="Staged melds">
            <div className="staging-melds">
              {staged.map((s, i) => (
                <span className="meld staged" key={i}>
                  <span className="meld-cards">
                    {handAll
                      .filter((c) => s.cardIds.includes(c.id))
                      .map((c) => (
                        <CardFace key={c.id} card={c} size="mini" />
                      ))}
                  </span>
                </span>
              ))}
            </div>
            <div className="staging-actions">
              <button type="button" className="btn ghost small" onClick={() => setStaged([])}>
                Return cards
              </button>
              <button type="button" className="btn primary small" disabled={stagedTotal < OPENING_MINIMUM} onClick={open}>
                Open with {pts(stagedTotal)}
              </button>
            </div>
          </div>
        )}

        <div className={`prompt ${error ? 'error' : ''}`} role="status" aria-live="polite">
          {error ?? prompt}
        </div>
        {online && match.status === 'playing' && !indra && <TurnTimer deadline={online.deadline} mine={myTurn} total={online.turnSeconds} />}

        <Hand cards={hand} selected={selected} onToggle={toggle} onMove={moveCard} disabled={!myTurn} />

        {match.status !== 'playing' && viewingTable ? (
          <div className="round-bar">
            <span className="round-bar-title">{match.status === 'match-over' ? 'Match over' : 'Round over'}</span>
            <div className="round-bar-actions">
              <button type="button" className="btn small" onClick={() => setViewingTable(false)}>
                Scores
              </button>
              <button type="button" className="btn primary small" onClick={match.status === 'match-over' ? restart : nextRound}>
                {match.status === 'match-over' ? 'Play again' : 'Deal next round'}
              </button>
            </div>
          </div>
        ) : (
        <div className="actions">
          <button type="button" className="btn ghost small sort" onClick={sortNow}>
            Sort by {sortMode === 'suit' ? 'rank' : 'suit'}
          </button>
          <AnimatePresence mode="popLayout" initial={false}>
            {choice ? (
              <motion.div key="choice" className="choice" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {choice.options.map((o, i) => (
                  <button key={i} type="button" className="btn small" onClick={() => (choice.kind === 'new' ? commitNew(o) : commitAdd(choice.meldId, o))}>
                    {describeMeld(o)}
                  </button>
                ))}
              </motion.div>
            ) : (
              <motion.div key="main" className="main-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {newOptions.length > 0 && (
                  <button type="button" className="btn" onClick={layDown}>
                    {needOpening ? 'Stage meld' : 'Lay down'}
                  </button>
                )}
                {playing && selectedCards.length === 1 && (
                  <button type="button" className={`btn primary ${showing ? 'show' : ''}`} onClick={discard}>
                    {showing ? 'Show' : `Discard ${cardName(selectedCards[0])}`}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        )}

        <IndraFlash show={!!indra} name={indra ? names[indra.seat] : null} />

        {match.status !== 'playing' && !viewingTable && (!online || !online.ended) && (
          <RoundOver match={match} sideNames={sideNames} names={names} onNext={nextRound} onRestart={restart} onHome={() => (online ? setLeaving(true) : onExit())} onViewTable={() => setViewingTable(true)} />
        )}

        {online && (
          <>
            <ChatToast online={online} hidden={chatOpen} />
            {chatOpen && <ChatSheet online={online} onClose={() => setChatOpen(false)} />}
            <DropPrompt online={online} />
            <EndedOverlay online={online} onLeave={onExit} />
            <ReconnectBanner online={online} />
          </>
        )}

        {leaving && (
          <div className="modal-scrim" onClick={() => setLeaving(false)}>
            <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" onClick={(e) => e.stopPropagation()}>
              <h2 id="leave-title" className="modal-title">
                Leave this game?
              </h2>
              <p className="modal-note">{online ? 'The others will be asked whether a bot should take your seat. You can rejoin with the room code.' : 'The match and its score sheet will be lost.'}</p>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={onExit}>
                  Leave game
                </button>
                <button type="button" className="btn primary" onClick={() => setLeaving(false)}>
                  Keep playing
                </button>
              </div>
            </div>
          </div>
        )}

        {sheetOpen && (
          <div className="modal-scrim" onClick={() => setSheetOpen(false)}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
              <h2 id="sheet-title" className="modal-title">
                Score sheet
              </h2>
              <p className="modal-note">
                {settings.target === null ? 'No target: the sheet keeps running.' : `First to ${settings.target} wins.`}
                {settings.openingRule ? ' After 100, open with 10 points.' : ''}
              </p>
              <ScoreSheet match={match} sideNames={sideNames} />
              <div className="modal-actions">
                <button type="button" className="btn primary" onClick={() => setSheetOpen(false)}>
                  Back to the table
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutGroup>
  );
}
