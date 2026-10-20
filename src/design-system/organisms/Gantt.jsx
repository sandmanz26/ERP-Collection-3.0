import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Organism: Gantt timeline.
 *  range      [from, to] in abstract units (days or minutes)
 *  lanes      [{ id, label, sub, items: [{ id, start, end?, label, tone, milestone?, background?, draggable?, meta? }] }]
 *  ticks      [{ at, label, major? }]          — use dayTicks()/hourTicks() helpers below
 *  markers    [{ at, label, tone }]            — vertical lines (today, now, curfew, event day)
 *  shading    [{ start, end, label }]          — hatched areas (e.g. no venue access)
 *  pxPerUnit  horizontal scale; the track scrolls horizontally, lane labels stay sticky
 *  fit        true = scale to the container width (pxPerUnit becomes the minimum); zoom multiplies it
 *  items with showLabel render their label next to the milestone diamond
 *  onItemMove(item, deltaUnits)                — drag a draggable bar horizontally (snapped to `snap`)
 *  onItemClick(item)
 * Overlapping items inside a lane are auto-stacked into sub-rows so nothing hides behind anything else.
 */
export function Gantt({ range, lanes, ticks = [], markers = [], shading = [], pxPerUnit = 1, fit = false, zoom = 1, snap = 1, onItemMove, onItemClick, labelWidth = 210, rowHeight = 24, emptyLabel = 'Nothing scheduled' }) {
  const [from, to] = range;
  const outerRef = useRef(null);
  const [cw, setCw] = useState(0);
  useEffect(() => {
    if (!fit || !outerRef.current) return undefined;
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width));
    ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [fit]);
  const scale = (fit && cw ? Math.max(pxPerUnit * 0.25, (cw - labelWidth - 4) / (to - from)) : pxPerUnit) * zoom;
  const width = Math.max(300, (to - from) * scale);
  const pos = (v) => ((v - from) / (to - from)) * 100;
  const [drag, setDrag] = useState(null);
  // Thin tick labels so they never collide: keep a label only if it is ≥ 52px from the previous kept one.
  const shownTicks = useMemo(() => {
    let last = -Infinity;
    return ticks.map((t) => {
      const px = (t.at - from) * scale;
      const show = px - last >= 52 && (to - t.at) * scale >= 30;
      if (show) last = px;
      return { ...t, show };
    });
  }, [ticks, from, to, scale]);

  const packed = useMemo(() => lanes.map((lane) => {
    const minSpan = (to - from) * 0.012; // milestones reserve room for their diamond
    const rows = [];
    const placed = lane.items.filter((i) => !i.background).sort((a, b) => a.start - b.start).map((it) => {
      const labelSpan = it.showLabel ? (it.label.length * 6.5 + 18) / Math.max(0.01, scale) : 0;
      const end = it.milestone || it.end === undefined ? it.start + Math.max(minSpan, labelSpan) : Math.max(it.end, it.start + minSpan);
      let r = rows.findIndex((last) => last <= it.start);
      if (r < 0) { rows.push(end); r = rows.length - 1; } else rows[r] = end;
      return { ...it, row: r };
    });
    return { ...lane, placed, rows: Math.max(1, rows.length), bg: lane.items.filter((i) => i.background) };
  }), [lanes, from, to, scale]);

  const startDrag = (e, item) => {
    if (!item.draggable || !onItemMove) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id: item.id, x0: e.clientX, dx: 0, item });
  };
  const moveDrag = (e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0 });
  const endDrag = () => {
    if (!drag) return;
    const units = Math.round(drag.dx / scale / snap) * snap;
    if (units !== 0) onItemMove(drag.item, units);
    else onItemClick?.(drag.item);
    setDrag(null);
  };
  const shiftPx = (it) => (drag?.id === it.id ? `translateX(${Math.round(drag.dx / scale / snap) * snap * scale}px)` : undefined);
  const tip = (it) => `${it.label}${it.meta ? ` — ${it.meta}` : ''}`;

  return (
    <div className="gantt" ref={outerRef} style={{ '--label-w': `${labelWidth}px` }}>
      <div className="gantt-scroll">
        <div className="gantt-grid" style={{ width: labelWidth + width }}>
          <div className="gantt-head">
            <div className="gantt-label gantt-corner" />
            <div className="gantt-track" style={{ width }}>
              {shownTicks.map((t) => <div key={`${t.at}${t.label}`} className={`gantt-tick ${t.major ? 'major' : ''}`} style={{ left: `${pos(t.at)}%` }}>{t.show ? t.label : ''}</div>)}
            </div>
          </div>
          {packed.map((lane) => (
            <div className="gantt-lane" key={lane.id}>
              <div className="gantt-label" title={lane.label}>
                <div className="gantt-label-main">{lane.label}</div>
                {lane.sub && <div className="gantt-label-sub">{lane.sub}</div>}
              </div>
              <div className="gantt-track" style={{ width, height: lane.rows * rowHeight + 10 }}>
                {ticks.filter((t) => t.major).map((t) => <div key={t.at} className="gantt-gridline" style={{ left: `${pos(t.at)}%` }} />)}
                {shading.map((s, i) => <div key={i} className="gantt-shade" title={s.label} style={{ left: `${pos(Math.max(from, s.start))}%`, width: `${pos(Math.min(to, s.end)) - pos(Math.max(from, s.start))}%` }} />)}
                {lane.bg.map((it) => <div key={it.id} className={`gantt-bg tone-${it.tone ?? 'neutral'}`} title={tip(it)} style={{ left: `${pos(it.start)}%`, width: `${pos(it.end) - pos(it.start)}%` }}><span>{it.label}</span></div>)}
                {lane.placed.filter((it) => it.milestone).map((it) => (
                  <React.Fragment key={it.id}>
                    <button type="button" className={`gantt-ms tone-${it.tone ?? 'neutral'}`} style={{ top: 5 + it.row * rowHeight, left: `${pos(it.start)}%` }} title={tip(it)} aria-label={tip(it)} onClick={() => onItemClick?.(it)} />
                    {it.showLabel && <span className="gantt-ms-text" style={{ top: 4 + it.row * rowHeight, left: `calc(${pos(it.start)}% + 10px)` }}>{it.label}</span>}
                  </React.Fragment>
                ))}
                {lane.placed.filter((it) => !it.milestone).map((it) => {
                  const movable = it.draggable && onItemMove;
                  return (
                    <div key={it.id} role="button" tabIndex={0} aria-label={`${tip(it)}${movable ? '. Arrow keys move by ' + snap : ''}`}
                      className={`gantt-bar tone-${it.tone ?? 'neutral'} ${movable ? 'draggable' : ''} ${drag?.id === it.id ? 'dragging' : ''}`}
                      style={{ top: 5 + it.row * rowHeight, transform: shiftPx(it), left: `${pos(it.start)}%`, width: `${Math.max(0.4, pos(it.end) - pos(it.start))}%`, height: rowHeight - 4 }}
                      title={`${tip(it)}${movable ? ' (drag to reschedule)' : ''}`}
                      onPointerDown={(e) => startDrag(e, it)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}
                      onClick={() => !movable && onItemClick?.(it)}
                      onKeyDown={(e) => {
                        if (movable && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); onItemMove(it, e.key === 'ArrowLeft' ? -snap : snap); }
                        if (e.key === 'Enter') onItemClick?.(it);
                      }}>
                      <span>{it.label}</span>
                    </div>
                  );
                })}
                {markers.map((m) => <div key={`${m.at}${m.label}`} className={`gantt-marker tone-${m.tone ?? 'brand'}`} style={{ left: `${pos(m.at)}%` }} />)}
              </div>
            </div>
          ))}
          {packed.length === 0 && <div className="empty">{emptyLabel}</div>}
          {markers.length > 0 && (
            <div className="gantt-lane gantt-markers-row">
              <div className="gantt-label" />
              <div className="gantt-track" style={{ width, height: 18 }}>
                {markers.map((m) => <span key={`${m.at}${m.label}`} className={`gantt-marker-label tone-${m.tone ?? 'brand'}`} style={{ left: `${pos(m.at)}%` }}>{m.label}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ticks for minute-based ranges whose 0 = 00:00 of `day0` (ISO date). */
export function hourTicks([from, to], day0, every = 60) {
  const out = [];
  const step = to - from > 36 * 60 ? 120 : every;
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    const h = ((t % 1440) + 1440) % 1440 / 60;
    const dayIdx = Math.floor(t / 1440);
    const label = h === 0 ? new Date(new Date(`${day0}T00:00:00`).getTime() + dayIdx * 86400000).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }) : `${String(h).padStart(2, '0')}:00`;
    out.push({ at: t, label, major: true });
  }
  return out;
}

/** Ticks for day-based ranges: month starts are major; weekly minor gridlines optional. */
export function dayTicks([from, to], toDate) {
  const out = [];
  for (let d = from; d <= to; d++) {
    const iso = toDate(d);
    if (iso.endsWith('-01') || d === from) out.push({ at: d, label: new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), major: true });
  }
  return out;
}
