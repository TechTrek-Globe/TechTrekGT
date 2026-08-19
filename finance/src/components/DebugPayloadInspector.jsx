// @ts-nocheck
import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  Code,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  Hash,
  CornerDownRight,
  Table
} from 'lucide-react';

/**
 * Format a primitive value with syntax highlighting
 */
function PrimitiveValue({ value }) {
  if (value === null) return <span className="text-slate-500 italic font-mono text-[11px]">null</span>;
  if (value === undefined) return <span className="text-slate-600 italic font-mono text-[11px]">undefined</span>;
  if (typeof value === 'boolean') {
    return (
      <span className={`font-mono font-bold text-[11px] px-1 py-0.5 rounded ${value ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'}`}>
        {value ? 'true' : 'false'}
      </span>
    );
  }
  if (typeof value === 'number') {
    return <span className="text-amber-300 font-mono text-[11px] font-semibold">{value}</span>;
  }
  if (typeof value === 'string') {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return <a href={value} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline break-all font-mono text-[11px]">{value}</a>;
    }
    return <span className="text-emerald-300/90 font-mono text-[11px] break-all">"{value}"</span>;
  }
  return <span className="text-slate-300 font-mono text-[11px]">{String(value)}</span>;
}

/**
 * Generic recursive key-value viewer for nested objects and arrays
 */
function GenericNestedViewer({ data, depth = 0, name = null }) {
  const [isOpen, setIsOpen] = useState(depth < 2);

  if (data === null || data === undefined || typeof data !== 'object') {
    return (
      <div className="flex items-center gap-2 py-0.5 font-mono text-[11px]">
        {name && <span className="text-cyan-400 font-semibold">{name}:</span>}
        <PrimitiveValue value={data} />
      </div>
    );
  }

  const isArray = Array.isArray(data);
  const keys = Object.keys(data);

  if (keys.length === 0) {
    return (
      <div className="flex items-center gap-2 py-0.5 font-mono text-[11px] text-slate-500">
        {name && <span className="text-cyan-400 font-semibold">{name}:</span>}
        <span>{isArray ? '[] (empty array)' : '{} (empty object)'}</span>
      </div>
    );
  }

  return (
    <div className={`my-1 ${depth > 0 ? 'ml-3 pl-2.5 border-l border-slate-800/80' : ''}`}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 py-1 text-slate-300 hover:text-slate-100 cursor-pointer font-mono text-[11px] select-none group"
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-indigo-400 shrink-0 transition-transform" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 shrink-0 transition-transform" />
        )}
        {name && <span className="font-bold text-cyan-300">{name}:</span>}
        <span className="text-slate-400 font-semibold">
          {isArray ? `Array (${keys.length} items)` : `Object (${keys.length} properties)`}
        </span>
      </div>

      {isOpen && (
        <div className="space-y-1 pt-0.5 pb-1">
          {isArray ? (
            data.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 py-0.5">
                <span className="text-[10px] font-mono text-slate-500 font-bold bg-slate-900 px-1.5 py-0.2 rounded shrink-0 mt-0.5">
                  [{idx}]
                </span>
                <div className="flex-1 min-w-0">
                  <GenericNestedViewer data={item} depth={depth + 1} />
                </div>
              </div>
            ))
          ) : (
            keys.map(key => (
              <div key={key} className="py-0.5">
                <GenericNestedViewer data={data[key]} depth={depth + 1} name={key} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Visual Inspector for Skipped Rows / Validation Errors
 */
function SkippedSamplesInspector({ samples, skippedCount }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!samples || (!Array.isArray(samples) && typeof samples !== 'object')) return null;
  const sampleList = Array.isArray(samples) ? samples : [samples];
  if (sampleList.length === 0) return null;

  return (
    <div className="rounded-xl border border-rose-900/60 bg-rose-950/20 overflow-hidden">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-2 bg-rose-950/40 border-b border-rose-900/50 cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span className="text-xs font-bold text-rose-300">
            Validation Failures &amp; Skipped Rows
          </span>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-900/60 text-rose-200 border border-rose-700/60">
            {skippedCount !== undefined ? `${skippedCount} skipped` : `${sampleList.length} samples`}
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-rose-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-rose-400" />
        )}
      </div>

      {isExpanded && (
        <div className="p-3 space-y-2.5">
          {sampleList.map((sample, idx) => {
            const rowNumber = sample.rowNumber || sample.rowIdx || idx + 1;
            const reason = sample.reason || 'Record validation failed';
            const rawData = sample.rawData || sample.data || sample;

            return (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-slate-950/80 border border-rose-900/40 text-xs font-mono space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-rose-900/50 text-rose-300 font-bold text-[10px]">
                      Row #{rowNumber}
                    </span>
                    <span className="text-rose-400 font-sans font-semibold text-[11px]">
                      {reason}
                    </span>
                  </div>
                </div>

                {/* Field Comparison if present */}
                {(sample.rawDate !== undefined || sample.rawAmount !== undefined) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 rounded bg-slate-900/90 border border-slate-800 text-[11px]">
                    {sample.rawDate !== undefined && (
                      <div>
                        <span className="text-slate-400 block text-[10px]">Date Field:</span>
                        <span className="text-rose-300 font-semibold font-mono">Raw: "{sample.rawDate}"</span>
                        <span className="text-slate-500 block text-[10px]">Parsed: {sample.normalizedDate || 'null'}</span>
                      </div>
                    )}
                    {sample.rawAmount !== undefined && (
                      <div>
                        <span className="text-slate-400 block text-[10px]">Amount Field:</span>
                        <span className="text-rose-300 font-semibold font-mono">Raw: "{sample.rawAmount}"</span>
                        <span className="text-slate-500 block text-[10px]">Parsed: {sample.parsedAmount !== undefined ? String(sample.parsedAmount) : 'NaN'}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Raw Row Preview */}
                {rawData && typeof rawData === 'object' && (
                  <details className="text-[10px] text-slate-400 group">
                    <summary className="cursor-pointer font-sans font-medium text-slate-400 hover:text-slate-200 py-0.5 select-none flex items-center gap-1">
                      <span className="group-open:hidden">&#9656; View Raw Row Data</span>
                      <span className="hidden group-open:inline">&#9662; Hide Raw Row Data</span>
                    </summary>
                    <div className="mt-1 p-2 rounded bg-slate-900 border border-slate-800 text-indigo-200/90 whitespace-pre-wrap break-all">
                      {JSON.stringify(rawData, null, 2)}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Visual Inspector for Header Offset & First Row Sample
 */
function FirstRowSampleInspector({ sample, headers }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!sample || typeof sample !== 'object') return null;

  const entries = Object.entries(sample);
  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 overflow-hidden">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-2 bg-blue-950/40 border-b border-blue-900/50 cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-xs font-bold text-blue-300">
            Header Offset &amp; First Row Sample
          </span>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-900/60 text-blue-200 border border-blue-700/60">
            {entries.length} columns inspected
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-blue-400" />
        )}
      </div>

      {isExpanded && (
        <div className="p-3 space-y-2">
          <p className="text-[11px] text-slate-400 font-sans">
            Verify that column headers align correctly with values in row 1. If headers appear displaced, check for leading title rows or empty top cells in the source file.
          </p>

          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-1.5 px-3 font-semibold text-[10px] w-8">#</th>
                  <th className="py-1.5 px-3 font-semibold text-[10px] text-indigo-300">Detected Header Column</th>
                  <th className="py-1.5 px-3 font-semibold text-[10px] text-emerald-300">Row 1 Sample Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {entries.map(([header, val], idx) => {
                  const isValEmpty = val === '' || val === null || val === undefined;
                  return (
                    <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-1.5 px-3 text-slate-500 font-bold text-[10px]">{idx + 1}</td>
                      <td className="py-1.5 px-3 font-bold text-slate-200">{header}</td>
                      <td className="py-1.5 px-3">
                        {isValEmpty ? (
                          <span className="text-slate-600 italic">(empty)</span>
                        ) : (
                          <span className="text-emerald-300/90 break-all">{String(val)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Visual Inspector for Missing Required Columns
 */
function MissingRequiredInspector({ missingRequired }) {
  if (!missingRequired || !Array.isArray(missingRequired) || missingRequired.length === 0) return null;

  return (
    <div className="p-3 rounded-xl border border-rose-900/70 bg-rose-950/30 text-xs space-y-2">
      <div className="flex items-center gap-2 text-rose-300 font-bold">
        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
        <span>Missing Required Column Mapping</span>
      </div>
      <p className="text-[11px] text-slate-300 font-sans">
        The auto-matcher could not locate acceptable headers for the following required schema fields:
      </p>
      <div className="flex items-center gap-1.5 flex-wrap pt-1">
        {missingRequired.map((field, idx) => (
          <span
            key={idx}
            className="px-2 py-1 rounded-md bg-rose-900/80 text-rose-100 border border-rose-700 font-mono font-bold text-xs shadow-sm"
          >
            {field}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Visual Inspector for Column Match Details
 */
function MatchDetailsInspector({ matchDetails, confidence }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!matchDetails || (!Array.isArray(matchDetails) && typeof matchDetails !== 'object')) return null;
  const items = Array.isArray(matchDetails) ? matchDetails : Object.entries(matchDetails).map(([k, v]) => ({ header: k, matchedField: v }));
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 overflow-hidden">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-2 bg-emerald-950/40 border-b border-emerald-900/50 cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold text-emerald-300">
            Column Matching Diagnostics
          </span>
          {confidence !== undefined && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-700/60">
              {(Number(confidence) * 100).toFixed(0)}% Confidence
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
        )}
      </div>

      {isExpanded && (
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map((item, idx) => {
              const srcHeader = item.header || item.columnKey || `Field #${idx + 1}`;
              const target = item.matchedField || item.mappedTo || item.field || '__ignore__';
              const isIgnored = target === '__ignore__';
              const matchType = item.matchType || item.type || (isIgnored ? 'Ignored' : 'Matched');

              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-xs font-mono ${
                    isIgnored
                      ? 'bg-slate-950/60 border-slate-800 text-slate-500'
                      : 'bg-slate-950 border-emerald-900/40 text-slate-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-bold block truncate text-slate-300 text-[11px]">{srcHeader}</span>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                      <CornerDownRight className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className={isIgnored ? 'text-slate-500 italic' : 'text-emerald-400 font-bold'}>
                        {target}
                      </span>
                    </div>
                  </div>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                    isIgnored
                      ? 'bg-slate-900 text-slate-500 border-slate-800'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  }`}>
                    {matchType}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Main Payload Inspector Component
 */
export function DebugPayloadInspector({ payload, logId }) {
  const [viewMode, setViewMode] = useState('structured'); // 'structured' | 'raw'
  const [isCopied, setIsCopied] = useState(false);

  if (!payload || typeof payload !== 'object') {
    return (
      <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300">
        <PrimitiveValue value={payload} />
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const hasSkipped = payload.skippedSamples || payload.unmatchedDebitSamples || payload.skippedDetails;
  const hasFirstRow = payload.firstRowSample;
  const hasMissingReq = payload.missingRequired && payload.missingRequired.length > 0;
  const hasMatchDetails = payload.matchDetails || (payload.mapping && Object.keys(payload.mapping).length > 0);

  // Extract keys that have dedicated inspectors
  const specializedKeys = new Set([
    'skippedSamples',
    'unmatchedDebitSamples',
    'skippedDetails',
    'firstRowSample',
    'missingRequired',
    'matchDetails'
  ]);

  const remainingKeys = Object.keys(payload).filter(k => !specializedKeys.has(k));

  return (
    <div className="mt-2 rounded-xl bg-slate-950 border border-slate-800/90 shadow-xl overflow-hidden text-xs">
      {/* Top Header & Actions */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Payload Inspector</span>
          </div>

          {/* Quick diagnostic pills */}
          {hasSkipped && (
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
              ⚠️ Skipped Rows
            </span>
          )}
          {hasMissingReq && (
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
              🚨 Missing Columns
            </span>
          )}
          {hasFirstRow && (
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800">
              📑 Row 1 Offset
            </span>
          )}
          {hasMatchDetails && (
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              🎯 Match Data
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Toggle View Mode */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[10px]">
            <button
              type="button"
              onClick={() => setViewMode('structured')}
              className={`px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                viewMode === 'structured'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Structured
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                viewMode === 'raw'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Raw JSON
            </button>
          </div>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-semibold transition-colors cursor-pointer border border-slate-700"
            title="Copy entire payload JSON"
          >
            {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{isCopied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        {viewMode === 'raw' ? (
          <pre className="text-[10px] font-mono text-indigo-200/90 whitespace-pre-wrap break-all leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800 max-h-96 overflow-y-auto">
            {JSON.stringify(payload, null, 2)}
          </pre>
        ) : (
          <div className="space-y-3">
            {/* 1. Missing Required Columns Warning */}
            {hasMissingReq && (
              <MissingRequiredInspector missingRequired={payload.missingRequired} />
            )}

            {/* 2. Skipped Samples / Validation Failures */}
            {hasSkipped && (
              <SkippedSamplesInspector
                samples={payload.skippedSamples || payload.unmatchedDebitSamples || payload.skippedDetails}
                skippedCount={payload.skippedCount || payload.skipped}
              />
            )}

            {/* 3. Header Offset & Row 1 Preview */}
            {hasFirstRow && (
              <FirstRowSampleInspector
                sample={payload.firstRowSample}
                headers={payload.headers}
              />
            )}

            {/* 4. Match Details / Column Mappings */}
            {hasMatchDetails && (
              <MatchDetailsInspector
                matchDetails={payload.matchDetails || payload.mapping}
                confidence={payload.confidence}
              />
            )}

            {/* 5. Remaining Nested Properties */}
            {remainingKeys.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Code className="w-3 h-3 text-indigo-400" />
                  <span>Other Telemetry Payload Fields</span>
                </div>
                {remainingKeys.map(k => (
                  <GenericNestedViewer key={k} data={payload[k]} depth={0} name={k} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
