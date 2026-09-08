const CODE_MINUTES = 15;
const PASSWORD_ITERATIONS = 100000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

function clean(v) {
  return String(v ?? "").trim();
}

function normalizeAccount(v) {
  let s = clean(v);

  if (/^\d+(\.0+)?$/.test(s)) {
    s = String(parseInt(s, 10));
  }

  s = s.replace(/\D/g, "");

  return s ? s.padStart(7, "0") : "";
}

function bytesToHex(bytes) {
  return [...bytes]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);

  return String(values[0] % 1000000)
    .padStart(6, "0");
}

async function sha256(value) {
  const bytes =
    new TextEncoder().encode(value);

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return bytesToHex(
    new Uint8Array(digest)
  );
}

async function codeHash(customerId, code) {
  return sha256(
    `${customerId}:${clean(code)}`
  );
}

function maskEmail(email) {
  const value = clean(email);

  const parts = value.split("@");

  if (parts.length !== 2) {
    return "";
  }

  const name = parts[0];
  const domain = parts[1];

  if (name.length <= 2) {
    return `${name[0] || "*"}***@${domain}`;
  }

  return (
    name.slice(0, 2) +
    "***@" +
    domain
  );
}

async function createPasswordHash(password) {
  const salt =
    new Uint8Array(16);

  crypto.getRandomValues(salt);

  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

  const derived =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations:
          PASSWORD_ITERATIONS
      },
      key,
      256
    );

  return [
    "pbkdf2",
    PASSWORD_ITERATIONS,
    bytesToHex(salt),
    bytesToHex(
      new Uint8Array(derived)
    )
  ].join("$");
}

async function getCustomerByAccount(
  env,
  account
) {
  return env.DB.prepare(`
    SELECT
      id,
      account_number,
      account_name,
      email,
      phone,
      password_hash,
      must_change_password,
      account_status

    FROM customers

    WHERE account_number = ?

    LIMIT 1
  `)
  .bind(account)
  .first();
}

async function findValidCode(
  env,
  customerId,
  code
) {
  const hash =
    await codeHash(
      customerId,
      code
    );

  const now =
    new Date().toISOString();

  return env.DB.prepare(`
    SELECT
      id,
      customer_id,
      purpose,
      expires_at

    FROM customer_activation_codes

    WHERE
      customer_id = ?
      AND code_hash = ?
      AND used_at IS NULL
      AND expires_at > ?

    ORDER BY id DESC

    LIMIT 1
  `)
  .bind(
    customerId,
    hash,
    now
  )
  .first();
}

async function storeCode(
  env,
  customerId,
  code,
  purpose
) {
  const hash =
    await codeHash(
      customerId,
      code
    );

  const expires =
    new Date(
      Date.now() +
      CODE_MINUTES *
      60 *
      1000
    ).toISOString();

  /*
  Expire older unused activation
  codes for this customer.
  */

  await env.DB.prepare(`
    UPDATE customer_activation_codes

    SET used_at = CURRENT_TIMESTAMP

    WHERE
      customer_id = ?
      AND used_at IS NULL
  `)
  .bind(customerId)
  .run();

  await env.DB.prepare(`
    INSERT INTO customer_activation_codes (
      customer_id,
      code_hash,
      purpose,
      expires_at,
      created_at
    )

    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `)
  .bind(
    customerId,
    hash,
    purpose,
    expires
  )
  .run();

  return expires;
}

async function sendActivationEmail(
  env,
  customer,
  code
) {
  if (!env.RESEND_API_KEY) {
    throw new Error(
      "Email service is not configured."
    );
  }

  const fromAddress =
    clean(env.FUEL_FROM_EMAIL) ||
    "fuel@wootenoil.com";

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${env.RESEND_API_KEY}`,

          "Content-Type":
            "application/json",

          "User-Agent":
            "WootenOilCustomerPortal/1.0"
        },

        body: JSON.stringify({
          from:
            `Wooten Oil <${fromAddress}>`,

          to: [
            customer.email
          ],

          subject:
            "Wooten Oil Online Account Verification",

          html: `
            <div style="
              font-family:Arial,sans-serif;
              max-width:560px;
              margin:auto;
              color:#172033;
              line-height:1.6;
            ">

              <h2 style="
                color:#0b2239;
                margin-bottom:12px;
              ">
                Wooten Oil
              </h2>

              <p>
                Hello ${escapeHtml(customer.account_name)},
              </p>

              <p>
                Your verification code for your
                Wooten Oil online account is:
              </p>

              <div style="
                font-size:32px;
                font-weight:800;
                letter-spacing:8px;
                padding:18px;
                background:#f4f7fa;
                border-radius:10px;
                text-align:center;
                margin:24px 0;
              ">
                ${code}
              </div>

              <p>
                This code expires in
                ${CODE_MINUTES} minutes.
              </p>

              <p style="
                color:#64748b;
                font-size:13px;
              ">
                If you did not request this code,
                you may ignore this email.
              </p>

            </div>
          `
        })
      }
    );

  const data =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    console.error(
      "Resend activation email error",
      data
    );

    throw new Error(
      "Verification email could not be sent."
    );
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* ======================================================
   CUSTOMER START ACTIVATION
   POST /api/customer/activation/start
====================================================== */

export async function customerActivationStart({
  request,
  env
}) {
  if (!env.DB) {
    return json({
      success: false,
      error:
        "Customer database is not configured."
    }, 503);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error:
        "Invalid activation request."
    }, 400);
  }

  const account =
    normalizeAccount(
      body?.account_number ||
      body?.accountNumber
    );

  if (!account) {
    return json({
      success: false,
      error:
        "Enter your Customer Number."
    }, 400);
  }

  const customer =
    await getCustomerByAccount(
      env,
      account
    );

  if (!customer) {
    return json({
      success: false,
      error:
        "We could not locate that Customer Number."
    }, 404);
  }

  const status =
    clean(customer.account_status)
      .toLowerCase();

  if (
    status &&
    status !== "active"
  ) {
    return json({
      success: false,
      error:
        "This account is not active. Please contact Wooten Oil."
    }, 403);
  }

  if (clean(customer.password_hash)) {
    return json({
      success: false,
      already_activated: true,
      error:
        "This online account has already been activated. Please use Customer Login."
    }, 409);
  }

  /*
  CUSTOMER HAS EMAIL
  */

  if (clean(customer.email)) {

    /*
    Prevent repeated emails within
    approximately one minute.
    */

    const recent =
      await env.DB.prepare(`
        SELECT id

        FROM customer_activation_codes

        WHERE
          customer_id = ?
          AND purpose = 'email_activation'
          AND used_at IS NULL
          AND created_at >
              datetime('now', '-60 seconds')

        LIMIT 1
      `)
      .bind(customer.id)
      .first();

   if (recent) {
  return json({
    success: true,
    method: "email",
    account_number:
      customer.account_number,
    account_name:
      customer.account_name,
    email:
      maskEmail(customer.email),
    message:
      "A verification code was already sent to the email address on your account. Please check your inbox."
  });
}
    const code =
      randomCode();

    await storeCode(
      env,
      customer.id,
      code,
      "email_activation"
    );

    try {
      await sendActivationEmail(
        env,
        customer,
        code
      );
    } catch (error) {
      console.error(error);

      return json({
        success: false,
        error:
          "We could not send the verification email. Please contact Wooten Oil."
      }, 503);
    }

    return json({
      success: true,
      method: "email",
      account_number:
        customer.account_number,
      account_name:
        customer.account_name,
      email:
        maskEmail(customer.email),
      message:
        "A verification code was sent to the email address on your account."
    });
  }


  /*
  CUSTOMER DOES NOT HAVE EMAIL
  */

  return json({
    success: true,
    method: "office",
    account_number:
      customer.account_number,
    account_name:
      customer.account_name,
    message:
      "There is no email address on this account. Please contact Wooten Oil to receive a one-time activation code."
  });
}


/* ======================================================
   VERIFY ACTIVATION CODE
   POST /api/customer/activation/verify
====================================================== */

export async function customerActivationVerify({
  request,
  env
}) {
  if (!env.DB) {
    return json({
      success: false,
      error:
        "Customer database is not configured."
    }, 503);
  }

  let body;

  try {
    body =
      await request.json();
  } catch {
    return json({
      success: false,
      error:
        "Invalid verification request."
    }, 400);
  }

  const account =
    normalizeAccount(
      body?.account_number
    );

  const code =
    clean(body?.code);

  if (!account || !code) {
    return json({
      success: false,
      error:
        "Enter your Customer Number and verification code."
    }, 400);
  }

  const customer =
    await getCustomerByAccount(
      env,
      account
    );

  if (!customer) {
    return json({
      success: false,
      error:
        "Invalid verification code."
    }, 400);
  }

  const activation =
    await findValidCode(
      env,
      customer.id,
      code
    );

  if (!activation) {
    return json({
      success: false,
      error:
        "The verification code is incorrect or has expired."
    }, 400);
  }

  return json({
    success: true,
    verified: true,
    account_number:
      customer.account_number,
    account_name:
      customer.account_name
  });
}


/* ======================================================
   SET FIRST PASSWORD
   POST /api/customer/activation/set-password
====================================================== */

/* ======================================================
   SET FIRST PASSWORD
   POST /api/customer/activation/set-password
====================================================== */

export async function customerActivationSetPassword({
  request,
  env
}) {
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
      error: "Invalid password request."
    }, 400);
  }

  const account =
    normalizeAccount(body?.account_number);

  const code =
    clean(body?.code);

  const password =
    String(body?.password ?? "");

  const confirmPassword =
    String(
      body?.confirm_password ??
      body?.confirmPassword ??
      ""
    );

  if (!account || !code || !password) {
    return json({
      success: false,
      error:
        "Customer Number, verification code and password are required."
    }, 400);
  }

  if (
    confirmPassword &&
    password !== confirmPassword
  ) {
    return json({
      success: false,
      error: "The passwords do not match."
    }, 400);
  }

  if (password.length < 10) {
    return json({
      success: false,
      error:
        "Your password must be at least 10 characters."
    }, 400);
  }

  if (password.length > 128) {
    return json({
      success: false,
      error: "Your password is too long."
    }, 400);
  }

  const customer =
    await getCustomerByAccount(
      env,
      account
    );

  if (!customer) {
    return json({
      success: false,
      error: "Unable to activate this account."
    }, 400);
  }

  if (clean(customer.password_hash)) {
    return json({
      success: false,
      already_activated: true,
      error:
        "This online account has already been activated."
    }, 409);
  }

  const activation =
    await findValidCode(
      env,
      customer.id,
      code
    );

  if (!activation) {
    return json({
      success: false,
      error:
        "The verification code is incorrect or has expired."
    }, 400);
  }

  let passwordHash;

  try {
    passwordHash =
      await createPasswordHash(password);
  } catch (error) {
    console.error(
      "Password hashing failed",
      error
    );

    return json({
      success: false,
      error:
        "We could not securely create your password. Please try again."
    }, 500);
  }

  try {
    await env.DB.prepare(`
      UPDATE customers

      SET
        password_hash = ?,
        must_change_password = 0,
        account_status = 'active',
        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
    `)
    .bind(
      passwordHash,
      customer.id
    )
    .run();

    await env.DB.prepare(`
      UPDATE customer_activation_codes

      SET used_at = CURRENT_TIMESTAMP

      WHERE id = ?
    `)
    .bind(
      activation.id
    )
    .run();

  } catch (error) {
    console.error(
      "Customer activation failed",
      error
    );

    return json({
      success: false,
      error:
        "We could not activate the online account."
    }, 500);
  }

  return json({
    success: true,
    activated: true,
    account_number:
      customer.account_number,
    account_name:
      customer.account_name,
    message:
      "Your Wooten Oil online account has been activated. You can now sign in."
  });
}

/* ======================================================
   ADMIN GENERATE PHONE ACTIVATION CODE

   POST /api/admin/customer-activation-code
====================================================== */

export async function adminGenerateActivationCode({
  request,
  env
}) {
  if (!env.DB) {
    return json({
      success: false,
      error:
        "Customer database is not configured."
    }, 503);
  }

  const supplied =
    request.headers.get(
      "X-Admin-Key"
    ) || "";

  if (
    !env.ADMIN_IMPORT_KEY ||
    supplied !== env.ADMIN_IMPORT_KEY
  ) {
    return json({
      success: false,
      error: "Unauthorized."
    }, 401);
  }

  let body;

  try {
    body =
      await request.json();
  } catch {
    return json({
      success: false,
      error:
        "Invalid request."
    }, 400);
  }

  const account =
    normalizeAccount(
      body?.account_number
    );

  if (!account) {
    return json({
      success: false,
      error:
        "Customer Number is required."
    }, 400);
  }

  const customer =
    await getCustomerByAccount(
      env,
      account
    );

  if (!customer) {
    return json({
      success: false,
      error:
        "Customer was not found."
    }, 404);
  }

  if (clean(customer.password_hash)) {
    return json({
      success: false,
      already_activated: true,
      error:
        "This customer already has an online account."
    }, 409);
  }

  const code =
    randomCode();

  const expires =
    await storeCode(
      env,
      customer.id,
      code,
      "manual_activation"
    );

  /*
  This endpoint is admin-only.
  The actual code is intentionally
  returned so Wooten Oil staff can
  give it to the verified customer
  over the phone.
  */

  return json({
    success: true,
    account_number:
      customer.account_number,
    account_name:
      customer.account_name,
    activation_code:
      code,
    expires_at:
      expires
  });
}
