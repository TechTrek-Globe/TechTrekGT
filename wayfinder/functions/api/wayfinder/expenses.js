// TechTrek Wayfinder - Multi-Currency Expense Ledger API
// Manages trip expenses, participant split allocations, and settle-up payments.

import { resolveAgendaAccess, canEdit, canViewSensitive } from '../../utils/agendaAccess.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Ensure database tables exist (self-healing)
async function ensureTables(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS wayfinder_expenses (
        id                   TEXT PRIMARY KEY,
        journey_id           TEXT NOT NULL,
        itinerary_item_id    TEXT,
        document_id          TEXT,
        user_id              TEXT NOT NULL,
        paid_by_name         TEXT,
        paid_by_user_id      TEXT,
        category             TEXT NOT NULL DEFAULT 'other',
        description          TEXT NOT NULL,
        amount_original      REAL,
        currency_original    TEXT DEFAULT 'PLN',
        amount_usd           REAL,
        exchange_rate        REAL,
        exchange_rate_date   TEXT,
        exchange_rate_source TEXT,
        is_converted         INTEGER NOT NULL DEFAULT 0,
        is_refundable        INTEGER NOT NULL DEFAULT 0,
        refund_status        TEXT NOT NULL DEFAULT 'na',
        cancellation_deadline TEXT,
        paid_status          TEXT NOT NULL DEFAULT 'paid',
        verification_status  TEXT NOT NULL DEFAULT 'unverified',
        purchase_site        TEXT,
        payment_method       TEXT,
        notes                TEXT,
        created_at           TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS wayfinder_expense_splits (
        id              TEXT PRIMARY KEY,
        expense_id      TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        user_name       TEXT,
        amount_owed     REAL NOT NULL,
        percentage      REAL,
        is_settled      INTEGER NOT NULL DEFAULT 0,
        settled_at      TEXT,
        settle_method   TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();

    // Add paid_by_user_id, purchase_site, payment_method to live tables if missing
    try {
      await db.prepare(`ALTER TABLE wayfinder_expenses ADD COLUMN paid_by_user_id TEXT`).run();
    } catch (_) { /* column already exists */ }
    try {
      await db.prepare(`ALTER TABLE wayfinder_expenses ADD COLUMN purchase_site TEXT`).run();
    } catch (_) { /* column already exists */ }
    try {
      await db.prepare(`ALTER TABLE wayfinder_expenses ADD COLUMN payment_method TEXT`).run();
    } catch (_) { /* column already exists */ }

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS wayfinder_expense_settlements (
        id              TEXT PRIMARY KEY,
        journey_id      TEXT NOT NULL,
        expense_id      TEXT,
        split_id        TEXT,
        from_user_id    TEXT NOT NULL,
        from_user_name  TEXT NOT NULL,
        to_user_id      TEXT NOT NULL,
        to_user_name    TEXT NOT NULL,
        amount          REAL NOT NULL,
        currency        TEXT NOT NULL DEFAULT 'PLN',
        settled_date    TEXT NOT NULL DEFAULT (date('now')),
        method          TEXT NOT NULL DEFAULT 'cash',
        notes           TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
  } catch (err) {
    console.warn('[expenses] table initialization note:', err.message);
  }
}

export async function handleExpenses(context, url, method) {
  const { env, user } = context;
  const db = env.DB;
  if (!db) return json({ error: 'Database binding not available' }, 503);

  await ensureTables(db);

  const journeyId = url.searchParams.get('journey_id') || url.searchParams.get('journeyId') || 'poland-christmas-2026';
  const pathParts = url.pathname.split('/').filter(Boolean);
  // URL structure: /api/wayfinder/expenses or /api/wayfinder/expenses/:id or /api/wayfinder/expenses/settle
  const lastSegment = pathParts[pathParts.length - 1];
  const isSettleAction = lastSegment === 'settle';
  const isPresetAction = lastSegment === 'preset';
  const isIdRoute = !isSettleAction && !isPresetAction && lastSegment !== 'expenses';
  const expenseId = isIdRoute ? lastSegment : null;

  try {
    if (!user?.userId) return json({ error: 'Authentication required' }, 401);

    const access = await resolveAgendaAccess(env, journeyId, user);
    const journey = access.journey;
    if (!journey) {
      return json({ error: 'Journey not found' }, 404);
    }
    // Expenses are restricted to owner, share admin and platform admin
    if (!canViewSensitive(access.role)) {
      return json({ error: 'Forbidden' }, 403);
    }

    // 1. GET /api/wayfinder/expenses - Fetch all expenses, splits, and settlements
    if (method === 'GET') {
      const expensesQuery = await db.prepare(`
        SELECT * FROM wayfinder_expenses
        WHERE journey_id = ? OR journey_id = ?
        ORDER BY created_at DESC
      `).bind(journeyId, journey.id).all();

      const expenses = expensesQuery.results || [];

      // Fetch all splits for these expenses
      let splits = [];
      if (expenses.length > 0) {
        const splitsQuery = await db.prepare(`
          SELECT * FROM wayfinder_expense_splits
          WHERE expense_id IN (${expenses.map(() => '?').join(',')})
        `).bind(...expenses.map(e => e.id)).all();
        splits = splitsQuery.results || [];
      }

      // Group splits by expense_id
      const splitsMap = {};
      for (const s of splits) {
        if (!splitsMap[s.expense_id]) splitsMap[s.expense_id] = [];
        splitsMap[s.expense_id].push(s);
      }

      const enrichedExpenses = expenses.map(e => ({
        ...e,
        splits: splitsMap[e.id] || []
      }));

      // Fetch recorded settlements
      const settlementsQuery = await db.prepare(`
        SELECT * FROM wayfinder_expense_settlements
        WHERE journey_id = ? OR journey_id = ?
        ORDER BY settled_date DESC, created_at DESC
      `).bind(journeyId, journey.id).all();

      return json({
        journey_id: journeyId,
        expenses: enrichedExpenses,
        settlements: settlementsQuery.results || []
      });
    }

    // 2. POST /api/wayfinder/expenses/settle - Record a debt settlement
    if (method === 'POST' && isSettleAction) {
      if (!canEdit(access.role)) {
        return json({ error: 'Permission denied: viewers have read-only access' }, 403);
      }
      const body = await context.request.json().catch(() => ({}));
      const {
        from_user_id,
        from_user_name = 'Member',
        to_user_id,
        to_user_name = 'Member',
        amount,
        currency = 'PLN',
        method: payMethod = 'cash',
        notes = '',
        expense_id = null,
        split_id = null
      } = body;

      if (!from_user_id || !to_user_id || !amount) {
        return json({ error: 'from_user_id, to_user_id, and amount are required' }, 400);
      }

      const settleId = `stl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const settleStmts = [
        db.prepare(`
          INSERT INTO wayfinder_expense_settlements (
            id, journey_id, from_user_id, from_user_name, to_user_id, to_user_name,
            amount, currency, settled_date, method, notes, expense_id, split_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?, ?, ?, datetime('now'))
        `).bind(
          settleId,
          journeyId,
          from_user_id,
          from_user_name,
          to_user_id,
          to_user_name,
          Number(amount),
          currency.toUpperCase(),
          payMethod,
          notes,
          expense_id,
          split_id
        )
      ];

      // If tied to a specific split, mark that split as settled
      if (split_id) {
        settleStmts.push(
          db.prepare(`
            UPDATE wayfinder_expense_splits 
            SET is_settled = 1, settled_at = datetime('now'), settle_method = ?
            WHERE id = ? AND expense_id IN (SELECT id FROM wayfinder_expenses WHERE journey_id = ?)
          `).bind(payMethod, split_id, journey.id)
        );
      }

      await db.batch(settleStmts);
      return json({ success: true, settlement_id: settleId });
    }

    // 2b. DELETE /api/wayfinder/expenses/settle - Undo / remove a recorded settlement
    if (method === 'DELETE' && isSettleAction) {
      if (!canEdit(access.role)) {
        return json({ error: 'Permission denied: viewers have read-only access' }, 403);
      }
      const settleId = url.searchParams.get('settlement_id') || url.searchParams.get('id');
      const splitId = url.searchParams.get('split_id');

      if (splitId) {
        await db.batch([
          db.prepare('UPDATE wayfinder_expense_splits SET is_settled = 0, settled_at = NULL, settle_method = NULL WHERE id = ? AND expense_id IN (SELECT id FROM wayfinder_expenses WHERE journey_id = ?)').bind(splitId, journey.id),
          db.prepare('DELETE FROM wayfinder_expense_settlements WHERE split_id = ? AND journey_id = ?').bind(splitId, journey.id)
        ]);
        return json({ success: true, un_settled_split: splitId });
      }

      if (settleId) {
        const stl = await db.prepare('SELECT * FROM wayfinder_expense_settlements WHERE id = ? AND journey_id = ?').bind(settleId, journey.id).first();
        if (!stl) return json({ error: 'Settlement not found' }, 404);
        const delStmts = [];
        if (stl && stl.split_id) {
          delStmts.push(db.prepare('UPDATE wayfinder_expense_splits SET is_settled = 0, settled_at = NULL, settle_method = NULL WHERE id = ?').bind(stl.split_id));
        }
        delStmts.push(db.prepare('DELETE FROM wayfinder_expense_settlements WHERE id = ?').bind(settleId));
        await db.batch(delStmts);
        return json({ success: true, deleted_settlement: settleId });
      }

      return json({ error: 'settlement_id or split_id required' }, 400);
    }

    // 3. POST /api/wayfinder/expenses/preset - Seed curated trip expenses
    if (method === 'POST' && isPresetAction) {
      if (!canEdit(access.role)) {
        return json({ error: 'Permission denied: viewers have read-only access' }, 403);
      }

      const presets = [
        {
          desc: 'Delta Transatlantic Flights: ATL -> AMS -> KRK (x2 Pax)',
          cat: 'flight',
          amount: 1980.00,
          cur: 'USD',
          paidBy: 'Ronald Milton Few',
          payerId: 'usr-ronald-few',
          site: 'Delta.com',
          method: 'Amex Delta SkyMiles',
          splits: [
            { userId: user.userId, userName: 'Jonathan Kemp', amount: 990.00, pct: 50 },
            { userId: 'usr-ronald-few', userName: 'Ronald Milton Few', amount: 990.00, pct: 50 }
          ]
        },
        {
          desc: 'Hotel Experior Boutique Kraków (3 Nights Dec 4-7)',
          cat: 'lodging',
          amount: 366.43,
          cur: 'USD',
          paidBy: 'Jonathan Kemp',
          payerId: user.userId,
          site: 'Booking.com',
          method: 'Visa (*4123)',
          splits: [
            { userId: user.userId, userName: 'Jonathan Kemp', amount: 183.22, pct: 50 },
            { userId: 'usr-ronald-few', userName: 'Ronald Milton Few', amount: 183.21, pct: 50 }
          ]
        },
        {
          desc: 'Hotel Altus Palace Wrocław (2 Nights Dec 7-9)',
          cat: 'lodging',
          amount: 2400.00,
          cur: 'PLN',
          paidBy: 'Jonathan Kemp',
          payerId: user.userId,
          site: 'Hotels.com',
          method: 'Mastercard',
          splits: [
            { userId: user.userId, userName: 'Jonathan Kemp', amount: 1200.00, pct: 50 },
            { userId: 'usr-ronald-few', userName: 'Ronald Milton Few', amount: 1200.00, pct: 50 }
          ]
        },
        {
          desc: 'Hotel Brovaria Poznań (1 Night Dec 9-10)',
          cat: 'lodging',
          amount: 450.00,
          cur: 'PLN',
          paidBy: 'Jonathan Kemp',
          payerId: user.userId,
          site: 'Brovaria Direct',
          method: 'Visa',
          splits: [
            { userId: user.userId, userName: 'Jonathan Kemp', amount: 225.00, pct: 50 },
            { userId: 'usr-ronald-few', userName: 'Ronald Milton Few', amount: 225.00, pct: 50 }
          ]
        },
        {
          desc: 'GetYourGuide: Auschwitz-Birkenau & Wieliczka Salt Mine Tour',
          cat: 'activity',
          amount: 284.76,
          cur: 'USD',
          paidBy: 'Jonathan Kemp',
          payerId: user.userId,
          site: 'GetYourGuide',
          method: 'Apple Pay',
          splits: [
            { userId: user.userId, userName: 'Jonathan Kemp', amount: 142.38, pct: 50 },
            { userId: 'usr-ronald-few', userName: 'Ronald Milton Few', amount: 142.38, pct: 50 }
          ]
        },
        {
          desc: 'Wrocław Rynek Market: Mulled Wine & Grilled Sausage Dinner',
          cat: 'dining',
          amount: 140.00,
          cur: 'PLN',
          paidBy: 'Ronald Milton Few',
          payerId: 'usr-ronald-few',
          site: 'Wrocław Christmas Market',
          method: 'Cash (PLN)',
          splits: [
            { userId: user.userId, userName: 'Jonathan Kemp', amount: 70.00, pct: 50 },
            { userId: 'usr-ronald-few', userName: 'Ronald Milton Few', amount: 70.00, pct: 50 }
          ]
        }
      ];

      const existingDescs = await db.prepare(
        `SELECT description FROM wayfinder_expenses WHERE journey_id = ? OR journey_id = 'poland-christmas-2026'`
      ).bind(journeyId).all();
      const existingSet = new Set((existingDescs.results || []).map(r => r.description));
      const toInsert = presets.filter(p => !existingSet.has(p.desc));

      if (toInsert.length === 0) {
        return json({ success: true, seeded: 0, message: 'All preset expenses already seeded' });
      }

      const presetStmts = [];
      for (const p of toInsert) {
        const newId = `exp-preset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const payerId = p.payerId || (p.paidBy === 'Jonathan Kemp' ? user.userId : 'usr-ronald-few');

        let amountUsd = p.amount;
        if (p.cur === 'PLN') amountUsd = Math.round((p.amount / 4.0) * 100) / 100;
        else if (p.cur === 'EUR') amountUsd = Math.round((p.amount * 1.08) * 100) / 100;

        presetStmts.push(
          db.prepare(`
            INSERT INTO wayfinder_expenses (
              id, journey_id, user_id, paid_by_name, paid_by_user_id, category, description,
              amount_original, currency_original, amount_usd, paid_status, purchase_site, payment_method, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, datetime('now'))
          `).bind(
            newId,
            journeyId,
            payerId,
            p.paidBy,
            payerId,
            p.cat,
            p.desc,
            p.amount,
            p.cur,
            amountUsd,
            p.site || null,
            p.method || null
          )
        );

        for (const s of p.splits) {
          const splitId = `spl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          presetStmts.push(
            db.prepare(`
              INSERT INTO wayfinder_expense_splits (
                id, expense_id, user_id, user_name, amount_owed, percentage, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(splitId, newId, s.userId, s.userName, s.amount, s.pct)
          );
        }
      }

      await db.batch(presetStmts);
      return json({ success: true, seeded: toInsert.length });
    }

    // 4. POST /api/wayfinder/expenses - Add new expense
    if (method === 'POST') {
      if (!canEdit(access.role)) {
        return json({ error: 'Permission denied: viewers have read-only access' }, 403);
      }
      const body = await context.request.json().catch(() => ({}));
      const {
        description,
        category = 'other',
        amount_original,
        currency_original = 'PLN',
        paid_by_name = user.email || 'You',
        paid_by_id,
        paid_by_user_id,
        purchase_site = null,
        payment_method = null,
        splits = [],
        notes = ''
      } = body;

      if (!description || !amount_original) {
        return json({ error: 'description and amount_original are required' }, 400);
      }

      const payerUserId = paid_by_user_id || paid_by_id || user.userId;
      const payerName = paid_by_name || user.email || 'You';
      const newExpenseId = `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      let amountUsd = Number(amount_original);
      if (currency_original.toUpperCase() === 'PLN') amountUsd = Math.round((Number(amount_original) / 4.0) * 100) / 100;
      else if (currency_original.toUpperCase() === 'EUR') amountUsd = Math.round((Number(amount_original) * 1.08) * 100) / 100;

      const postStmts = [
        db.prepare(`
          INSERT INTO wayfinder_expenses (
            id, journey_id, user_id, paid_by_name, paid_by_user_id, category, description,
            amount_original, currency_original, amount_usd, paid_status, purchase_site, payment_method, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, datetime('now'))
        `).bind(
          newExpenseId,
          journeyId,
          payerUserId,
          payerName,
          payerUserId,
          category,
          description,
          Number(amount_original),
          currency_original.toUpperCase(),
          amountUsd,
          purchase_site || null,
          payment_method || null,
          notes
        )
      ];

      // Insert splits
      if (Array.isArray(splits) && splits.length > 0) {
        for (const s of splits) {
          const splitId = `spl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          postStmts.push(
            db.prepare(`
              INSERT INTO wayfinder_expense_splits (
                id, expense_id, user_id, user_name, amount_owed, percentage, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
              splitId,
              newExpenseId,
              s.user_id || s.userId || user.userId,
              s.user_name || s.userName || 'Member',
              Number(s.amount_owed || s.amountOwed || 0),
              Number(s.percentage || 0)
            )
          );
        }
      }

      await db.batch(postStmts);
      return json({ success: true, id: newExpenseId });
    }

    // 4b. PUT /api/wayfinder/expenses/:id - Update an existing expense and its splits
    if (method === 'PUT') {
      if (!canEdit(access.role)) {
        return json({ error: 'Permission denied: viewers have read-only access' }, 403);
      }
      const body = await context.request.json().catch(() => ({}));
      const targetExpenseId = expenseId || url.searchParams.get('id') || body.id;
      if (!targetExpenseId) {
        return json({ error: 'expense ID is required for update' }, 400);
      }
      const ownedExpense = await db.prepare('SELECT id FROM wayfinder_expenses WHERE id = ? AND journey_id = ?').bind(targetExpenseId, journey.id).first();
      if (!ownedExpense) return json({ error: 'Expense not found' }, 404);

      const {
        description,
        category = 'other',
        amount_original,
        currency_original = 'PLN',
        paid_by_name,
        paid_by_user_id,
        paid_by_id,
        purchase_site = null,
        payment_method = null,
        splits = [],
        notes = ''
      } = body;

      const payerUserId = paid_by_user_id || paid_by_id || user.userId;
      const payerName = paid_by_name || user.email || 'You';

      let amountUsd = Number(amount_original);
      if (currency_original.toUpperCase() === 'PLN') amountUsd = Math.round((Number(amount_original) / 4.0) * 100) / 100;
      else if (currency_original.toUpperCase() === 'EUR') amountUsd = Math.round((Number(amount_original) * 1.08) * 100) / 100;

      const putStmts = [
        db.prepare(`
          UPDATE wayfinder_expenses
          SET description = ?,
              category = ?,
              amount_original = ?,
              currency_original = ?,
              amount_usd = ?,
              paid_by_name = ?,
              paid_by_user_id = ?,
              purchase_site = ?,
              payment_method = ?,
              notes = ?
          WHERE id = ?
        `).bind(
          description,
          category,
          Number(amount_original),
          currency_original.toUpperCase(),
          amountUsd,
          payerName,
          payerUserId,
          purchase_site || null,
          payment_method || null,
          notes,
          targetExpenseId
        )
      ];

      // If splits provided, preserve settlement state where possible, then update splits
      if (Array.isArray(splits) && splits.length > 0) {
        const existingSplits = await db.prepare('SELECT * FROM wayfinder_expense_splits WHERE expense_id = ?').bind(targetExpenseId).all();
        const settledMap = {};
        for (const es of (existingSplits.results || [])) {
          if (es.is_settled) {
            settledMap[es.user_id] = { is_settled: 1, settled_at: es.settled_at, settle_method: es.settle_method };
          }
        }

        putStmts.push(db.prepare('DELETE FROM wayfinder_expense_splits WHERE expense_id = ?').bind(targetExpenseId));

        for (const s of splits) {
          const splitId = `spl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const uId = s.user_id || s.userId || user.userId;
          const uName = s.user_name || s.userName || 'Member';
          const amtOwed = Number(s.amount_owed || s.amountOwed || 0);
          const pct = Number(s.percentage || 0);
          const prevSettled = settledMap[uId];
          const isSettled = prevSettled ? 1 : 0;
          const settledAt = prevSettled ? prevSettled.settled_at : null;
          const settleMethod = prevSettled ? prevSettled.settle_method : null;

          putStmts.push(
            db.prepare(`
              INSERT INTO wayfinder_expense_splits (
                id, expense_id, user_id, user_name, amount_owed, percentage, is_settled, settled_at, settle_method, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `).bind(
              splitId,
              targetExpenseId,
              uId,
              uName,
              amtOwed,
              pct,
              isSettled,
              settledAt,
              settleMethod
            )
          );
        }
      }

      await db.batch(putStmts);
      return json({ success: true, updated: targetExpenseId });
    }

    // 5. DELETE /api/wayfinder/expenses/:id - Remove an expense
    if (method === 'DELETE' && expenseId) {
      if (!canEdit(access.role)) {
        return json({ error: 'Permission denied: viewers have read-only access' }, 403);
      }
      const ownedExpense = await db.prepare('SELECT id FROM wayfinder_expenses WHERE id = ? AND journey_id = ?').bind(expenseId, journey.id).first();
      if (!ownedExpense) return json({ error: 'Expense not found' }, 404);

      await db.batch([
        db.prepare('DELETE FROM wayfinder_expense_splits WHERE expense_id = ?').bind(expenseId),
        db.prepare('DELETE FROM wayfinder_expenses WHERE id = ?').bind(expenseId)
      ]);

      return json({ success: true, deleted: expenseId });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[expenses] error:', err);
    return json({ error: err.message || 'Internal server error' }, 500);
  }
}
