import { useState } from 'react';
import type { BotLevel, MatchSettings } from '@indra/engine';

interface Props {
  onStart: (s: MatchSettings, level: BotLevel) => void;
  onBack: () => void;
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  columns = options.length,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; note?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="segmented" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <label key={String(o.value)} className={`seg ${value === o.value ? 'on' : ''} ${o.disabled ? 'off' : ''}`}>
            <input type="radio" name={label} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} />
            <span className="seg-label">{o.label}</span>
            {o.note && <span className="seg-note">{o.note}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Setup({ onStart, onBack }: Props) {
  const [players, setPlayers] = useState<2 | 4>(2);
  const [level, setLevel] = useState<BotLevel>('medium');
  const [targetMode, setTargetMode] = useState<'custom' | 'none'>('custom');
  const [custom, setCustom] = useState('200');
  const [openingRule, setOpeningRule] = useState(true);

  const customValue = Math.max(20, Math.min(5000, parseInt(custom, 10) || 0));
  const target = targetMode === 'none' ? null : customValue;

  return (
    <main className="page">
      <button type="button" className="back-link" onClick={onBack}>
        Back
      </button>
      <h1 className="page-title">Play against the computer</h1>

      <Segmented
        label="Table"
        value={players}
        onChange={setPlayers}
        options={[
          { value: 2, label: '1 vs 1', note: 'You against Arjun' },
          { value: 4, label: '2 vs 2', note: 'You and Meera against Arjun and Kabir' },
        ]}
      />

      <Segmented
        label="Computer level"
        value={level}
        onChange={setLevel}
        columns={2}
        options={[
          { value: 'beginner', label: 'Beginner', note: 'Plays the obvious move' },
          { value: 'medium', label: 'Medium', note: 'Counts the cards it needs' },
          { value: 'advanced', label: 'Advanced', note: 'Remembers every discard' },
          { value: 'expert', label: 'Expert', note: 'Plays each move out in its head' },
        ]}
      />

      <Segmented
        label="Play to"
        value={targetMode}
        onChange={setTargetMode}
        options={[
          { value: 'custom', label: 'Custom target', note: 'First side to reach it wins' },
          { value: 'none', label: 'No limit', note: 'Keep a running score sheet' },
        ]}
      />
      {targetMode === 'custom' && (
        <label className="number-field">
          <span>Target score</span>
          <input type="number" inputMode="numeric" min={20} max={5000} step={10} value={custom} onChange={(e) => setCustom(e.target.value)} />
        </label>
      )}

      <label className="toggle">
        <input type="checkbox" checked={openingRule} onChange={(e) => setOpeningRule(e.target.checked)} />
        <span className="toggle-track" aria-hidden="true" />
        <span className="toggle-text">
          <span>10-point opening after 100</span>
          <span className="seg-note">Once your side passes 100, your first lay-down each round must be worth 10. Slower, tenser games.</span>
        </span>
      </label>

      <button type="button" className="btn primary big deal" onClick={() => onStart({ players, target, openingRule }, level)}>
        Deal the cards
      </button>
    </main>
  );
}
