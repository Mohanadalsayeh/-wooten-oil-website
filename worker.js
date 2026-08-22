var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// functions/api/fuel-request.js
var json = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
}), "json");
var esc = /* @__PURE__ */ __name((value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"), "esc");
function validRequestNumber(value) {
  return /^WO-\d{6}-\d{4}$/.test(String(value || ""));
}
__name(validRequestNumber, "validRequestNumber");
async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid request data." }, 400);
  }
  const requestNumber = String(body.requestNumber || "").trim();
  const customerName = String(body.customerName || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  const deliveryAddress = String(body.deliveryAddress || "").trim();
  const fuelType = String(body.fuelType || "").trim();
  const gallons = String(body.gallons || "").trim();
  const deliveryDate = String(body.deliveryDate || "").trim();
  const notes = String(body.notes || "").trim();
  const submittedFrom = String(body.submittedFrom || "").trim();
  if (!validRequestNumber(requestNumber)) {
    return json({ success: false, error: "Invalid request number." }, 400);
  }
  if (!customerName || !phone || !deliveryAddress || !fuelType || !gallons) {
    return json({ success: false, error: "Please complete all required fields." }, 400);
  }
  if (!/^\d+(?:\.\d+)?$/.test(gallons) || Number(gallons) <= 0 || Number(gallons) > 1e6) {
    return json({ success: false, error: "Estimated gallons is not valid." }, 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ success: false, error: "Customer email is not valid." }, 400);
  }
  if (!env.RESEND_API_KEY) {
    return json({ success: false, error: "Email service is not configured yet." }, 503);
  }
  const receivedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (env.DB) {
    try {
      await env.DB.prepare(`
        INSERT INTO fuel_requests
        (request_number, customer_name, phone, email, delivery_address, fuel_type,
         gallons, delivery_date, notes, submitted_from, received_at, email_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        requestNumber,
        customerName,
        phone,
        email,
        deliveryAddress,
        fuelType,
        gallons,
        deliveryDate,
        notes,
        submittedFrom,
        receivedAt,
        "pending"
      ).run();
    } catch (error) {
      console.error("D1 insert failed", error);
      return json({
        success: false,
        error: "This request could not be saved. Please try again."
      }, 500);
    }
  }
  const fromAddress = env.FUEL_FROM_EMAIL || "Wooten Oil Website <orders@wootenoil.com>";
  const toAddress = env.FUEL_TO_EMAIL || "Support@wootenoil.com";
  const subject = `Fuel Delivery Request ${requestNumber} - ${customerName}`;
  const rows = [
    ["Request Number", requestNumber],
    ["Customer / Company Name", customerName],
    ["Phone Number", phone],
    ["Customer Email", email || "Not provided"],
    ["Delivery Address", deliveryAddress],
    ["Fuel Type", fuelType],
    ["Estimated Gallons", gallons],
    ["Preferred Delivery Date", deliveryDate || "Flexible / Not specified"],
    ["Additional Notes", notes || "None"],
    ["Received", receivedAt]
  ];
  const htmlRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;vertical-align:top;width:210px">
        ${esc(label)}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top">
        ${esc(value)}
      </td>
    </tr>`).join("");
  const html2 = `
  <!doctype html>
  <html>
    <body style="font-family:Arial,sans-serif;color:#111827;background:#f3f4f6;padding:24px">
      <div style="max-width:700px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">

        <div style="background:#b9342b;color:#fff;padding:20px 24px">
          <div style="font-size:22px;font-weight:800">
            New Fuel Delivery Request
          </div>

          <div style="margin-top:6px;font-size:16px">
            ${esc(requestNumber)}
          </div>
        </div>

        <table role="presentation"
               style="width:100%;border-collapse:collapse">
          ${htmlRows}
        </table>

        <div style="padding:16px 24px;color:#6b7280;font-size:12px">
          Submitted from ${esc(submittedFrom || "wootenoil.com")}
        </div>

      </div>
    </body>
  </html>`;
  const emailPayload = {
    from: fromAddress,
    to: [toAddress],
    subject,
    html: html2,
    text: rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
    tags: [{
      name: "request_number",
      value: requestNumber.replace(/[^A-Za-z0-9_-]/g, "_")
    }]
  };
  if (email) {
    emailPayload.reply_to = email;
  }
  let resendResponse;
  let resendData = {};
  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `fuel-request-${requestNumber}`
      },
      body: JSON.stringify(emailPayload)
    });
    try {
      resendData = await resendResponse.json();
    } catch {
    }
  } catch (error) {
    console.error("Resend request failed", error);
    if (env.DB) {
      await env.DB.prepare(
        "UPDATE fuel_requests SET email_status = ? WHERE request_number = ?"
      ).bind("network_error", requestNumber).run().catch(() => {
      });
    }
    return json({
      success: false,
      error: "The order was saved, but the email notification could not be sent. Please call Wooten Oil."
    }, 502);
  }
  if (!resendResponse.ok) {
    console.error("Resend error", resendData);
    if (env.DB) {
      await env.DB.prepare(
        "UPDATE fuel_requests SET email_status = ? WHERE request_number = ?"
      ).bind(`failed_${resendResponse.status}`, requestNumber).run().catch(() => {
      });
    }
    return json({
      success: false,
      error: "The order was saved, but the email notification could not be sent. Please call Wooten Oil."
    }, 502);
  }
  if (email) {
    try {
      const customerPayload = {
        from: env.FUEL_FROM_EMAIL,
        to: [email],
        subject: `Wooten Oil Fuel Request Confirmation - ${requestNumber}`,
        html: `
          <h2>Fuel Request Confirmation</h2>
          <p>Thank you for submitting your fuel delivery request to Wooten Oil.</p>

          <p style="font-size:20px;">
            <strong>Confirmation Number: ${esc(requestNumber)}</strong>
          </p>

          <hr>

          <p><strong>Customer:</strong> ${esc(customerName)}</p>
          <p><strong>Fuel Type:</strong> ${esc(fuelType)}</p>
          <p><strong>Estimated Gallons:</strong> ${esc(gallons)}</p>
          <p><strong>Delivery Address:</strong> ${esc(deliveryAddress)}</p>
          <p><strong>Preferred Delivery Date:</strong> ${esc(deliveryDate || "Not specified")}</p>

          <p>We have received your request and will contact you if additional information is needed.</p>

          <p>Please keep your confirmation number for your records.</p>

          <p>
            Thank you,<br>
            <strong>Wooten Oil Company</strong>
          </p>
        `,
        text: `Wooten Oil Fuel Request Confirmation

Confirmation Number: ${requestNumber}

Customer: ${customerName}
Fuel Type: ${fuelType}
Estimated Gallons: ${gallons}
Delivery Address: ${deliveryAddress}
Preferred Delivery Date: ${deliveryDate || "Not specified"}

We have received your request and will contact you if additional information is needed.

Please keep your confirmation number for your records.

Wooten Oil Company`
      };
      const customerResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `fuel-confirmation-${requestNumber}`
        },
        body: JSON.stringify(customerPayload)
      });
      if (!customerResponse.ok) {
        console.error(
          "Customer confirmation email failed",
          await customerResponse.text()
        );
      }
    } catch (error) {
      console.error("Customer confirmation email error", error);
    }
  }
  if (env.DB) {
    await env.DB.prepare(
      "UPDATE fuel_requests SET email_status = ?, resend_email_id = ? WHERE request_number = ?"
    ).bind("sent", resendData.id || "", requestNumber).run().catch(() => {
    });
  }
  return json({
    success: true,
    requestNumber,
    emailId: resendData.id || null
  });
}
__name(onRequestPost, "onRequestPost");
function onRequestGet() {
  return json({
    success: false,
    error: "Method not allowed."
  }, 405);
}
__name(onRequestGet, "onRequestGet");

// functions/api/contact-message.js
var json2 = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
}), "json");
var esc2 = /* @__PURE__ */ __name((value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"), "esc");
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}
__name(validEmail, "validEmail");
function validReference(value) {
  return /^MSG-\d{6}-\d{4}$/.test(String(value || ""));
}
__name(validReference, "validReference");
async function sendResend(env, payload, idempotencyKey) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
  }
  return { response, data };
}
__name(sendResend, "sendResend");
async function onRequestPost2(context) {
  const { request, env } = context;
  if (!env.RESEND_API_KEY) {
    return json2({
      success: false,
      error: "Email service is not configured yet."
    }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json2({
      success: false,
      error: "Invalid request data."
    }, 400);
  }
  const referenceNumber = String(body.referenceNumber || "").trim();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  const submittedFrom = String(body.submittedFrom || "").trim();
  if (!validReference(referenceNumber)) {
    return json2({
      success: false,
      error: "Invalid message reference number."
    }, 400);
  }
  if (!name || !email || !subject || !message) {
    return json2({
      success: false,
      error: "Please complete all required fields."
    }, 400);
  }
  if (!validEmail(email)) {
    return json2({
      success: false,
      error: "Please enter a valid email address."
    }, 400);
  }
  if (name.length > 150 || subject.length > 140 || message.length > 5e3 || phone.length > 60) {
    return json2({
      success: false,
      error: "One or more fields are too long."
    }, 400);
  }
  const fromAddress = "support@wootenoil.com";
  const toAddress = env.FUEL_TO_EMAIL || "support@wootenoil.com";
  const receivedAt = (/* @__PURE__ */ new Date()).toISOString();
  const internalPayload = {
    from: fromAddress,
    to: [toAddress],
    reply_to: email,
    subject: `Website Message ${referenceNumber} - ${subject}`,
    html: `
      <h2>New Website Message</h2>

      <p><strong>Reference:</strong> ${esc2(referenceNumber)}</p>
      <p><strong>Name:</strong> ${esc2(name)}</p>
      <p><strong>Email:</strong> ${esc2(email)}</p>
      <p><strong>Phone:</strong> ${esc2(phone || "Not provided")}</p>
      <p><strong>Subject:</strong> ${esc2(subject)}</p>

      <p><strong>Message:</strong></p>

      <div style="
        white-space:pre-wrap;
        border-left:4px solid #b9342b;
        padding:12px;
        background:#f8f8f8;
      ">
        ${esc2(message)}
      </div>

      <p style="margin-top:20px;font-size:12px;color:#666;">
        Received ${esc2(receivedAt)}
      </p>
    `,
    text: `New Website Message

Reference: ${referenceNumber}
Name: ${name}
Email: ${email}
Phone: ${phone || "Not provided"}
Subject: ${subject}

${message}

Received: ${receivedAt}`
  };
  let internal;
  try {
    internal = await sendResend(
      env,
      internalPayload,
      `contact-internal-${referenceNumber}`
    );
  } catch (error) {
    console.error(
      "Contact internal email network error",
      error
    );
    return json2({
      success: false,
      error: "Your message could not be sent. Please try again."
    }, 502);
  }
  if (!internal.response.ok) {
    console.error(
      "Contact internal email failed",
      internal.data
    );
    return json2({
      success: false,
      error: "Your message could not be sent. Please try again."
    }, 502);
  }
  const customerPayload = {
    from: fromAddress,
    to: [email],
    subject: `Wooten Oil - We Received Your Message - ${referenceNumber}`,
    html: `
      <h2>We Received Your Message</h2>

      <p>Hello ${esc2(name)},</p>

      <p>
        Thank you for contacting Wooten Oil.
        We received your message and a member of our team
        will get back to you as soon as possible.
      </p>

      <div style="
        border:1px solid #ddd;
        border-radius:10px;
        padding:15px;
        text-align:center;
        margin:20px 0;
      ">
        <div style="font-size:12px;color:#666;">
          MESSAGE REFERENCE
        </div>

        <div style="font-size:22px;font-weight:bold;">
          ${esc2(referenceNumber)}
        </div>
      </div>

      <p>
        <strong>Subject:</strong>
        ${esc2(subject)}
      </p>

      <p>
        Please keep your reference number for your records.
      </p>

      <p>
        Thank you,<br>
        <strong>Wooten Oil Company</strong>
      </p>
    `,
    text: `Wooten Oil - We Received Your Message

Hello ${name},

Thank you for contacting Wooten Oil. We received your message and a member of our team will get back to you as soon as possible.

Message Reference: ${referenceNumber}
Subject: ${subject}

Please keep your reference number for your records.

Wooten Oil Company`
  };
  let customer;
  try {
    customer = await sendResend(
      env,
      customerPayload,
      `contact-confirmation-${referenceNumber}`
    );
  } catch (error) {
    console.error(
      "Contact confirmation network error",
      error
    );
    return json2({
      success: false,
      error: "Your message was received, but the confirmation email could not be sent."
    }, 502);
  }
  if (!customer.response.ok) {
    console.error(
      "Contact confirmation failed",
      customer.data
    );
    return json2({
      success: false,
      error: "Your message was received, but the confirmation email could not be sent."
    }, 502);
  }
  return json2({
    success: true,
    referenceNumber,
    internalEmailId: internal.data.id || null,
    confirmationEmailId: customer.data.id || null
  });
}
__name(onRequestPost2, "onRequestPost");
function onRequestGet2() {
  return json2({
    success: false,
    error: "Method not allowed."
  }, 405);
}
__name(onRequestGet2, "onRequestGet");

// functions/api/admin-customers-import.js
var json3 = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
}), "json");
var text = /* @__PURE__ */ __name((v) => String(v ?? "").trim(), "text");
function numberValue(v) {
  const s = text(v).replace(/[$,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
__name(numberValue, "numberValue");
function accountNumber(v) {
  let s = text(v).replace(/\D/g, "");
  return s ? s.padStart(7, "0") : "";
}
__name(accountNumber, "accountNumber");
async function onRequestPost3({ request, env }) {
  const supplied = request.headers.get("X-Admin-Key") || "";
  if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
    return json3({ success: false, error: "Unauthorized." }, 401);
  }
  if (!env.DB) {
    return json3({ success: false, error: "Customer database is not configured." }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json3({ success: false, error: "Invalid request data." }, 400);
  }
  const customers = Array.isArray(body?.customers) ? body.customers : [];
  if (!customers.length) {
    return json3({ success: false, error: "No customer records were supplied." }, 400);
  }
  if (customers.length > 5e3) {
    return json3({ success: false, error: "Too many records in one upload." }, 413);
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
    return json3({ success: false, error: "No valid customer records were found." }, 400);
  }
  try {
    await env.DB.batch(batch);
  } catch (error) {
    console.error("Customer import failed", error);
    return json3({ success: false, error: "Database import failed." }, 500);
  }
  return json3({
    success: true,
    processed: batch.length,
    skipped
  });
}
__name(onRequestPost3, "onRequestPost");
function onRequestGet3() {
  return json3({ success: false, error: "Method not allowed." }, 405);
}
__name(onRequestGet3, "onRequestGet");

// functions/api/customer-login.js
var SESSION_COOKIE = "wooten_customer_session";
var SESSION_DAYS = 7;
var json4 = /* @__PURE__ */ __name((data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  }
}), "json");
function clean(v) {
  return String(v ?? "").trim();
}
__name(clean, "clean");
function normalizeAccount(v) {
  let s = clean(v);
  if (/^\d+(\.0+)?$/.test(s)) {
    s = String(parseInt(s, 10));
  }
  s = s.replace(/\D/g, "");
  return s ? s.padStart(7, "0") : "";
}
__name(normalizeAccount, "normalizeAccount");
function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex, "bytesToHex");
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
__name(hexToBytes, "hexToBytes");
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
__name(randomToken, "randomToken");
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
__name(sha256, "sha256");
async function verifyPassword(password, storedHash) {
  const value = clean(storedHash);
  if (!value) {
    return false;
  }
  const parts = value.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }
  const iterations = Number(parts[1]);
  const salt = hexToBytes(parts[2]);
  const expected = hexToBytes(parts[3]);
  if (!Number.isInteger(iterations) || iterations < 1e5 || !salt || !expected) {
    return false;
  }
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const derived = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations
      },
      key,
      expected.length * 8
    );
    const actual = new Uint8Array(derived);
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
__name(verifyPassword, "verifyPassword");
function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) {
      cookies[key] = value;
    }
  }
  return cookies;
}
__name(parseCookies, "parseCookies");
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
__name(sessionCookie, "sessionCookie");
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
__name(clearSessionCookie, "clearSessionCookie");
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
__name(timeZoneOffsetMs, "timeZoneOffsetMs");
function nextCentralMidnight(now = /* @__PURE__ */ new Date()) {
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
    0,
    0,
    0
  ));
  let candidate = new Date(naive.getTime() - timeZoneOffsetMs(naive, timeZone));
  candidate = new Date(naive.getTime() - timeZoneOffsetMs(candidate, timeZone));
  return candidate;
}
__name(nextCentralMidnight, "nextCentralMidnight");
function publicCustomer(customer) {
  return {
    account_number: customer.account_number,
    account_name: customer.account_name,
    current_balance: Number(
      customer.current_balance || 0
    ),
    aging_category_1: Number(
      customer.aging_category_1 || 0
    ),
    aging_category_2: Number(
      customer.aging_category_2 || 0
    ),
    aging_category_3: Number(
      customer.aging_category_3 || 0
    ),
    aging_category_4: Number(
      customer.aging_category_4 || 0
    ),
    credit_hold: customer.credit_hold || "",
    credit_limit: Number(
      customer.credit_limit || 0
    ),
    terms_description: customer.terms_description || "",
    salesperson_name: customer.salesperson_name || "",
    phone: customer.phone || "",
    phone_ext: customer.phone_ext || "",
    email: customer.email || "",
    address1: customer.address1 || "",
    address2: customer.address2 || "",
    address3: customer.address3 || "",
    city: customer.city || "",
    state: customer.state || "",
    zip_code: customer.zip_code || "",
    must_change_password: Number(
      customer.must_change_password || 0
    ) === 1
  };
}
__name(publicCustomer, "publicCustomer");
async function createSession(env, customerId, rememberMe = false) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = /* @__PURE__ */ new Date();
  const expires = rememberMe ? new Date(
    now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1e3
  ) : nextCentralMidnight(now);
  await env.DB.prepare(`
    INSERT INTO customer_sessions (
      customer_id,
      session_token_hash,
      expires_at,
      last_seen_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    customerId,
    tokenHash,
    expires.toISOString(),
    now.toISOString(),
    now.toISOString()
  ).run();
  return token;
}
__name(createSession, "createSession");
async function getCustomerFromSession(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const tokenHash = await sha256(token);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const row = await env.DB.prepare(`
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
    `).bind(
    tokenHash,
    now
  ).first();
  if (!row) {
    return null;
  }
  if (clean(row.account_status).toLowerCase() !== "active") {
    return null;
  }
  env.DB.prepare(`
    UPDATE customer_sessions
    SET last_seen_at = ?
    WHERE id = ?
  `).bind(
    now,
    row.session_id
  ).run().catch(
    (error) => console.error(
      "Could not update session",
      error
    )
  );
  return row;
}
__name(getCustomerFromSession, "getCustomerFromSession");
async function customerLoginPost({
  request,
  env
}) {
  if (!env.DB) {
    return json4({
      success: false,
      error: "Customer database is not configured."
    }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json4({
      success: false,
      error: "Invalid login request."
    }, 400);
  }
  const user = clean(
    body?.user || body?.account_number || body?.email
  );
  const password = String(body?.password ?? "");
  const rememberMe = body?.remember_me === true || body?.remember_me === 1 || body?.remember_me === "1" || body?.remember_me === "true";
  if (!user || !password) {
    return json4({
      success: false,
      error: "Enter your Customer Number and password."
    }, 400);
  }
  let customer = null;
  const normalizedAccount = normalizeAccount(user);
  if (normalizedAccount) {
    customer = await env.DB.prepare(`
        SELECT *
        FROM customers
        WHERE account_number = ?
        LIMIT 1
      `).bind(normalizedAccount).first();
  }
  if (!customer && user.includes("@")) {
    customer = await env.DB.prepare(`
        SELECT *
        FROM customers
        WHERE lower(email) = lower(?)
        LIMIT 1
      `).bind(user).first();
  }
  if (!customer) {
    return json4({
      success: false,
      error: "Customer Number or password is incorrect."
    }, 401);
  }
  const status = clean(customer.account_status).toLowerCase();
  if (status && status !== "active") {
    return json4({
      success: false,
      error: "This customer account is not active. Please contact Wooten Oil."
    }, 403);
  }
  if (!clean(customer.password_hash)) {
    return json4({
      success: false,
      setup_required: true,
      account_number: customer.account_number,
      error: "This account has not been activated for online access yet."
    }, 403);
  }
  const valid = await verifyPassword(
    password,
    customer.password_hash
  );
  if (!valid) {
    return json4({
      success: false,
      error: "Customer Number or password is incorrect."
    }, 401);
  }
  const token = await createSession(
    env,
    customer.id,
    rememberMe
  );
  return json4(
    {
      success: true,
      customer: publicCustomer(customer)
    },
    200,
    {
      "Set-Cookie": sessionCookie(token, rememberMe)
    }
  );
}
__name(customerLoginPost, "customerLoginPost");
async function customerMeGet({
  request,
  env
}) {
  if (!env.DB) {
    return json4({
      success: false,
      error: "Customer database is not configured."
    }, 503);
  }
  const customer = await getCustomerFromSession(
    request,
    env
  );
  if (!customer) {
    return json4({
      success: false,
      authenticated: false
    }, 401);
  }
  return json4({
    success: true,
    authenticated: true,
    customer: publicCustomer(customer)
  });
}
__name(customerMeGet, "customerMeGet");
async function customerLogoutPost({
  request,
  env
}) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (token && env.DB) {
    try {
      const tokenHash = await sha256(token);
      await env.DB.prepare(`
        DELETE FROM customer_sessions
        WHERE session_token_hash = ?
      `).bind(tokenHash).run();
    } catch (error) {
      console.error(
        "Logout session cleanup failed",
        error
      );
    }
  }
  return json4(
    {
      success: true
    },
    200,
    {
      "Set-Cookie": clearSessionCookie()
    }
  );
}
__name(customerLogoutPost, "customerLogoutPost");

// functions/api/customer-activation.js
var CODE_MINUTES = 15;
var PASSWORD_ITERATIONS = 1e5;
var json5 = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
}), "json");
function clean2(v) {
  return String(v ?? "").trim();
}
__name(clean2, "clean");
function normalizeAccount2(v) {
  let s = clean2(v);
  if (/^\d+(\.0+)?$/.test(s)) {
    s = String(parseInt(s, 10));
  }
  s = s.replace(/\D/g, "");
  return s ? s.padStart(7, "0") : "";
}
__name(normalizeAccount2, "normalizeAccount");
function bytesToHex2(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex2, "bytesToHex");
function randomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1e6).padStart(6, "0");
}
__name(randomCode, "randomCode");
async function sha2562(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes
  );
  return bytesToHex2(
    new Uint8Array(digest)
  );
}
__name(sha2562, "sha256");
async function codeHash(customerId, code) {
  return sha2562(
    `${customerId}:${clean2(code)}`
  );
}
__name(codeHash, "codeHash");
function maskEmail(email) {
  const value = clean2(email);
  const parts = value.split("@");
  if (parts.length !== 2) {
    return "";
  }
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) {
    return `${name[0] || "*"}***@${domain}`;
  }
  return name.slice(0, 2) + "***@" + domain;
}
__name(maskEmail, "maskEmail");
async function createPasswordHash(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PASSWORD_ITERATIONS
    },
    key,
    256
  );
  return [
    "pbkdf2",
    PASSWORD_ITERATIONS,
    bytesToHex2(salt),
    bytesToHex2(
      new Uint8Array(derived)
    )
  ].join("$");
}
__name(createPasswordHash, "createPasswordHash");
async function getCustomerByAccount(env, account) {
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
  `).bind(account).first();
}
__name(getCustomerByAccount, "getCustomerByAccount");
async function findValidCode(env, customerId, code) {
  const hash = await codeHash(
    customerId,
    code
  );
  const now = (/* @__PURE__ */ new Date()).toISOString();
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
  `).bind(
    customerId,
    hash,
    now
  ).first();
}
__name(findValidCode, "findValidCode");
async function storeCode(env, customerId, code, purpose) {
  const hash = await codeHash(
    customerId,
    code
  );
  const expires = new Date(
    Date.now() + CODE_MINUTES * 60 * 1e3
  ).toISOString();
  await env.DB.prepare(`
    UPDATE customer_activation_codes

    SET used_at = CURRENT_TIMESTAMP

    WHERE
      customer_id = ?
      AND used_at IS NULL
  `).bind(customerId).run();
  await env.DB.prepare(`
    INSERT INTO customer_activation_codes (
      customer_id,
      code_hash,
      purpose,
      expires_at,
      created_at
    )

    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    customerId,
    hash,
    purpose,
    expires
  ).run();
  return expires;
}
__name(storeCode, "storeCode");
async function sendActivationEmail(env, customer, code) {
  if (!env.RESEND_API_KEY) {
    throw new Error(
      "Email service is not configured."
    );
  }
  const fromAddress = clean2(env.FUEL_FROM_EMAIL) || "fuel@wootenoil.com";
  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "WootenOilCustomerPortal/1.0"
      },
      body: JSON.stringify({
        from: `Wooten Oil <${fromAddress}>`,
        to: [
          customer.email
        ],
        subject: "Wooten Oil Online Account Verification",
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
  const data = await response.json().catch(() => ({}));
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
__name(sendActivationEmail, "sendActivationEmail");
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
__name(escapeHtml, "escapeHtml");
async function customerActivationStart({
  request,
  env
}) {
  if (!env.DB) {
    return json5({
      success: false,
      error: "Customer database is not configured."
    }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json5({
      success: false,
      error: "Invalid activation request."
    }, 400);
  }
  const account = normalizeAccount2(
    body?.account_number || body?.accountNumber
  );
  if (!account) {
    return json5({
      success: false,
      error: "Enter your Customer Number."
    }, 400);
  }
  const customer = await getCustomerByAccount(
    env,
    account
  );
  if (!customer) {
    return json5({
      success: false,
      error: "We could not locate that Customer Number."
    }, 404);
  }
  const status = clean2(customer.account_status).toLowerCase();
  if (status && status !== "active") {
    return json5({
      success: false,
      error: "This account is not active. Please contact Wooten Oil."
    }, 403);
  }
  if (clean2(customer.password_hash)) {
    return json5({
      success: false,
      already_activated: true,
      error: "This online account has already been activated. Please use Customer Login."
    }, 409);
  }
  if (clean2(customer.email)) {
    const recent = await env.DB.prepare(`
        SELECT id

        FROM customer_activation_codes

        WHERE
          customer_id = ?
          AND purpose = 'email_activation'
          AND used_at IS NULL
          AND created_at >
              datetime('now', '-60 seconds')

        LIMIT 1
      `).bind(customer.id).first();
    if (recent) {
      return json5({
        success: true,
        method: "email",
        account_number: customer.account_number,
        account_name: customer.account_name,
        email: maskEmail(customer.email),
        message: "A verification code was already sent to the email address on your account. Please check your inbox."
      });
    }
    const code = randomCode();
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
      return json5({
        success: false,
        error: "We could not send the verification email. Please contact Wooten Oil."
      }, 503);
    }
    return json5({
      success: true,
      method: "email",
      account_number: customer.account_number,
      account_name: customer.account_name,
      email: maskEmail(customer.email),
      message: "A verification code was sent to the email address on your account."
    });
  }
  return json5({
    success: true,
    method: "office",
    account_number: customer.account_number,
    account_name: customer.account_name,
    message: "There is no email address on this account. Please contact Wooten Oil to receive a one-time activation code."
  });
}
__name(customerActivationStart, "customerActivationStart");
async function customerActivationVerify({
  request,
  env
}) {
  if (!env.DB) {
    return json5({
      success: false,
      error: "Customer database is not configured."
    }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json5({
      success: false,
      error: "Invalid verification request."
    }, 400);
  }
  const account = normalizeAccount2(
    body?.account_number
  );
  const code = clean2(body?.code);
  if (!account || !code) {
    return json5({
      success: false,
      error: "Enter your Customer Number and verification code."
    }, 400);
  }
  const customer = await getCustomerByAccount(
    env,
    account
  );
  if (!customer) {
    return json5({
      success: false,
      error: "Invalid verification code."
    }, 400);
  }
  const activation = await findValidCode(
    env,
    customer.id,
    code
  );
  if (!activation) {
    return json5({
      success: false,
      error: "The verification code is incorrect or has expired."
    }, 400);
  }
  return json5({
    success: true,
    verified: true,
    account_number: customer.account_number,
    account_name: customer.account_name
  });
}
__name(customerActivationVerify, "customerActivationVerify");
async function customerActivationSetPassword({
  request,
  env
}) {
  if (!env.DB) {
    return json5({
      success: false,
      error: "Customer database is not configured."
    }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json5({
      success: false,
      error: "Invalid password request."
    }, 400);
  }
  const account = normalizeAccount2(body?.account_number);
  const code = clean2(body?.code);
  const password = String(body?.password ?? "");
  const confirmPassword = String(
    body?.confirm_password ?? body?.confirmPassword ?? ""
  );
  if (!account || !code || !password) {
    return json5({
      success: false,
      error: "Customer Number, verification code and password are required."
    }, 400);
  }
  if (confirmPassword && password !== confirmPassword) {
    return json5({
      success: false,
      error: "The passwords do not match."
    }, 400);
  }
  if (password.length < 10) {
    return json5({
      success: false,
      error: "Your password must be at least 10 characters."
    }, 400);
  }
  if (password.length > 128) {
    return json5({
      success: false,
      error: "Your password is too long."
    }, 400);
  }
  const customer = await getCustomerByAccount(
    env,
    account
  );
  if (!customer) {
    return json5({
      success: false,
      error: "Unable to activate this account."
    }, 400);
  }
  if (clean2(customer.password_hash)) {
    return json5({
      success: false,
      already_activated: true,
      error: "This online account has already been activated."
    }, 409);
  }
  const activation = await findValidCode(
    env,
    customer.id,
    code
  );
  if (!activation) {
    return json5({
      success: false,
      error: "The verification code is incorrect or has expired."
    }, 400);
  }
  let passwordHash;
  try {
    passwordHash = await createPasswordHash(password);
  } catch (error) {
    console.error(
      "Password hashing failed",
      error
    );
    return json5({
      success: false,
      error: "We could not securely create your password. Please try again."
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
    `).bind(
      passwordHash,
      customer.id
    ).run();
    await env.DB.prepare(`
      UPDATE customer_activation_codes

      SET used_at = CURRENT_TIMESTAMP

      WHERE id = ?
    `).bind(
      activation.id
    ).run();
  } catch (error) {
    console.error(
      "Customer activation failed",
      error
    );
    return json5({
      success: false,
      error: "We could not activate the online account."
    }, 500);
  }
  return json5({
    success: true,
    activated: true,
    account_number: customer.account_number,
    account_name: customer.account_name,
    message: "Your Wooten Oil online account has been activated. You can now sign in."
  });
}
__name(customerActivationSetPassword, "customerActivationSetPassword");
async function adminGenerateActivationCode({
  request,
  env
}) {
  if (!env.DB) {
    return json5({
      success: false,
      error: "Customer database is not configured."
    }, 503);
  }
  const supplied = request.headers.get(
    "X-Admin-Key"
  ) || "";
  if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
    return json5({
      success: false,
      error: "Unauthorized."
    }, 401);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json5({
      success: false,
      error: "Invalid request."
    }, 400);
  }
  const account = normalizeAccount2(
    body?.account_number
  );
  if (!account) {
    return json5({
      success: false,
      error: "Customer Number is required."
    }, 400);
  }
  const customer = await getCustomerByAccount(
    env,
    account
  );
  if (!customer) {
    return json5({
      success: false,
      error: "Customer was not found."
    }, 404);
  }
  if (clean2(customer.password_hash)) {
    return json5({
      success: false,
      already_activated: true,
      error: "This customer already has an online account."
    }, 409);
  }
  const code = randomCode();
  const expires = await storeCode(
    env,
    customer.id,
    code,
    "manual_activation"
  );
  return json5({
    success: true,
    account_number: customer.account_number,
    account_name: customer.account_name,
    activation_code: code,
    expires_at: expires
  });
}
__name(adminGenerateActivationCode, "adminGenerateActivationCode");

// functions/api/password-reset.js
var CODE_MINUTES2 = 15;
var PASSWORD_ITERATIONS2 = 1e5;
var json6 = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
}), "json");
function clean3(v) {
  return String(v ?? "").trim();
}
__name(clean3, "clean");
function normalizeAccount3(v) {
  let s = clean3(v);
  if (/^\d+(\.0+)?$/.test(s)) s = String(parseInt(s, 10));
  s = s.replace(/\D/g, "");
  return s ? s.padStart(7, "0") : "";
}
__name(normalizeAccount3, "normalizeAccount");
function bytesToHex3(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex3, "bytesToHex");
async function sha2563(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex3(new Uint8Array(digest));
}
__name(sha2563, "sha256");
function randomCode2() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1e6).padStart(6, "0");
}
__name(randomCode2, "randomCode");
async function codeHash2(customerId, code) {
  return sha2563(`${customerId}:${clean3(code)}`);
}
__name(codeHash2, "codeHash");
function maskEmail2(email) {
  const value = clean3(email);
  const parts = value.split("@");
  if (parts.length !== 2) return "";
  const name = parts[0], domain = parts[1];
  return `${name.slice(0, Math.min(2, name.length)) || "*"}***@${domain}`;
}
__name(maskEmail2, "maskEmail");
function maskPhone(phone) {
  const digits = clean3(phone).replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `(***) ***-${digits.slice(-4)}`;
}
__name(maskPhone, "maskPhone");
function escapeHtml2(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
__name(escapeHtml2, "escapeHtml");
async function createPasswordHash2(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS2 }, key, 256);
  return ["pbkdf2", PASSWORD_ITERATIONS2, bytesToHex3(salt), bytesToHex3(new Uint8Array(derived))].join("$");
}
__name(createPasswordHash2, "createPasswordHash");
async function findCustomer(env, identifier) {
  const raw = clean3(identifier);
  if (!raw) return null;
  if (raw.includes("@")) {
    return env.DB.prepare(`SELECT id,account_number,account_name,email,phone,password_hash,account_status FROM customers WHERE lower(email)=lower(?) LIMIT 1`).bind(raw).first();
  }
  const account = normalizeAccount3(raw);
  if (!account) return null;
  return env.DB.prepare(`SELECT id,account_number,account_name,email,phone,password_hash,account_status FROM customers WHERE account_number=? LIMIT 1`).bind(account).first();
}
__name(findCustomer, "findCustomer");
async function storeResetCode(env, customerId, code) {
  const hash = await codeHash2(customerId, code);
  const expires = new Date(Date.now() + CODE_MINUTES2 * 60 * 1e3).toISOString();
  await env.DB.prepare(`UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE customer_id=? AND used_at IS NULL`).bind(customerId).run();
  await env.DB.prepare(`INSERT INTO password_reset_tokens (customer_id,token_hash,expires_at,created_at) VALUES (?,?,?,CURRENT_TIMESTAMP)`).bind(customerId, hash, expires).run();
  return expires;
}
__name(storeResetCode, "storeResetCode");
async function sendResetEmail(env, customer, code) {
  if (!env.RESEND_API_KEY) throw new Error("Email service is not configured.");
  const fromAddress = clean3(env.FUEL_FROM_EMAIL) || "support@wootenoil.com";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "WootenOilCustomerPortal/1.0" },
    body: JSON.stringify({
      from: `Wooten Oil <${fromAddress}>`,
      to: [customer.email],
      subject: "Wooten Oil Password Reset Code",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033;line-height:1.6"><h2 style="color:#0b2239">Wooten Oil</h2><p>Hello ${escapeHtml2(customer.account_name)},</p><p>Use this verification code to reset the password for customer account <strong>${escapeHtml2(customer.account_number)}</strong>:</p><div style="font-size:32px;font-weight:800;letter-spacing:7px;background:#f3f6f9;border-radius:12px;padding:18px;text-align:center">${code}</div><p>This code expires in ${CODE_MINUTES2} minutes. If you did not request a password reset, you can ignore this email.</p></div>`
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Resend password reset error", data);
    throw new Error("Password reset email could not be sent.");
  }
}
__name(sendResetEmail, "sendResetEmail");
async function sendResetSms(env, customer, code) {
  const sid = clean3(env.TWILIO_ACCOUNT_SID), token = clean3(env.TWILIO_AUTH_TOKEN), from = clean3(env.TWILIO_FROM_NUMBER);
  if (!sid || !token || !from) throw new Error("SMS service is not configured.");
  let to = clean3(customer.phone).replace(/\D/g, "");
  if (to.length === 10) to = `+1${to}`;
  else if (!to.startsWith("+")) to = `+${to}`;
  const body = new URLSearchParams({ To: to, From: from, Body: `Wooten Oil password reset code: ${code}. It expires in ${CODE_MINUTES2} minutes.` });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": `Basic ${btoa(`${sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!response.ok) {
    console.error("Twilio reset SMS error", await response.text().catch(() => ""));
    throw new Error("Password reset text could not be sent.");
  }
}
__name(sendResetSms, "sendResetSms");
async function customerPasswordResetStart({ request, env }) {
  if (!env.DB) return json6({ success: false, error: "Customer database is not configured." }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json6({ success: false, error: "Invalid password reset request." }, 400);
  }
  const identifier = clean3(body?.identifier || body?.user || body?.account_number || body?.email);
  if (!identifier) return json6({ success: false, error: "Enter the email address or Customer Number on the account." }, 400);
  const customer = await findCustomer(env, identifier);
  if (!customer) return json6({ success: false, error: "We could not locate an account with that email or Customer Number." }, 404);
  if (clean3(customer.account_status).toLowerCase() && clean3(customer.account_status).toLowerCase() !== "active") return json6({ success: false, error: "This account is not active. Please contact Wooten Oil." }, 403);
  if (!clean3(customer.password_hash)) return json6({ success: false, setup_required: true, account_number: customer.account_number, error: "This online account has not been activated yet. Please use First time here? Activate Online Account." }, 409);
  const recent = await env.DB.prepare(`SELECT id FROM password_reset_tokens WHERE customer_id=? AND used_at IS NULL AND created_at > datetime('now','-60 seconds') LIMIT 1`).bind(customer.id).first();
  if (recent) return json6({ success: false, wait: true, error: "A reset code was already requested recently. Please wait about one minute before trying again." }, 429);
  const code = randomCode2();
  if (clean3(customer.email)) {
    await storeResetCode(env, customer.id, code);
    try {
      await sendResetEmail(env, customer, code);
    } catch (e) {
      console.error(e);
      return json6({ success: false, error: "We could not send the password reset email. Please contact Wooten Oil." }, 503);
    }
    return json6({ success: true, method: "email", account_number: customer.account_number, destination: maskEmail2(customer.email), message: "A 6-digit password reset code was sent to the email address on your account." });
  }
  if (clean3(customer.phone)) {
    if (clean3(env.TWILIO_ACCOUNT_SID) && clean3(env.TWILIO_AUTH_TOKEN) && clean3(env.TWILIO_FROM_NUMBER)) {
      await storeResetCode(env, customer.id, code);
      try {
        await sendResetSms(env, customer, code);
      } catch (e) {
        console.error(e);
        return json6({ success: false, error: "We could not send the password reset text. Please contact Wooten Oil." }, 503);
      }
      return json6({ success: true, method: "sms", account_number: customer.account_number, destination: maskPhone(customer.phone), message: "A 6-digit password reset code was sent by text message to the phone number on your account." });
    }
    return json6({ success: true, method: "office", account_number: customer.account_number, phone: maskPhone(customer.phone), message: "A phone number is on this account, but text-message password recovery is not enabled yet. Please contact Wooten Oil for password assistance." });
  }
  return json6({ success: true, method: "office", account_number: customer.account_number, message: "There is no email address or mobile number available for automatic recovery. Please contact Wooten Oil for password assistance." });
}
__name(customerPasswordResetStart, "customerPasswordResetStart");
async function customerPasswordResetComplete({ request, env }) {
  try {
    if (!env.DB) return json6({ success: false, error: "Customer database is not configured." }, 503);
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json6({ success: false, error: "Invalid password reset request body." }, 400);
    }
    const identifier = clean3(body?.identifier || body?.account_number || body?.email);
    const code = clean3(body?.code);
    const password = String(body?.password ?? "");
    const confirm = String(body?.confirm_password ?? body?.confirmPassword ?? "");
    if (!identifier || !/^\d{6}$/.test(code) || !password) {
      return json6({ success: false, error: "Enter your Customer Number or email, the 6-digit code, and a new password." }, 400);
    }
    if (confirm && password !== confirm) return json6({ success: false, error: "The passwords do not match." }, 400);
    if (password.length < 10) return json6({ success: false, error: "Your password must be at least 10 characters." }, 400);
    if (password.length > 128) return json6({ success: false, error: "Your password is too long." }, 400);
    const customer = await findCustomer(env, identifier);
    if (!customer) return json6({ success: false, error: "The verification code is incorrect or has expired." }, 400);
    const hash = await codeHash2(customer.id, code);
    const token = await env.DB.prepare(`
      SELECT id
      FROM password_reset_tokens
      WHERE customer_id = ?
        AND token_hash = ?
        AND used_at IS NULL
        AND datetime(expires_at) > datetime('now')
      ORDER BY id DESC
      LIMIT 1
    `).bind(customer.id, hash).first();
    if (!token) return json6({ success: false, error: "The verification code is incorrect or has expired. Please request a new code." }, 400);
    const passwordHash = await createPasswordHash2(password);
    const update = await env.DB.prepare(`
      UPDATE customers
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(passwordHash, customer.id).run();
    const changed = Number(update?.meta?.changes ?? update?.changes ?? 0);
    if (changed < 1) {
      return json6({ success: false, error: "The customer record was found, but the new password was not saved. Please contact Wooten Oil." }, 500);
    }
    try {
      await env.DB.prepare(`UPDATE customers SET must_change_password = 0 WHERE id = ?`).bind(customer.id).run();
    } catch (e) {
      console.error("must_change_password cleanup failed", e);
    }
    try {
      await env.DB.prepare(`UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(token.id).run();
    } catch (e) {
      console.error("reset token cleanup failed", e);
    }
    try {
      await env.DB.prepare(`DELETE FROM customer_sessions WHERE customer_id = ?`).bind(customer.id).run();
    } catch (e) {
      console.error("session cleanup failed", e);
    }
    return json6({
      success: true,
      account_number: customer.account_number,
      message: "Your password has been reset. You can now sign in with your new password."
    });
  } catch (e) {
    console.error("Password reset complete unexpected error", e);
    const msg = clean3(e?.message) || String(e || "Unknown server error");
    return json6({
      success: false,
      error: `Password reset server error: ${msg}`
    }, 500);
  }
}
__name(customerPasswordResetComplete, "customerPasswordResetComplete");

// functions/api/gmail-oauth.js
var GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
function json7(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
__name(json7, "json");
function html(body, status = 200) {
  return new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wooten Oil Gmail Connection</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f7f9;color:#17314b;margin:0;padding:24px}
.card{max-width:620px;margin:70px auto;background:#fff;border:1px solid #dce4eb;border-radius:18px;padding:28px;box-shadow:0 16px 44px rgba(15,39,66,.12)}
h1{margin:0 0 12px;font-size:1.65rem}
p{line-height:1.55;color:#5f6f7e}
.ok{color:#287342;font-weight:800}.bad{color:#a52632;font-weight:800}
</style>
</head><body><div class="card">${body}</div></body></html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
__name(html, "html");
function requiredEnv(env, name) {
  const value = String(env?.[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
__name(requiredEnv, "requiredEnv");
function constantTimeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(constantTimeEqual, "constantTimeEqual");
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(bytesToBase64Url, "bytesToBase64Url");
function base64UrlToBytes(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
__name(base64UrlToBytes, "base64UrlToBytes");
async function signState(payload, secret) {
  const enc = new TextEncoder();
  const payloadPart = bytesToBase64Url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadPart));
  return `${payloadPart}.${bytesToBase64Url(new Uint8Array(sig))}`;
}
__name(signState, "signState");
async function verifyState(state, secret) {
  const [payloadPart, sigPart] = String(state || "").split(".");
  if (!payloadPart || !sigPart) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(sigPart),
    enc.encode(payloadPart)
  );
  if (!ok) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart)));
  if (!payload?.exp || Date.now() > payload.exp) return null;
  return payload;
}
__name(verifyState, "verifyState");
function callbackUrl(request) {
  return `${new URL(request.url).origin}/api/gmail/oauth/callback`;
}
__name(callbackUrl, "callbackUrl");
async function ensureTable(env) {
  if (!env?.DB) throw new Error("D1 binding DB is not available.");
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS gmail_oauth_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      google_email TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_type TEXT,
      scope TEXT,
      expires_at TEXT,
      updated_at TEXT NOT NULL
    )
  `).run();
}
__name(ensureTable, "ensureTable");
async function fetchGoogleEmail(accessToken) {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) return "";
  const d = await r.json();
  return String(d?.emailAddress || "");
}
__name(fetchGoogleEmail, "fetchGoogleEmail");
async function gmailOAuthStart({ request, env }) {
  try {
    const url = new URL(request.url);
    const suppliedKey = url.searchParams.get("key") || "";
    const setupKey = requiredEnv(env, "GMAIL_SETUP_KEY");
    if (!constantTimeEqual(suppliedKey, setupKey)) {
      return json7({ success: false, error: "Unauthorized Gmail setup request." }, 401);
    }
    const clientId = requiredEnv(env, "GOOGLE_GMAIL_CLIENT_ID");
    const stateSecret = requiredEnv(env, "GMAIL_OAUTH_STATE_SECRET");
    const state = await signState(
      { purpose: "wooten-gmail-oauth", exp: Date.now() + 10 * 60 * 1e3 },
      stateSecret
    );
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("redirect_uri", callbackUrl(request));
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", GMAIL_SCOPE);
    auth.searchParams.set("access_type", "offline");
    auth.searchParams.set("prompt", "consent");
    auth.searchParams.set("include_granted_scopes", "true");
    auth.searchParams.set("state", state);
    return Response.redirect(auth.toString(), 302);
  } catch (error) {
    return json7({ success: false, error: String(error?.message || error) }, 500);
  }
}
__name(gmailOAuthStart, "gmailOAuthStart");
async function gmailOAuthCallback({ request, env }) {
  try {
    const url = new URL(request.url);
    const googleError = url.searchParams.get("error");
    if (googleError) {
      return html(`<h1>Gmail connection canceled</h1><p class="bad">${googleError}</p>`, 400);
    }
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    if (!code || !state) {
      return html("<h1>Gmail connection failed</h1><p class='bad'>Missing authorization code or state.</p>", 400);
    }
    const stateSecret = requiredEnv(env, "GMAIL_OAUTH_STATE_SECRET");
    const verified = await verifyState(state, stateSecret);
    if (!verified || verified.purpose !== "wooten-gmail-oauth") {
      return html("<h1>Gmail connection failed</h1><p class='bad'>Invalid or expired setup session.</p>", 400);
    }
    const clientId = requiredEnv(env, "GOOGLE_GMAIL_CLIENT_ID");
    const clientSecret = requiredEnv(env, "GOOGLE_GMAIL_CLIENT_SECRET");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl(request),
        grant_type: "authorization_code"
      })
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token?.access_token) {
      return html(`<h1>Gmail connection failed</h1><p class="bad">${String(token?.error_description || token?.error || "Token exchange failed.")}</p>`, 400);
    }
    await ensureTable(env);
    const existing = await env.DB.prepare(
      "SELECT refresh_token FROM gmail_oauth_tokens WHERE id = 1"
    ).first();
    const refreshToken = token.refresh_token || existing?.refresh_token || "";
    if (!refreshToken) {
      return html("<h1>Gmail connection incomplete</h1><p class='bad'>Google did not return a refresh token. Start the connection again and approve access.</p>", 400);
    }
    const expiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1e3).toISOString();
    const googleEmail = await fetchGoogleEmail(token.access_token);
    await env.DB.prepare(`
      INSERT INTO gmail_oauth_tokens
        (id, google_email, access_token, refresh_token, token_type, scope, expires_at, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        google_email = excluded.google_email,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_type = excluded.token_type,
        scope = excluded.scope,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `).bind(
      googleEmail,
      token.access_token,
      refreshToken,
      token.token_type || "Bearer",
      token.scope || GMAIL_SCOPE,
      expiresAt,
      (/* @__PURE__ */ new Date()).toISOString()
    ).run();
    return html(`
      <h1>Wooten Oil Gmail Connected</h1>
      <p class="ok">Authorization completed successfully.</p>
      <p>${googleEmail ? `Connected mailbox: <strong>${googleEmail}</strong>` : "The Gmail mailbox is connected."}</p>
      <p>You can close this page and return to the Wooten Oil setup.</p>
    `);
  } catch (error) {
    return html(`<h1>Gmail connection failed</h1><p class="bad">${String(error?.message || error)}</p>`, 500);
  }
}
__name(gmailOAuthCallback, "gmailOAuthCallback");
async function gmailOAuthStatus({ request, env }) {
  try {
    const url = new URL(request.url);
    const suppliedKey = url.searchParams.get("key") || "";
    const setupKey = requiredEnv(env, "GMAIL_SETUP_KEY");
    if (!constantTimeEqual(suppliedKey, setupKey)) {
      return json7({ success: false, error: "Unauthorized." }, 401);
    }
    await ensureTable(env);
    const row = await env.DB.prepare(`
      SELECT google_email, scope, expires_at, updated_at,
             CASE WHEN refresh_token IS NOT NULL AND refresh_token <> '' THEN 1 ELSE 0 END AS has_refresh_token
      FROM gmail_oauth_tokens
      WHERE id = 1
    `).first();
    return json7({
      success: true,
      connected: !!row?.has_refresh_token,
      email: row?.google_email || "",
      scope: row?.scope || "",
      access_token_expires_at: row?.expires_at || null,
      updated_at: row?.updated_at || null
    });
  } catch (error) {
    return json7({ success: false, error: String(error?.message || error) }, 500);
  }
}
__name(gmailOAuthStatus, "gmailOAuthStatus");
async function getGmailAccessToken(env) {
  await ensureTable(env);

  const row = await env.DB.prepare(`
    SELECT access_token, refresh_token, expires_at
    FROM gmail_oauth_tokens
    WHERE id = 1
  `).first();

  if (!row || !row.refresh_token) {
    throw new Error("Gmail is not connected.");
  }

  const expiresAt = row.expires_at
    ? new Date(row.expires_at).getTime()
    : 0;

  // Reuse the existing access token if it is still valid
  if (
    row.access_token &&
    expiresAt > Date.now() + 60000
  ) {
    return row.access_token;
  }

  const clientId = requiredEnv(
    env,
    "GOOGLE_GMAIL_CLIENT_ID"
  );

  const clientSecret = requiredEnv(
    env,
    "GOOGLE_GMAIL_CLIENT_SECRET"
  );

  const tokenResponse = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: row.refresh_token,
        grant_type: "refresh_token"
      })
    }
  );

  const token = await tokenResponse.json();

  if (
    !tokenResponse.ok ||
    !token?.access_token
  ) {
    throw new Error(
      token?.error_description ||
      token?.error ||
      "Unable to refresh Gmail access token."
    );
  }

  const newExpiresAt = new Date(
    Date.now() +
    Number(token.expires_in || 3600) * 1000
  ).toISOString();

  await env.DB.prepare(`
    UPDATE gmail_oauth_tokens
    SET access_token = ?,
        token_type = ?,
        expires_at = ?,
        updated_at = ?
    WHERE id = 1
  `)
    .bind(
      token.access_token,
      token.token_type || "Bearer",
      newExpiresAt,
      new Date().toISOString()
    )
    .run();

  return token.access_token;
}

__name(
  getGmailAccessToken,
  "getGmailAccessToken"
);


async function gmailTestMessages({
  request,
  env
}) {
  try {
    const url = new URL(request.url);

    if (url.pathname === "/api/admin/gmail-inbox") {
      const suppliedAdminKey =
        request.headers.get("X-Admin-Key") || "";

      if (
        !env.ADMIN_IMPORT_KEY ||
        suppliedAdminKey !== env.ADMIN_IMPORT_KEY
      ) {
        return json7(
          {
            success: false,
            error: "Unauthorized."
          },
          401
        );
      }
    } else {
      const suppliedKey =
        url.searchParams.get("key") || "";

      const setupKey = requiredEnv(
        env,
        "GMAIL_SETUP_KEY"
      );

      if (
        !constantTimeEqual(
          suppliedKey,
          setupKey
        )
      ) {
        return json7(
          {
            success: false,
            error: "Unauthorized."
          },
          401
        );
      }
    }

    const accessToken =
      await getGmailAccessToken(env);

    const listResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25",
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

    const listData =
      await listResponse.json();

    if (!listResponse.ok) {
      throw new Error(
        listData?.error?.message ||
        "Unable to read Gmail messages."
      );
    }

    const messageIds =
      listData.messages || [];

    const messages = [];

    const extractEmail = (value = "") => {
      const text = String(value || "").trim();
      const bracket = text.match(/<([^<>@\s]+@[^<>@\s]+)>/);
      if (bracket) return bracket[1].trim().toLowerCase();
      const plain = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return plain ? plain[0].trim().toLowerCase() : "";
    };

    const extractLabeledValue = (snippet = "", label = "", stopLabels = []) => {
      const text = String(snippet || "");
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const stops = stopLabels
        .map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
      const pattern = stops
        ? new RegExp(`${escaped}\\s*:?\\s*(.+?)(?=\\s+(?:${stops})\\s*:?|$)`, "i")
        : new RegExp(`${escaped}\\s*:?\\s*(.+)$`, "i");
      const match = text.match(pattern);
      return match ? String(match[1] || "").trim() : "";
    };

    const findCustomer = async ({
      email = "",
      name = "",
      accountNumber = ""
    } = {}) => {
      if (!env.DB) return null;

      const normalizedAccount = String(accountNumber || "")
        .replace(/\D/g, "")
        .padStart(7, "0");

      if (normalizedAccount && normalizedAccount !== "0000000") {
        const byAccount = await env.DB.prepare(`
          SELECT account_number, account_name, email
          FROM customers
          WHERE account_number = ?
          LIMIT 1
        `).bind(normalizedAccount).first();
        if (byAccount) return byAccount;
      }

      if (email) {
        const byEmail = await env.DB.prepare(`
          SELECT account_number, account_name, email
          FROM customers
          WHERE lower(email) = lower(?)
          LIMIT 1
        `).bind(email).first();
        if (byEmail) return byEmail;
      }

      if (name) {
        const byName = await env.DB.prepare(`
          SELECT account_number, account_name, email
          FROM customers
          WHERE lower(trim(account_name)) = lower(trim(?))
          LIMIT 1
        `).bind(name).first();
        if (byName) return byName;
      }

      return null;
    };

    for (const item of messageIds) {
      const messageResponse =
        await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`
            }
          }
        );

      const message =
        await messageResponse.json();

      if (!messageResponse.ok) {
        continue;
      }

      const headers =
        message?.payload?.headers || [];

      const header = (name) => {
        const found = headers.find(
          (h) =>
            String(h.name).toLowerCase() ===
            name.toLowerCase()
        );

        return found?.value || "";
      };

      const fromValue = header("From");
      const toValue = header("To");
      const subjectValue = header("Subject");
      const snippetValue = message.snippet || "";

      const fromLower = fromValue.toLowerCase();
      const subjectLower = subjectValue.toLowerCase();

      const isFuelRequest =
        fromLower.includes("fuel@wootenoil.com") ||
        subjectLower.includes("fuel delivery request");

      const isWebsiteMessage =
        subjectLower.includes("website message") ||
        subjectLower.includes("new website message");

      if (!isFuelRequest && !isWebsiteMessage) {
        continue;
      }

      let customerEmail = "";
      let customerName = "";
      let accountNumber = "";

      if (isFuelRequest) {
        customerEmail = extractEmail(
          extractLabeledValue(
            snippetValue,
            "Customer Email",
            ["Delivery Address", "Fuel Type", "Estimated Gallons", "Preferred Delivery Date", "Additional Notes"]
          )
        );

        customerName = extractLabeledValue(
          snippetValue,
          "Customer / Company Name",
          ["Phone Number", "Customer Email", "Delivery Address"]
        );
      } else {
        customerEmail = extractEmail(
          extractLabeledValue(
            snippetValue,
            "Email",
            ["Phone", "Subject", "Message", "Received"]
          )
        );

        customerName = extractLabeledValue(
          snippetValue,
          "Name",
          ["Email", "Phone", "Subject", "Message"]
        );
      }

      const customer = await findCustomer({
        email: customerEmail,
        name: customerName,
        accountNumber
      });

      if (customer) {
        accountNumber = customer.account_number || "";
        customerName = customer.account_name || customerName || "";
        customerEmail = customer.email || customerEmail || "";
      }

      messages.push({
        id: message.id,
        threadId: message.threadId,
        type: isFuelRequest ? "Fuel Request" : "Website Message",
        customer_name: customerName || "",
        account_number: accountNumber || "",
        customer_email: customerEmail || "",
        from: fromValue,
        to: toValue,
        subject: subjectValue,
        date: header("Date"),
        snippet: snippetValue
      });
    }

    return json7({
      success: true,
      count: messages.length,
      messages
    });

  } catch (error) {
    return json7(
      {
        success: false,
        error: String(
          error?.message || error
        )
      },
      500
    );
  }
}

__name(
  gmailTestMessages,
  "gmailTestMessages"
);

// Customer portal notifications
async function ensureCustomerNotificationsTable(env) {
  if (!env?.DB) throw new Error("Customer database is not configured.");

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS portal_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_number TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      email_sent INTEGER NOT NULL DEFAULT 0,
      email_id TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_portal_notifications_account_created
    ON portal_notifications(account_number, created_at DESC)
  `).run();
}
__name(ensureCustomerNotificationsTable, "ensureCustomerNotificationsTable");

function notificationJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
__name(notificationJson, "notificationJson");

function notificationEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
__name(notificationEscapeHtml, "notificationEscapeHtml");

function normalizeNotificationAccount(value) {
  let s = String(value ?? "").trim();
  if (/^\d+(\.0+)?$/.test(s)) s = String(parseInt(s, 10));
  s = s.replace(/\D/g, "");
  return s ? s.padStart(7, "0") : "";
}
__name(normalizeNotificationAccount, "normalizeNotificationAccount");

async function adminSendCustomerNotification({ request, env }) {
  try {
    const supplied = request.headers.get("X-Admin-Key") || "";
    if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
      return notificationJson({ success: false, error: "Unauthorized." }, 401);
    }
    if (!env.DB) {
      return notificationJson({ success: false, error: "Customer database is not configured." }, 503);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return notificationJson({ success: false, error: "Invalid request data." }, 400);
    }

    const account = normalizeNotificationAccount(body?.account_number || body?.accountNumber);
    const title = String(body?.title || body?.subject || "").trim();
    const message = String(body?.message || "").trim();
    const sendEmail = body?.send_email !== false && body?.sendEmail !== false;

    if (!account || !title || !message) {
      return notificationJson({
        success: false,
        error: "Customer Number, subject and message are required."
      }, 400);
    }

    if (title.length > 160 || message.length > 5000) {
      return notificationJson({ success: false, error: "Subject or message is too long." }, 400);
    }

    const customer = await env.DB.prepare(`
      SELECT account_number, account_name, email
      FROM customers
      WHERE account_number = ?
      LIMIT 1
    `).bind(account).first();

    if (!customer) {
      return notificationJson({ success: false, error: "Customer was not found." }, 404);
    }

    await ensureCustomerNotificationsTable(env);

    // IMPORTANT: save the portal notification FIRST.
    // Email is secondary, so a successful email can never hide a failed portal insert.
    const inserted = await env.DB.prepare(`
      INSERT INTO portal_notifications
        (account_number, title, message, email_sent, email_id, created_at)
      VALUES (?, ?, ?, 0, '', CURRENT_TIMESTAMP)
    `).bind(
      customer.account_number,
      title,
      message
    ).run();

    const notificationId =
      inserted?.meta?.last_row_id ||
      inserted?.meta?.last_insert_rowid ||
      null;

    let emailSent = false;
    let emailId = "";
    let warning = "";

    if (sendEmail) {
      if (!customer.email) {
        warning = "Portal notification was saved, but this customer does not have an email address on file.";
      } else if (!env.RESEND_API_KEY) {
        warning = "Portal notification was saved, but email service is not configured.";
      } else {
        try {
          const fromAddress = String(env.FUEL_FROM_EMAIL || "support@wootenoil.com").trim();

          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
              "User-Agent": "WootenOilCustomerPortal/1.0"
            },
            body: JSON.stringify({
              from: `Wooten Oil <${fromAddress}>`,
              to: [customer.email],
              subject: title,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.6">
                  <h2 style="color:#0b2239;margin-bottom:8px">Wooten Oil</h2>
                  <p>Hello ${notificationEscapeHtml(customer.account_name)},</p>
                  <p style="white-space:pre-wrap">${notificationEscapeHtml(message)}</p>
                  <p style="margin-top:24px;color:#64748b;font-size:13px">
                    This message is also available in your Wooten Oil online customer account.
                  </p>
                </div>
              `,
              text: `Hello ${customer.account_name},\n\n${message}\n\nThis message is also available in your Wooten Oil online customer account.`
            })
          });

          const emailData = await emailResponse.json().catch(() => ({}));

          if (emailResponse.ok) {
            emailSent = true;
            emailId = emailData.id || "";

            if (notificationId) {
              await env.DB.prepare(`
                UPDATE portal_notifications
                SET email_sent = 1, email_id = ?
                WHERE id = ? AND account_number = ?
              `).bind(
                emailId,
                notificationId,
                customer.account_number
              ).run();
            }
          } else {
            warning = "Portal notification was saved, but the email could not be sent.";
            console.error("Customer notification email failed", emailData);
          }
        } catch (error) {
          warning = "Portal notification was saved, but the email could not be sent.";
          console.error("Customer notification email error", error);
        }
      }
    }

    return notificationJson({
      success: true,
      saved_to_portal: true,
      notification_id: notificationId,
      account_number: customer.account_number,
      account_name: customer.account_name,
      email: customer.email || "",
      email_sent: emailSent,
      warning
    });
  } catch (error) {
    console.error("adminSendCustomerNotification failed", error);

    return notificationJson({
      success: false,
      error: "The portal notification could not be saved. " + String(error?.message || error)
    }, 500);
  }
}
__name(adminSendCustomerNotification, "adminSendCustomerNotification");

async function customerNotificationsGet({ request, env }) {
  try {
    if (!env.DB) {
      return notificationJson({ success: false, error: "Customer database is not configured." }, 503);
    }

    const customer = await getCustomerFromSession(request, env);

    if (!customer) {
      return notificationJson({
        success: false,
        authenticated: false,
        error: "Customer session was not found."
      }, 401);
    }

    await ensureCustomerNotificationsTable(env);

    const account = normalizeNotificationAccount(customer.account_number);

    const result = await env.DB.prepare(`
      SELECT id, title, message, read_at, created_at
      FROM portal_notifications
      WHERE account_number = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 50
    `).bind(account).all();

    const notifications = (result?.results || []).map((row) => ({
      id: row.id,
      title: row.title || "Wooten Oil",
      message: row.message || "",
      created_at: row.created_at,
      read: !!row.read_at
    }));

    return notificationJson({
      success: true,
      authenticated: true,
      account_number: account,
      unread_count: notifications.filter((n) => !n.read).length,
      notifications
    });
  } catch (error) {
    console.error("customerNotificationsGet failed", error);

    return notificationJson({
      success: false,
      error: "Notifications could not be loaded. " + String(error?.message || error)
    }, 500);
  }
}
__name(customerNotificationsGet, "customerNotificationsGet");

async function customerNotificationsReadPost({ request, env }) {
  try {
    if (!env.DB) {
      return notificationJson({ success: false, error: "Customer database is not configured." }, 503);
    }

    const customer = await getCustomerFromSession(request, env);

    if (!customer) {
      return notificationJson({ success: false, authenticated: false }, 401);
    }

    await ensureCustomerNotificationsTable(env);

    const account = normalizeNotificationAccount(customer.account_number);

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const id = Number(body?.id || 0);
    const markAll = body?.all === true || body?.mark_all === true;

    if (markAll) {
      await env.DB.prepare(`
        UPDATE portal_notifications
        SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE account_number = ?
      `).bind(account).run();
    } else if (Number.isInteger(id) && id > 0) {
      await env.DB.prepare(`
        UPDATE portal_notifications
        SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE id = ? AND account_number = ?
      `).bind(id, account).run();
    } else {
      return notificationJson({ success: false, error: "Notification id is required." }, 400);
    }

    return notificationJson({ success: true });
  } catch (error) {
    console.error("customerNotificationsReadPost failed", error);

    return notificationJson({
      success: false,
      error: String(error?.message || error)
    }, 500);
  }
}
__name(customerNotificationsReadPost, "customerNotificationsReadPost");

// worker.js
function methodNotAllowed() {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Method not allowed."
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
__name(methodNotAllowed, "methodNotAllowed");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/fuel-request") {
      if (request.method === "POST") {
        return onRequestPost({
          request,
          env,
          waitUntil: ctx.waitUntil.bind(ctx)
        });
      }
      if (request.method === "GET") {
        return onRequestGet({
          request,
          env
        });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/contact-message") {
      if (request.method === "POST") {
        return onRequestPost2({
          request,
          env,
          waitUntil: ctx.waitUntil.bind(ctx)
        });
      }
      if (request.method === "GET") {
        return onRequestGet2({
          request,
          env
        });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/admin/customers-import") {
      if (request.method === "POST") {
        return onRequestPost3({
          request,
          env
        });
      }
      if (request.method === "GET") {
        return onRequestGet3({
          request,
          env
        });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/admin/gmail-inbox") {
  if (request.method === "GET") {
    return gmailTestMessages({
      request,
      env
    });
  }
  return methodNotAllowed();
}
    

    if (url.pathname === "/api/admin/customer-notifications") {
      if (request.method === "POST") {
        return adminSendCustomerNotification({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/notifications") {
      if (request.method === "GET") {
        return customerNotificationsGet({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/notifications/read") {
      if (request.method === "POST") {
        return customerNotificationsReadPost({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/login") {
      if (request.method === "POST") {
        return customerLoginPost({
          request,
          env
        });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/customer/me") {
      if (request.method === "GET") {
        return customerMeGet({
          request,
          env
        });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/customer/logout") {
      if (request.method === "POST") {
        return customerLogoutPost({
          request,
          env
        });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/customer/activation/start") {
      if (request.method === "POST") {
        return customerActivationStart({
          request,
          env
        });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/customer/activation/verify") {
      if (request.method === "POST") {
        return customerActivationVerify({
          request,
          env
        });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/customer/activation/set-password") {
      if (request.method === "POST") {
        return customerActivationSetPassword({
          request,
          env
        });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/customer/password-reset/start") {
      if (request.method === "POST") {
        return customerPasswordResetStart({ request, env });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/customer/password-reset/complete") {
      if (request.method === "POST") {
        return customerPasswordResetComplete({ request, env });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/admin/customer-activation-code") {
      if (request.method === "POST") {
        return adminGenerateActivationCode({
          request,
          env
        });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/gmail/oauth/start") {
      if (request.method === "GET") {
        return gmailOAuthStart({ request, env });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/gmail/oauth/callback") {
      if (request.method === "GET") {
        return gmailOAuthCallback({ request, env });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/gmail/oauth/status") {
      if (request.method === "GET") {
        return gmailOAuthStatus({ request, env });
      }
      return methodNotAllowed();
    }
    if (url.pathname === "/api/gmail/test-messages") {
  if (request.method === "GET") {
    return gmailTestMessages({
      request,
      env
    });
  }

  return methodNotAllowed();
}

return env.ASSETS.fetch(request);

  }
  
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map