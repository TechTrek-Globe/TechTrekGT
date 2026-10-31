// TechTrek Wayfinder - Multi-Currency Expense Ledger API
// Manages trip expenses, participant split allocations, and settle-up payments.

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
    // 1. GET /api/wayfinder/expenses - Fetch all expenses, splits, and settlements
    if (method === 'GET') {
      const expensesQuery = await db.prepare(`
        SELECT * FROM wayfinder_expenses
        WHERE journey_id = ? OR journey_id = 'poland-christmas-2026'
        ORDER BY created_at DESC
      `).bind(journeyId).all();

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
        WHERE journey_id = ? OR journey_id = 'poland-christmas-2026'
        ORDER BY settled_date DESC, created_at DESC
      `).bind(journeyId).all();

      return json({
        journey_id: journeyId,
        expenses: enrichedExpenses,
        settlements: settlementsQuery.results || []
      });
    }

    // 2. POST /api/wayfinder/expenses/settle - Record a debt settlement
    if (method === 'POST' && isSettleAction) {
      if (!user) return json({ error: 'Authentication required' }, 401);
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
      await db.prepare(`
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
      ).run();

      // If tied to a specific split, mark that split as settled
      if (split_id) {
        await db.prepare(`
          UPDATE wayfinder_expense_splits 
          SET is_settled = 1, settled_at = datetime('now'), settle_method = ?
          WHERE id = ?
        `).bind(payMethod, split_id).run();
      }

      return json({ success: true, settlement_id: settleId });
    }

    // 2b. DELETE /api/wayfinder/expenses/settle - Undo / remove a recorded settlement
    if (method === 'DELETE' && isSettleAction) {
      if (!user) return json({ error: 'Authentication required' }, 401);
      const settleId = url.searchParams.get('settlement_id') || url.searchParams.get('id');
      const splitId = url.searchParams.get('split_id');

      if (splitId) {
        await db.prepare('UPDATE wayfinder_expense_splits SET is_settled = 0, settled_at = NULL, settle_method = NULL WHERE id = ?').bind(splitId).run();
        await db.prepare('DELETE FROM wayfinder_expense_settlements WHERE split_id = ?').bind(splitId).run();
        return json({ success: true, un_settled_split: splitId });
      }

      if (settleId) {
        const stl = await db.prepare('SELECT * FROM wayfinder_expense_settlements WHERE id = ?').bind(settleId).first();
        if (stl && stl.split_id) {
          await db.prepare('UPDATE wayfinder_expense_splits SET is_settled = 0, settled_at = NULL, settle_method = NULL WHERE id = ?').bind(stl.split_id).run();
        }
        await db.prepare('DELETE FROM wayfinder_expense_settlements WHERE id = ?').bind(settleId).run();
        return json({ success: true, deleted_settlement: settleId });
      }

      return json({ error: 'settlement_id or split_id required' }, 400);
    }

    // 3. POST /api/wayfinder/expenses/preset - Seed curated trip expenses
    if (method === 'POST' && isPresetAction) {
      if (!user) return json({ error: 'Authentication required' }, 401);

      const presets = [
        {
          desc: 'Delta Transatlantic Flights: ATL -> AMS -> KRK (x2 Pax)',
          cat: 'flight',
          amount: 1980.00,
          cur: 'USD',
          paidBy: 'Jonathan Kemp',
          splits: [
            { userId: user.userId, userName: 'Jonathan Kemp', amount: 990.00, pct: 50 },
            { userId: 'usr-ronald-few', userName: 'Ronald Milton Few', amount: 990.00, pct: 50 }
          ]
        },
        {
          desc: 'Altus Palace Wrocław 5-Star Stay (2 Nights)',
          cat: 'lodging',
          amount: 1650.00,
          cur: 'PLN',
          paidBy: 'Jonathan Kemp',
          splits: [
            { userId: user.userId, userName: 'Jonathan Kemp', amount: 825.00, pct: 50 },
            { userId: 'usr-ronald-few', userName: 'Ronald Milton Few', amount: 825.00, pct: 50 }
          ]
        },
        {
          desc: 'PKP Intercity 1st Class: Kraków -> Wrocław -> Poznań',
          cat: 'transit',
          amount: 380.00,
          cur: 'PLN',
          paidBy: 'Ronald Milton Few',
          splits: [
            { userId: user.userId, userName: 'Jonathan Kemp', amount: 190.00, pct: 50 },
            { userId: 'usr-ronald-few', userName: 'Ronald Milton Few', amount: 190.00, pct: 50 }
          ]
        },
        {
          desc: 'Wrocław Rynek Market: Mulled Wine & Grilled Sausage Dinner',
          cat: 'dining',
          amount: 140.00,
          cur: 'PLN',
          paidBy: 'Ronald Milton Few',
          splits: [
            { userId: user.userId, userName: 'Jonathan Kemp', amount: 70.00, pct: 50 },
            { userId: 'usr-ronald-few', userName: 'Ronald Milton Few', amount: 70.00, pct: 50 }
          ]
        }
      ];

      for (const p of presets) {
        const newId = `exp-preset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const payerId = p.paidBy === 'Jonathan Kemp' ? user.userId : 'usr-ronald-few';

        await db.prepare(`
          INSERT INTO wayfinder_expenses (
            id, journey_id, user_id, paid_by_name, category, description,
            amount_original, currency_original, paid_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', datetime('now'))
        `).bind(
          newId,
          journeyId,
          payerId,
          p.paidBy,
          p.cat,
          p.desc,
          p.amount,
          p.cur
        ).run();

        for (const s of p.splits) {
          const splitId = `spl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          await db.prepare(`
            INSERT INTO wayfinder_expense_splits (
              id, expense_id, user_id, user_name, amount_owed, percentage, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `).bind(splitId, newId, s.userId, s.userName, s.amount, s.pct).run();
        }
      }

      return json({ success: true, seeded: presets.length });
    }

    // 4. POST /api/wayfinder/expenses - Add new expense
    if (method === 'POST') {
      if (!user) return json({ error: 'Authentication required' }, 401);
      const body = await context.request.json().catch(() => ({}));
      const {
        description,
        category = 'other',
        amount_original,
        currency_original = 'PLN',
        paid_by_name = user.email || 'You',
        paid_by_id = user.userId,
        splits = [],
        notes = ''
      } = body;

      if (!description || !amount_original) {
        return json({ error: 'description and amount_original are required' }, 400);
      }

      const newExpenseId = `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await db.prepare(`
        INSERT INTO wayfinder_expenses (
          id, journey_id, user_id, paid_by_name, category, description,
          amount_original, currency_original, paid_status, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, datetime('now'))
      `).bind(
        newExpenseId,
        journeyId,
        paid_by_id,
        paid_by_name,
        category,
        description,
        Number(amount_original),
        currency_original.toUpperCase(),
        notes
      ).run();

      // Insert splits
      if (Array.isArray(splits) && splits.length > 0) {
        for (const s of splits) {
          const splitId = `spl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          await db.prepare(`
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
          ).run();
        }
      }

      return json({ success: true, id: newExpenseId });
    }

    // 5. DELETE /api/wayfinder/expenses/:id - Remove an expense
    if (method === 'DELETE' && expenseId) {
      if (!user) return json({ error: 'Authentication required' }, 401);

      await db.prepare('DELETE FROM wayfinder_expense_splits WHERE expense_id = ?').bind(expenseId).run();
      await db.prepare('DELETE FROM wayfinder_expenses WHERE id = ?').bind(expenseId).run();

      return json({ success: true, deleted: expenseId });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[expenses] error:', err);
    return json({ error: err.message || 'Internal server error' }, 500);
  }
}
