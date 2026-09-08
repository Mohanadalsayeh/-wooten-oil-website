const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const text = (v) => String(v ?? "").trim();

function numberValue(v) {
  const s = text(v).replace(/[$,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function accountNumber(v) {
  let s = text(v).replace(/\D/g, "");
  return s ? s.padStart(7, "0") : "";
}

export async function onRequestPost({ request, env }) {
  const supplied = request.headers.get("X-Admin-Key") || "";
  if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
    return json({ success: false, error: "Unauthorized." }, 401);
  }

  if (!env.DB) {
    return json({ success: false, error: "Customer database is not configured." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid request data." }, 400);
  }

  const customers = Array.isArray(body?.customers) ? body.customers : [];
  if (!customers.length) {
    return json({ success: false, error: "No customer records were supplied." }, 400);
  }
  if (customers.length > 5000) {
    return json({ success: false, error: "Too many records in one upload." }, 413);
  }

  const statement = env.DB.prepare(`
    INSERT INTO customers
      (account_number, account_name, address1, address2, city, state, zip_code, phone, email, current_balance, aging_category_1, aging_category_2, aging_category_3, aging_category_4, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(account_number) DO UPDATE SET
      account_name = excluded.account_name,
      address1 = excluded.address1,
      address2 = excluded.address2,
      city = excluded.city,
      state = excluded.state,
      zip_code = excluded.zip_code,
      phone = excluded.phone,
      email = CASE
        WHEN excluded.email IS NOT NULL AND excluded.email <> '' THEN excluded.email
        ELSE customers.email
      END,
      current_balance = excluded.current_balance,
      aging_category_1 = excluded.aging_category_1,
      aging_category_2 = excluded.aging_category_2,
      aging_category_3 = excluded.aging_category_3,
      aging_category_4 = excluded.aging_category_4,
      updated_at = CURRENT_TIMESTAMP
  `);

  const batch = [];
  let skipped = 0;

  for (const row of customers) {
    const acct = accountNumber(row?.account_number);
    const name = text(row?.account_name);
    if (!acct || !name) {
      skipped++;
      continue;
    }
    batch.push(
      statement.bind(
        acct,
        name.slice(0, 200),
        text(row?.address1).slice(0, 250),
        text(row?.address2).slice(0, 250),
        text(row?.city).slice(0, 120),
        text(row?.state).slice(0, 30),
        text(row?.zip_code).slice(0, 20),
        text(row?.phone).replace(/[^\d]/g, "").slice(0, 30),
        text(row?.email).slice(0, 254),
        numberValue(row?.current_balance),
        numberValue(row?.aging_category_1),
        numberValue(row?.aging_category_2),
        numberValue(row?.aging_category_3),
        numberValue(row?.aging_category_4)
      )
    );
  }

  if (!batch.length) {
    return json({ success: false, error: "No valid customer records were found." }, 400);
  }

  try {
    // D1 batch runs the prepared statements as a single batch operation.
    await env.DB.batch(batch);
  } catch (error) {
    console.error("Customer import failed", error);
    return json({ success: false, error: "Database import failed." }, 500);
  }

  return json({
    success: true,
    processed: batch.length,
    skipped
  });
}

export function onRequestGet() {
  return json({ success: false, error: "Method not allowed." }, 405);
}
