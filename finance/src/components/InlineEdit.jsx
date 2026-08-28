import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Pencil, Check, X, Trash2 } from 'lucide-react';

/**
 * InlineEdit - universal click-to-edit primitive.
 *
 * Props:
 *   value       - current raw numeric or string value
 *   onCommit    - called with parsed value on commit
 *   type        - 'currency' | 'integer' | 'percent' | 'text'
 *   prefix      - display prefix (e.g. '$')
 *   suffix      - display suffix (e.g. ' days')
 *   min / max   - numeric limits
 *   step        - input step
 *   displayFn   - optional override to format display text
 *   className   - extra classes on the display trigger
 *   inputClass  - extra classes on the input element
 *   dimmed      - if true, uses muted text color for display (derived/secondary fields)
 */
/**
 * @typedef {Object} InlineEditProps
 * @property {any} value
 * @property {(val: any) => void} onCommit
 * @property {'currency' | 'integer' | 'percent' | 'text'} [type]
 * @property {string} [prefix]
 * @property {string} [suffix]
 * @property {number} [min]
 * @property {number} [max]
 * @property {number | string} [step]
 * @property {(val: any) => string} [displayFn]
 * @property {string} [className]
 * @property {string} [inputClass]
 * @property {boolean} [dimmed]
 */

/**
 * @param {InlineEditProps} props
 */
export function InlineEdit({
  value,
  onCommit,
  type = 'currency',
  prefix = '',
  suffix = '',
  min,
  max,
  step,
  displayFn,
  className = '',
  inputClass = '',
  dimmed = false,
}) {
  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState('');
  const inputRef                = useRef(null);

  // Format for display
  const formatted = displayFn
    ? displayFn(value)
    : type === 'currency'
      ? `$${parseFloat(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : type === 'percent'
        ? `${parseFloat(value || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`
        : type === 'integer'
          ? `${prefix}${parseInt(value || 0, 10).toLocaleString('en-US')}${suffix}`
          : `${prefix}${value}${suffix}`;

  const open = useCallback(() => {
    const raw = type === 'currency' || type === 'percent'
      ? parseFloat(value || 0).toFixed(type === 'percent' ? 3 : 2)
      : type === 'integer'
        ? String(parseInt(value || 0, 10))
        : String(value ?? '');
    setDraft(raw);
    setEditing(true);
  }, [value, type]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft('');
  }, []);

  const commit = useCallback(() => {
    let parsed;
    const str = String(draft ?? '').trim();
    if (type === 'currency' || type === 'percent') {
      if (str === '') {
        parsed = 0;
      } else {
        parsed = parseFloat(str);
        if (isNaN(parsed)) { cancel(); return; }
      }
      if (min !== undefined) parsed = Math.max(min, parsed);
      if (max !== undefined) parsed = Math.min(max, parsed);
    } else if (type === 'integer') {
      if (str === '') {
        parsed = 0;
      } else {
        parsed = parseInt(str, 10);
        if (isNaN(parsed)) { cancel(); return; }
      }
      if (min !== undefined) parsed = Math.max(min, parsed);
      if (max !== undefined) parsed = Math.min(max, parsed);
    } else {
      parsed = str;
    }
    onCommit(parsed);
    setEditing(false);
  }, [draft, type, min, max, onCommit, cancel]);

  const handleClear = useCallback(() => {
    const clearVal = (type === 'currency' || type === 'percent' || type === 'integer') ? 0 : '';
    onCommit(clearVal);
    setEditing(false);
  }, [type, onCommit]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  }, [commit, cancel]);

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        {(type === 'currency') && <span className="text-slate-500 text-xs">$</span>}
        <input
          ref={inputRef}
          type={type === 'text' ? 'text' : 'number'}
          step={step ?? (type === 'currency' ? '0.01' : type === 'percent' ? '0.001' : '1')}
          min={min}
          max={max}
          value={draft}
          autoFocus
          aria-label="Edit value"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          className={`bg-slate-800 border border-blue-500/70 rounded px-1.5 py-0.5 text-blue-200 text-xs font-mono text-right focus:outline-none focus:border-blue-400 w-24 ${inputClass}`}
        />
        {suffix && <span className="text-slate-500 text-xs">{suffix}</span>}
        <button
          onMouseDown={e => { e.preventDefault(); commit(); }}
          aria-label="Save changes"
          className="p-0.5 text-emerald-400 hover:text-emerald-300 transition-colors"
          title="Commit (Enter)"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          onMouseDown={e => { e.preventDefault(); handleClear(); }}
          aria-label="Clear value ($0)"
          className="p-0.5 text-slate-400 hover:text-rose-400 transition-colors"
          title="Clear value ($0)"
        >
          <Trash2 className="w-3 h-3" />
        </button>
        <button
          onMouseDown={e => { e.preventDefault(); cancel(); }}
          aria-label="Cancel editing"
          className="p-0.5 text-slate-400 hover:text-rose-400 transition-colors"
          title="Cancel (Esc)"
        >
          <X className="w-3 h-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={open}
      aria-label={`Edit value, current value is ${formatted}`}
      className={`group/ie flex items-center justify-end w-full hover:opacity-90 transition-opacity relative ${className}`}
      title="Click to edit"
    >
      <span className={dimmed ? 'text-slate-400 font-mono text-xs' : ''}>{formatted}</span>
      <Pencil className="w-2.5 h-2.5 text-slate-600 opacity-0 group-hover/ie:opacity-100 group-hover/ie:text-blue-400 transition-all absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none" />
    </button>
  );
}
