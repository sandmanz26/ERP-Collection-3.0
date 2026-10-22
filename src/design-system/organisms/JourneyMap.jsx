import React, { useEffect, useRef } from 'react';
import { Icon } from '../atoms/Icon.jsx';

/**
 * Organism: JourneyMap — a road from the first step to the last, with a "You are here" pin.
 * stops: [{ id, label, date?, status: 'done'|'current'|'todo'|'exit', icon?, emphasis? }]
 * position: where the pin sits, in stop units (0 = first stop, 2.5 = halfway between stops 3 and 4).
 * Stops are buttons (onSelect) so the page can explain any step; the selected one is outlined.
 */
const W = 1000;
const H = 184;
const PAD = 48;
const MID = 92;
const AMP = 16;
const roadY = (x) => MID + AMP * Math.sin(((x - PAD) / (W - 2 * PAD)) * Math.PI * 2.5);

export function JourneyMap({ stops, position = 0, pinLabel = 'You are here', pinSub, selectedId, onSelect, formatDate = (d) => d }) {
  const scroller = useRef(null);
  const n = stops.length;
  const xOf = (i) => PAD + (i * (W - 2 * PAD)) / Math.max(1, n - 1);
  const pos = Math.max(0, Math.min(n - 1, position));
  const pinX = xOf(pos);
  const pts = Array.from({ length: 121 }, (_, k) => { const x = PAD + (k * (W - 2 * PAD)) / 120; return `${x.toFixed(1)},${roadY(x).toFixed(1)}`; });
  const d = `M${pts.join(' L')}`;
  const pct = (x) => `${(x / W) * 100}%`;

  // On narrow screens the map scrolls sideways: bring the pin into view.
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (pinX / W) * el.scrollWidth - el.clientWidth / 2;
  }, [pinX]);

  return (
    <div className="jmap-scroll" ref={scroller}>
      <div className="jmap" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="jmap-svg">
          <defs><clipPath id="jmap-done"><rect x="0" y="0" width={pinX} height={H} /></clipPath></defs>
          <path d={d} className="jmap-bed" vectorEffect="non-scaling-stroke" />
          <path d={d} className="jmap-ahead" vectorEffect="non-scaling-stroke" />
          <path d={d} className="jmap-done" clipPath="url(#jmap-done)" vectorEffect="non-scaling-stroke" />
        </svg>
        {stops.map((s, i) => {
          const x = xOf(i);
          return (
            <button key={s.id} type="button" className={`jmap-stop ${s.status} ${s.emphasis ? 'big' : ''} ${selectedId === s.id ? 'selected' : ''}`}
              style={{ left: pct(x), top: roadY(x) }} onClick={() => onSelect?.(s.id)} aria-pressed={selectedId === s.id}
              aria-label={`${s.label}${s.date ? `, ${formatDate(s.date)}` : ''}, ${s.status === 'done' ? 'done' : s.status === 'current' ? 'in progress' : s.status === 'exit' ? 'stopped' : 'upcoming'}`}>
              <span className="jmap-dot">{s.status === 'done' ? <Icon name="check" size={s.emphasis ? 16 : 13} strokeWidth={2.5} /> : s.status === 'exit' ? <Icon name="x" size={13} strokeWidth={2.5} /> : <Icon name={s.icon ?? 'flag'} size={s.emphasis ? 17 : 13} />}</span>
              <span className="jmap-label">{s.label}</span>
              <span className="jmap-date">{s.date ? formatDate(s.date) : ''}</span>
            </button>
          );
        })}
        <div className="jmap-pin" style={{ left: pct(pinX), top: roadY(pinX) }} role="img" aria-label={`${pinLabel}${pinSub ? ` — ${pinSub}` : ''}`}>
          <span className="jmap-bubble"><b>{pinLabel}</b>{pinSub && <small>{pinSub}</small>}</span>
          <span className="jmap-marker" />
        </div>
      </div>
    </div>
  );
}
