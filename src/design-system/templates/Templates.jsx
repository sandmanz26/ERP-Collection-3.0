import React from 'react';

/** Template: client/vendor portal header band. */
export function PortalTemplate({ eyebrow, title, subtitle, aside, footer, children }) {
  return (
    <div>
      <div className="portal-hero">
        <div className="row between">
          <div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>{eyebrow}</div>
            <h1>{title}</h1>
            {subtitle && <div>{subtitle}</div>}
          </div>
          {aside}
        </div>
        {footer && <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>{footer}</div>}
      </div>
      {children}
    </div>
  );
}

/** Template: phone frame for the day-of mobile experience. */
export function MobileTemplate({ title, status, children }) {
  return (
    <div className="phone">
      <div className="screen">
        <div className="bar"><b style={{ flex: 1 }}>{title}</b>{status}</div>
        <div style={{ padding: 12 }}>{children}</div>
      </div>
    </div>
  );
}

/** Template: public (unauthenticated) pages such as the RSVP website and inquiry form. */
export function PublicTemplate({ children }) {
  return <div className="public-page"><div className="inner">{children}</div></div>;
}
