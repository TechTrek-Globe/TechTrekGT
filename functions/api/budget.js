import { verifyToken } from '../utils/auth.js';

async function ensureSchema(db) {
  if (!db) return;
  try {
    await db.prepare('ALTER TABLE people ADD COLUMN pay_offset_days INTEGER DEFAULT 0').run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE people ADD COLUMN account_allocations TEXT DEFAULT '{}'").run();
  } catch (e) {}
  try {
    await db.prepare('ALTER TABLE accounts ADD COLUMN balance_as_of_date TEXT').run();
  } catch (e) {}
  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS household_settings (household_id TEXT PRIMARY KEY, theme TEXT, dashboard_widgets TEXT, hide_dashboard_header INTEGER DEFAULT 0)').run();
  } catch (e) {}
  try {
    await db.prepare('ALTER TABLE bills ADD COLUMN is_archived INTEGER DEFAULT 0').run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE loans ADD COLUMN name TEXT DEFAULT 'New Loan'").run();
  } catch (e) {}
  try {
    await db.prepare('ALTER TABLE loans ADD COLUMN is_archived INTEGER DEFAULT 0').run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE loans ADD COLUMN interest_compounding TEXT DEFAULT 'monthly'").run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE loans ADD COLUMN payment_frequency TEXT DEFAULT 'monthly'").run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE loans ADD COLUMN payment_type TEXT DEFAULT 'amortizing'").run();
  } catch (e) {}
}

/**
 * @param {{ request: Request, env: Record<string, any> }} context
 */
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload || !payload.householdId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const householdId = payload.householdId;

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await ensureSchema(env.DB);

    // Query Accounts
    const accRows = await env.DB.prepare('SELECT * FROM accounts WHERE household_id = ?').bind(householdId).all();
    const accounts = (accRows.results || []).map((/** @type {any} */ a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      startingBalance: a.starting_balance,
      balanceAsOfDate: a.balance_as_of_date || '',
      extraStartingBalance: a.extra_starting_balance || 0,
      saveExtraMonthly: a.save_extra_monthly || 0,
      enableExtraSavings: Boolean(a.enable_extra_savings),
      color: a.color,
      notes: a.notes || ''
    }));

    // Query People
    const peopleRows = await env.DB.prepare('SELECT * FROM people WHERE household_id = ?').bind(householdId).all();
    const people = (peopleRows.results || []).map((/** @type {any} */ p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      payFrequency: p.pay_frequency,
      payDay1: isNaN(p.pay_day1) ? p.pay_day1 : Number(p.pay_day1),
      payDay2: isNaN(p.pay_day2) ? p.pay_day2 : Number(p.pay_day2),
      payOffsetDays: p.pay_offset_days !== undefined && p.pay_offset_days !== null ? Number(p.pay_offset_days) : 0,
      accountAllocations: (() => {
        try {
          return p.account_allocations ? JSON.parse(p.account_allocations) : {};
        } catch (e) {
          return {};
        }
      })(),
      grossPerPay: p.gross_per_pay,
      netPerPay: p.net_per_pay,
      color: p.color
    }));

    // Query Bills
    const billRows = await env.DB.prepare('SELECT * FROM bills WHERE household_id = ?').bind(householdId).all();

    // Query Bill Splits
    const splitRows = await env.DB.prepare(
      'SELECT bs.bill_id, bs.person_id, bs.percentage FROM bill_splits bs JOIN bills b ON bs.bill_id = b.id WHERE b.household_id = ?'
    ).bind(householdId).all();

    /** @type {Record<string, Record<string, number>>} */
    const splitsByBill = {};
    (splitRows.results || []).forEach((/** @type {any} */ s) => {
      if (!splitsByBill[s.bill_id]) splitsByBill[s.bill_id] = {};
      splitsByBill[s.bill_id][s.person_id] = s.percentage;
    });

    const bills = (billRows.results || []).map((/** @type {any} */ b) => ({
      id: b.id,
      accountId: b.account_id,
      name: b.name,
      amount: b.amount,
      period: b.period,
      dueDay: b.due_day,
      paymentSource: b.payment_source,
      notes: b.notes || '',
      isArchived: Boolean(b.is_archived),
      splits: splitsByBill[b.id] || {}
    }));

    // Query Line Items
    const lineItemRows = await env.DB.prepare(
      'SELECT li.bill_id, li.month_key, li.actual_amount, li.updated_at FROM line_items li JOIN bills b ON li.bill_id = b.id WHERE b.household_id = ?'
    ).bind(householdId).all();

    const lineItems = (lineItemRows.results || []).map((/** @type {any} */ li) => ({
      billId: li.bill_id,
      monthKey: li.month_key,
      actualAmount: li.actual_amount,
      updatedAt: li.updated_at
    }));

    // Query Loans
    const loanRows = await env.DB.prepare('SELECT * FROM loans WHERE household_id = ?').bind(householdId).all();
    const loans = (loanRows.results || []).map((/** @type {any} */ l) => ({
      id: l.id,
      name: l.name || '',
      description: l.description || '',
      principal: l.principal || 0,
      annualInterestRate: l.annual_interest_rate || 0,
      termMonths: l.term_months || 0,
      monthlyPayment: l.monthly_payment || 0,
      extraPayment: l.extra_payment || 0,
      startDate: l.start_date || '',
      isArchived: Boolean(l.is_archived),
      interestCompounding: l.interest_compounding || 'monthly',
      paymentFrequency: l.payment_frequency || 'monthly',
      paymentType: l.payment_type || 'amortizing'
    }));

    // Query Household Settings (theme, dashboardWidgets, hideDashboardHeader)
    let theme = 'dark';
    let dashboardWidgets = null;
    let hideDashboardHeader = false;
    try {
      const settingsRow = await env.DB.prepare(
        'SELECT theme, dashboard_widgets, hide_dashboard_header FROM household_settings WHERE household_id = ?'
      ).bind(householdId).first();
      if (settingsRow) {
        if (settingsRow.theme) theme = settingsRow.theme;
        if (settingsRow.dashboard_widgets) {
          try { dashboardWidgets = JSON.parse(settingsRow.dashboard_widgets); } catch (e) {}
        }
        hideDashboardHeader = Boolean(settingsRow.hide_dashboard_header);
      }
    } catch (e) {
      // Table might not exist yet
    }

    return new Response(JSON.stringify({
      success: true,
      budget: {
        accounts,
        people,
        bills,
        lineItems,
        loan: loans[0] || null,
        loans,
        theme,
        dashboardWidgets,
        hideDashboardHeader
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err || 'Failed to fetch budget');
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * @param {{ request: Request, env: Record<string, any> }} context
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload || !payload.householdId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const householdId = payload.householdId;
    const body = await request.json();
    const { budget } = body;

    if (!budget) {
      return new Response(JSON.stringify({ error: 'Budget payload is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await ensureSchema(env.DB);

    // Sync Accounts
    if (Array.isArray(budget.accounts)) {
      await env.DB.prepare('DELETE FROM accounts WHERE household_id = ?').bind(householdId).run();
      for (const acc of budget.accounts) {
        await env.DB.prepare(
          'INSERT INTO accounts (id, household_id, name, type, starting_balance, balance_as_of_date, extra_starting_balance, save_extra_monthly, enable_extra_savings, color, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          acc.id, householdId, acc.name, acc.type || 'checking',
          acc.startingBalance || 0, acc.balanceAsOfDate || '', acc.extraStartingBalance || 0, acc.saveExtraMonthly || 0,
          acc.enableExtraSavings ? 1 : 0, acc.color || 'blue', acc.notes || ''
        ).run();
      }
    }

    // Sync People
    if (Array.isArray(budget.people)) {
      await env.DB.prepare('DELETE FROM people WHERE household_id = ?').bind(householdId).run();
      for (const p of budget.people) {
        await env.DB.prepare(
          'INSERT INTO people (id, household_id, name, role, pay_frequency, pay_day1, pay_day2, pay_offset_days, account_allocations, gross_per_pay, net_per_pay, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          p.id, householdId, p.name, p.role || 'Member', p.payFrequency || 'bi-weekly',
          String(p.payDay1 || '15'), String(p.payDay2 || 'last'), Number(p.payOffsetDays || 0),
          JSON.stringify(p.accountAllocations || {}),
          p.grossPerPay || 0, p.netPerPay || 0, p.color || 'purple'
        ).run();
      }
    }

    // Sync Bills & Bill Splits
    let validBillIds = new Set();
    if (Array.isArray(budget.bills)) {
      await env.DB.prepare('DELETE FROM bills WHERE household_id = ?').bind(householdId).run();
      for (const b of budget.bills) {
        validBillIds.add(b.id);
        await env.DB.prepare(
          'INSERT INTO bills (id, household_id, account_id, name, amount, period, due_day, payment_source, notes, is_archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          b.id, householdId, b.accountId, b.name, b.amount || 0,
          b.period || 'Monthly', b.dueDay || 1, b.paymentSource || 'Auto Pay', b.notes || '',
          b.isArchived ? 1 : 0
        ).run();

        if (b.splits && typeof b.splits === 'object') {
          for (const [personId, percentage] of Object.entries(b.splits)) {
            await env.DB.prepare(
              'INSERT INTO bill_splits (bill_id, person_id, percentage) VALUES (?, ?, ?)'
            ).bind(b.id, personId, percentage || 0).run();
          }
        }
      }
    }

    // Sync Line Items
    if (Array.isArray(budget.lineItems)) {
      // If bills weren't passed in this payload, fetch valid ones from DB
      if (!Array.isArray(budget.bills)) {
        const existingBills = await env.DB.prepare('SELECT id FROM bills WHERE household_id = ?').bind(householdId).all();
        (existingBills.results || []).forEach((/** @type {any} */ b) => validBillIds.add(b.id));
      }

      // Clear line items for household's bills
      await env.DB.prepare(
        'DELETE FROM line_items WHERE bill_id IN (SELECT id FROM bills WHERE household_id = ?)'
      ).bind(householdId).run();

      for (const li of budget.lineItems) {
        if (!validBillIds.has(li.billId)) continue; // IDOR Protection: skip line items for unowned bills
        await env.DB.prepare(
          'INSERT INTO line_items (bill_id, month_key, actual_amount, updated_at) VALUES (?, ?, ?, ?)'
        ).bind(li.billId, li.monthKey, li.actualAmount ?? null, li.updatedAt || Date.now()).run();
      }
    }

    // Sync Loans
    if (Array.isArray(budget.loans)) {
      await env.DB.prepare('DELETE FROM loans WHERE household_id = ?').bind(householdId).run();
      for (const l of budget.loans) {
        await env.DB.prepare(
          'INSERT INTO loans (id, household_id, name, description, principal, annual_interest_rate, term_months, monthly_payment, extra_payment, start_date, is_archived, interest_compounding, payment_frequency, payment_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          l.id, householdId, l.name || 'New Loan', l.description || '',
          l.principal || 0, l.annualInterestRate || 0, l.termMonths || 0,
          l.monthlyPayment || 0, l.extraPayment || 0, l.startDate || '2024-01-01',
          l.isArchived ? 1 : 0, l.interestCompounding || 'monthly',
          l.paymentFrequency || 'monthly', l.paymentType || 'amortizing'
        ).run();
      }
    } else if (budget.loan) {
      await env.DB.prepare('DELETE FROM loans WHERE household_id = ?').bind(householdId).run();
      const loanId = budget.loan.id || `loan-${Date.now()}`;
      await env.DB.prepare(
        'INSERT INTO loans (id, household_id, name, description, principal, annual_interest_rate, term_months, monthly_payment, extra_payment, start_date, is_archived, interest_compounding, payment_frequency, payment_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        loanId, householdId, budget.loan.name || 'New Loan', budget.loan.description || '',
        budget.loan.principal || 0, budget.loan.annualInterestRate || 0,
        budget.loan.termMonths || 0, budget.loan.monthlyPayment || 0,
        budget.loan.extraPayment || 0, budget.loan.startDate || '2024-01-01',
        budget.loan.isArchived ? 1 : 0, budget.loan.interestCompounding || 'monthly',
        budget.loan.paymentFrequency || 'monthly', budget.loan.paymentType || 'amortizing'
      ).run();
    }

    // Sync Household Settings (theme, dashboardWidgets, hideDashboardHeader)
    if (budget.theme !== undefined || budget.dashboardWidgets !== undefined || budget.hideDashboardHeader !== undefined) {
      try {
        const existingSettings = await env.DB.prepare(
          'SELECT theme, dashboard_widgets, hide_dashboard_header FROM household_settings WHERE household_id = ?'
        ).bind(householdId).first();

        const themeVal = budget.theme || existingSettings?.theme || 'dark';
        const widgetsVal = budget.dashboardWidgets
          ? JSON.stringify(budget.dashboardWidgets)
          : (existingSettings?.dashboard_widgets || '[]');
        const hideHeaderVal = budget.hideDashboardHeader !== undefined
          ? (budget.hideDashboardHeader ? 1 : 0)
          : (existingSettings?.hide_dashboard_header || 0);

        await env.DB.prepare(
          'INSERT INTO household_settings (household_id, theme, dashboard_widgets, hide_dashboard_header) VALUES (?, ?, ?, ?) ON CONFLICT(household_id) DO UPDATE SET theme = excluded.theme, dashboard_widgets = excluded.dashboard_widgets, hide_dashboard_header = excluded.hide_dashboard_header'
        ).bind(householdId, themeVal, widgetsVal, hideHeaderVal).run();
      } catch (e) {
        console.error('Failed to sync household settings to D1:', e);
      }
    }

    return new Response(JSON.stringify({ success: true, syncedAt: Date.now() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err || 'Failed to sync budget');
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
