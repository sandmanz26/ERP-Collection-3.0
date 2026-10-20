import React from 'react';

/** Organism: Card — titled surface with an optional action slot. */
export function Card({ title, actions, children, className = '', style }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Organism: page header with breadcrumbs, title, subtitle and actions. */
export function PageHeader({ crumbs, title, subtitle, actions, children }) {
  return (
    <div className="page-head">
      <div className="grow">
        {crumbs && <div className="crumbs">{crumbs}</div>}
        <h1>{title}</h1>
        {subtitle && <div className="muted">{subtitle}</div>}
        {children}
      </div>
      {actions && <div className="row no-print">{actions}</div>}
    </div>
  );
}
