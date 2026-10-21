# Finance OS - Transactions Grid & Ledger Interaction Stabilization Plan

## 1. Executive Summary & Context

Finance OS provides a 365-day continuous spreadsheet matrix for cash flow forecasting, bill scheduling, and paycheck allocation. The core interface resides in [LedgerView.jsx](file:///e:/TechTrekGT/finance/src/components/LedgerView.jsx), rendering a dense tabular grid powered by `@dnd-kit/core` (^6.3.1) and custom inline cell editing primitives ([InlineEdit.jsx](file:///e:/TechTrekGT/finance/src/components/InlineEdit.jsx)).

Users have reported critical interaction failures in the Transactions Grid:
1. **Click vs. Drag Stutter**: Selecting or clicking a cell's price value to edit it frequently fails, requiring multiple clicks, or inadvertently triggers a drag operation that cancels edit mode.
2. **Text Selection / Input Freeze**: Attempting to edit or select text inside an open cell input triggers drag-and-drop gestures, hijacking the pointer and causing input desynchronization.
3. **Vertical & Cross-Row Drag Failures**: Dragging a price up or down across rows (dates) or month boundaries fails to highlight drop targets, stutters erratically, or drops onto incorrect dates.
4. **Row Selection Desynchronization**: Clicking a price cell or dragging an amount unexpectedly toggles row highlight selection (`selectedRowKey`), confusing the visual state.
5. **Float Precision Drift (FIN-AUDIT-003)**: Drag-moved amounts and inline edits bypass `round2()` deterministic rounding, risking floating-point drift and negative zero serialization.
6. **State Mutation Race Conditions & Missing Rollback (FIN-AUDIT-004)**: Cell movements mutate ref state without snapshotting prior values, risking data loss upon rejected operations or aborted drags.

This plan details the root causes and provides copy-pasteable surgical code diffs to stabilize the interaction mechanics across `InlineEdit.jsx`, `LedgerView.jsx`, and `LedgerDataContext.jsx`.

---

## 2. Root Cause Analysis (RCA)

### 2.1 RCA-1: PointerSensor Activation Constraint & Event Collision
* **Location:** `LedgerView.jsx` lines 387–394 and 110–118.
* **Mechanism:**
  ```javascript
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );
  ```
  `MatrixCell` attaches `{...listeners}` from `useDraggable` to the outer cell container `<div>`. Inside this container sits `<InlineEdit>`, which renders a `<button>` trigger or an active `<input>`.
* **Failure Impact:**
  1. A `distance: 4` constraint is too sensitive. On high-DPI mice, trackpads, and touch devices, standard mouse releases or finger taps drift 4–6 pixels during a click. `@dnd-kit`'s `PointerSensor` interprets this micro-movement as an active drag, calls `event.preventDefault()`, and captures the pointer. As a result, the native `click` event is swallowed, and `<InlineEdit>` never opens.
  2. When `<InlineEdit>` is already in edit mode (`editing === true`), dragging to highlight digits inside `<input>` triggers `@dnd-kit`'s pointer listeners on the parent `<div>`. The cell begins dragging mid-edit, triggering an unexpected `blur` and state commit race condition.
  3. The drag grip handle (`<GripVertical>`) is styled with `pointer-events-none`, preventing users from explicitly dragging via the designated grip handle.

### 2.2 RCA-2: Coordinate Virtualization Failure via `contentVisibility: 'auto'`
* **Location:** `LedgerView.jsx` line 1618:
  ```jsx
  <tbody
    key={group.monthKey}
    data-month-group={`${group.year}-${group.month}`}
    style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 950px' }}
    className="divide-y divide-slate-800/50 font-mono text-[10px]"
  >
  ```
* **Mechanism:**
  `content-visibility: auto` tells the browser layout engine to skip rendering and DOM bounding box calculation for any off-screen `<tbody>`.
* **Failure Impact:**
  `@dnd-kit` computes droppable bounding boxes (`getClientRects()`) when a drag operation begins. Because off-screen month groups have their layout skipped by the browser engine, their droppable cells either report `(0, 0, 0, 0)` bounding rects or synthetic placeholder heights. When dragging an amount vertically down or up into another month, `pointerWithin` and `closestCenter` fail completely. Furthermore, as the user scrolls during a drag, the browser asynchronously un-skips rendering, causing sudden layout reflows and severe pointer stutter.

### 2.3 RCA-3: Droppable Registry Thrashing & Per-Cell DndContext Subscription
* **Location:** `LedgerView.jsx` lines 212–227 (`DroppableCellTd`):
  ```jsx
  const { active } = useDndContext();
  const isMatchingField = Boolean(active && active.data?.current?.field === field);
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
    data: dropPayload,
    disabled: !isMatchingField
  });
  ```
* **Mechanism:**
  In a 365-day grid with ~20 columns, there are over 5,000 `<td>` elements. Every single cell calls `useDndContext()`.
* **Failure Impact:**
  1. When a drag starts, `active` transitions from `null` to the active item, causing all 5,000 cells to re-render simultaneously on the UI thread.
  2. Dynamically toggling `disabled: !isMatchingField` across thousands of droppable containers invalidates `@dnd-kit`'s spatial index mid-drag, forcing expensive layout recalculations on the pointer move path.
  3. Because `matrixCollisionDetection` already filters containers by field (`args.droppableContainers.filter(c => c.data?.current?.field === activeField)`), toggling `disabled` at the component level is completely redundant and causes high rendering latency.

### 2.4 RCA-4: Row Selection Click-Hijacking
* **Location:** `LedgerView.jsx` lines 1649–1653:
  ```jsx
  onClick={(e) => {
    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
      setSelectedRowKey(prev => prev === row.rowKey ? null : row.rowKey);
    }
  }}
  ```
* **Mechanism:**
  The price text inside `<InlineEdit>` is rendered inside `<button><span ...>{fmtGrid(value)}</span></button>`.
* **Failure Impact:**
  When a user clicks on the numeric digits, `e.target` is the `<span>` element. Since `e.target.tagName === 'SPAN'`, the check `e.target.tagName !== 'BUTTON'` evaluates to `true`! The parent `<tr>` click handler executes and toggles row selection (`selectedRowKey`), causing jarring visual row highlights whenever the user clicks to edit or clear an amount.

### 2.5 RCA-5: Unshielded Float Arithmetic & Lack of `round2()` Protection
* **Location:** `InlineEdit.jsx` lines 96–113, `LedgerView.jsx` line 423, and `LedgerDataContext.jsx` line 1026.
* **Mechanism:**
  1. In `InlineEdit.jsx`, `parsed = parseFloat(str)` commits raw floating-point numbers without passing through `round2(parsed)`.
  2. In `LedgerView.jsx`, `handleCellCommit` receives `val` and updates the matrix directly.
  3. In `LedgerDataContext.jsx`, `moveDailyMatrixCell` assigns `dailyMatrixRef.current[targetKey] = value` without `round2(value)` boundary protection and `-0` normalization.
* **Failure Impact:**
  Direct violation of FIN-AUDIT-003. Sub-cent floating point precision drift accumulates across multi-day cash flow projections.

### 2.6 RCA-6: Missing Optimistic State Rollback on Dropped Operations
* **Location:** `LedgerDataContext.jsx` lines 1026–1070 (`moveDailyMatrixCell`).
* **Mechanism:**
  Cell movement directly updates `dailyMatrixRef.current[sourceKey] = 0` and `dailyMatrixRef.current[targetKey] = value`.
* **Failure Impact:**
  If an exception occurs or an invalid drop target is processed, the original cell value is lost and cannot be recovered without a full browser reload.

---

## 3. Architectural Redesign & Hardening Specification

### 3.1 Custom `MatrixPointerSensor`
We introduce an explicit `MatrixPointerSensor` extending `@dnd-kit/core`'s `PointerSensor`:
1. Requires primary mouse button (`event.button === 0`).
2. Gating: Completely ignores pointer down events targeting `<input>`, `<textarea>`, `<select>`, or `[contenteditable="true"]`.
3. Gating: Ignores buttons that are NOT designated drag handles (such as the Trash/Clear button and the InlineEdit commit/cancel buttons).
4. Activation Constraint: Requires an intentional `distance: 8` pixel movement before initiating drag mode, ensuring that normal clicks and trackpad releases never trigger drag mode.

### 3.2 Drag Handle & Inline Edit Disambiguation
1. `<GripVertical>` is wrapped in an explicit drag handle button with `data-drag-handle="true"`, `cursor-grab`, and `pointer-events-auto`.
2. The outer cell wrapper allows dragging when moving >8px, but when an inline editor is active (`editing === true`), all drag capabilities are disabled.

### 3.3 Excising `contentVisibility: 'auto'`
Remove `style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 950px' }}` from `<tbody>`. This guarantees that all rendered rows in the loaded year stream have stable, physical DOM dimensions, enabling 100% reliable coordinate mapping across dates and months.

### 3.4 Decoupling `DroppableCellTd` from `useDndContext()`
1. Remove `const { active } = useDndContext()` from `DroppableCellTd`.
2. Keep droppable containers permanently registered without dynamic `disabled: !isMatchingField` toggling.
3. Rely on `matrixCollisionDetection` to filter candidate containers by `activeField`.
4. Drop highlights (`activeHighlight`) trigger cleanly via `isOver`, eliminating thousands of unnecessary re-renders.

### 3.5 Bounded Collision Detection
Refine `matrixCollisionDetection`:
1. Filter droppable containers strictly by `activeField`.
2. First check exact cursor collision via `pointerWithin`.
3. If pointer coordinates are within a reasonable horizontal corridor (±45px) of the column, fall back to `closestCenter` for smooth vertical tracking across row boundaries.
4. If dragged horizontally outside the column corridor (e.g. to another column or off the grid), return `[]` to allow clean cancellation on drop.

### 3.6 Strict `round2()` Enforcement (FIN-AUDIT-003)
Enforce `round2()` deterministic rounding with `Number.EPSILON` boundary protection and `-0` normalization across:
- `InlineEdit.jsx`: All currency commits pass through `round2(parsed)`.
- `LedgerView.jsx`: `handleCellCommit` validates and rounds all numeric commits via `round2()`.
- `LedgerDataContext.jsx`: `updateDailyMatrixCell` and `moveDailyMatrixCell` enforce `round2(value)` before updating `dailyMatrixRef.current`.

### 3.7 Optimistic Snapshot & Rollback (FIN-AUDIT-004)
`moveDailyMatrixCell` snapshots prior values of `sourceKey`, `targetKey`, and associated description keys (`other_desc`, `other_credit_desc`). In case of mutation failure or error, the prior snapshot is atomically restored in a `catch` block and synced to state.

### 3.8 Row Selection Target Gating
In `<tr>`, update the `onClick` handler:
```javascript
onClick={(e) => {
  if (e.target.closest('button, input, select, textarea, [data-drag-handle="true"], [data-matrix-cell="true"]')) {
    return;
  }
  setSelectedRowKey(prev => prev === row.rowKey ? null : row.rowKey);
}}
```
This guarantees clicking any price, input, or action icon never inadvertently selects or deselects the table row.

---

## 4. Surgical Code Diffs

### 4.1 `e:\TechTrekGT\finance\src\components\InlineEdit.jsx`
* Import `round2` from `../utils/formatters`.
* Enforce `round2(parsed)` on currency parsing.
* Prevent drag event interference during editing.

```diff
--- a/finance/src/components/InlineEdit.jsx
+++ b/finance/src/components/InlineEdit.jsx
@@ -1,4 +1,5 @@
 import React, { useState, useRef, useCallback, useEffect } from 'react';
 import { Pencil, Check, X, Trash2 } from 'lucide-react';
+import { round2 } from '../utils/formatters';
 
 /**
  * InlineEdit - universal click-to-edit primitive.
@@ -98,6 +99,7 @@ export function InlineEdit({
       }
       if (min !== undefined) parsed = Math.max(min, parsed);
       if (max !== undefined) parsed = Math.min(max, parsed);
+      if (type === 'currency') parsed = round2(parsed);
     } else if (type === 'integer') {
       if (str === '') {
         parsed = 0;
@@ -140,6 +142,7 @@ export function InlineEdit({
           value={draft}
           autoFocus
           aria-label="Edit value"
+          onPointerDown={e => e.stopPropagation()}
           onChange={e => setDraft(e.target.value)}
           onKeyDown={onKeyDown}
           onBlur={commit}
```

---

### 4.2 `e:\TechTrekGT\finance\src\context\LedgerDataContext.jsx`
* Enforce `round2()` on `updateDailyMatrixCell` and `moveDailyMatrixCell`.
* Implement optimistic snapshot and rollback in `moveDailyMatrixCell`.

```diff
--- a/finance/src/context/LedgerDataContext.jsx
+++ b/finance/src/context/LedgerDataContext.jsx
@@ -980,14 +980,17 @@ export function LedgerDataProvider({ children }) {
   const updateDailyMatrixCell = useCallback((accountId, monthKey, day, field, value) => {
     const key = `${accountId}_${monthKey}_${day}_${field}`;
     
-    const currentVal = dailyMatrixRef.current[key];
-    if (currentVal === value) return;
-    if ((currentVal === undefined || currentVal === null || currentVal === '') && (value === undefined || value === null || value === '')) {
+    const isTextField = field.endsWith('_desc');
+    const cleanValue = isTextField ? (value || '') : (value === '' || value === null || value === undefined ? '' : round2(value));
+
+    const currentVal = dailyMatrixRef.current[key];
+    if (currentVal === cleanValue) return;
+    if ((currentVal === undefined || currentVal === null || currentVal === '') && (cleanValue === undefined || cleanValue === null || cleanValue === '')) {
       return;
     }
 
     const prevNum = parseMoney(currentVal, 0);
-    const newNum = parseMoney(value, 0);
+    const newNum = parseMoney(cleanValue, 0);
     logTransaction('UPDATE_CELL_AMOUNT', `Matrix cell amount updated: ${key} = ${value}`, {
       accountId,
       monthKey,
@@ -999,7 +1002,7 @@ export function LedgerDataProvider({ children }) {
     });
     
     // Mutate ref and sync state for reactive components and persistence
-    dailyMatrixRef.current[key] = value;
+    dailyMatrixRef.current[key] = cleanValue;
     setDailyMatrix({ ...dailyMatrixRef.current });
     setMatrixVersion(v => v + 1);
   }, []);
@@ -1026,6 +1029,20 @@ export function LedgerDataProvider({ children }) {
   const moveDailyMatrixCell = useCallback((accountId, sourceMonthKey, sourceDay, targetMonthKey, targetDay, field, value, extraData = {}) => {
     const sourceKey = `${accountId}_${sourceMonthKey}_${sourceDay}_${field}`;
     const targetKey = `${accountId}_${targetMonthKey}_${targetDay}_${field}`;
+    const cleanValue = round2(value);
+
+    // Snapshot prior state for optimistic rollback
+    const prevSourceValue = dailyMatrixRef.current[sourceKey];
+    const prevTargetValue = dailyMatrixRef.current[targetKey];
+    const sourceDescKey = field === 'other_amount'
+      ? `${accountId}_${sourceMonthKey}_${sourceDay}_other_desc`
+      : field === 'other_credit_amount'
+        ? `${accountId}_${sourceMonthKey}_${sourceDay}_other_credit_desc`
+        : null;
+    const targetDescKey = field === 'other_amount'
+      ? `${accountId}_${targetMonthKey}_${targetDay}_other_desc`
+      : field === 'other_credit_amount'
+        ? `${accountId}_${targetMonthKey}_${targetDay}_other_credit_desc`
+        : null;
+    const prevSourceDesc = sourceDescKey ? dailyMatrixRef.current[sourceDescKey] : undefined;
+    const prevTargetDesc = targetDescKey ? dailyMatrixRef.current[targetDescKey] : undefined;
+
+    try {
 
     logTransaction('MOVE_CELL_DATE', `Relocated cell [${field}] from ${sourceMonthKey}-${sourceDay} to ${targetMonthKey}-${targetDay}`, {
       accountId,
@@ -1034,7 +1051,7 @@ export function LedgerDataProvider({ children }) {
       sourceDate: `${sourceMonthKey}-${sourceDay}`,
       targetDate: `${targetMonthKey}-${targetDay}`,
       field,
-      value,
+      value: cleanValue,
       extraData
     });
 
@@ -1043,8 +1060,8 @@ export function LedgerDataProvider({ children }) {
       dailyMatrixRef.current[sourceKey] = 0;
       hasChanges = true;
     }
-    if (dailyMatrixRef.current[targetKey] !== value) {
-      dailyMatrixRef.current[targetKey] = value;
+    if (dailyMatrixRef.current[targetKey] !== cleanValue) {
+      dailyMatrixRef.current[targetKey] = cleanValue;
       hasChanges = true;
     }
 
@@ -1067,6 +1084,17 @@ export function LedgerDataProvider({ children }) {
       setDailyMatrix({ ...dailyMatrixRef.current });
       setMatrixVersion(v => v + 1);
     }
+    } catch (err) {
+      // Optimistic state rollback upon failure
+      dailyMatrixRef.current[sourceKey] = prevSourceValue;
+      dailyMatrixRef.current[targetKey] = prevTargetValue;
+      if (sourceDescKey && prevSourceDesc !== undefined) dailyMatrixRef.current[sourceDescKey] = prevSourceDesc;
+      if (targetDescKey && prevTargetDesc !== undefined) dailyMatrixRef.current[targetDescKey] = prevTargetDesc;
+      setDailyMatrix({ ...dailyMatrixRef.current });
+      setMatrixVersion(v => v + 1);
+      console.error('Failed to move matrix cell, rolled back state:', err);
+      throw err;
+    }
   }, []);
```

---

### 4.3 `e:\TechTrekGT\finance\src\components\LedgerView.jsx`
* Implement `MatrixPointerSensor` with smart target gating.
* Remove `useDndContext()` and dynamic `disabled` from `DroppableCellTd`.
* Refine `matrixCollisionDetection` with horizontal corridor thresholding.
* Update `MatrixCell` to support active grip handles and clean click disambiguation.
* Remove `contentVisibility: 'auto'` from `<tbody>`.
* Gate row selection in `<tr>` to prevent click-hijacking.
* Add `onDragCancel` handler and smooth overlay drop animation.

```diff
--- a/finance/src/components/LedgerView.jsx
+++ b/finance/src/components/LedgerView.jsx
@@ -62,6 +62,23 @@ function fmtGrid(val) {
   return fmtMoney(val);
 }
 
+// Hardened PointerSensor that suppresses drag initiation on interactive inputs or action buttons
+class MatrixPointerSensor extends PointerSensor {
+  static activators = [
+    {
+      eventName: 'onPointerDown',
+      handler: ({ nativeEvent: event }) => {
+        if (event.button !== 0) return false;
+        const target = event.target;
+        if (target.closest('input, textarea, select, [contenteditable="true"]')) return false;
+        if (target.closest('button:not([data-drag-handle="true"])')) return false;
+        return true;
+      }
+    }
+  ];
+}
+
 // Inline cell editor for matrix cells with @dnd-kit Draggable capability
 const MatrixCell = React.memo(function MatrixCell({
   value,
@@ -81,8 +98,9 @@ const MatrixCell = React.memo(function MatrixCell({
   const isZero = !value || value === 0;
 
   const commitHandler = useCallback((val) => {
-    if (onCommit) onCommit(monthKey, day, field, val, selectedAccountId);
+    const cleanVal = round2(val);
+    if (onCommit) onCommit(monthKey, day, field, cleanVal, selectedAccountId);
   }, [onCommit, monthKey, day, field, selectedAccountId]);
 
   const cellId = `${monthKey}-${day}-${field}`;
@@ -111,16 +129,27 @@ const MatrixCell = React.memo(function MatrixCell({
   return (
     <div
       ref={setNodeRef}
+      data-matrix-cell="true"
       {...(draggable ? attributes : {})}
       {...(draggable ? listeners : {})}
       className={`group/matrix relative flex items-center justify-end w-full ${
         draggable ? 'cursor-grab active:cursor-grabbing select-none' : ''
       } ${isDragging ? 'opacity-30 scale-90' : ''}`}
       title={draggable ? 'Drag to move to a different date line, or click to edit' : undefined}
     >
       {draggable && (
-        <GripVertical className="w-2.5 h-2.5 text-slate-500 opacity-0 group-hover/matrix:opacity-70 transition-opacity absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none" />
+        <button
+          type="button"
+          data-drag-handle="true"
+          className="opacity-0 group-hover/matrix:opacity-80 hover:opacity-100 hover:text-blue-400 p-0.5 text-slate-500 transition-opacity absolute left-0.5 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-10"
+          title="Drag amount to move date"
+          aria-label="Drag handle"
+          tabIndex={-1}
+        >
+          <GripVertical className="w-2.5 h-2.5 pointer-events-none" />
+        </button>
       )}
       {Boolean(value && value !== 0) && !isTotal && (
         <button
@@ -188,14 +217,26 @@ const matrixCollisionDetection = (args) => {
   const activeField = args.active?.data?.current?.field;
+  if (!activeField) return [];
+
   const filteredContainers = activeField
     ? args.droppableContainers.filter(c => c.data?.current?.field === activeField)
     : args.droppableContainers;
 
+  if (filteredContainers.length === 0) return [];
+
   const filteredArgs = activeField ? { ...args, droppableContainers: filteredContainers } : args;
 
   const pointerCollisions = pointerWithin(filteredArgs);
   if (pointerCollisions.length > 0) {
     return pointerCollisions;
   }
 
+  // Horizontal corridor guard: if pointer has drifted far outside column, cancel drop targeting
+  const pointerCoords = args.pointerCoordinates;
+  if (pointerCoords && filteredContainers[0]?.rect?.current) {
+    const colRect = filteredContainers[0].rect.current;
+    if (pointerCoords.x < colRect.left - 45 || pointerCoords.x > colRect.right + 45) {
+      return [];
+    }
+  }
+
   return closestCenter(filteredArgs);
 };
@@ -211,8 +252,6 @@ const DroppableCellTd = React.memo(function DroppableCellTd({
   className,
   isBillField = false
 }) {
-  const { active } = useDndContext();
-  const isMatchingField = Boolean(active && active.data?.current?.field === field);
   const dropId = `drop-${row.monthKey}-${row.day}-${field}`;
 
   const dropPayload = useMemo(() => ({
@@ -224,10 +263,9 @@ const DroppableCellTd = React.memo(function DroppableCellTd({
   const { isOver, setNodeRef } = useDroppable({
     id: dropId,
-    data: dropPayload,
-    disabled: !isMatchingField
+    data: dropPayload
   });
 
-  const activeHighlight = isOver && isMatchingField
+  const activeHighlight = isOver
     ? isBillField
       ? 'bg-rose-500/30 ring-2 ring-rose-400 ring-inset shadow-[0_0_10px_rgba(244,63,94,0.3)]'
       : 'bg-emerald-500/30 ring-2 ring-emerald-400 ring-inset shadow-[0_0_10px_rgba(16,185,129,0.3)]'
@@ -387,7 +425,7 @@ function DailySpreadsheetMatrix() {
   // Drag and drop sensor configuration
   const sensors = useSensors(
-    useSensor(PointerSensor, {
+    useSensor(MatrixPointerSensor, {
       activationConstraint: {
-        distance: 4
+        distance: 8
       }
     }),
     useSensor(KeyboardSensor)
@@ -418,6 +456,10 @@ function DailySpreadsheetMatrix() {
     }
   }, [moveDailyMatrixCell, selectedAccountId]);
 
+  const handleDragCancel = useCallback(() => {
+    logTransaction('UI_DRAG_CANCEL', 'User cancelled cell drag interaction');
+  }, []);
+
   const handleCellCommit = useCallback((monthKey, day, field, val, cellAccountId) => {
     const targetAccId = (cellAccountId && cellAccountId !== 'all') ? cellAccountId : (selectedAccountId === 'all' ? (budget.accounts[0]?.id || 'all') : selectedAccountId);
-    const numVal = typeof val === 'number' ? val : (parseFloat(val) || 0);
-    logTransaction('UI_CELL_COMMIT', `User committed ${field} on ${monthKey}-${day}: ${val}`, { targetAccId, monthKey, day, field, val });
-    updateDailyMatrixCell(targetAccId, monthKey, day, field, val);
+    const isTextField = field.endsWith('_desc');
+    const cleanVal = isTextField ? (val || '') : round2(val);
+    logTransaction('UI_CELL_COMMIT', `User committed ${field} on ${monthKey}-${day}: ${cleanVal}`, { targetAccId, monthKey, day, field, val: cleanVal });
+    updateDailyMatrixCell(targetAccId, monthKey, day, field, cleanVal);
 
     // If clearing out an other amount (val === 0 or ''), automatically clear associated other description
-    if ((field === 'other_amount' || field === 'other_credit_amount') && (!val || numVal === 0)) {
+    if ((field === 'other_amount' || field === 'other_credit_amount') && (!val || round2(val) === 0)) {
       updateDailyMatrixCell(targetAccId, monthKey, day, 'other_desc', '');
       updateDailyMatrixCell(targetAccId, monthKey, day, 'other_credit_desc', '');
     }
@@ -1232,6 +1274,7 @@ function DailySpreadsheetMatrix() {
       sensors={sensors}
       collisionDetection={matrixCollisionDetection}
       onDragEnd={handleDragEnd}
+      onDragCancel={handleDragCancel}
     >
@@ -1617,7 +1660,6 @@ function DailySpreadsheetMatrix() {
             <tbody
               key={group.monthKey}
               data-month-group={`${group.year}-${group.month}`}
-              style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 950px' }}
               className="divide-y divide-slate-800/50 font-mono text-[10px]"
             >
@@ -1649,7 +1691,7 @@ function DailySpreadsheetMatrix() {
                     data-rowkey={row.rowKey}
                     onClick={(e) => {
-                      if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
+                      if (e.target.closest('button, input, select, textarea, [data-drag-handle="true"], [data-matrix-cell="true"]')) {
+                        return;
+                      }
                         setSelectedRowKey(prev => prev === row.rowKey ? null : row.rowKey);
-                      }
                     }}
@@ -2004,7 +2046,7 @@ function DailySpreadsheetMatrix() {
       </div>
 
       {/* Floating Drag Overlay */}
-      <DragOverlay dropAnimation={null}>
+      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
         <MatrixDragOverlay />
       </DragOverlay>
```

---

## 5. Verification Checklist & Testing Steps

### 5.1 Verification Matrix
| Test Case | Scenario | Expected Result |
| :--- | :--- | :--- |
| **TC-GRID-01** | Click on price cell to edit | `<InlineEdit>` opens immediately on single click; no drag overlay or pointer capture. |
| **TC-GRID-02** | Select text inside active `<input>` | Dragging across digits inside `<input>` selects text; cell does not initiate drag. |
| **TC-GRID-03** | Click Clear Trash button | Value resets to `$0.00` immediately; no drag mode or row selection toggle. |
| **TC-GRID-04** | Click price text to edit | Row selection highlight (`selectedRowKey`) remains unchanged. |
| **TC-GRID-05** | Drag bill cell vertically across dates | Drag overlay appears; target date row in bill column highlights emerald/rose; drop relocates amount cleanly. |
| **TC-GRID-06** | Drag bill cell across month boundary | Target date in next/previous month highlights cleanly without coordinate drift or stutter. |
| **TC-GRID-07** | Drag cell horizontally outside column corridor | Target highlight disappears; release triggers clean cancel animation; cell remains on source date. |
| **TC-GRID-08** | Drag cell with decimals / precision | Committed amount is strictly formatted via `round2(val)` with `Number.EPSILON` boundary protection. |
| **TC-GRID-09** | Simulated mutation error | Prior state for source and target keys is immediately restored via optimistic rollback. |
| **TC-GRID-10** | Local IndexedDB persistence | Debounced 500ms auto-save fires and persists updated `dailyMatrix` snapshot without corruption. |

### 5.2 Automated Regression Suite Run
Execute the full test suite to guarantee zero regression:
```powershell
npm test
npm run test:unit
```
Confirm that all 516 Node tests and 10 Vitest suites pass with 100% success rate.
