// Shared presentational bits: head, panel, table, form fields, modal.
import { useEffect, useRef } from "react";

export function Head({ title, sub, actions }) {
  return (
    <div className="head">
      <div><h2>{title}</h2><p>{sub}</p></div>
      <div className="head-actions">{actions}</div>
    </div>
  );
}

export function Panel({ title, actions, children }) {
  return (
    <div className="panel">
      <div className="panel-head"><h3>{title}</h3>{actions}</div>
      {children}
    </div>
  );
}

export function Table({ columns, rows, renderRow, emptyTitle, emptyBody }) {
  if (!rows || !rows.length) {
    return <div className="empty"><strong>{emptyTitle}</strong>{emptyBody}</div>;
  }
  return (
    <div className="scroller">
      <table>
        <thead><tr>{columns.map((c, i) => (
          <th key={i} className={c.align === "right" ? "right" : ""}>{c.label}</th>
        ))}</tr></thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

export function Field({ name, label, type = "text", step, min, value, defaultValue, required, placeholder, note, onChange }) {
  const id = `f-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} step={step} min={min}
        value={value} defaultValue={defaultValue} required={required}
        placeholder={placeholder} onChange={onChange} />
      {note ? <div className="note">{note}</div> : null}
    </div>
  );
}

export function Select({ name, label, options, value, defaultValue, blank, note, onChange }) {
  const id = `f-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} value={value} defaultValue={defaultValue} onChange={onChange}>
        {blank ? <option value="">{blank}</option> : null}
        {options.map((o, i) => (
          <option key={i} value={o.value}>{o.label}</option>
        ))}
      </select>
      {note ? <div className="note">{note}</div> : null}
    </div>
  );
}

// Generic modal shell. Collects named form fields with FormData on submit,
// calls onSubmit(data), and closes only when onSubmit resolves without
// throwing (errors render inline and keep the modal open).
export function Modal({ title, subtitle, submitLabel, onClose, onSubmit, children, wide }) {
  const errorRef = useRef(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    const btn = document.getElementById("modal-submit");
    if (btn) btn.disabled = true;
    try {
      const form = document.getElementById("modal-form");
      const data = Object.fromEntries(new FormData(form).entries());
      await onSubmit(data);
      onClose();
    } catch (err) {
      if (errorRef.current) {
        errorRef.current.textContent = err.message;
        errorRef.current.style.display = "block";
      }
      if (btn) btn.disabled = false;
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <div className="scrim" id="scrim" onMouseDown={(e) => { if (e.target.id === "scrim") onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}
        style={wide ? { width: "min(720px, 100%)" } : undefined}>
        <header><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</header>
        <div className="body">
          <div className="form-error" ref={errorRef} style={{ display: "none" }} />
          <form id="modal-form" onSubmit={submit}>{children}</form>
        </div>
        <footer>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" type="submit" form="modal-form" id="modal-submit">{submitLabel}</button>
        </footer>
      </div>
    </div>
  );
}
