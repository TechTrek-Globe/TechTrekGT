import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * InlineEditableCell
 * 
 * Reusable spreadsheet-like editable cell component.
 * Supports:
 * - Double-click or Enter to activate edit mode
 * - Tab navigation (saves edit and advances focus naturally to the next cell)
 * - Escape key to cancel editing without changes
 * - Enter or blur to commit changes
 * - Optimistic UI updates with in-flight loading indicators
 * - Client-side validation (non-negative numbers by default)
 * - Zero layout shift design matching surrounding cell geometry
 * - Accessible aria-labels and keyboard navigation
 * - Responsive guard: disables inline editing on mobile (<640px) with fallback to edit modal
 */
export function InlineEditableCell({
  value,
  displayValue,
  onSave,
  validate,
  type = 'number',
  min = 0,
  step = '0.01',
  ariaLabel,
  colHeader = 'Value',
  align = 'right',
  className = '',
  textClassName = '',
  isSaving = false,
  disabled = false,
  onEditStart,
  onEditEnd,
  onMobileFallback
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentInput, setCurrentInput] = useState(value != null ? String(value) : '');
  const [internalSaving, setInternalSaving] = useState(false);
  const inputRef = useRef(null);
  const cellRef = useRef(null);
  const isCancellingRef = useRef(false);

  // Sync internal input value when external value changes and not editing
  useEffect(() => {
    if (!isEditing) {
      setCurrentInput(value != null ? String(value) : '');
    }
  }, [value, isEditing]);

  // Focus and select input on entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const isMobile = useCallback(() => {
    return typeof window !== 'undefined' && window.innerWidth < 640;
  }, []);

  const handleStartEditing = useCallback((e) => {
    if (disabled || isSaving || internalSaving) return;

    if (isMobile()) {
      if (onMobileFallback) {
        onMobileFallback();
      }
      return;
    }

    if (e) {
      e.stopPropagation();
    }
    if (onEditStart) {
      onEditStart();
    }
    setCurrentInput(value != null ? String(value) : '');
    setIsEditing(true);
  }, [disabled, isSaving, internalSaving, isMobile, onMobileFallback, onEditStart, value]);

  const handleCancel = useCallback(() => {
    isCancellingRef.current = true;
    setIsEditing(false);
    setCurrentInput(value != null ? String(value) : '');
    if (onEditEnd) {
      onEditEnd();
    }
    if (cellRef.current) {
      cellRef.current.focus();
    }
  }, [value, onEditEnd]);

  const handleCommit = useCallback(async () => {
    if (!isEditing || isCancellingRef.current) {
      isCancellingRef.current = false;
      return;
    }

    const trimmed = String(currentInput).trim();

    // Default numeric validation
    let finalVal;
    if (type === 'number') {
      const numVal = trimmed === '' ? 0 : parseFloat(trimmed);
      if (isNaN(numVal) || !isFinite(numVal)) {
        handleCancel();
        return;
      }
      if (min != null && numVal < min) {
        handleCancel();
        return;
      }
      finalVal = numVal;
    } else {
      finalVal = trimmed;
    }

    // Custom validator
    if (validate) {
      const customValidation = validate(finalVal);
      if (customValidation && customValidation.isValid === false) {
        handleCancel();
        return;
      }
    }

    // Check if unchanged
    if (type === 'number' && Number(finalVal) === Number(value || 0)) {
      setIsEditing(false);
      if (onEditEnd) onEditEnd();
      return;
    } else if (type !== 'number' && String(finalVal) === String(value || '')) {
      setIsEditing(false);
      if (onEditEnd) onEditEnd();
      return;
    }

    setIsEditing(false);
    if (onEditEnd) onEditEnd();
    setInternalSaving(true);
    try {
      if (onSave) {
        await onSave(finalVal);
      }
    } catch (err) {
      console.error('Inline cell save failed:', err);
      // Revert input on error
      setCurrentInput(value != null ? String(value) : '');
    } finally {
      setInternalSaving(false);
    }
  }, [isEditing, currentInput, type, min, validate, value, handleCancel, onEditEnd, onSave]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
    } else if (e.key === 'Tab') {
      // Commit the change, allowing default Tab behavior to focus the next cell
      handleCommit();
    }
  };

  const handleCellKeyDown = (e) => {
    if (disabled || isSaving || internalSaving) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleStartEditing(e);
    }
  };

  const loadingActive = isSaving || internalSaving;
  const computedAriaLabel = ariaLabel || `${colHeader}: ${displayValue || value || 'empty'}`;

  const alignmentClass = align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left';

  return (
    <div
      ref={cellRef}
      role="gridcell"
      tabIndex={disabled || isEditing ? -1 : 0}
      aria-label={computedAriaLabel}
      onDoubleClick={handleStartEditing}
      onKeyDown={handleCellKeyDown}
      className={`relative inline-flex items-center w-full h-[22px] min-h-[22px] max-h-[22px] select-none outline-none focus:ring-1 focus:ring-amber-500/50 rounded transition-all ${alignmentClass} ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-800/40'
      } ${className}`}
      title={disabled ? undefined : 'Double-click or press Enter to edit'}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type={type}
          min={min}
          step={step}
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleCommit}
          aria-label={ariaLabel || `Edit ${colHeader}`}
          className={`w-full h-full bg-slate-950 border border-amber-500 rounded px-1 py-0 text-xs font-mono font-bold text-amber-200 outline-none shadow-sm focus:ring-1 focus:ring-amber-400 m-0 ${
            align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
          }`}
          style={{ boxSizing: 'border-box' }}
        />
      ) : (
        <div className={`flex items-center gap-1 w-full truncate ${alignmentClass}`}>
          {loadingActive ? (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
              <span className={`truncate text-xs ${textClassName}`}>
                {displayValue != null ? displayValue : value}
              </span>
            </span>
          ) : (
            <span className={`truncate ${textClassName}`}>
              {displayValue != null ? displayValue : value}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
