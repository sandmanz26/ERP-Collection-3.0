import React, { useRef, useState } from 'react';

/**
 * Organism: site / floor plan. Units are meters; the SVG scales to its container.
 * elements: [{ id, type, label, x, y, w, h, shape: 'rect'|'circle', sub? }]
 * Drag an element to move it (snapped to 0.5 m); onMove(element, x, y) fires on drop.
 */
export function SitePlan({ width, height, elements, selectedId, onSelect, onMove, readOnly, highlightIds = [] }) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const toMeters = (e) => {
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
  };
  const down = (e, el) => {
    onSelect?.(el);
    if (readOnly || !onMove) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toMeters(e);
    setDrag({ id: el.id, ox: p.x - el.x, oy: p.y - el.y, x: el.x, y: el.y, el });
  };
  const move = (e) => {
    if (!drag) return;
    const p = toMeters(e);
    const snap = (v) => Math.round(v * 2) / 2;
    setDrag({ ...drag, x: Math.max(0, Math.min(width - drag.el.w, snap(p.x - drag.ox))), y: Math.max(0, Math.min(height - drag.el.h, snap(p.y - drag.oy))) });
  };
  const up = () => {
    if (drag && (drag.x !== drag.el.x || drag.y !== drag.el.y)) onMove(drag.el, drag.x, drag.y);
    setDrag(null);
  };
  const grid = [];
  for (let x = 0; x <= width; x++) grid.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={height} className={x % 5 ? 'sp-grid' : 'sp-grid major'} />);
  for (let y = 0; y <= height; y++) grid.push(<line key={`y${y}`} x1={0} y1={y} x2={width} y2={y} className={y % 5 ? 'sp-grid' : 'sp-grid major'} />);
  return (
    <svg ref={svgRef} className="siteplan" viewBox={`-1 -1 ${width + 2} ${height + 2}`} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onClick={() => onSelect?.(null)} role="img" aria-label="Site plan">
      <rect x={0} y={0} width={width} height={height} className="sp-floor" />
      {grid}
      {elements.map((el) => {
        const x = drag?.id === el.id ? drag.x : el.x;
        const y = drag?.id === el.id ? drag.y : el.y;
        const cls = `sp-el sp-${el.type} ${selectedId === el.id ? 'selected' : ''} ${highlightIds.includes(el.id) ? 'highlight' : ''} ${readOnly ? '' : 'movable'}`;
        const fs = Math.max(0.35, Math.min(0.85, el.w / Math.max(3.2, el.label.length * 0.62)));
        const subFs = el.sub ? Math.max(0.28, Math.min(fs * 0.8, (el.w * 0.92) / (el.sub.length * 0.55))) : 0;
        return (
          <g key={el.id} className={cls} onPointerDown={(e) => down(e, el)} onClick={(e) => e.stopPropagation()}>
            <title>{`${el.label}${el.sub ? ` — ${el.sub}` : ''} (${el.w}×${el.h} m)`}</title>
            {el.shape === 'circle'
              ? <ellipse cx={x + el.w / 2} cy={y + el.h / 2} rx={el.w / 2} ry={el.h / 2} />
              : <rect x={x} y={y} width={el.w} height={el.h} rx={0.2} />}
            <text x={x + el.w / 2} y={y + el.h / 2 + (el.sub ? -0.15 : 0.2)} fontSize={fs} textAnchor="middle">{el.label}</text>
            {el.sub && <text x={x + el.w / 2} y={y + el.h / 2 + fs * 0.9} fontSize={subFs} textAnchor="middle" className="sp-sub">{el.sub}</text>}
          </g>
        );
      })}
      <text x={width} y={height + 0.8} fontSize={0.6} textAnchor="end" className="sp-sub">{width} × {height} m · grid 1 m</text>
    </svg>
  );
}
