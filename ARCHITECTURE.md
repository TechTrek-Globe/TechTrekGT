# Budget OS - Architecture & Multi-User Implementation Guide

## 1. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 19 + Vite 6 | Fast HMR, concurrent mode |
| Styling | Tailwind CSS 3.4 | Responsive, utility-first, dark theme |
| Charts | Recharts 2.15 | Lightweight, composable SVG charts |
| Icons | Lucide React | Consistent icon set |
| State | React Context + useState | Local-first, no external deps for MVP |
| Auth (future) | Supabase Auth | OAuth, magic links, RBAC |
| Database (future) | Supabase (PostgreSQL) | Row-Level Security, real-time sync |
| ORM (future) | Prisma | Type-safe schema, migrations |

## 2. Current Data Model (LocalStorage)

### Root: `budget` object

```typescript
interface BudgetData {
  accounts: Account[];
  people: Person[];
  bills: Bill[];
  lineItems: LineItem[];
  loan: Loan;
}

interface Account {
  id: string;            // "acc-{timestamp}"
  name: string;          // "USAA Bills Checking - 7071"
  type: 'checking' | 'savings' | 'credit';
  startingBalance: number;
  color: string;
  notes: string;
}

interface Person {
  id: string;            // "person-{timestamp}"
  name: string;
  role: string;
  payFrequency: 'bi-weekly' | 'monthly' | 'weekly';
  payDay1: number | 'last';
  payDay2: number | 'last';
  grossPerPay: number;
  netPerPay: number;
  color: string;
}

interface Bill {
  id: string;            // "bill-{timestamp}"
  name: string;
  amount: number;
  period: 'Monthly' | 'Semi-Annual' | 'Annual' | 'Weekly';
  accountId: string;     // FK -> Account
  dueDay: number;
  paymentSource: string;
  notes: string;
  splits: Record<string, number>; // personId -> split percentage
}

interface LineItem {
  billId: string;        // FK -> Bill
  monthKey: string;      // "YYYY-MM"
  actualAmount: number;
  updatedAt: number;     // epoch ms
}

interface Loan {
  description: string;
  principal: number;
  annualInterestRate: number;
  termMonths: number;
  monthlyPayment: number;
  extraPayment: number;
  startDate: string;
}
```

## 3. PostgreSQL Schema (Supabase / Multi-User)

```sql
-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- HOUSEHOLDS (Multi-Tenant Groups)
-- ============================================
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'My Household',
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PROFILES (Extended Auth Users)
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- HOUSEHOLD MEMBERS (RBAC Join Table)
-- ============================================
CREATE TYPE member_role AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE household_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'editor',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, profile_id)
);

-- ============================================
-- ACCOUNTS
-- ============================================
CREATE TYPE account_type AS ENUM ('checking', 'savings', 'credit');

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type account_type NOT NULL DEFAULT 'checking',
  starting_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  color TEXT NOT NULL DEFAULT 'blue',
  notes TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_household ON accounts(household_id);

-- ============================================
-- PEOPLE (Income Contributors)
-- ============================================
CREATE TYPE pay_frequency AS ENUM ('bi-weekly', 'monthly', 'weekly');

CREATE TABLE people (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Member',
  pay_frequency pay_frequency NOT NULL DEFAULT 'bi-weekly',
  pay_day1 TEXT NOT NULL DEFAULT '15',   -- day number or 'last'
  pay_day2 TEXT DEFAULT 'last',
  gross_per_pay DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  net_per_pay DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  color TEXT NOT NULL DEFAULT 'purple',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_people_household ON people(household_id);

-- ============================================
-- BILLS
-- ============================================
CREATE TYPE bill_period AS ENUM ('Monthly', 'Semi-Annual', 'Annual', 'Weekly');

CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  period bill_period NOT NULL DEFAULT 'Monthly',
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  payment_source TEXT NOT NULL DEFAULT 'Auto Pay',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bills_household ON bills(household_id);
CREATE INDEX idx_bills_account ON bills(account_id);

-- ============================================
-- BILL SPLITS (Person -> Bill Percentage)
-- ============================================
CREATE TABLE bill_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  percentage DECIMAL(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  UNIQUE(bill_id, person_id)
);

-- ============================================
-- LINE ITEMS (Month-level Actuals)
-- ============================================
CREATE TABLE line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,          -- "YYYY-MM"
  actual_amount DECIMAL(10,2),     -- NULL = use projected
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bill_id, month_key)
);

CREATE INDEX idx_line_items_month ON line_items(month_key);

-- ============================================
-- LOAN / AMORTIZATION (Optional)
-- ============================================
CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  description TEXT,
  principal DECIMAL(12,2) NOT NULL,
  annual_interest_rate DECIMAL(5,3) NOT NULL,
  term_months INTEGER NOT NULL,
  monthly_payment DECIMAL(10,2),
  extra_payment DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  start_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Enable RLS on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

-- Policy: users can only access data for households they belong to
CREATE POLICY household_isolation ON accounts
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE profile_id = auth.uid()
    )
  );

-- Replicate same policy for bills, people, line_items, loans
-- (omitted for brevity - same pattern)

-- Policy: owners can manage members
CREATE POLICY manage_members ON household_members
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE profile_id = auth.uid() AND role = 'owner'
    )
  );
```

## 4. Multi-User RBAC Model

| Role | Read Data | Write Data | Manage Members | Delete Household |
|------|-----------|-----------|----------------|-----------------|
| Owner | ALL | ALL | YES | YES |
| Editor | ALL | ALL | NO | NO |
| Viewer | ALL | NO | NO | NO |

## 5. Migration Path: LocalStorage -> Supabase

### Phase 1 (Current): LocalStorage
- Single user, no auth
- All budgeting features working
- Data persisted to `localStorage`

### Phase 2: Supabase Auth + Sync
- Add Supabase JS client
- Users sign in via email/OAuth
- Export localStorage data to Supabase on first login
- Read from Supabase, write to both (dual-write for safety)

### Phase 3: Full Multi-User
- Household creation wizard
- Invite members via email
- RLS policies enforce data isolation
- Real-time sync via Supabase Realtime (WebSockets)

### Phase 4: Offline-First
- Service worker caching
- IndexedDB local fallback
- Queue writes when offline, sync on reconnect

## 6. Project Directory Layout

```
e:\Personal Budget\
  index.html
  package.json
  vite.config.js
  tailwind.config.js
  postcss.config.js
  ARCHITECTURE.md                # This file
  src/
    main.jsx                     # Entry point
    App.jsx                      # Root component, view routing
    index.css                    # Tailwind directives + glass styles
    initialData.js               # Default preset (Excel spreadsheet data)
    
    # State Management
    context/
      BudgetContext.jsx           # Global state + all operations
    
    # Views
    components/
      Navbar.jsx                  # Navigation + quick metrics
      DashboardView.jsx           # KPI cards, charts, upcoming bills
      MainBudgetView.jsx          # Read-only budget plan tables
      InteractiveBudgetView.jsx   # Inline-editable actual vs projected
      AccountLedgerView.jsx       # 30-day cash flow register
      AmortizationView.jsx        # Loan amortization calculator
      SettingsModal.jsx           # Full CRUD for all entities
    
    # Future (Phase 2+)
    # lib/
    #   supabaseClient.js         # Supabase init
    # hooks/
    #   useAuth.js                # Auth context
    #   useHousehold.js           # Multi-tenant switching
    # services/
    #   syncService.js            # LocalStorage -> Supabase sync
```

## 7. Interactive Budget Table: Recalculation Engine

The `InteractiveBudgetView` component implements a reactive recalculation engine:

### State Flow
```
User edits actual amount
  -> upsertLineItem(billId, monthKey, value)
    -> setBudget() triggers re-render
      -> useMemo recalculates totalActual, variance
        -> getAccountActualExpenses() recalculates per-account totals
          -> getAccountActualEndBalance() = startingBalance - actualExpenses
            -> All UI cells update reactively (< 1ms)
```

### Recalculation Functions

| Function | Returns | Reactive To |
|----------|---------|------------|
| `getEffectiveAmount(bill, monthKey)` | Actual if overridden, else projected | bill.amount, lineItems |
| `getTotalActualExpenses(monthKey)` | Sum of all effective amounts | lineItems, bills |
| `getAccountActualExpenses(accountId, monthKey)` | Sum per account | lineItems, bills |
| `getAccountProjectedEndBalance(accountId)` | startingBalance - projectedExpenses | accounts, bills |
| `getAccountActualEndBalance(accountId, monthKey)` | startingBalance - actualExpenses | accounts, lineItems, bills |

### Variance Color Coding
- Actual < Projected: Green (saved money)
- Actual > Projected: Red (overspent)
- Actual == Projected: Neutral (on track)

## 8. Future Enhancements

- [ ] Recurring transaction templates (auto-generate line items monthly)
- [ ] Chart: actual vs projected trend line over 12 months
- [ ] Export to Excel/CSV
- [ ] Push notifications for upcoming bills
- [ ] Mobile-responsive PWA (offline support)
- [ ] Investment account tracking
- [ ] Net worth calculator