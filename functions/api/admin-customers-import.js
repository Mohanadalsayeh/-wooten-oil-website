const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const textValue = (v) => String(v ?? "").trim();

const numberValue = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function customerNumber(v) {
  const s = textValue(v);

  // Keep MAS 90 customer numbers exactly as supplied,
  // including leading zeros such as 0001002.
  return s.slice(0, 20);
}

export async function onRequestPost({ request, env }) {
  const supplied = request.headers.get("X-Admin-Key") || "";

  if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
    return json({
      success: false,
      error: "Unauthorized."
    }, 401);
  }

  if (!env.DB) {
    return json({
      success: false,
      error: "Customer database is not configured."
    }, 503);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: "Invalid request data."
    }, 400);
  }

  const customers = Array.isArray(body?.customers)
    ? body.customers
    : [];

  if (!customers.length) {
    return json({
      success: false,
      error: "No customer records were supplied."
    }, 400);
  }

  if (customers.length > 5000) {
    return json({
      success: false,
      error: "Too many records in one upload."
    }, 413);
  }

  const statement = env.DB.prepare(`
    INSERT INTO customers
      (
        ar_division_no,
        account_number,
        account_name,
        credit_hold,
        current_balance,
        aging_category_1,
        aging_category_2,
        aging_category_3,
        aging_category_4,
        salesperson_name,
        credit_limit,
        terms_description,
        email,
        phone,
        phone_ext,
        fax,
        address1,
        address2,
        address3,
        city,
        state,
        zip_code,
        updated_at
      )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(account_number)
    DO UPDATE SET
      ar_division_no = excluded.ar_division_no,
      account_name = excluded.account_name,
      credit_hold = excluded.credit_hold,
      current_balance = excluded.current_balance,
      aging_category_1 = excluded.aging_category_1,
      aging_category_2 = excluded.aging_category_2,
      aging_category_3 = excluded.aging_category_3,
      aging_category_4 = excluded.aging_category_4,
      salesperson_name = excluded.salesperson_name,
      credit_limit = excluded.credit_limit,
      terms_description = excluded.terms_description,

      email = CASE
        WHEN excluded.email IS NOT NULL
             AND excluded.email <> ''
        THEN excluded.email
        ELSE customers.email
      END,

      phone = excluded.phone,
      phone_ext = excluded.phone_ext,
      fax = excluded.fax,
      address1 = excluded.address1,
      address2 = excluded.address2,
      address3 = excluded.address3,
      city = excluded.city,
      state = excluded.state,
      zip_code = excluded.zip_code,
      updated_at = CURRENT_TIMESTAMP
  `);

  const batch = [];
  let skipped = 0;

  for (const row of customers) {
    const acct = customerNumber(
      row?.CustomerNo ??
      row?.customer_no ??
      row?.account_number
    );

    const name = textValue(
      row?.CustomerName ??
      row?.customer_name ??
      row?.account_name
    );

    if (!acct || !name) {
      skipped++;
      continue;
    }

    batch.push(
      statement.bind(
        textValue(row?.ARDivisionNo).slice(0, 20),
        acct,
        name.slice(0, 200),

        textValue(row?.CreditHold)
          .toUpperCase()
          .slice(0, 10),

        numberValue(row?.CurrentBalance),
        numberValue(row?.AgingCategory1),
        numberValue(row?.AgingCategory2),
        numberValue(row?.AgingCategory3),
        numberValue(row?.AgingCategory4),

        textValue(row?.SalespersonName).slice(0, 200),
        numberValue(row?.CreditLimit),
        textValue(row?.TermsCodeDesc).slice(0, 150),

        textValue(row?.EmailAddress).slice(0, 254),

        textValue(row?.TelephoneNo).slice(0, 50),
        textValue(row?.TelephoneExt).slice(0, 20),
        textValue(row?.FaxNo).slice(0, 50),

        textValue(row?.AddressLine1).slice(0, 250),
        textValue(row?.AddressLine2).slice(0, 250),
        textValue(row?.AddressLine3).slice(0, 250),

        textValue(row?.City).slice(0, 120),
        textValue(row?.State).slice(0, 30),
        textValue(row?.ZipCode).slice(0, 20)
      )
    );
  }

  if (!batch.length) {
    return json({
      success: false,
      error: "No valid customer records were found."
    }, 400);
  }

  try {
    await env.DB.batch(batch);
  } catch (error) {
    console.error("Customer import failed", error);

    return json({
      success: false,
      error: "Database import failed.",
      details: String(error?.message || error)
    }, 500);
  }

  return json({
    success: true,
    processed: batch.length,
    skipped
  });
}

export function onRequestGet() {
  return json({
    success: false,
    error: "Method not allowed."
  }, 405);
}
