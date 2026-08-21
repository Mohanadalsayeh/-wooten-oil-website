const SESSION_COOKIE = "wooten_customer_session";
const SESSION_DAYS = 7;

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
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

function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    const value = Number.parseInt(
      hex.slice(i * 2, i * 2 + 2),
      16
    );

    if (!Number.isFinite(value)) {
      return null;
    }

    bytes[i] = value;
  }

  return bytes;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);

  const digest = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return bytesToHex(
    new Uint8Array(digest)
  );
}

/*
Expected password_hash format:

pbkdf2$210000$SALT_HEX$HASH_HEX

We'll use the same format when we create the
first-time password setup function.
*/
async function verifyPassword(password, storedHash) {
  const value = clean(storedHash);

  if (!value) {
    return false;
  }

  const parts = value.split("$");

  if (
    parts.length !== 4 ||
    parts[0] !== "pbkdf2"
  ) {
    return false;
  }

  const iterations =
    Number(parts[1]);

  const salt =
    hexToBytes(parts[2]);

  const expected =
    hexToBytes(parts[3]);

  if (
    !Number.isInteger(iterations) ||
    iterations < 100000 ||
    !salt ||
    !expected
  ) {
    return false;
  }

  try {
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
          iterations
        },
        key,
        expected.length * 8
      );

    const actual =
      new Uint8Array(derived);

    if (actual.length !== expected.length) {
      return false;
    }

    return crypto.subtle.timingSafeEqual(
      actual,
      expected
    );
  } catch (error) {
    console.error(
      "Password verification failed",
      error
    );

    return false;
  }
}

function parseCookies(request) {
  const header =
    request.headers.get("Cookie") || "";

  const cookies = {};

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) continue;

    const key =
      part.slice(0, index).trim();

    const value =
      part.slice(index + 1).trim();

    if (key) {
      cookies[key] = value;
    }
  }

  return cookies;
}

function sessionCookie(token, rememberMe = false) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ];

  if (rememberMe) {
    const maxAge = SESSION_DAYS * 24 * 60 * 60;
    parts.splice(2, 0, `Max-Age=${maxAge}`);
  }

  return parts.join("; ");
}

function clearSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }

  return Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  ) - date.getTime();
}

function nextCentralMidnight(now = new Date()) {
  const timeZone = "America/Chicago";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }

  const naive = new Date(Date.UTC(
    values.year,
    values.month - 1,
    values.day + 1,
    0, 0, 0
  ));

  let candidate = new Date(naive.getTime() - timeZoneOffsetMs(naive, timeZone));
  candidate = new Date(naive.getTime() - timeZoneOffsetMs(candidate, timeZone));
  return candidate;
}

function publicCustomer(customer) {
  return {
    account_number:
      customer.account_number,

    account_name:
      customer.account_name,

    current_balance:
      Number(
        customer.current_balance || 0
      ),

    aging_category_1:
      Number(
        customer.aging_category_1 || 0
      ),

    aging_category_2:
      Number(
        customer.aging_category_2 || 0
      ),

    aging_category_3:
      Number(
        customer.aging_category_3 || 0
      ),

    aging_category_4:
      Number(
        customer.aging_category_4 || 0
      ),

    credit_hold:
      customer.credit_hold || "",

    credit_limit:
      Number(
        customer.credit_limit || 0
      ),

    terms_description:
      customer.terms_description || "",

    salesperson_name:
      customer.salesperson_name || "",

    phone:
      customer.phone || "",

    phone_ext:
      customer.phone_ext || "",

    email:
      customer.email || "",

    address1:
      customer.address1 || "",

    address2:
      customer.address2 || "",

    address3:
      customer.address3 || "",

    city:
      customer.city || "",

    state:
      customer.state || "",

    zip_code:
      customer.zip_code || "",

    must_change_password:
      Number(
        customer.must_change_password || 0
      ) === 1
  };
}

async function createSession(
  env,
  customerId,
  rememberMe = false
) {
  const token =
    randomToken();

  const tokenHash =
    await sha256(token);

  const now =
    new Date();

  const expires = rememberMe
    ? new Date(
        now.getTime() +
        SESSION_DAYS *
        24 *
        60 *
        60 *
        1000
      )
    : nextCentralMidnight(now);

  await env.DB.prepare(`
    INSERT INTO customer_sessions (
      customer_id,
      session_token_hash,
      expires_at,
      last_seen_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?)
  `)
  .bind(
    customerId,
    tokenHash,
    expires.toISOString(),
    now.toISOString(),
    now.toISOString()
  )
  .run();

  return token;
}

async function getCustomerFromSession(
  request,
  env
) {
  const cookies =
    parseCookies(request);

  const token =
    cookies[SESSION_COOKIE];

  if (!token) {
    return null;
  }

  const tokenHash =
    await sha256(token);

  const now =
    new Date().toISOString();

  const row =
    await env.DB.prepare(`
      SELECT
        s.id AS session_id,
        s.expires_at,

        c.id,
        c.account_number,
        c.account_name,
        c.address1,
        c.address2,
        c.address3,
        c.city,
        c.state,
        c.zip_code,
        c.phone,
        c.phone_ext,
        c.email,
        c.must_change_password,
        c.account_status,
        c.credit_hold,
        c.current_balance,
        c.aging_category_1,
        c.aging_category_2,
        c.aging_category_3,
        c.aging_category_4,
        c.salesperson_name,
        c.credit_limit,
        c.terms_description

      FROM customer_sessions s

      INNER JOIN customers c
        ON c.id = s.customer_id

      WHERE
        s.session_token_hash = ?
        AND s.expires_at > ?

      LIMIT 1
    `)
    .bind(
      tokenHash,
      now
    )
    .first();

  if (!row) {
    return null;
  }

  if (
    clean(row.account_status)
      .toLowerCase() !== "active"
  ) {
    return null;
  }

  env.DB.prepare(`
    UPDATE customer_sessions
    SET last_seen_at = ?
    WHERE id = ?
  `)
  .bind(
    now,
    row.session_id
  )
  .run()
  .catch(error =>
    console.error(
      "Could not update session",
      error
    )
  );

  return row;
}


/* ======================================================
   POST /api/customer/login
====================================================== */

export async function customerLoginPost({
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
      error: "Invalid login request."
    }, 400);
  }

  const user =
    clean(
      body?.user ||
      body?.account_number ||
      body?.email
    );

  const password =
    String(body?.password ?? "");

  const rememberMe =
    body?.remember_me === true ||
    body?.remember_me === 1 ||
    body?.remember_me === "1" ||
    body?.remember_me === "true";

  if (!user || !password) {
    return json({
      success: false,
      error:
        "Enter your Customer Number and password."
    }, 400);
  }

  let customer = null;

  const normalizedAccount =
    normalizeAccount(user);

  if (normalizedAccount) {
    customer =
      await env.DB.prepare(`
        SELECT *
        FROM customers
        WHERE account_number = ?
        LIMIT 1
      `)
      .bind(normalizedAccount)
      .first();
  }

  if (!customer && user.includes("@")) {
    customer =
      await env.DB.prepare(`
        SELECT *
        FROM customers
        WHERE lower(email) = lower(?)
        LIMIT 1
      `)
      .bind(user)
      .first();
  }

  if (!customer) {
    return json({
      success: false,
      error:
        "Customer Number or password is incorrect."
    }, 401);
  }

  const status =
    clean(customer.account_status)
      .toLowerCase();

  if (status && status !== "active") {
    return json({
      success: false,
      error:
        "This customer account is not active. Please contact Wooten Oil."
    }, 403);
  }

  /*
  New MAS 90 customers currently have no password.
  We return a special response so the website can
  send them into first-time account setup later.
  */
  if (!clean(customer.password_hash)) {
    return json({
      success: false,
      setup_required: true,
      account_number:
        customer.account_number,
      error:
        "This account has not been activated for online access yet."
    }, 403);
  }

  const valid =
    await verifyPassword(
      password,
      customer.password_hash
    );

  if (!valid) {
    return json({
      success: false,
      error:
        "Customer Number or password is incorrect."
    }, 401);
  }

  const token =
    await createSession(
      env,
      customer.id,
      rememberMe
    );

  return json(
    {
      success: true,
      customer:
        publicCustomer(customer)
    },
    200,
    {
      "Set-Cookie":
        sessionCookie(token, rememberMe)
    }
  );
}


/* ======================================================
   GET /api/customer/me
====================================================== */

export async function customerMeGet({
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

  const customer =
    await getCustomerFromSession(
      request,
      env
    );

  if (!customer) {
    return json({
      success: false,
      authenticated: false
    }, 401);
  }

  return json({
    success: true,
    authenticated: true,
    customer:
      publicCustomer(customer)
  });
}


/* ======================================================
   POST /api/customer/logout
====================================================== */

export async function customerLogoutPost({
  request,
  env
}) {
  const cookies =
    parseCookies(request);

  const token =
    cookies[SESSION_COOKIE];

  if (
    token &&
    env.DB
  ) {
    try {
      const tokenHash =
        await sha256(token);

      await env.DB.prepare(`
        DELETE FROM customer_sessions
        WHERE session_token_hash = ?
      `)
      .bind(tokenHash)
      .run();
    } catch (error) {
      console.error(
        "Logout session cleanup failed",
        error
      );
    }
  }

  return json(
    {
      success: true
    },
    200,
    {
      "Set-Cookie":
        clearSessionCookie()
    }
  );
}
