# Implementation Plan: Bank Match Names & Multi-Tier Transaction Importer Reconciliation

**Target Application:** TechTrek Finance (`finance/`)  
**Document Path:** `e:/TechTrekGT/finance/bill_mapping_plan.md`  
**Date:** August 27, 2026  
**Status:** Complete Architectural Design - Awaiting User Approval  

---

## 1. Executive Summary & Problem Definition

When importing bank statements (CSV/XLSX) into TechTrek Finance, statement transaction descriptions rarely match human-readable bill names exactly. For example:
- Statement description: `COMCAST*PHILADELPHIA PA 800-COMCAST`
  Human bill name: `Comcast Gigabit Internet`
- Statement description: `PROGRESSIVE AUTO INS 800-888-0000`
  Human bill name: `Car Insurance (Progressive)`
- Statement description: `GA POWER ATLANTA GA PMT`
  Human bill name: `Georgia Power Electric`

### Current Deficiencies:
1. **No UI to View or Edit Match Names in Setup View:** In the primary bill management interface (`BillsSplitsPanel.jsx` under `SettingsView.jsx`), the high-density bills table only displays Bill Name, Amount, Due Day/Frequency, Payment Source/Account, and Earner Splits. Users cannot view or update statement match keywords for existing bills. The "Bank Document Key" is only visible in the Add Bill modal or via an inline cell in `MainBudgetView.jsx`.
2. **Brittle Heuristic Reconciliation:** In `src/utils/spreadsheet.js`, matching currently mixes heuristic name checks, keyword synonyms, and bank keys. If statement text does not match hardcoded synonyms, imported transactions either fail to link to the bill, incorrectly fall back to generic "Other" expense, or dynamically spawn duplicate bill records.
3. **Data Schema & Compatibility Gaps:** Inconsistent property naming exists across legacy and modern contexts (`matchingKey`, `matching_key`, `bankMatchNames`).

### Proposed Solution:
1. Provide a first-class, intuitive UI in `BillsSplitsPanel.jsx` (Setup view) allowing users to view, add, and update "Bank Match Names" (bank statement aliases) as comma-separated keywords for any bill.
2. Refactor the transaction reconciliation pipeline in `src/utils/spreadsheet.js` (and parser utilities in `importer.js` and `spreadsheetParser.js`) into a deterministic, two-tier matching engine:
   - **Tier 1 (Highest Priority - Aliases):** Match transaction descriptions directly against configured `bankMatchNames` (statement aliases).
   - **Tier 2 (Fallback - Heuristics & Amount):** Fall back to fuzzy bill name similarity, known payment sources, category synonyms, and expected dollar amounts.
3. Guarantee dual-layer persistence to both IndexedDB (`current_budget`) and Cloudflare D1 (`user_backups` table).

---

## 2. Architecture & Data Flow Audit

In compliance with workspace rule 0 and `ARCHITECTURE.md`:

### 2.1 Architectural Conventions
- **Pure JavaScript:** React 19, Vite 6, Tailwind CSS 3.4. No TypeScript (`.ts`/`.tsx`), no `tsc`.
- **Custom SPA Router:** Routing via `window.history.pushState` and `popstate` listeners. No `react-router-dom`.
- **State Management:** React Context (`BudgetMetadataProvider`, `LedgerDataProvider`, `useBudget`) without external state libraries.
- **Backend & Cloudflare Workers:** ESM Worker in `src/worker.js` interfacing with Cloudflare D1 (`personal-budget-db`). Full budget snapshots persist via `POST /api/sync/backup` into `user_backups`.
- **Local Storage:** Origin-sandboxed IndexedDB (`TechTrekFinanceDB`, `app_state` store) with automatic debounced flush (500ms local, 5000ms cloud).

### 2.2 Bill Data Flow Trace
1. **Creation & Updates:** Managed in `BudgetMetadataContext.jsx`:
   - `addBill(billData)`: Appends new bill object to `metadataState.bills`.
   - `updateBill(id, updatedData)`: Updates specific fields on bill `id`.
2. **Current Object Schema for Bills:**
   ```javascript
   {
     id: "bill-1724784000000",
     name: "Comcast Cable",
     amount: 120.00,
     period: "Monthly",
     accountId: "acc-1",
     dueDay: 15,
     dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
     paymentSource: "Auto Pay",
     notes: "Fiber 1Gbps",
     matchingKey: "COMCAST, XFINITY, INTERNET", // Existing legacy property
     bankMatchNames: "COMCAST, XFINITY, INTERNET", // Alias standard
     splits: { "person-1": 50, "person-2": 50 }
   }
   ```
3. **Database & Storage Compatibility:**
   - D1 Table `bills`: Has column `matching_key TEXT DEFAULT ''`.
   - D1 Table `user_backups`: Stores full JSON stringified budget containing all bill properties.
   - Backward Compatibility Rule: Any update to `bankMatchNames` will automatically mirror to `matchingKey` and vice versa, preserving full backwards and forwards compatibility across existing backups and D1 sync.

---

## 3. UI Design: "Bank Match Names" in Setup View

### 3.1 Target Component: `BillsSplitsPanel.jsx`
Located at: `src/components/settings/BillsSplitsPanel.jsx`. Rendered when user navigates to Settings -> Setup -> Bills & Splits (`/finance/settings`).

### 3.2 Modal Form Refinement ("Add New Bill")
Update lines 270-280 in `BillsSplitsPanel.jsx`:
- **Label:** "Bank Match Names (Statement Aliases)"
- **Helper Subtitle:** "Enter comma-separated keywords or statement descriptors (e.g. COMCAST, XFINITY, 800-COMCAST). The importer matches these against bank descriptions before using heuristics."
- **Input Placeholder:** "e.g. COMCAST, XFINITY, INTERNET"
- **State Binding:** Mirrors value to both `matchingKey` and `bankMatchNames`.

### 3.3 High-Density Bills Table Inline Editor
In the main bills table (`<table className="w-full text-left text-xs text-slate-300">`):
Currently, the first column (`w-[22%]`) contains only the bill name:
```jsx
{/* Bill Name */}
<td className="px-3 py-1.5 font-bold text-slate-200">
  <input
    type="text"
    value={bill.name}
    onChange={e => updateBill(bill.id, { name: e.target.value })}
    className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none w-full text-xs font-bold text-slate-100"
    placeholder="Bill Name"
  />
</td>
```

#### Proposed Enhanced Layout:
Transform the Bill Name cell to a grouped identifier layout:
1. **Primary Line:** Bill Name input (bold, white).
2. **Secondary Line:** Bank Match Names inline badge/input row:
   - Left indicator: Compact mono badge `MATCH:` (slate-500).
   - Input element: Styled text input with subtle border, mono font (`text-[10px] text-blue-300`), placeholder `"Statement aliases (comma-separated)"`.
   - Popover / Pill preview: When input is blurred, render recognized keywords as subtle blue pills (`bg-blue-950/70 border border-blue-800/60 text-blue-300`). Clicking activates edit mode.
   - Auto-commit: On change or blur, invokes:
     ```javascript
     updateBill(bill.id, {
       matchingKey: e.target.value,
       bankMatchNames: e.target.value
     });
     ```

### 3.4 Secondary Alignment: `MainBudgetView.jsx`
In `src/components/MainBudgetView.jsx` (lines 202-212), the "Bank Match Key" column already uses `InlineEdit`. Update this column header and tooltip to read "Bank Match Names", ensuring both `matchingKey` and `bankMatchNames` update synchronously upon commit.

---

## 4. Multi-Tier Importer & Reconciliation Engine Refinement

### 4.1 Target Locations:
1. `src/utils/spreadsheet.js` - `processSpreadsheetImport()` (Core transaction reconciliation loop)
2. `src/utils/importer.js` - `INTERNAL_BILL_FIELDS`, `BILL_SYNONYMS`, `mergeBills()`
3. `src/utils/spreadsheetParser.js` - sheet parsing bill matching functions

### 4.2 Helper: Universal Alias Extraction
Define a robust helper in `src/utils/spreadsheet.js` (and export where needed):
```javascript
export function getBillMatchAliases(bill) {
  if (!bill) return [];
  const raw = bill.bankMatchNames || bill.matchingKey || bill.matching_key || '';
  if (Array.isArray(raw)) {
    return raw.map(k => String(k).trim().toLowerCase()).filter(Boolean);
  }
  return String(raw)
    .split(/[,;\n\r|]+/)
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);
}
```

### 4.3 Refined Matching Pipeline:

```
[Imported Debit Transaction]
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 1: BANK MATCH NAMES (STATEMENT ALIASES)                │
│ - Extract configured aliases from all active bills          │
│ - Check if txn.description or txn.notes contains alias      │
│ - Filter by account match (bill.accountId === targetAccount)│
│ - Prioritize exact account matches & longest matching alias │
└─────────────────────────────┬───────────────────────────────┘
                              │
               Match Found? ──┴── No
               │
              Yes
               │              ▼
               │  ┌───────────────────────────────────────────┐
               │  │ TIER 2: HEURISTIC FALLBACK                │
               │  │ 2A: Bill Name & Synonym Similarity        │
               │  │     (bName, paymentSource, known domains) │
               │  │ 2B: Expected Dollar Amount Match          │
               │  │     (Math.abs(amount - bill.amount) < 0.01│
               │  └───────────────────┬───────────────────────┘
               │                      │
               │         Match Found? ──┴── No
               │         │
               │        Yes
               ▼         ▼
┌─────────────────────────────────────────────────────────────┐
│ RECORD MATCH & UPDATE MATRIX                                │
│ - Target bill identified: resolvedBillId                    │
│ - Create lineItemUpdate ({ billId, monthKey, actualAmount })│
│ - Update dailyMatrix cell: {account}_{month}_{day}_bill_{id}│
│ - Zero previous scheduled day if different                  │
│ - Log detailed debug entry with match strategy              │
└─────────────────────────────────────────────────────────────┘
                               │
                              No (Tier 1 & Tier 2 both failed)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 3: UNMATCHED EXPENSE ROUTING                           │
│ - Explicit 'Other' column: add to other_amount/other_desc   │
│ - Named unrecognized column: auto-create discovered bill    │
└─────────────────────────────────────────────────────────────┘
```

#### Detailed Logic for Tier 1:
```javascript
// 1. Tier 1: Match by Bank Statement Match Names / Aliases (Highest Priority)
if (!resolvedBillId && (descLower || notesLower)) {
  // Step 1A: Search bills assigned to this specific account first
  const accountBills = nextBills.filter(b => !b.isArchived && (!b.accountId || b.accountId === accountId));
  
  let bestMatch = null;
  let longestMatchLen = 0;

  for (const bill of accountBills) {
    const aliases = getBillMatchAliases(bill);
    for (const alias of aliases) {
      if (alias.length < 2) continue; // Skip single characters to avoid false positives
      
      const inDesc = descLower && descLower.includes(alias);
      const inNotes = notesLower && notesLower.includes(alias);
      
      if (inDesc || inNotes) {
        // Prefer longer, more specific alias matches (e.g. "comcast fiber" over "comcast")
        if (alias.length > longestMatchLen) {
          bestMatch = { bill, alias };
          longestMatchLen = alias.length;
        }
      }
    }
  }

  // Step 1B: If not found on current account, check unassigned or other accounts as fallback
  if (!bestMatch) {
    const otherBills = nextBills.filter(b => !b.isArchived && b.accountId && b.accountId !== accountId);
    for (const bill of otherBills) {
      const aliases = getBillMatchAliases(bill);
      for (const alias of aliases) {
        if (alias.length < 2) continue;
        if ((descLower && descLower.includes(alias)) || (notesLower && notesLower.includes(alias))) {
          if (alias.length > longestMatchLen) {
            bestMatch = { bill, alias };
            longestMatchLen = alias.length;
          }
        }
      }
    }
  }

  if (bestMatch) {
    resolvedBillId = bestMatch.bill.id;
    matchStrategy = `bank_match_alias ("${bestMatch.alias}" -> ${bestMatch.bill.name})`;
  }
}
```

#### Detailed Logic for Tier 2 (Fallback):
```javascript
// 2. Tier 2: Heuristic Fallback (Bill Name similarity, Domain synonyms, Expected Amount)
if (!resolvedBillId && descLower) {
  // 2A: Bill Name & Synonym matching
  const matchedHeuristic = nextBills.find(b => {
    if (b.isArchived) return false;
    if (b.accountId && accountId && b.accountId !== accountId) return false;
    
    const bName = (b.name || '').toLowerCase().trim();
    const pSource = (b.paymentSource || '').toLowerCase().trim();
    
    // Direct name substring match
    if (bName && (descLower.includes(bName) || bName.includes(descLower))) return true;
    if (pSource && (descLower.includes(pSource) || pSource.includes(descLower))) return true;
    
    // Domain synonyms
    if ((descLower.includes('insurance') || descLower.includes('progressive') || descLower.includes('geico') || descLower.includes('allstate')) &&
        (bName.includes('insurance') || bName.includes('vehicle') || bName.includes('auto'))) return true;
    if ((descLower.includes('cell') || descLower.includes('phone') || descLower.includes('verizon') || descLower.includes('t-mobile') || descLower.includes('att')) &&
        (bName.includes('cell') || bName.includes('phone') || bName.includes('wireless'))) return true;
    if ((descLower.includes('gym') || descLower.includes('planet fitness') || descLower.includes('la fitness')) &&
        (bName.includes('gym') || bName.includes('fitness') || bName.includes('membership'))) return true;
    if ((descLower.includes('power') || descLower.includes('electric') || descLower.includes('energy') || descLower.includes('georgia power')) &&
        (bName.includes('power') || bName.includes('electric') || bName.includes('energy') || bName.includes('utility'))) return true;
    if (descLower.includes('water') && bName.includes('water')) return true;
    if (descLower.includes('gas') && bName.includes('gas')) return true;
    if (descLower.includes('hoa') && bName.includes('hoa')) return true;
    if (descLower.includes('mortgage') && bName.includes('mortgage')) return true;
    if ((descLower.includes('comcast') || descLower.includes('xfinity') || descLower.includes('spectrum')) &&
        (bName.includes('comcast') || bName.includes('internet') || bName.includes('xfinity') || bName.includes('cable'))) return true;
    if (descLower.includes('youtube') && bName.includes('youtube')) return true;
    if (descLower.includes('netflix') && bName.includes('netflix')) return true;
    
    return false;
  });

  if (matchedHeuristic) {
    resolvedBillId = matchedHeuristic.id;
    matchStrategy = `heuristic_name (${matchedHeuristic.name})`;
  } else {
    // 2B: Expected Amount Match (exact cent match on same account)
    const matchedByAmount = nextBills.find(b => {
      if (b.isArchived) return false;
      if (b.accountId && accountId && b.accountId !== accountId) return false;
      const billAmt = Math.abs(parseFloat(b.amount || 0));
      return Math.abs(billAmt - actualAmount) < 0.01;
    });

    if (matchedByAmount) {
      resolvedBillId = matchedByAmount.id;
      matchStrategy = `heuristic_amount ($${actualAmount} -> ${matchedByAmount.name})`;
    }
  }
}
```

---

## 5. Step-by-Step Implementation Sequence

### Phase 1: Context & Data Modeling
1. **`src/context/BudgetMetadataContext.jsx`:**
   - In `addBill`, ensure new bills populate both `matchingKey` and `bankMatchNames`:
     ```javascript
     const rawMatch = billData.bankMatchNames || billData.matchingKey || billData.matching_key || '';
     // set both matchingKey and bankMatchNames to rawMatch
     ```
   - In `updateBill`, ensure if either `matchingKey` or `bankMatchNames` is updated, both fields are synchronized in state.
2. **`src/utils/importer.js`:**
   - In `INTERNAL_BILL_FIELDS`: Update label to `"Bank Match Names (Aliases)"`.
   - In `BILL_SYNONYMS`: Add `'bank match names'`, `'bank match'`, `'bank aliases'`, `'aliases'`, `'statement aliases'`, `'bank statement match'`.
   - In `applyBillMapping()`: Map incoming column to both `matchingKey` and `bankMatchNames`.
   - In `mergeBills()`: Ensure both properties are merged and preserved without loss.

### Phase 2: Core Matching Engine & Parser Refactor
1. **`src/utils/spreadsheet.js`:**
   - Export `getBillMatchAliases(bill)` helper function.
   - Refactor `processSpreadsheetImport()` lines 442-490 to execute strict Tier 1 (`bank_match_alias`) before falling back to Tier 2 (`heuristic_name` and `heuristic_amount`).
   - Enhance structured logging via `logDebug('MATCH', ...)` to report exact match tier and matching alias.
2. **`src/utils/spreadsheetParser.js`:**
   - Update matrix transaction scanning (lines 365-385, 520-565, 897-915, 1098-1140) to use the unified alias extraction helper.

### Phase 3: Setup View UI Refinement
1. **`src/components/settings/BillsSplitsPanel.jsx`:**
   - Update `newBillForm` default state: include `bankMatchNames: ''` alongside `matchingKey: ''`.
   - Update Add Bill modal input label, placeholder, and helper note.
   - Update High-Density Bills Table:
     Add a sleek, inline "Bank Match Names" alias editor directly under the Bill Name input for all active and archived bills.
     Allow immediate text editing with auto-save on change/blur via `updateBill`.
2. **`src/components/MainBudgetView.jsx`:**
   - Update "Bank Match Key" column header label to "Bank Match Names".
   - Ensure `InlineEdit` onCommit updates `{ matchingKey: v, bankMatchNames: v }`.

### Phase 4: Build Verification & Deployment Loop
1. Run PowerShell build test:
   ```powershell
   cd e:/TechTrekGT/finance
   npm run build
   ```
2. Verify zero bundle errors, zero broken imports, and clean Vite production output in `dist/client`.
3. Execute production deployment:
   ```powershell
   npm run deploy
   ```
4. Verify live Cloudflare Worker deployment at `https://techtrekgt.com/finance`.

---

## 6. Verification & Test Plan

### 6.1 Unit & Functional Testing Scenarios
1. **Alias Creation & Storage Test:**
   - Open Settings -> Setup -> Bills & Splits (`/finance/settings`).
   - For an existing bill (e.g. "Comcast"), enter Bank Match Names: `COMCAST, XFINITY 800, COMCAST CABLE`.
   - Reload the browser. Verify the aliases persist from IndexedDB.
   - Trigger cloud backup; verify `user_backups` receives the updated JSON payload.
2. **Tier 1 Importer Auto-Match Test:**
   - Prepare a sample CSV with description: `XFINITY 800-COMCAST INTERNET BILL`.
   - Open Smart Spreadsheet & Bank Importer.
   - Import CSV to checking account.
   - Verify transaction reconciles directly to "Comcast" bill column with match strategy `bank_match_alias ("xfinity 800" -> Comcast)`.
   - Verify transaction does NOT route to "Other" or spawn duplicate bill.
3. **Tier 2 Fallback Test:**
   - Prepare a transaction with description `GEORGIA POWER UTILITY PMT` with NO configured alias on Georgia Power.
   - Verify fallback heuristic matches the bill based on synonym `power`.
4. **Amount Matching Fallback Test:**
   - Prepare a transaction with uninformative description `ACH WITHDRAWAL` and amount matching a unique bill ($143.25).
   - Verify Tier 2B matches the bill via exact amount matching.

---

## 7. Mandatory AntiPilot Halt Notice

**CRITICAL OVERRIDE NOTICE:**
In strict compliance with the user prompt directive:
- **No `.js` or `.jsx` files have been modified.**
- Execution is completely halted.
- The assistant will await the exact confirmation phrase: **"Plan approved, proceed with implementation."** before making any code modifications.
