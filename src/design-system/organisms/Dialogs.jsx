import React, { createContext, useCallback, useContext, useState } from 'react';
import { Modal } from './Modal.jsx';

/**
 * Organism: promise-based dialogs replacing window.prompt/confirm/alert.
 *   const dialog = useDialog();
 *   if (await dialog.confirm({ title, message })) …
 *   const values = await dialog.form({ title, fields: [{ name, label, type, options, defaultValue, required }] });
 *   const text = await dialog.prompt({ title, label, defaultValue });
 *   await dialog.alert({ title, message });
 */
const DialogCtx = createContext(null);

export function DialogProvider({ children }) {
  const [req, setReq] = useState(null);
  const open = useCallback((kind, opts) => new Promise((resolve) => setReq({ kind, opts, resolve })), []);
  const api = {
    confirm: (opts) => open('confirm', opts),
    alert: (opts) => open('alert', opts),
    prompt: async ({ title, label = 'Value', defaultValue = '', type = 'text', required = true, hint }) => {
      const r = await open('form', { title, fields: [{ name: 'value', label, defaultValue, type, required, hint }] });
      return r ? r.value : null;
    },
    form: (opts) => open('form', opts),
  };
  const close = (value) => { req?.resolve(value); setReq(null); };
  return (
    <DialogCtx.Provider value={api}>
      {children}
      {req?.kind === 'confirm' && (
        <Modal size="narrow" title={req.opts.title ?? 'Please confirm'} onClose={() => close(false)}
          footer={<><button className="btn" onClick={() => close(false)}>{req.opts.cancelLabel ?? 'Cancel'}</button><button autoFocus className={`btn ${req.opts.danger ? 'danger solid' : 'primary'}`} onClick={() => close(true)}>{req.opts.confirmLabel ?? 'Confirm'}</button></>}>
          <p style={{ margin: 0 }}>{req.opts.message}</p>
        </Modal>
      )}
      {req?.kind === 'alert' && (
        <Modal size="narrow" title={req.opts.title ?? 'Notice'} onClose={() => close(true)} footer={<button autoFocus className="btn primary" onClick={() => close(true)}>OK</button>}>
          <p style={{ margin: 0 }}>{req.opts.message}</p>
        </Modal>
      )}
      {req?.kind === 'form' && <FormDialog opts={req.opts} onDone={close} />}
    </DialogCtx.Provider>
  );
}

function FormDialog({ opts, onDone }) {
  const [v, setV] = useState(() => Object.fromEntries(opts.fields.map((f) => [f.name, f.defaultValue ?? (f.type === 'checkbox' ? false : '')])));
  const [touched, setTouched] = useState(false);
  const missing = opts.fields.filter((f) => f.required && (v[f.name] === '' || v[f.name] === null || v[f.name] === undefined));
  const submit = (e) => {
    e?.preventDefault();
    setTouched(true);
    if (missing.length) return;
    const out = { ...v };
    opts.fields.forEach((f) => { if (f.type === 'number') out[f.name] = Number(out[f.name]); });
    onDone(out);
  };
  return (
    <Modal size={opts.fields.length > 3 ? undefined : 'narrow'} title={opts.title} onClose={() => onDone(null)}
      footer={<><button className="btn" onClick={() => onDone(null)}>Cancel</button><button className="btn primary" onClick={submit}>{opts.submitLabel ?? 'Save'}</button></>}>
      {opts.description && <p className="muted" style={{ marginTop: 0 }}>{opts.description}</p>}
      <form onSubmit={submit} className={opts.fields.length > 3 ? 'grid g2' : 'stack'}>
        {opts.fields.map((f, i) => {
          const invalid = touched && missing.includes(f);
          const common = { autoFocus: i === 0, value: v[f.name], onChange: (e) => setV({ ...v, [f.name]: f.type === 'checkbox' ? e.target.checked : e.target.value }), className: invalid ? 'invalid' : '' };
          return (
            <label key={f.name} className="field" style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
              {f.type !== 'checkbox' && <span>{f.label}{f.required ? ' *' : ''}</span>}
              {f.type === 'select' ? <select {...common}>{f.options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}</select>
                : f.type === 'textarea' ? <textarea {...common} />
                  : f.type === 'checkbox' ? <span className="row"><input type="checkbox" checked={!!v[f.name]} onChange={common.onChange} autoFocus={i === 0} />{f.label}</span>
                    : <input type={f.type ?? 'text'} {...common} />}
              {f.hint && <span className="hint">{f.hint}</span>}
              {invalid && <span className="error">Required</span>}
            </label>
          );
        })}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function useDialog() {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>');
  return ctx;
}
