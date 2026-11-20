import { parseCard } from '@indra/engine';
import { CardFace } from '../ui/Card';

function Row({ codes, joker }: { codes: string; joker?: string }) {
  return (
    <span className="example" aria-label={codes}>
      {codes.split(' ').map((code, i) => {
        const card = parseCard(code);
        return <CardFace key={`${code}-${i}`} card={card} size="mini" joker={code === joker} layout={false} />;
      })}
    </span>
  );
}

export function HowToPlay({ onBack }: { onBack: () => void }) {
  return (
    <main className="page rules">
      <button type="button" className="back-link" onClick={onBack}>
        Back
      </button>
      <h1 className="page-title">How to play</h1>
      <p className="lede">Two players or two teams of two, two full decks, thirteen cards each. Get your cards onto the table in sets and runs, and score more than the other side.</p>

      <h2>The table</h2>
      <p>Everyone gets 13 cards. Another 13 go face down in the middle, sealed: that's the Indra deck. One card starts the discard pile and the rest is the pit.</p>

      <h2>Your turn</h2>
      <p>Draw one card, either the top of the pit or the top discard. Then lay down as many melds as you like, or add cards to your side's melds. End your turn by discarding one card.</p>

      <h2>Sets and runs</h2>
      <p>A set is three or more of the same rank, in any suits. Duplicates are fine, because there are two decks.</p>
      <Row codes="7S 7H 7H'" />
      <p>A run is three or more in a row, all in one suit. Aces go high or low, but runs never wrap from King round to 2.</p>
      <Row codes="5H 6H 7H 8H 9H" />

      <h2>Twos are wild</h2>
      <p>Any 2 can stand in for a missing card, but only one wild 2 per meld. A 2 in its own place in its own suit is just a 2.</p>
      <Row codes="7C 2D 9C" joker="2D" />
      <p>If you hold the real 8♣, play it into that run. The 2 stays on the table and slides to either end, so the run can now grow from 6♣ or 10♣.</p>

      <h2>Showing and the Indra deck</h2>
      <p>When your last discard empties your hand, you show. The first player to show takes the 13 sealed Indra cards and plays on straight away, without drawing, but can't show again until their next turn. The second show, by anyone, ends the round.</p>

      <h2>Scoring</h2>
      <table className="breakdown values">
        <tbody>
          <tr>
            <th scope="row">3 to 7</th>
            <td>½ point</td>
          </tr>
          <tr>
            <th scope="row">8 to King, and 2</th>
            <td>1 point</td>
          </tr>
          <tr>
            <th scope="row">Ace</th>
            <td>1½ points</td>
          </tr>
          <tr>
            <th scope="row">Each show</th>
            <td>+10</td>
          </tr>
          <tr>
            <th scope="row">Taking Indra</th>
            <td>+10</td>
          </tr>
          <tr>
            <th scope="row">Meld of 7+ with no wild 2</th>
            <td>+20</td>
          </tr>
          <tr>
            <th scope="row">Meld of 7+ with a wild 2</th>
            <td>+10</td>
          </tr>
        </tbody>
      </table>
      <p>Your round score is your cards on the table plus bonuses, minus whatever is still in your hand. First side to 200 wins. Once your side passes 100, your first lay-down of each round must be worth at least 10 points; a 7-card bonus counts toward it.</p>
    </main>
  );
}
