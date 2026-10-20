import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ReceiptText, Users, Tag, History, Calendar, Pencil, Plus, X } from 'lucide-react';
import { fmtMoney } from '../utils/formatters';
import { matchCreditToEarner } from '../utils/importer';
export { formatTxnDate, getColumnAliases, toYmd, getColumnRecentTransactions } from '../utils/columnTooltipUtils';
import { formatTxnDate, getColumnAliases, toYmd, getColumnRecentTransactions } from '../utils/columnTooltipUtils';


/**
 * Floating dark-mode tooltip rendered via React Portal directly into document.body.
 * Provides interactive inline editing for statement aliases and column names.
 */
export function ColumnHeaderHoverTooltip({
  column,
  type = 'bill',
  rect,
  transactions = [],
  dailyMatrix = {},
  selectedAccountId = 'all',
  asOfDate = null,
  people = [],
  accounts = [],
  onUpdateAliases,
  onUpdateName,
  onMouseEnter,
  onMouseLeave
}) {
  // Inline editing state for aliases
  const [editingAliasIdx, setEditingAliasIdx] = useState(null);
  const [draftAliasValue, setDraftAliasValue] = useState('');
  const [isAddingAlias, setIsAddingAlias] = useState(false);
  const [newAliasValue, setNewAliasValue] = useState('');

  // Inline editing state for column name
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftNameValue, setDraftNameValue] = useState('');

  if (!column || !rect) return null;

  const aliases = getColumnAliases(column, type);
  const recentTxns = getColumnRecentTransactions({
    column,
    type,
    transactions,
    dailyMatrix,
    selectedAccountId,
    asOfDate,
    people,
    accounts
  });

  const isAnyInputActive = editingAliasIdx !== null || isAddingAlias || isEditingName;

  // Handle saving an existing alias edit
  const handleCommitAlias = (idx) => {
    const trimmed = draftAliasValue.trim();
    const updated = [...aliases];
    if (!trimmed) {
      // If user cleared the alias, remove it
      updated.splice(idx, 1);
    } else if (trimmed.includes(',')) {
      // Split multiple comma-separated values if pasted
      const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
      updated.splice(idx, 1, ...parts);
    } else {
      updated[idx] = trimmed;
    }
    setEditingAliasIdx(null);
    if (onUpdateAliases) {
      onUpdateAliases(column, type, updated);
    }
  };

  // Handle adding a new alias
  const handleCommitNewAlias = () => {
    const trimmed = newAliasValue.trim();
    if (trimmed) {
      const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
      const updated = [...aliases, ...parts];
      if (onUpdateAliases) {
        onUpdateAliases(column, type, updated);
      }
    }
    setIsAddingAlias(false);
    setNewAliasValue('');
  };

  // Handle removing an alias
  const handleRemoveAlias = (idx) => {
    const updated = aliases.filter((_, i) => i !== idx);
    if (onUpdateAliases) {
      onUpdateAliases(column, type, updated);
    }
  };

  // Handle saving column name
  const handleCommitName = () => {
    const trimmed = draftNameValue.trim();
    if (trimmed && trimmed !== column.name && onUpdateName) {
      onUpdateName(column, type, trimmed);
    }
    setIsEditingName(false);
  };

  // Wrap onMouseLeave to prevent closing while an inline input is actively focused
  const handleWrapperMouseLeave = (e) => {
    if (isAnyInputActive) return;
    if (onMouseLeave) onMouseLeave(e);
  };

  // Tooltip geometry calculations
  const tooltipWidth = 316;
  const estimatedHeight = 310;

  // Horizontal centering with screen edge clamping
  let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
  if (left + tooltipWidth > window.innerWidth - 12) {
    left = window.innerWidth - tooltipWidth - 12;
  }
  if (left < 12) {
    left = 12;
  }

  // Vertical placement (prefer below header, flip above if constrained)
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  let top;
  let transform = 'none';

  if (spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove) {
    top = rect.bottom + 8;
    if (top + estimatedHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - estimatedHeight - 12);
    }
  } else {
    top = rect.top - 8;
    transform = 'translateY(-100%)';
  }

  return createPortal(
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={handleWrapperMouseLeave}
      style={{ top, left, transform }}
      className="fixed z-50 w-[316px] p-3.5 rounded-2xl bg-slate-950/95 border border-slate-700/80 shadow-[0_20px_45px_rgba(0,0,0,0.85)] backdrop-blur-md text-slate-200 pointer-events-auto animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      {/* Popover Header: Column Title & Category Badge */}
      <div className="flex items-start justify-between gap-2 mb-3 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`p-1.5 rounded-lg border flex-shrink-0 ${
            type === 'bill'
              ? 'bg-rose-950/70 border-rose-800/60 text-rose-300'
              : 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300'
          }`}>
            {type === 'bill' ? (
              <ReceiptText className="w-4 h-4" />
            ) : (
              <Users className="w-4 h-4" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <input
                type="text"
                autoFocus
                value={draftNameValue}
                onChange={e => setDraftNameValue(e.target.value)}
                onBlur={handleCommitName}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCommitName();
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
                className="bg-slate-900 text-slate-100 border border-blue-400 rounded px-1.5 py-0.5 text-xs font-bold outline-none w-full shadow-inner"
              />
            ) : (
              <div
                onClick={() => {
                  setIsEditingName(true);
                  setDraftNameValue(column.name || '');
                }}
                className="group/name flex items-center gap-1.5 cursor-pointer max-w-full"
                title="Click to rename column"
              >
                <h4 className="text-xs font-bold text-slate-100 truncate group-hover/name:text-blue-300 transition-colors">
                  {column.name}
                </h4>
                <Pencil className="w-2.5 h-2.5 text-slate-500 group-hover/name:text-blue-400 opacity-0 group-hover/name:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            )}
            <p className="text-[10px] text-slate-400 capitalize">
              {type === 'bill' ? 'Recurring Bill' : 'Household Earner'}
            </p>
          </div>
        </div>

        {type === 'bill' && column.amount !== undefined && (
          <div className="text-right flex-shrink-0">
            <span className="text-[11px] font-mono font-bold text-rose-300">
              {fmtMoney(column.amount)}
            </span>
            <span className="block text-[9px] text-slate-500 font-medium">budgeted</span>
          </div>
        )}
      </div>

      {/* Top Header Section: Statement Aliases (Click to Update) */}
      <div className="space-y-1.5 mb-2.5">
        <div className="flex items-center justify-between text-[10px] uppercase font-extrabold tracking-wider text-slate-400">
          <span className="flex items-center gap-1.5">
            <Tag className="w-3 h-3 text-blue-400" />
            Statement Aliases
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-400 font-sans lowercase font-normal">click alias to edit</span>
            {aliases.length > 0 && (
              <span className="text-[9px] text-blue-400 font-mono font-semibold">
                {aliases.length}
              </span>
            )}
          </div>
        </div>

        <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800/60 max-h-24 overflow-y-auto matrix-scrollbar">
          <div className="flex flex-wrap items-center gap-1.5">
            {aliases.map((alias, idx) => {
              if (editingAliasIdx === idx) {
                return (
                  <input
                    key={`editing-alias-${idx}`}
                    type="text"
                    autoFocus
                    value={draftAliasValue}
                    onChange={e => setDraftAliasValue(e.target.value)}
                    onBlur={() => handleCommitAlias(idx)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCommitAlias(idx);
                      if (e.key === 'Escape') setEditingAliasIdx(null);
                    }}
                    className="bg-slate-950 text-blue-200 border border-blue-400 rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold outline-none shadow-inner w-28"
                  />
                );
              }

              return (
                <div
                  key={`alias-${idx}`}
                  onClick={() => {
                    setEditingAliasIdx(idx);
                    setDraftAliasValue(alias);
                    setIsAddingAlias(false);
                  }}
                  className="group/alias inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-900 text-blue-300 border border-blue-900/60 hover:border-blue-400 hover:text-white transition-colors cursor-pointer shadow-sm relative select-none"
                  title="Click to edit alias"
                >
                  <span>{alias}</span>
                  <Pencil className="w-2.5 h-2.5 text-blue-400/50 group-hover/alias:text-blue-300 transition-colors" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveAlias(idx);
                    }}
                    className="opacity-0 group-hover/alias:opacity-100 hover:text-rose-400 transition-opacity p-0.5 -mr-1"
                    title="Remove alias"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}

            {/* Inline Add Alias Input or Button */}
            {isAddingAlias ? (
              <input
                type="text"
                autoFocus
                placeholder="New alias..."
                value={newAliasValue}
                onChange={e => setNewAliasValue(e.target.value)}
                onBlur={handleCommitNewAlias}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCommitNewAlias();
                  if (e.key === 'Escape') {
                    setIsAddingAlias(false);
                    setNewAliasValue('');
                  }
                }}
                className="bg-slate-950 text-blue-200 border border-blue-400 rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold outline-none shadow-inner w-28 placeholder:text-slate-500"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsAddingAlias(true);
                  setNewAliasValue('');
                  setEditingAliasIdx(null);
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-slate-400 hover:text-blue-300 hover:bg-slate-800/80 border border-dashed border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer"
                title="Add new statement alias"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>Add</span>
              </button>
            )}
          </div>

          {aliases.length === 0 && !isAddingAlias && (
            <p className="text-[10px] text-slate-500 italic text-center py-1">
              No aliases defined. Click <span className="text-blue-400 font-semibold cursor-pointer" onClick={() => setIsAddingAlias(true)}>+ Add</span> to create one.
            </p>
          )}
        </div>
      </div>

      {/* Divider / Separator line */}
      <div className="border-t border-slate-800/80 my-2.5" />

      {/* Recent Activity Section: Up to Last 10 Transactions */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] uppercase font-extrabold tracking-wider text-slate-400">
          <span className="flex items-center gap-1.5">
            <History className="w-3 h-3 text-amber-400" />
            Recent Activity
          </span>
          <span className="text-[9px] text-slate-500 font-mono">
            {recentTxns.length > 0 ? `Last ${recentTxns.length}` : '0 recorded'}
          </span>
        </div>

        {recentTxns.length > 0 ? (
          <div className="max-h-40 overflow-y-auto space-y-1 matrix-scrollbar pr-0.5">
            {recentTxns.map((txn, idx) => (
              <div
                key={txn.id || `recent-${idx}`}
                className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-slate-900/60 border border-slate-800/50 hover:bg-slate-850/80 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <Calendar className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[11px] font-mono font-medium text-slate-300 block">
                      {formatTxnDate(txn.date)}
                    </span>
                    {txn.description && txn.description.toLowerCase() !== (column.name || '').toLowerCase() && (
                      <span className="text-[9px] text-slate-500 truncate block max-w-[150px]" title={txn.description}>
                        {txn.description}
                      </span>
                    )}
                  </div>
                </div>

                <span className={`text-xs font-mono font-bold flex-shrink-0 ${
                  type === 'bill' ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {fmtMoney(txn.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/40 text-center">
            <p className="text-[10.5px] text-slate-500 italic">No recent transactions recorded</p>
            <p className="text-[9px] text-slate-600 mt-0.5">Recorded items will appear here automatically</p>
          </div>
        )}
      </div>

      {/* Subtle Bottom Tip */}
      <div className="mt-2.5 pt-2 border-t border-slate-900/90 text-center">
        <p className="text-[9px] text-slate-500 font-medium">Click any alias or name above to edit inline</p>
      </div>
    </div>,
    document.body
  );
}
