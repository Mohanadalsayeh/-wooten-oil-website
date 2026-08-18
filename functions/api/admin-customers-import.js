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
  if (v === null || v === undefined || v === "") return 0;

  const cleaned = String(v)
    .replace(/[$,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

function accountNumber(v) {
  let s = textValue(v).replace(/\D/g, "");
  return s ? s.padStart(7, "0") : "";
}

function getValue(row, ...names) {
  for (const name of names) {
    if (
      Object.prototype.hasOwnProperty.call(row, name) &&
      row[name] !== null &&
      row[name] !== undefined
    ) {
      return row[name];
    }
  }

  return "";
}

export async function onRequestPost({ request, env }) {
  const supplied = request.headers.get("X-Admin-Key") || "";

  if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
    return json(
      {
        success: false,
        error: "Unauthorized."
      },
      401
    );
  }

  if (!env.DB) {
    return json(
      {
        success: false,
        error: "Customer database is not configured."
      },
      503
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: "Invalid request data."
      },
      400
    );
  }

  const customers = Array.isArray(body?.customers)
    ? body.customers
    : [];

  if (!customers.length) {
    return json(
      {
        success: false,
        error: "No customer records were supplied."
      },
      400
    );
  }

  if (customers.length > 5000) {
    return json(
      {
        success: false,
        error: "Too many records in one upload."
      },
      413
    );
  }

  const statement = env.DB.prepare(`
    INSERT INTO customers (
      account_number,
      account_name,
      address1,
      address2,
      city,
      state,
      zip_code,
      phone,
      email,
      ar_division_no,
      credit_hold,
      current_balance,
      aging_category_1,
      aging_category_2,
      aging_category_3,
      aging_category_4,
      salesperson_name,
      credit_limit,
      terms_description,
      phone_ext,
      fax,
      address3,
      updated_at
    )

    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, CURRENT_TIMESTAMP
    )

    ON CONFLICT(account_number)
    DO UPDATE SET

      account_name = excluded.account_name,
      address1 = excluded.address1,
      address2 = excluded.address2,
      address3 = excluded.address3,
      city = excluded.city,
      state = excluded.state,
      zip_code = excluded.zip_code,
      phone = excluded.phone,
      phone_ext = excluded.phone_ext,
      fax = excluded.fax,

      ar_division_no = excluded.ar_division_no,
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

      updated_at = CURRENT_TIMESTAMP
  `);

  const batch = [];
  let skipped = 0;

  for (const row of customers) {
    const acct = accountNumber(
      getValue(row, "CustomerNo", "account_number")
    );

    const name = textValue(
      getValue(row, "CustomerName", "account_name")
    );

    if (!acct || !name) {
      skipped++;
      continue;
    }

    batch.push(
      statement.bind(
        acct,
        name.slice(0, 200),

        textValue(
          getValue(row, "AddressLine1", "address1")
        ).slice(0, 250),

        textValue(
          getValue(row, "AddressLine2", "address2")
        ).slice(0, 250),

        textValue(
          getValue(row, "City", "city")
        ).slice(0, 120),

        textValue(
          getValue(row, "State", "state")
        ).slice(0, 30),

        textValue(
          getValue(row, "ZipCode", "zip_code")
        ).slice(0, 20),

        textValue(
          getValue(row, "TelephoneNo", "phone")
        ).replace(/[^\d]/g, "").slice(0, 30),

        textValue(
          getValue(row, "EmailAddress", "email")
        ).slice(0, 254),

        textValue(
          getValue(row, "ARDivisionNo", "ar_division_no")
        ).slice(0, 30),

        textValue(
          getValue(row, "CreditHold", "credit_hold")
        ).slice(0, 30),

        numberValue(
          getValue(row, "CurrentBalance", "current_balance")
        ),

        numberValue(
          getValue(row, "AgingCategory1", "aging_category_1")
        ),

        numberValue(
          getValue(row, "AgingCategory2", "aging_category_2")
        ),

        numberValue(
          getValue(row, "AgingCategory3", "aging_category_3")
        ),

        numberValue(
          getValue(row, "AgingCategory4", "aging_category_4")
        ),

        textValue(
          getValue(row, "SalespersonName", "salesperson_name")
        ).slice(0, 200),

        numberValue(
          getValue(row, "CreditLimit", "credit_limit")
        ),

        textValue(
          getValue(row, "TermsCodeDesc", "terms_description")
        ).slice(0, 200),

        textValue(
          getValue(row, "TelephoneExt", "phone_ext")
        ).slice(0, 30),

        textValue(
          getValue(row, "FaxNo", "fax")
        ).replace(/[^\d]/g, "").slice(0, 30),

        textValue(
          getValue(row, "AddressLine3", "address3")
        ).slice(0, 250)
      )
    );
  }

  if (!batch.length) {
    return json(
      {
        success: false,
        error: "No valid customer records were found."
      },
      400
    );
  }

  try {
    await env.DB.batch(batch);
  } catch (error) {
    console.error("Customer import failed", error);

    return json(
      {
        success: false,
        error: "Database import failed.",
        details: String(error?.message || error)
      },
      500
    );
  }

  return json({
    success: true,
    processed: batch.length,
    skipped,
    totalReceived: customers.length
  });
}

export function onRequestGet() {
  return json(
    {
      success: false,
      error: "Method not allowed."
    },
    405
  );
}
