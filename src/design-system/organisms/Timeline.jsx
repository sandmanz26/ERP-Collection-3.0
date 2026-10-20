import React from 'react';
import { Icon } from '../atoms/Icon.jsx';

/**
 * Organism: Timeline — a vertical, dated list grouped by period (e.g. month).
 * groups: [{ id, label, items: [{ id, date, title, detail?, icon?, tone?: ok|brand|warn|danger|neutral, done?, past?, aside?, onClick? }] }]
 * `marker` (optional) inserts a "Today" divider before the first item dated on/after it.
 */
export function Timeline({ groups, formatDate = (d) => d, marker }) {
  let markerShown = !marker;
  return (
    <div className="vtl">
      {groups.map((g) => (
        <section key={g.id} className="vtl-group">
          <h4 className="vtl-period">{g.label}</h4>
          <ol className="vtl-list">
            {g.items.map((it) => {
              const showMarker = !markerShown && it.date >= marker.date;
              if (showMarker) markerShown = true;
              const Body = it.onClick ? 'button' : 'div';
              return (
                <React.Fragment key={it.id}>
                  {showMarker && <li className="vtl-now" aria-label={marker.label}><span>{marker.label}</span></li>}
                  <li className={`vtl-item vtl-${it.tone ?? 'neutral'} ${it.done ? 'done' : ''} ${it.past && !it.done ? 'past' : ''}`}>
                    <span className="vtl-dot">{it.done ? <Icon name="check" size={11} strokeWidth={2.5} /> : it.icon ? <Icon name={it.icon} size={11} /> : null}</span>
                    <Body type={it.onClick ? 'button' : undefined} className="vtl-body" onClick={it.onClick}>
                      <time className="vtl-date">{formatDate(it.date)}</time>
                      <span className="vtl-title">{it.title}</span>
                      {it.detail && <span className="vtl-detail">{it.detail}</span>}
                      {it.aside && <span className="vtl-aside">{it.aside}</span>}
                    </Body>
                  </li>
                </React.Fragment>
              );
            })}
          </ol>
        </section>
      ))}
      {!markerShown && <div className="vtl-now standalone"><span>{marker.label}</span></div>}
    </div>
  );
}
