import { verifyToken } from '../utils/auth.js';

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

    // Query Accounts
    const accRows = await env.DB.prepare('SELECT * FROM accounts WHERE household_id = ?').bind(householdId).all();
    const accounts = (accRows.results || []).map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      startingBalance: a.starting_balance,
      extraStartingBalance: a.extra_starting_balance || 0,
      saveExtraMonthly: a.save_extra_monthly || 0,
      enableExtraSavings: Boolean(a.enable_extra_savings),
      color: a.color,
      notes: a.notes || ''
    }));

    // Query People
    const peopleRows = await env.DB.prepare('SELECT * FROM people WHERE household_id = ?').bind(householdId).all();
    const people = (peopleRows.results || []).map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      payFrequency: p.pay_frequency,
      payDay1: isNaN(p.pay_day1) ? p.pay_day1 : Number(p.pay_day1),
      payDay2: isNaN(p.pay_day2) ? p.pay_day2 : Number(p.pay_day2),
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

    const splitsByBill = {};
    (splitRows.results || []).forEach(s => {
      if (!splitsByBill[s.bill_id]) splitsByBill[s.bill_id] = {};
      splitsByBill[s.bill_id][s.person_id] = s.percentage;
    });

    const bills = (billRows.results || []).map(b => ({
      id: b.id,
      accountId: b.account_id,
      name: b.name,
      amount: b.amount,
      period: b.period,
      dueDay: b.due_day,
      paymentSource: b.payment_source,
      notes: b.notes || '',
      splits: splitsByBill[b.id] || {}
    }));

    // Query Line Items
    const lineItemRows = await env.DB.prepare(
      'SELECT li.bill_id, li.month_key, li.actual_amount, li.updated_at FROM line_items li JOIN bills b ON li.bill_id = b.id WHERE b.household_id = ?'
    ).bind(householdId).all();

    const lineItems = (lineItemRows.results || []).map(li => ({
      billId: li.bill_id,
      monthKey: li.month_key,
      actualAmount: li.actual_amount,
      updatedAt: li.updated_at
    }));

    // Query Loan
    const loanRow = await env.DB.prepare('SELECT * FROM loans WHERE household_id = ?').bind(householdId).first();
    const loan = loanRow ? {
      description: loanRow.description || '',
      principal: loanRow.principal || 0,
      annualInterestRate: loanRow.annual_interest_rate || 0,
      termMonths: loanRow.term_months || 0,
      monthlyPayment: loanRow.monthly_payment || 0,
      extraPayment: loanRow.extra_payment || 0,
      startDate: loanRow.start_date || ''
    } : {
      description: '',
      principal: 0,
      annualInterestRate: 0,
      termMonths: 0,
      monthlyPayment: 0,
      extraPayment: 0,
      startDate: ''
    };

    return new Response(JSON.stringify({
      success: true,
      budget: {
        accounts,
        people,
        bills,
        lineItems,
        loan
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch budget' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

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

    // Sync Accounts
    if (Array.isArray(budget.accounts)) {
      await env.DB.prepare('DELETE FROM accounts WHERE household_id = ?').bind(householdId).run();
      for (const acc of budget.accounts) {
        await env.DB.prepare(
          'INSERT INTO accounts (id, household_id, name, type, starting_balance, extra_starting_balance, save_extra_monthly, enable_extra_savings, color, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          acc.id, householdId, acc.name, acc.type || 'checking',
          acc.startingBalance || 0, acc.extraStartingBalance || 0, acc.saveExtraMonthly || 0,
          acc.enableExtraSavings ? 1 : 0, acc.color || 'blue', acc.notes || ''
        ).run();
      }
    }

    // Sync People
    if (Array.isArray(budget.people)) {
      await env.DB.prepare('DELETE FROM people WHERE household_id = ?').bind(householdId).run();
      for (const p of budget.people) {
        await env.DB.prepare(
          'INSERT INTO people (id, household_id, name, role, pay_frequency, pay_day1, pay_day2, gross_per_pay, net_per_pay, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          p.id, householdId, p.name, p.role || 'Member', p.payFrequency || 'bi-weekly',
          String(p.payDay1 || '15'), String(p.payDay2 || 'last'),
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
          'INSERT INTO bills (id, household_id, account_id, name, amount, period, due_day, payment_source, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          b.id, householdId, b.accountId, b.name, b.amount || 0,
          b.period || 'Monthly', b.dueDay || 1, b.paymentSource || 'Auto Pay', b.notes || ''
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
        (existingBills.results || []).forEach(b => validBillIds.add(b.id));
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

    // Sync Loan
    if (budget.loan) {
      await env.DB.prepare('DELETE FROM loans WHERE household_id = ?').bind(householdId).run();
      const loanId = `loan-${Date.now()}`;
      await env.DB.prepare(
        'INSERT INTO loans (id, household_id, description, principal, annual_interest_rate, term_months, monthly_payment, extra_payment, start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        loanId, householdId, budget.loan.description || 'Home Loan',
        budget.loan.principal || 0, budget.loan.annualInterestRate || 0,
        budget.loan.termMonths || 0, budget.loan.monthlyPayment || 0,
        budget.loan.extraPayment || 0, budget.loan.startDate || '2024-01-01'
      ).run();
    }

    return new Response(JSON.stringify({ success: true, syncedAt: Date.now() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to sync budget' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
