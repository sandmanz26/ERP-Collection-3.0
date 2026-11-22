import React, { useEffect, useRef } from 'react';
import { Icon } from '../atoms/Icon.jsx';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Organism: Modal dialog (shadcn Dialog behaviour). Esc and backdrop click close it; focus moves into the
 * dialog (first field, else the dialog), Tab stays inside, and focus returns to the opener on close.
 * size = narrow | default | wide.
 */
export function Modal({ title, onClose, children, footer, wide, size }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    const el = ref.current;
    // the first field, else the dialog's main action (a confirm), else the dialog itself
    const first = el?.querySelector('.modal-body input:not([disabled]):not([type=hidden]), .modal-body select:not([disabled]), .modal-body textarea:not([disabled])') ?? el?.querySelector('.modal-foot .btn.primary, .modal-foot .btn.danger');
    (first || el)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (opener && document.contains(opener)) opener.focus?.(); };
  }, []);
  const cls = size ?? (wide ? 'wide' : '');
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className={`modal ${cls}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
