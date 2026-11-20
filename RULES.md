# INDRA — Rules Spec (v1.0, locked 2026-11-20)

This file holds the rules as Shlok described them. Items marked **[DEFAULT]** are choices Shlok didn't specify, so we picked one; any of them can be changed. The rules engine (`packages/engine`), the AI and the online server all follow this file.

---

## 1. Players and cards

- **Modes:** 1 vs 1, or 2 vs 2 (teams).
- In 2 vs 2, partners sit opposite each other and play goes round the table: A1 → B1 → A2 → B2. Partners share one score.
- **Cards:** two standard 52-card decks (104 cards). No printed jokers.
- **Jokers:** every **2** is wild. A 2 can also be played as a real 2 (see 4.3).

### Card values

| Card | Points |
|---|---|
| 3, 4, 5, 6, 7 | ½ |
| 8, 9, 10, J, Q, K | 1 |
| 2 (wild or real) | 1 |
| A | 1½ |

All 104 cards together are worth 88 points. A card is worth the same on the table and in a hand.

## 2. Setting up a round

1. Shuffle both decks together.
2. Deal 13 cards to each player.
3. Deal 13 more cards face down. This is the **Indra deck**, and it stays secret.
4. Turn one card face up to start the **discard pile**.
5. The remaining cards form the **pit deck**.

**Who starts:**
- Round 1: a random player.
- Later rounds: whoever won the previous round, meaning the side with the highest round score.
- In 2 vs 2, one of the two winning partners is picked at random. **[DEFAULT]**
- If round scores tie, the seat after the last starter begins. **[DEFAULT]**

## 3. A turn

1. **Draw.** Take exactly one card from either:
   - the **top of the discard pile**. Except on the round's very first move, taking it means you **must lay down or add at least one card this turn** (any card counts, not necessarily the one you took). You may only take it if you can do that; with the 10-point opening rule in force, that means opening with 10 this turn. If the pit is used up and can't be refilled, taking the discard is always allowed. *(Added 2026-11-20.)*
   - the **top of the pit deck**.
2. **Play (optional).** As many times as you like:
   - lay down new melds of 3 or more cards;
   - add cards to your own side's melds;
   - swap a real card for a joker (see 4.4).
3. **Discard.** End the turn by putting one card on the discard pile.
   - Any card may be discarded, including a 2.
   - You may discard the same card you just took from the discard pile, once you've laid something down.

You can never put down every card in your hand during step 2, because you must keep one card to discard.

**When the pit deck runs out:** the top discard stays where it is. The rest of the discard pile is shuffled to form a new pit deck. This happens only when the pit deck is completely empty.

## 4. Melds

### 4.1 Sets (same rank)
- 3 or more cards of the same rank, in any suits. Example: 7♠ 7♥ 7♦.
- Duplicates are fine, since there are two decks. Example: 7♥ 7♥ 7♠.
- There is no size limit.
- A set made only of 2s counts as a set of real 2s. **[DEFAULT]**

### 4.2 Runs (sequences)
- 3 or more cards in a row, **all of the same suit**.
- An ace can be low (A-2-3) or high (Q-K-A), but runs never wrap around (K-A-2 is not a run).
- The longest possible run is A-2-…-K-A (14 cards).

### 4.3 Jokers (2s)
- **A meld can contain at most one joker.** This applies to sets and runs alike.
- A 2 in its natural place in a run of its own suit is a **real 2**, not a joker. In A♥ 2♥ 3♥, the 2♥ is real.
- So a run can contain one real 2 and one joker 2. Example: A♥ 2♥ 3♥ 4♥ 5♥ 6♥ plus 2♣ standing in for 7♥.
- A 2 is worth 1 point whether it is played as a joker or a real 2.

### 4.4 Swapping a joker in a run
- Suppose a run contains a joker and you hold the real card it stands for. You can play your card in the joker's place.
- The joker never returns to a hand. It stays in the run and moves to whichever open end you choose.
- Example: 7♠ 2♦ 9♠ + your 8♠ becomes either 2♦ 7♠ 8♠ 9♠ or 7♠ 8♠ 9♠ 2♦.
- After a swap, the run still contains a joker, so it is still impure.
- If a joker is not swapped out, it keeps its place.

### 4.5 Whose melds you can add to
- Only your own side's melds: your own, plus your partner's in 2 vs 2.
- You can never add to the opponents' melds.

## 5. Opening requirement (the 10-point rule)

- This rule can be switched on or off when the room is created. It is on by default, and having it on makes the game slower.
- When it is on and your side's match score is **100 or more**, your side's first lay-down of the round must be worth **at least 10 points**.
- This is a team requirement: once either partner opens with 10 or more, the other partner can add to that meld or lay down their own melds freely.
- Several melds laid down in the same turn count together toward the 10.
- 2s count toward it.
- A 7-card bonus earned in that same lay-down also counts toward it.
- Below 100 there is no minimum.

## 6. Showing, the Indra deck, and the end of the round

### 6.1 Show
- You **show** when your discard empties your hand. You must finish with a discard.
- Each show earns **+10**. The first show and taking Indra are the same event, so they earn **+10 together**, not 20.

### 6.2 First show: the Indra deck
1. The first player to show gets **+10** (showing first and taking Indra are one bonus).
2. They take the 13 Indra cards into their hand.
3. It is immediately their turn again, but they **don't draw**, because the Indra cards count as their draw.
4. In that turn they may lay down and add cards as usual, and they must end it with a discard.
5. They **may not empty their hand on that turn**. They have to wait until their next turn to show again.
6. In 2 vs 2, Indra goes to the player who showed.

### 6.3 Second show: the round ends
- The next show by anyone, including the Indra holder, earns **+10** and **ends the round immediately**.

## 7. Bonuses

| Bonus | Points |
|---|---|
| First show (takes the Indra deck) | +10 |
| Second show (ends the round) | +10 |
| Any meld (set or run) of 7+ cards with no joker (**pure**) | +20 |
| Any meld of 7+ cards with one joker (**impure**) | +10 |

- The 7-card bonus is counted once per meld, not again at 14 cards.
- A real 2 in its natural place doesn't make a meld impure.
- The bonus depends on how the meld looks when the round ends. A pure 7-card meld that later takes a joker earns 10, not 20. **[DEFAULT]**

## 8. Scoring a round

For each player (1 vs 1) or each team (2 vs 2):

```
round score = points of your side's cards on the table
            + bonuses (shows, Indra, 7-card melds)
            − points of cards still in hand (both partners' hands in 2 vs 2)
```

A round score can be negative.

**Worked example (1 vs 1):**
- Your melds on the table are worth 18½, and one of them is a pure 7-card run.
- You showed first and took Indra.
- When the round ended you still held 3½ points.
- Score: 18½ + 20 + 10 + 10 − 3½ = **55**.

## 9. Winning the match

- Round scores add up on a running score sheet.
- Each side has a **live counter** during play: points on the table plus bonuses so far.
- The **target is 200 by default**. Players can change it in room settings or set it to **no limit**. With no limit, the score sheet keeps running and nobody wins.
- If both sides pass the target in the same round, the higher total wins. On an exact tie, play another round. **[DEFAULT]**

---

## 10. Product scope (agreed)

- **Home screen:** three options only: **Play Online**, **Play vs AI**, **How to Play**.
- **Play vs AI:**
  - Levels: Beginner, Medium, Advanced, each using a probability-based strategy.
  - Modes: 1 vs 1, or 2 vs 2 with an AI partner. **[DEFAULT]**
- **Play Online:**
  - Private rooms joined with a room code; no public table list for now.
  - 1 vs 1 or 2 vs 2, with **in-game chat** between players.
- **Room settings:**
  - Target score (200, or no limit).
  - 10-point opening rule (on/off).
  - Turn timer (60 s default).
- **Turn timer:** if time runs out, the player automatically draws from the pit deck and discards the card they drew. If they had already taken the discard, the smallest legal lay-down is made for them first.
- **Dropped player (1 vs 1 or 2 vs 2):** the others are offered a bot to replace them. If they decline, the game ends.
- **Platform:** mobile first, also desktop. English only.
- **Later:** brainstorm twists, for example making the second show different from the first.
