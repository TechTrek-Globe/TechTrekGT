const JWT_SECRET = "personal-budget-secret-key-change-in-production";
async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 1e5,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    true,
    ["sign", "verify"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  const hashHex = Array.from(new Uint8Array(exported)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}
async function verifyPassword(password, storedHash) {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [saltHex, originalHashHex] = parts;
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 1e5,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    true,
    ["sign", "verify"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  const hashHex = Array.from(new Uint8Array(exported)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex === originalHashHex;
}
function base64UrlEncode(str) {
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
}
async function createToken(payload, secret = JWT_SECRET) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1e3) + 30 * 24 * 60 * 60
    // 30 days expiration
  }));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(dataToSign));
  const signatureHex = Array.from(new Uint8Array(signature)).map((b) => String.fromCharCode(b)).join("");
  const encodedSignature = base64UrlEncode(signatureHex);
  return `${dataToSign}.${encodedSignature}`;
}
async function verifyToken(token, secret = JWT_SECRET) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const enc = new TextEncoder();
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signatureBytes = Uint8Array.from(base64UrlDecode(encodedSignature), (c) => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify("HMAC", cryptoKey, signatureBytes, enc.encode(dataToSign));
    if (!isValid) return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1e3)) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
}
async function onRequestPost$2(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { email, password, name } = body;
    if (!email || !password || !name) {
      return new Response(JSON.stringify({ error: "Name, email, and password are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Database binding DB not available" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(cleanEmail).first();
    if (existing) {
      return new Response(JSON.stringify({ error: "User with this email already exists" }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    }
    const userId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const householdId = `hh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const passwordHash = await hashPassword(password);
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)"
    ).bind(userId, cleanEmail, passwordHash, name.trim()).run();
    await env.DB.prepare(
      "INSERT INTO households (id, name) VALUES (?, ?)"
    ).bind(householdId, `${name.trim()}'s Household`).run();
    const memberId = `hm-${Date.now()}`;
    await env.DB.prepare(
      "INSERT INTO household_members (id, household_id, user_id, role) VALUES (?, ?, ?, ?)"
    ).bind(memberId, householdId, userId, "owner").run();
    const person1Id = `person-${Date.now()}-1`;
    await env.DB.prepare(
      "INSERT INTO people (id, household_id, name, role, pay_frequency, pay_day1, pay_day2, gross_per_pay, net_per_pay, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(person1Id, householdId, name.trim(), "Primary", "bi-weekly", "15", "last", 0, 0, "purple").run();
    const token = await createToken({ userId, email: cleanEmail, householdId, name: name.trim() });
    return new Response(JSON.stringify({
      success: true,
      user: { id: userId, email: cleanEmail, name: name.trim() },
      token,
      householdId
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Registration failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost$1(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Database binding DB not available" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(cleanEmail).first();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid email or password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid email or password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const member = await env.DB.prepare(
      "SELECT household_id FROM household_members WHERE user_id = ?"
    ).bind(user.id).first();
    const householdId = member ? member.household_id : null;
    const token = await createToken({ userId: user.id, email: user.email, householdId, name: user.name });
    return new Response(JSON.stringify({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
      token,
      householdId
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Login failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestGet$1(context) {
  const { request } = context;
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const token = authHeader.split(" ")[1];
    const payload = await verifyToken(token);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      success: true,
      user: { id: payload.userId, email: payload.email, name: payload.name },
      householdId: payload.householdId
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Auth check failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const token = authHeader.split(" ")[1];
    const payload = await verifyToken(token);
    if (!payload || !payload.householdId) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const householdId = payload.householdId;
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Database binding DB not available" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const accRows = await env.DB.prepare("SELECT * FROM accounts WHERE household_id = ?").bind(householdId).all();
    const accounts = (accRows.results || []).map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      startingBalance: a.starting_balance,
      extraStartingBalance: a.extra_starting_balance || 0,
      saveExtraMonthly: a.save_extra_monthly || 0,
      enableExtraSavings: Boolean(a.enable_extra_savings),
      color: a.color,
      notes: a.notes || ""
    }));
    const peopleRows = await env.DB.prepare("SELECT * FROM people WHERE household_id = ?").bind(householdId).all();
    const people = (peopleRows.results || []).map((p) => ({
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
    const billRows = await env.DB.prepare("SELECT * FROM bills WHERE household_id = ?").bind(householdId).all();
    const splitRows = await env.DB.prepare(
      "SELECT bs.bill_id, bs.person_id, bs.percentage FROM bill_splits bs JOIN bills b ON bs.bill_id = b.id WHERE b.household_id = ?"
    ).bind(householdId).all();
    const splitsByBill = {};
    (splitRows.results || []).forEach((s) => {
      if (!splitsByBill[s.bill_id]) splitsByBill[s.bill_id] = {};
      splitsByBill[s.bill_id][s.person_id] = s.percentage;
    });
    const bills = (billRows.results || []).map((b) => ({
      id: b.id,
      accountId: b.account_id,
      name: b.name,
      amount: b.amount,
      period: b.period,
      dueDay: b.due_day,
      paymentSource: b.payment_source,
      notes: b.notes || "",
      splits: splitsByBill[b.id] || {}
    }));
    const lineItemRows = await env.DB.prepare(
      "SELECT li.bill_id, li.month_key, li.actual_amount, li.updated_at FROM line_items li JOIN bills b ON li.bill_id = b.id WHERE b.household_id = ?"
    ).bind(householdId).all();
    const lineItems = (lineItemRows.results || []).map((li) => ({
      billId: li.bill_id,
      monthKey: li.month_key,
      actualAmount: li.actual_amount,
      updatedAt: li.updated_at
    }));
    const loanRow = await env.DB.prepare("SELECT * FROM loans WHERE household_id = ?").bind(householdId).first();
    const loan = loanRow ? {
      description: loanRow.description || "",
      principal: loanRow.principal || 0,
      annualInterestRate: loanRow.annual_interest_rate || 0,
      termMonths: loanRow.term_months || 0,
      monthlyPayment: loanRow.monthly_payment || 0,
      extraPayment: loanRow.extra_payment || 0,
      startDate: loanRow.start_date || ""
    } : {
      description: "",
      principal: 0,
      annualInterestRate: 0,
      termMonths: 0,
      monthlyPayment: 0,
      extraPayment: 0,
      startDate: ""
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
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Failed to fetch budget" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const token = authHeader.split(" ")[1];
    const payload = await verifyToken(token);
    if (!payload || !payload.householdId) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const householdId = payload.householdId;
    const body = await request.json();
    const { budget } = body;
    if (!budget) {
      return new Response(JSON.stringify({ error: "Budget payload is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Database binding DB not available" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (Array.isArray(budget.accounts)) {
      await env.DB.prepare("DELETE FROM accounts WHERE household_id = ?").bind(householdId).run();
      for (const acc of budget.accounts) {
        await env.DB.prepare(
          "INSERT INTO accounts (id, household_id, name, type, starting_balance, extra_starting_balance, save_extra_monthly, enable_extra_savings, color, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          acc.id,
          householdId,
          acc.name,
          acc.type || "checking",
          acc.startingBalance || 0,
          acc.extraStartingBalance || 0,
          acc.saveExtraMonthly || 0,
          acc.enableExtraSavings ? 1 : 0,
          acc.color || "blue",
          acc.notes || ""
        ).run();
      }
    }
    if (Array.isArray(budget.people)) {
      await env.DB.prepare("DELETE FROM people WHERE household_id = ?").bind(householdId).run();
      for (const p of budget.people) {
        await env.DB.prepare(
          "INSERT INTO people (id, household_id, name, role, pay_frequency, pay_day1, pay_day2, gross_per_pay, net_per_pay, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          p.id,
          householdId,
          p.name,
          p.role || "Member",
          p.payFrequency || "bi-weekly",
          String(p.payDay1 || "15"),
          String(p.payDay2 || "last"),
          p.grossPerPay || 0,
          p.netPerPay || 0,
          p.color || "purple"
        ).run();
      }
    }
    if (Array.isArray(budget.bills)) {
      await env.DB.prepare("DELETE FROM bills WHERE household_id = ?").bind(householdId).run();
      for (const b of budget.bills) {
        await env.DB.prepare(
          "INSERT INTO bills (id, household_id, account_id, name, amount, period, due_day, payment_source, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          b.id,
          householdId,
          b.accountId,
          b.name,
          b.amount || 0,
          b.period || "Monthly",
          b.dueDay || 1,
          b.paymentSource || "Auto Pay",
          b.notes || ""
        ).run();
        if (b.splits && typeof b.splits === "object") {
          for (const [personId, percentage] of Object.entries(b.splits)) {
            await env.DB.prepare(
              "INSERT INTO bill_splits (bill_id, person_id, percentage) VALUES (?, ?, ?)"
            ).bind(b.id, personId, percentage || 0).run();
          }
        }
      }
    }
    if (Array.isArray(budget.lineItems)) {
      await env.DB.prepare(
        "DELETE FROM line_items WHERE bill_id IN (SELECT id FROM bills WHERE household_id = ?)"
      ).bind(householdId).run();
      for (const li of budget.lineItems) {
        await env.DB.prepare(
          "INSERT INTO line_items (bill_id, month_key, actual_amount, updated_at) VALUES (?, ?, ?, ?)"
        ).bind(li.billId, li.monthKey, li.actualAmount ?? null, li.updatedAt || Date.now()).run();
      }
    }
    if (budget.loan) {
      await env.DB.prepare("DELETE FROM loans WHERE household_id = ?").bind(householdId).run();
      const loanId = `loan-${Date.now()}`;
      await env.DB.prepare(
        "INSERT INTO loans (id, household_id, description, principal, annual_interest_rate, term_months, monthly_payment, extra_payment, start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        loanId,
        householdId,
        budget.loan.description || "Home Loan",
        budget.loan.principal || 0,
        budget.loan.annualInterestRate || 0,
        budget.loan.termMonths || 0,
        budget.loan.monthlyPayment || 0,
        budget.loan.extraPayment || 0,
        budget.loan.startDate || "2024-01-01"
      ).run();
    }
    return new Response(JSON.stringify({ success: true, syncedAt: Date.now() }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Failed to sync budget" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
const worker = {
  /**
   * @param {Request} request
   * @param {Record<string, any>} env
   * @param {any} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx };
    if (url.protocol === "http:" || request.headers.get("x-forwarded-proto") === "http") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    try {
      if (url.pathname === "/api/auth/register" && request.method === "POST") {
        return await onRequestPost$2(context);
      }
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return await onRequestPost$1(context);
      }
      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        return await onRequestGet$1(context);
      }
      if (url.pathname === "/api/budget") {
        if (request.method === "GET") return await onRequestGet(context);
        if (request.method === "POST") return await onRequestPost(context);
      }
      if (url.pathname.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "Endpoint not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
      return await env.ASSETS.fetch(request);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err || "Server error");
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
const workerEntry = worker ?? {};
export {
  workerEntry as default
};
