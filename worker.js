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
  let customerAccountNumber="";
  if(env.DB){
    try{
      const signedInCustomer=await getCustomerFromSession(request,env);
      if(signedInCustomer){
        customerAccountNumber=String(signedInCustomer.account_number||"").trim();
      }
    }catch(error){
      console.error("Could not identify signed-in customer for fuel request",error);
    }
  }
  if (env.DB) {
    try {
      await ensureFuelRequestHistorySchema(env);
      await env.DB.prepare(`
        INSERT INTO fuel_requests
        (request_number, customer_account_number, customer_name, phone, email, delivery_address, fuel_type,
         gallons, delivery_date, notes, submitted_from, received_at, email_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        requestNumber,
        customerAccountNumber,
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


async function ensureFuelRequestHistorySchema(env) {
  if(!env.DB) return;
  const info=await env.DB.prepare(`PRAGMA table_info(fuel_requests)`).all();
  const columns=(info?.results||[]).map(r=>String(r.name||"").toLowerCase());
  if(!columns.includes("customer_account_number")){
    await env.DB.prepare(`ALTER TABLE fuel_requests ADD COLUMN customer_account_number TEXT`).run();
  }
}
__name(ensureFuelRequestHistorySchema,"ensureFuelRequestHistorySchema");

async function customerFuelRequestHistoryGet({request,env}) {
  if(!env.DB){
    return json4({success:false,error:"Customer database is not configured."},503);
  }
  const customer=await getCustomerFromSession(request,env);
  if(!customer){
    return json4({success:false,error:"Please sign in to view fuel request history."},401);
  }

  try{
    await ensureFuelRequestHistorySchema(env);
    const rows=await env.DB.prepare(`
      SELECT
        request_number,
        fuel_type,
        gallons,
        delivery_date,
        delivery_address,
        notes,
        received_at,
        email_status
      FROM fuel_requests
      WHERE customer_account_number = ?
      ORDER BY datetime(received_at) DESC, rowid DESC
      LIMIT 50
    `).bind(String(customer.account_number||"").trim()).all();

    return json4({
      success:true,
      requests:(rows?.results||[]).map(row=>({
        request_number:String(row.request_number||""),
        fuel_type:String(row.fuel_type||""),
        gallons:String(row.gallons||""),
        delivery_date:String(row.delivery_date||""),
        delivery_address:String(row.delivery_address||""),
        notes:String(row.notes||""),
        received_at:String(row.received_at||""),
        email_status:String(row.email_status||"")
      }))
    });
  }catch(error){
    console.error("fuel request history load failed",error);
    return json4({success:false,error:"Fuel request history could not be loaded right now."},500);
  }
}
__name(customerFuelRequestHistoryGet,"customerFuelRequestHistoryGet");

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
  let importMeta=null;
  try{
    importMeta=await recordAdminImport(env,"customers",batch.length);
  }catch(error){
    console.error("Customer import timestamp could not be recorded",error);
  }

  return json3({
    success: true,
    processed: batch.length,
    skipped,
    imported_at: importMeta?.last_import_at || new Date().toISOString()
  });
}
__name(onRequestPost3, "onRequestPost");

function onRequestGet3() {
  return json3({ success: false, error: "Method not allowed." }, 405);
}
__name(onRequestGet3, "onRequestGet");

async function ensureAdminImportMetadataSchema(env){
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_import_metadata (
      import_type TEXT PRIMARY KEY,
      last_import_at TEXT NOT NULL,
      last_record_count INTEGER NOT NULL DEFAULT 0
    )
  `).run();
}
__name(ensureAdminImportMetadataSchema,"ensureAdminImportMetadataSchema");

async function recordAdminImport(env,type,count){
  await ensureAdminImportMetadataSchema(env);
  await env.DB.prepare(`
    INSERT INTO admin_import_metadata(import_type,last_import_at,last_record_count)
    VALUES (?,CURRENT_TIMESTAMP,?)
    ON CONFLICT(import_type) DO UPDATE SET
      last_import_at=CURRENT_TIMESTAMP,
      last_record_count=excluded.last_record_count
  `).bind(String(type||""),Number(count||0)).run();

  const row=await env.DB.prepare(`
    SELECT last_import_at,last_record_count
    FROM admin_import_metadata
    WHERE import_type=?
  `).bind(String(type||"")).first();
  return row||null;
}
__name(recordAdminImport,"recordAdminImport");

async function adminImportStatusGet({request,env}){
  const supplied=request.headers.get("X-Admin-Key")||"";
  if(!env.ADMIN_IMPORT_KEY || supplied!==env.ADMIN_IMPORT_KEY){
    return json3({success:false,error:"Unauthorized."},401);
  }
  if(!env.DB){
    return json3({success:false,error:"Customer database is not configured."},503);
  }

  try{
    await ensureAdminImportMetadataSchema(env);
    const result=await env.DB.prepare(`
      SELECT import_type,last_import_at,last_record_count
      FROM admin_import_metadata
      WHERE import_type IN ('customers','payments')
    `).all();

    let customersLast="",paymentsLast="";
    let customersCount=0,paymentsCount=0;

    for(const row of result?.results||[]){
      if(row.import_type==="customers"){
        customersLast=row.last_import_at||"";
        customersCount=Number(row.last_record_count||0);
      }else if(row.import_type==="payments"){
        paymentsLast=row.last_import_at||"";
        paymentsCount=Number(row.last_record_count||0);
      }
    }

    return json3({
      success:true,
      customers_last_import_at:customersLast,
      customers_last_record_count:customersCount,
      payments_last_import_at:paymentsLast,
      payments_last_record_count:paymentsCount
    });
  }catch(error){
    console.error("adminImportStatusGet failed",error);
    return json3({success:false,error:"Import update information could not be loaded."},500);
  }
}
__name(adminImportStatusGet,"adminImportStatusGet");

// Customer payments import
async function ensureCustomerPaymentsSchema(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_number TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      reference TEXT NOT NULL DEFAULT '',
      payment_type TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      deposit_date TEXT NOT NULL DEFAULT '',
      deposit_no TEXT NOT NULL DEFAULT '',
      deposit_type TEXT NOT NULL DEFAULT '',
      customer_name TEXT NOT NULL DEFAULT '',
      posting_date TEXT NOT NULL DEFAULT '',
      discount_amount REAL NOT NULL DEFAULT 0,
      source_invoice_no TEXT NOT NULL DEFAULT '',
      source_row_key TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const info = await env.DB.prepare(`PRAGMA table_info(customer_payments)`).all();
  const columns = new Set((info?.results||[]).map(r=>String(r.name||'')));
  if(!columns.has('source_invoice_no')){
    await env.DB.prepare(`ALTER TABLE customer_payments ADD COLUMN source_invoice_no TEXT NOT NULL DEFAULT ''`).run();
  }
  if(!columns.has('source_row_key')){
    await env.DB.prepare(`ALTER TABLE customer_payments ADD COLUMN source_row_key TEXT NOT NULL DEFAULT ''`).run();
  }
  if(!columns.has('deposit_date')) await env.DB.prepare(`ALTER TABLE customer_payments ADD COLUMN deposit_date TEXT NOT NULL DEFAULT ''`).run();
  if(!columns.has('deposit_no')) await env.DB.prepare(`ALTER TABLE customer_payments ADD COLUMN deposit_no TEXT NOT NULL DEFAULT ''`).run();
  if(!columns.has('deposit_type')) await env.DB.prepare(`ALTER TABLE customer_payments ADD COLUMN deposit_type TEXT NOT NULL DEFAULT ''`).run();
  if(!columns.has('customer_name')) await env.DB.prepare(`ALTER TABLE customer_payments ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''`).run();
  if(!columns.has('posting_date')) await env.DB.prepare(`ALTER TABLE customer_payments ADD COLUMN posting_date TEXT NOT NULL DEFAULT ''`).run();
  if(!columns.has('discount_amount')) await env.DB.prepare(`ALTER TABLE customer_payments ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`).run();

  // The old index could collapse separate MAS 90 rows that happen to look alike.
  await env.DB.prepare(`DROP INDEX IF EXISTS idx_customer_payments_unique`).run();
  await env.DB.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_payments_source_row
    ON customer_payments(source_row_key)
    WHERE source_row_key <> ''
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_customer_payments_account_date
    ON customer_payments (account_number, payment_date DESC, id DESC)
  `).run();
}
__name(ensureCustomerPaymentsSchema, "ensureCustomerPaymentsSchema");

function paymentText(v, max = 500) {
  return String(v ?? "").trim().slice(0, max);
}
__name(paymentText, "paymentText");

function paymentAccount(v) {
  const s = String(v ?? "").replace(/\D/g, "");
  return s ? s.padStart(7, "0") : "";
}
__name(paymentAccount, "paymentAccount");

function paymentAmount(v) {
  const n = Number(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
__name(paymentAmount, "paymentAmount");

async function paymentRowKey(p){
  const raw=[p.account,p.date,p.amount.toFixed(2),p.reference,p.depositDate,p.depositNo,p.depositType,p.postingDate,p.discountAmount.toFixed(2),p.invoiceNo].join('|');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
__name(paymentRowKey,"paymentRowKey");

async function adminCustomerPaymentsImport({ request, env }) {
  const supplied = request.headers.get("X-Admin-Key") || "";
  if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
    return json3({ success: false, error: "Unauthorized." }, 401);
  }
  if (!env.DB) return json3({ success:false,error:"Customer database is not configured." },503);

  let body;
  try { body = await request.json(); }
  catch { return json3({ success:false,error:"Invalid request data." },400); }

  const payments = Array.isArray(body?.payments) ? body.payments : [];
  if (!payments.length) return json3({ success:false,error:"No payment records were supplied." },400);
  if (payments.length > 1500) return json3({ success:false,error:"Too many payment records in one upload." },413);

  try { await ensureCustomerPaymentsSchema(env); }
  catch(error){
    console.error("Customer payment schema setup failed",error);
    return json3({success:false,error:"Payment history database could not be prepared."},500);
  }

  const valid=[];
  let skipped=0;
  for(const row of payments){
    const account=paymentAccount(row?.account_number);
    const date=paymentText(row?.payment_date,40);
    const amount=paymentAmount(row?.amount);
    if(!account || !date || !Number.isFinite(amount) || amount===0){ skipped++; continue; }
    valid.push({
      account,date,amount,
      reference:paymentText(row?.reference,150),
      type:paymentText(row?.payment_type,100),
      description:paymentText(row?.description,500),
      depositDate:paymentText(row?.deposit_date,40),depositNo:paymentText(row?.deposit_no,100),depositType:paymentText(row?.deposit_type,100),
      customerName:paymentText(row?.customer_name,250),postingDate:paymentText(row?.posting_date,40),discountAmount:paymentAmount(row?.discount_amount_applied),
      invoiceNo:paymentText(row?.invoice_no,100)
    });
  }
  if(!valid.length) return json3({success:false,error:"No valid payment records were found."},400);

  let inserted=0,duplicates=0;
  const insertStmt=env.DB.prepare(`
    INSERT OR IGNORE INTO customer_payments
      (account_number,payment_date,amount,reference,payment_type,description,deposit_date,deposit_no,deposit_type,customer_name,posting_date,discount_amount,source_invoice_no,source_row_key,imported_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `);

  try{
    for(let i=0;i<valid.length;i+=150){
      const chunk=valid.slice(i,i+150);
      const stmts=[];
      for(const p of chunk){
        const key=await paymentRowKey(p);
        stmts.push(insertStmt.bind(p.account,p.date,p.amount,p.reference,p.type,p.description,p.depositDate,p.depositNo,p.depositType,p.customerName,p.postingDate,p.discountAmount,p.invoiceNo,key));
      }
      const results=await env.DB.batch(stmts);
      for(const r of results||[]){
        const changes=Number(r?.meta?.changes||0);
        if(changes>0) inserted++; else duplicates++;
      }
    }
  }catch(error){
    console.error("Customer payments import failed",error);
    return json3({success:false,error:"Payment history import failed."},500);
  }

  let importMeta=null;
  try{
    importMeta=await recordAdminImport(env,"payments",valid.length);
  }catch(error){
    console.error("Payment import timestamp could not be recorded",error);
  }

  return json3({
    success:true,
    received:payments.length,
    valid:valid.length,
    inserted,
    duplicates,
    skipped,
    imported_at: importMeta?.last_import_at || new Date().toISOString()
  });
}
__name(adminCustomerPaymentsImport, "adminCustomerPaymentsImport");

async function customerPaymentsGet({request,env}){
  const customer=await getCustomerFromSession(request,env);
  if(!customer) return notificationJson({success:false,error:"Unauthorized."},401);
  if(!env.DB) return notificationJson({success:false,error:"Customer database is not configured."},503);

  try{
    await ensureCustomerPaymentsSchema(env);
    const account=paymentAccount(customer.account_number);
    const result=await env.DB.prepare(`
      SELECT
        id,account_number,payment_date,posting_date,deposit_date,deposit_no,
        source_invoice_no AS invoice_no,amount,reference,description,imported_at
      FROM customer_payments
      WHERE account_number=?
      ORDER BY COALESCE(NULLIF(posting_date,''),payment_date) DESC,id DESC
      LIMIT 5000
    `).bind(account).all();
    const rows=result?.results||[];
    const totalPaid=rows.reduce((sum,r)=>sum+paymentAmount(r.amount),0);
    return notificationJson({success:true,count:rows.length,total_paid:totalPaid,payments:rows});
  }catch(error){
    console.error('customerPaymentsGet failed',error);
    return notificationJson({success:false,error:"Payment history could not be loaded."},500);
  }
}
__name(customerPaymentsGet,'customerPaymentsGet');

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

async function adminGeneratePasswordResetCode({ request, env }) {
  try {
    if (!env.DB) {
      return json6({ success: false, error: "Customer database is not configured." }, 503);
    }

    const supplied = request.headers.get("X-Admin-Key") || "";
    if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
      return json6({ success: false, error: "Unauthorized." }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json6({ success: false, error: "Invalid request." }, 400);
    }

    const account = normalizeAccount3(body?.account_number || body?.accountNumber);
    if (!account) {
      return json6({ success: false, error: "Customer Number is required." }, 400);
    }

    const customer = await findCustomer(env, account);
    if (!customer) {
      return json6({ success: false, error: "Customer was not found." }, 404);
    }

    const status = clean3(customer.account_status).toLowerCase();
    if (status && status !== "active") {
      return json6({
        success: false,
        error: "This customer account is not active."
      }, 403);
    }

    if (!clean3(customer.password_hash)) {
      return json6({
        success: false,
        setup_required: true,
        error: "This online account has not been activated yet. Use the Account Activation tool instead."
      }, 409);
    }

    const code = randomCode2();
    const expires = await storeResetCode(env, customer.id, code);

    return json6({
      success: true,
      account_number: customer.account_number,
      account_name: customer.account_name,
      reset_code: code,
      expires_at: expires
    });
  } catch (error) {
    console.error("adminGeneratePasswordResetCode failed", error);
    return json6({
      success: false,
      error: "The password reset code could not be generated. " + String(error?.message || error)
    }, 500);
  }
}
__name(adminGeneratePasswordResetCode, "adminGeneratePasswordResetCode");

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

  /* Optional action metadata lets certain notifications open a portal feature
     instead of the generic message popup. Added safely for existing databases. */
  try{
    const info=await env.DB.prepare(`PRAGMA table_info(portal_notifications)`).all();
    const cols=(info?.results||[]).map(r=>String(r.name||"").toLowerCase());
    if(!cols.includes("action_type")){
      await env.DB.prepare(`ALTER TABLE portal_notifications ADD COLUMN action_type TEXT`).run();
    }
    if(!cols.includes("action_id")){
      await env.DB.prepare(`ALTER TABLE portal_notifications ADD COLUMN action_id INTEGER`).run();
    }
    if(!cols.includes("sms_sent")){
      await env.DB.prepare(`ALTER TABLE portal_notifications ADD COLUMN sms_sent INTEGER NOT NULL DEFAULT 0`).run();
    }
    if(!cols.includes("sms_sid")){
      await env.DB.prepare(`ALTER TABLE portal_notifications ADD COLUMN sms_sid TEXT`).run();
    }
    if(!cols.includes("sms_error")){
      await env.DB.prepare(`ALTER TABLE portal_notifications ADD COLUMN sms_error TEXT`).run();
    }
  }catch(error){
    console.error("portal notification action columns check failed",error);
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS portal_notification_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id INTEGER NOT NULL,
      account_number TEXT NOT NULL,
      object_key TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_portal_notification_attachments_account_notification
    ON portal_notification_attachments(account_number, notification_id, id)
  `).run();
}
__name(ensureCustomerNotificationsTable, "ensureCustomerNotificationsTable");

async function ensureAdminCommunicationLogTable(env){
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_communication_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_number TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      portal_sent INTEGER NOT NULL DEFAULT 0,
      email_sent INTEGER NOT NULL DEFAULT 0,
      sms_sent INTEGER NOT NULL DEFAULT 0,
      email_id TEXT,
      sms_sid TEXT,
      error_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_type,source_id)
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_communication_log_account_created
    ON admin_communication_log(account_number,created_at DESC,id DESC)
  `).run();
}
__name(ensureAdminCommunicationLogTable,"ensureAdminCommunicationLogTable");

async function backfillAdminCommunicationLog(env){
  await ensureCustomerNotificationsTable(env);
  await ensureCustomerDocumentsTable(env);
  await ensureAdminCommunicationLogTable(env);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO admin_communication_log
      (account_number,event_type,title,detail,source_type,source_id,portal_sent,email_sent,sms_sent,email_id,sms_sid,error_text,created_at)
    SELECT
      n.account_number,
      CASE WHEN d.document_type IN ('statement','invoice') THEN d.document_type ELSE 'notification' END,
      n.title,
      n.message,
      'notification',n.id,1,COALESCE(n.email_sent,0),COALESCE(n.sms_sent,0),
      COALESCE(n.email_id,''),COALESCE(n.sms_sid,''),COALESCE(n.sms_error,''),n.created_at
    FROM portal_notifications n
    LEFT JOIN portal_customer_documents d
      ON n.action_type='customer_documents' AND n.action_id=d.id
  `).run();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO admin_communication_log
      (account_number,event_type,title,detail,source_type,source_id,portal_sent,email_sent,sms_sent,created_at)
    SELECT
      d.account_number,
      CASE WHEN d.document_type='invoice' THEN 'invoice' ELSE 'statement' END,
      d.title,d.filename,'document',d.id,1,0,0,d.created_at
    FROM portal_customer_documents d
    WHERE NOT EXISTS (
      SELECT 1 FROM portal_notifications n
      WHERE n.action_type='customer_documents' AND n.action_id=d.id
    )
  `).run();
}
__name(backfillAdminCommunicationLog,"backfillAdminCommunicationLog");

async function adminCommunicationLogGet({request,env}){
  try{
    const supplied=request.headers.get("X-Admin-Key")||"";
    if(!env.ADMIN_IMPORT_KEY||supplied!==env.ADMIN_IMPORT_KEY){
      return notificationJson({success:false,error:"Unauthorized."},401);
    }
    if(!env.DB) return notificationJson({success:false,error:"Customer database is not configured."},503);
    await backfillAdminCommunicationLog(env);
    const url=new URL(request.url);
    const account=normalizeNotificationAccount(url.searchParams.get("account_number")||"");
    const from=String(url.searchParams.get("from")||"").trim();
    const to=String(url.searchParams.get("to")||"").trim();
    const type=String(url.searchParams.get("type")||"all").trim().toLowerCase();
    const q=String(url.searchParams.get("q")||"").trim().toLowerCase();
    const clauses=[];
    const binds=[];
    if(from){clauses.push("date(l.created_at)>=date(?)");binds.push(from);}
    if(to){clauses.push("date(l.created_at)<=date(?)");binds.push(to);}
    if(["notification","statement","invoice"].includes(type)){clauses.push("l.event_type=?");binds.push(type);}
    if(account){clauses.push("l.account_number=?");binds.push(account);}
    if(q){clauses.push("(lower(l.account_number) LIKE ? OR lower(COALESCE(c.account_name,'')) LIKE ?)");binds.push(`%${q}%`,`%${q}%`);}
    const where=clauses.length?`WHERE ${clauses.join(" AND ")}`:"";
    if(account){
      const result=await env.DB.prepare(`
        SELECT l.*,COALESCE(c.account_name,'Customer') AS account_name,c.phone,c.email
        FROM admin_communication_log l
        LEFT JOIN customers c ON c.account_number=l.account_number
        ${where}
        ORDER BY l.created_at DESC,l.id DESC
        LIMIT 500
      `).bind(...binds).all();
      return notificationJson({success:true,account_number:account,entries:result?.results||[]});
    }
    const result=await env.DB.prepare(`
      SELECT
        l.account_number,COALESCE(c.account_name,'Customer') AS account_name,c.phone,c.email,
        COUNT(*) AS total_count,
        SUM(CASE WHEN l.event_type='notification' THEN 1 ELSE 0 END) AS notification_count,
        SUM(CASE WHEN l.event_type='statement' THEN 1 ELSE 0 END) AS statement_count,
        SUM(CASE WHEN l.event_type='invoice' THEN 1 ELSE 0 END) AS invoice_count,
        MAX(l.created_at) AS last_sent_at
      FROM admin_communication_log l
      LEFT JOIN customers c ON c.account_number=l.account_number
      ${where}
      GROUP BY l.account_number,c.account_name,c.phone,c.email
      ORDER BY last_sent_at DESC,l.account_number ASC
      LIMIT 5000
    `).bind(...binds).all();
    return notificationJson({success:true,customers:result?.results||[]});
  }catch(error){
    console.error("adminCommunicationLogGet failed",error);
    return notificationJson({success:false,error:"Communication log could not be loaded. "+String(error?.message||error)},500);
  }
}
__name(adminCommunicationLogGet,"adminCommunicationLogGet");

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

function notificationBase64ToBytes(value) {
  const cleaned = String(value || "").replace(/\s+/g, "");
  const binary = atob(cleaned);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
__name(notificationBase64ToBytes, "notificationBase64ToBytes");

function notificationSafeFilename(value) {
  return String(value || "attachment")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\/\\]+/g, "_")
    .trim()
    .slice(0, 180) || "attachment";
}
__name(notificationSafeFilename, "notificationSafeFilename");

function notificationAllowedAttachmentType(value) {
  const type = String(value || "").toLowerCase().trim();
  return new Set([
    "application/pdf",
    "image/png","image/jpeg","image/gif","image/webp",
    "text/plain","text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ]).has(type);
}
__name(notificationAllowedAttachmentType, "notificationAllowedAttachmentType");

function notificationAttachmentDisposition(contentType) {
  const type = String(contentType || "").toLowerCase();
  return (
    type === "application/pdf" ||
    type.startsWith("image/") ||
    type === "text/plain"
  ) ? "inline" : "attachment";
}
__name(notificationAttachmentDisposition, "notificationAttachmentDisposition");

function twilioConfig(env){
  const accountSid=String(env.TWILIO_ACCOUNT_SID||"").trim();
  const authToken=String(env.TWILIO_AUTH_TOKEN||"").trim();
  const messagingServiceSid=String(env.TWILIO_MESSAGING_SERVICE_SID||"").trim();
  const phoneNumber=String(env.TWILIO_PHONE_NUMBER||"").trim();
  const missing=[];
  if(!accountSid) missing.push("TWILIO_ACCOUNT_SID");
  if(!authToken) missing.push("TWILIO_AUTH_TOKEN");
  if(!messagingServiceSid&&!phoneNumber) missing.push("TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID");
  return {configured:missing.length===0,missing,accountSid,authToken,messagingServiceSid,phoneNumber};
}
__name(twilioConfig,"twilioConfig");
function twilioNormalizePhone(value){
  const raw=String(value||"").trim();
  if(!raw) return "";
  if(raw.startsWith("+")){
    const digits=raw.slice(1).replace(/\D/g,"");
    return digits.length>=10&&digits.length<=15?`+${digits}`:"";
  }
  const digits=raw.replace(/\D/g,"");
  if(digits.length===10) return `+1${digits}`;
  if(digits.length===11&&digits.startsWith("1")) return `+${digits}`;
  return "";
}
__name(twilioNormalizePhone,"twilioNormalizePhone");
async function twilioSendSms(env,to,body){
  const config=twilioConfig(env);
  if(!config.configured) throw new Error(`Twilio is not configured. Missing: ${config.missing.join(", ")}.`);
  const normalizedTo=twilioNormalizePhone(to);
  if(!normalizedTo) throw new Error("Customer phone number is not a valid U.S./E.164 number.");
  const text=String(body||"").trim();
  if(!text) throw new Error("SMS message is empty.");
  const params=new URLSearchParams();
  params.set("To",normalizedTo);
  params.set("Body",text.slice(0,1500));
  if(config.messagingServiceSid) params.set("MessagingServiceSid",config.messagingServiceSid);
  else params.set("From",config.phoneNumber);
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,{
    method:"POST",
    headers:{"Authorization":`Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,"Content-Type":"application/x-www-form-urlencoded"},
    body:params.toString()
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(String(data?.message||`Twilio request failed with status ${response.status}.`));
  return {sid:String(data?.sid||""),status:String(data?.status||""),to:normalizedTo};
}
__name(twilioSendSms,"twilioSendSms");

async function ensurePortalDocumentLinksTable(env){
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS portal_document_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      attachment_id INTEGER NOT NULL,
      account_number TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_portal_document_links_account
    ON portal_document_links(account_number, attachment_id)
  `).run();
}
__name(ensurePortalDocumentLinksTable,"ensurePortalDocumentLinksTable");

async function createPortalDocumentLink({request,env,attachmentId,accountNumber}){
  await ensurePortalDocumentLinksTable(env);
  const token=randomToken();
  const tokenHash=await sha256(token);
  await env.DB.prepare(`
    INSERT INTO portal_document_links
      (token_hash, attachment_id, account_number, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(tokenHash,attachmentId,accountNumber).run();
  return `${new URL(request.url).origin}/open-document/${encodeURIComponent(token)}`;
}
__name(createPortalDocumentLink,"createPortalDocumentLink");

async function ensurePortalStatementLinksTable(env){
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS portal_statement_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      document_id INTEGER NOT NULL,
      account_number TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_portal_statement_links_account
    ON portal_statement_links(account_number, document_id)
  `).run();
}
__name(ensurePortalStatementLinksTable,"ensurePortalStatementLinksTable");

async function createPortalStatementLink({request,env,documentId,accountNumber}){
  await ensurePortalStatementLinksTable(env);
  const token=randomToken();
  await env.DB.prepare(`
    INSERT INTO portal_statement_links
      (token_hash, document_id, account_number, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(await sha256(token),documentId,accountNumber).run();
  return `${new URL(request.url).origin}/open-document/${encodeURIComponent(token)}`;
}
__name(createPortalStatementLink,"createPortalStatementLink");

async function portalDocumentLinkGet({request,env}){
  try{
    if(!env.DB||!env.NOTIFICATION_ATTACHMENTS){
      return new Response("Document storage is not configured.",{status:503});
    }
    const url=new URL(request.url);
    const token=decodeURIComponent(url.pathname.split("/").filter(Boolean).pop()||"");
    if(!/^[a-f0-9]{64}$/i.test(token)) return new Response("Document link is invalid.",{status:404});

    await ensureCustomerNotificationsTable(env);
    await ensurePortalDocumentLinksTable(env);
    let row=await env.DB.prepare(`
      SELECT l.account_number, a.object_key, a.filename, a.content_type
      FROM portal_document_links l
      INNER JOIN portal_notification_attachments a ON a.id=l.attachment_id
      WHERE l.token_hash=? AND a.account_number=l.account_number
      LIMIT 1
    `).bind(await sha256(token)).first();
    if(!row){
      await ensureCustomerDocumentsTable(env);
      await ensurePortalStatementLinksTable(env);
      row=await env.DB.prepare(`
        SELECT l.account_number, d.object_key, d.filename, d.content_type
        FROM portal_statement_links l
        INNER JOIN portal_customer_documents d ON d.id=l.document_id
        WHERE l.token_hash=? AND d.account_number=l.account_number
        LIMIT 1
      `).bind(await sha256(token)).first();
    }
    if(!row) return new Response("Document link was not found.",{status:404});

    const customer=await getCustomerFromSession(request,env);
    if(!customer){
      const loginUrl=new URL("/",url.origin);
      loginUrl.searchParams.set("document_token",token);
      loginUrl.hash="customer-login";
      return Response.redirect(loginUrl.toString(),302);
    }
    if(normalizeNotificationAccount(customer.account_number)!==normalizeNotificationAccount(row.account_number)){
      return new Response("This document belongs to a different customer account.",{status:403});
    }

    const object=await env.NOTIFICATION_ATTACHMENTS.get(row.object_key);
    if(!object) return new Response("Document file is unavailable.",{status:404});
    const filename=notificationSafeFilename(row.filename||"document.pdf");
    const headers=new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type",row.content_type||"application/pdf");
    headers.set("Content-Disposition",`inline; filename="${filename.replace(/"/g,"")}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    headers.set("Cache-Control","private, no-store");
    headers.set("X-Content-Type-Options","nosniff");
    headers.set("Content-Length",String(Number(object.size||row.size_bytes||0)));
    return new Response(object.body,{status:200,headers});
  }catch(error){
    console.error("portalDocumentLinkGet failed",error);
    return new Response("Document could not be opened.",{status:500});
  }
}
__name(portalDocumentLinkGet,"portalDocumentLinkGet");
async function adminTwilioStatusGet({request,env}){
  const supplied=request.headers.get("X-Admin-Key")||"";
  if(!env.ADMIN_IMPORT_KEY||supplied!==env.ADMIN_IMPORT_KEY) return notificationJson({success:false,error:"Unauthorized."},401);
  const config=twilioConfig(env);
  return notificationJson({
    success:true,
    configured:config.configured,
    missing:config.missing,
    account_sid_masked:config.accountSid?`${config.accountSid.slice(0,4)}…${config.accountSid.slice(-4)}`:"",
    sender_label:config.messagingServiceSid?`Messaging Service ${config.messagingServiceSid.slice(0,6)}…`:(config.phoneNumber||"")
  });
}
__name(adminTwilioStatusGet,"adminTwilioStatusGet");

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

    const sendAllWithEmail =
      body?.send_all_with_email === true ||
      body?.sendAllWithEmail === true;

    const account = normalizeNotificationAccount(body?.account_number || body?.accountNumber);
    const title = String(body?.title || body?.subject || "").trim();
    const message = String(body?.message || "").trim();
    const sendEmail = sendAllWithEmail
      ? true
      : (body?.send_email !== false && body?.sendEmail !== false);
    const sendSms=body?.send_sms===true||body?.sendSms===true;
    if(sendAllWithEmail&&sendSms){
      return notificationJson({success:false,error:"Bulk SMS is disabled until A2P registration and customer opt-in are fully configured."},400);
    }

    const rawAttachments = Array.isArray(body?.attachments) ? body.attachments : [];
    if (sendAllWithEmail && rawAttachments.length) {
      return notificationJson({
        success: false,
        error: "Attachments are currently supported for one-customer notifications only."
      }, 400);
    }
    if (rawAttachments.length > 3) {
      return notificationJson({ success: false, error: "Choose no more than 3 attachments." }, 400);
    }

    let totalAttachmentBytes = 0;
    const attachments = [];
    for (const item of rawAttachments) {
      const filename = notificationSafeFilename(item?.filename);
      const contentType = String(item?.content_type || item?.contentType || "application/octet-stream").toLowerCase().trim();
      const contentBase64 = String(item?.content_base64 || item?.contentBase64 || "").replace(/\s+/g, "");
      if (!contentBase64) {
        return notificationJson({ success: false, error: `Attachment ${filename} is empty.` }, 400);
      }
      if (!notificationAllowedAttachmentType(contentType)) {
        return notificationJson({ success: false, error: `Attachment type is not allowed: ${filename}` }, 400);
      }

      let bytes;
      try {
        bytes = notificationBase64ToBytes(contentBase64);
      } catch {
        return notificationJson({ success: false, error: `Attachment ${filename} could not be decoded.` }, 400);
      }

      if (bytes.byteLength > 5 * 1024 * 1024) {
        return notificationJson({ success: false, error: `${filename} is larger than 5 MB.` }, 400);
      }
      totalAttachmentBytes += bytes.byteLength;
      if (totalAttachmentBytes > 10 * 1024 * 1024) {
        return notificationJson({ success: false, error: "Total attachment size cannot exceed 10 MB." }, 400);
      }

      attachments.push({
        filename,
        content_type: contentType,
        content_base64: contentBase64,
        bytes
      });
    }

    if (attachments.length && !env.NOTIFICATION_ATTACHMENTS) {
      return notificationJson({
        success: false,
        error: "Notification attachment storage is not configured. Add the NOTIFICATION_ATTACHMENTS R2 binding."
      }, 503);
    }

    if (!title || !message || (!sendAllWithEmail && !account)) {
      return notificationJson({
        success: false,
        error: sendAllWithEmail
          ? "Subject and message are required."
          : "Customer Number, subject and message are required."
      }, 400);
    }

    if (title.length > 160 || message.length > 5000) {
      return notificationJson({ success: false, error: "Subject or message is too long." }, 400);
    }

    await ensureCustomerNotificationsTable(env);

    /* BULK SEND: every customer with a valid email address on file. */
    if (sendAllWithEmail) {
      if (!env.RESEND_API_KEY) {
        return notificationJson({
          success: false,
          error: "Email service is not configured. No broadcast was sent."
        }, 503);
      }

      const result = await env.DB.prepare(`
        SELECT account_number, account_name, email
        FROM customers
        WHERE email IS NOT NULL
          AND trim(email) <> ''
        ORDER BY account_number
      `).all();

      const allRows = result?.results || [];
      const isUsableEmail = (value) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

      const customers = allRows
        .map((row) => ({
          account_number: normalizeNotificationAccount(row.account_number),
          account_name: String(row.account_name || "Customer").trim() || "Customer",
          email: String(row.email || "").trim()
        }))
        .filter((row) => row.account_number && isUsableEmail(row.email));

      const invalidEmailCustomers = Math.max(0, allRows.length - customers.length);

      if (!customers.length) {
        return notificationJson({
          success: false,
          error: "No customers with valid email addresses were found."
        }, 404);
      }

      const records = [];

      /* Save every portal notification first. */
      for (let i = 0; i < customers.length; i += 50) {
        const chunk = customers.slice(i, i + 50);
        const statements = chunk.map((customer) =>
          env.DB.prepare(`
            INSERT INTO portal_notifications
              (account_number, title, message, email_sent, email_id, created_at)
            VALUES (?, ?, ?, 0, '', CURRENT_TIMESTAMP)
          `).bind(customer.account_number, title, message)
        );

        const insertedResults = await env.DB.batch(statements);

        chunk.forEach((customer, index) => {
          const inserted = insertedResults?.[index];
          const notificationId =
            inserted?.meta?.last_row_id ||
            inserted?.meta?.last_insert_rowid ||
            null;

          records.push({
            ...customer,
            notification_id: notificationId
          });
        });
      }

      const fromAddress = String(env.FUEL_FROM_EMAIL || "support@wootenoil.com").trim();
      let emailsSent = 0;
      let emailsFailed = 0;
      const emailErrors = [];

      /* Resend Batch Emails supports up to 100 emails per API call. */
      for (let i = 0; i < records.length; i += 100) {
        const chunk = records.slice(i, i + 100);

        const payload = chunk.map((customer) => ({
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
        }));

        try {
          const emailResponse = await fetch("https://api.resend.com/emails/batch", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
              "User-Agent": "WootenOilCustomerPortal/1.0"
            },
            body: JSON.stringify(payload)
          });

          const emailData = await emailResponse.json().catch(() => ({}));

          if (!emailResponse.ok) {
            emailsFailed += chunk.length;
            emailErrors.push(
              String(
                emailData?.message ||
                emailData?.error?.message ||
                emailData?.error ||
                `Batch email request failed with status ${emailResponse.status}.`
              )
            );
            console.error("Bulk customer notification email batch failed", emailData);
            continue;
          }

          const responseItems = Array.isArray(emailData?.data)
            ? emailData.data
            : (Array.isArray(emailData) ? emailData : []);

          const updates = chunk
            .filter((customer) => customer.notification_id)
            .map((customer, index) => {
              const emailId = responseItems?.[index]?.id || "";
              return env.DB.prepare(`
                UPDATE portal_notifications
                SET email_sent = 1, email_id = ?
                WHERE id = ? AND account_number = ?
              `).bind(
                emailId,
                customer.notification_id,
                customer.account_number
              );
            });

          if (updates.length) {
            for (let u = 0; u < updates.length; u += 50) {
              await env.DB.batch(updates.slice(u, u + 50));
            }
          }

          emailsSent += chunk.length;
        } catch (error) {
          emailsFailed += chunk.length;
          emailErrors.push(String(error?.message || error));
          console.error("Bulk customer notification email error", error);
        }
      }

      let warning = "";
      if (emailsFailed) {
        warning =
          `${emailsFailed} email(s) could not be sent. ` +
          `Their portal notifications were still saved.`;
      }

      return notificationJson({
        success: true,
        bulk: true,
        customers_targeted: records.length,
        notifications_saved: records.length,
        emails_sent: emailsSent,
        emails_failed: emailsFailed,
        invalid_email_customers: invalidEmailCustomers,
        warning,
        email_errors: emailErrors.slice(0, 5)
      });
    }

    /* SINGLE CUSTOMER SEND — existing behavior preserved. */
    const customer = await env.DB.prepare(`
      SELECT account_number, account_name, email, phone
      FROM customers
      WHERE account_number = ?
      LIMIT 1
    `).bind(account).first();

    if (!customer) {
      return notificationJson({ success: false, error: "Customer was not found." }, 404);
    }

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

    const savedAttachments = [];
    if (attachments.length) {
      if (!notificationId) {
        throw new Error("Notification was saved but its id could not be determined.");
      }

      const storedKeys = [];
      try {
        for (const attachment of attachments) {
          const objectKey =
            `notifications/${customer.account_number}/${notificationId}/` +
            `${crypto.randomUUID()}-${notificationSafeFilename(attachment.filename)}`;

          await env.NOTIFICATION_ATTACHMENTS.put(objectKey, attachment.bytes, {
            httpMetadata: {
              contentType: attachment.content_type,
              contentDisposition:
                `${notificationAttachmentDisposition(attachment.content_type)}; filename="${attachment.filename.replace(/"/g, "")}"`
            },
            customMetadata: {
              account_number: String(customer.account_number),
              notification_id: String(notificationId),
              filename: attachment.filename
            }
          });
          storedKeys.push(objectKey);

          const attachmentRow = await env.DB.prepare(`
            INSERT INTO portal_notification_attachments
              (notification_id, account_number, object_key, filename, content_type, size_bytes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).bind(
            notificationId,
            customer.account_number,
            objectKey,
            attachment.filename,
            attachment.content_type,
            attachment.bytes.byteLength
          ).run();

          savedAttachments.push({
            id:
              attachmentRow?.meta?.last_row_id ||
              attachmentRow?.meta?.last_insert_rowid ||
              null,
            filename: attachment.filename,
            content_type: attachment.content_type,
            size_bytes: attachment.bytes.byteLength,
            object_key: objectKey
          });
        }
      } catch (attachmentError) {
        for (const key of storedKeys) {
          try { await env.NOTIFICATION_ATTACHMENTS.delete(key); } catch {}
        }
        try {
          await env.DB.prepare(`DELETE FROM portal_notification_attachments WHERE notification_id=?`).bind(notificationId).run();
          await env.DB.prepare(`DELETE FROM portal_notifications WHERE id=? AND account_number=?`).bind(notificationId, customer.account_number).run();
        } catch {}
        throw new Error("Attachment could not be stored. " + String(attachmentError?.message || attachmentError));
      }
    }

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
              text: `Hello ${customer.account_name},\n\n${message}\n\nThis message is also available in your Wooten Oil online customer account.`,
              ...(attachments.length ? {
                attachments: attachments.map((attachment) => ({
                  filename: attachment.filename,
                  content: attachment.content_base64
                }))
              } : {})
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

    let smsSent=false;
    let smsSid="";
    let smsError="";
    if(sendSms){
      if(!customer.phone){
        warning=warning?`${warning} SMS was not sent because this customer has no phone number on file.`:"Portal notification was saved, but SMS was not sent because this customer has no phone number on file.";
      }else{
        try{
          const pdfAttachment=savedAttachments.find((attachment)=>
            attachment.id && String(attachment.content_type||"").toLowerCase()==="application/pdf"
          );
          const documentLink=pdfAttachment
            ? await createPortalDocumentLink({
                request,
                env,
                attachmentId:pdfAttachment.id,
                accountNumber:customer.account_number
              })
            : "";
          const smsBody =
            `WOOTEN OIL CO INC\n\n` +
            `${title.trim()}\n\n` +
            `${message.trim()}\n\n` +
            (documentLink ? `${documentLink}\n\n` : "") +
            `Please do not reply to this message.`;
          const smsResult=await twilioSendSms(env,customer.phone,smsBody);
          smsSent=true;
          smsSid=smsResult.sid||"";
        }catch(error){
          smsError=String(error?.message||error);
          warning=warning?`${warning} SMS was not sent: ${smsError}`:`Portal notification was saved, but SMS was not sent: ${smsError}`;
          console.error("Twilio customer notification SMS failed",error);
        }
      }
    }

    if(notificationId){
      try{
        await env.DB.prepare(`
          UPDATE portal_notifications
          SET sms_sent=?,sms_sid=?,sms_error=?
          WHERE id=? AND account_number=?
        `).bind(smsSent?1:0,smsSid,smsError,notificationId,customer.account_number).run();
        await ensureAdminCommunicationLogTable(env);
        await env.DB.prepare(`
          INSERT INTO admin_communication_log
            (account_number,event_type,title,detail,source_type,source_id,portal_sent,email_sent,sms_sent,email_id,sms_sid,error_text,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(source_type,source_id) DO UPDATE SET
            portal_sent=excluded.portal_sent,email_sent=excluded.email_sent,sms_sent=excluded.sms_sent,
            email_id=excluded.email_id,sms_sid=excluded.sms_sid,error_text=excluded.error_text
        `).bind(
          customer.account_number,"notification",title,message,"notification",notificationId,
          1,emailSent?1:0,smsSent?1:0,emailId,smsSid,smsError
        ).run();
      }catch(error){
        console.error("notification communication log update failed",error);
      }
    }

    return notificationJson({
      success: true,
      saved_to_portal: true,
      notification_id: notificationId,
      account_number: customer.account_number,
      account_name: customer.account_name,
      email: customer.email || "",
      phone: customer.phone || "",
      email_sent: emailSent,
      sms_sent: smsSent,
      sms_sid: smsSid,
      attachment_count: savedAttachments.length,
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
    await ensureCustomerDocumentsTable(env);

    try {
      await syncGmailSentToPortal(env, { force: false, maxMessages: 50 });
    } catch (syncError) {
      console.error("Customer notification Gmail sync skipped", syncError);
    }

    const account = normalizeNotificationAccount(customer.account_number);

    const result = await env.DB.prepare(`
      SELECT
        n.id,
        n.title,
        n.message,
        n.read_at,
        n.created_at,
        n.action_type,
        n.action_id,
        d.title AS document_title,
        d.filename AS document_filename
      FROM portal_notifications n
      LEFT JOIN portal_customer_documents d
        ON n.action_type='customer_documents'
       AND n.action_id=d.id
       AND d.account_number=n.account_number
      WHERE n.account_number = ?
      ORDER BY datetime(n.created_at) DESC, n.id DESC
      LIMIT 50
    `).bind(account).all();

    const attachmentResult = await env.DB.prepare(`
      SELECT id, notification_id, filename, content_type, size_bytes
      FROM portal_notification_attachments
      WHERE account_number = ?
      ORDER BY notification_id DESC, id ASC
    `).bind(account).all();

    const attachmentsByNotification = new Map();
    for (const row of attachmentResult?.results || []) {
      const key = Number(row.notification_id);
      if (!attachmentsByNotification.has(key)) attachmentsByNotification.set(key, []);
      attachmentsByNotification.get(key).push({
        id: row.id,
        filename: row.filename || "Attachment",
        content_type: row.content_type || "application/octet-stream",
        size_bytes: Number(row.size_bytes || 0),
        url: `/api/customer/notification-attachments/${encodeURIComponent(row.id)}`
      });
    }

    const notifications = (result?.results || []).map((row) => ({
      id: row.id,
      title: row.title || "Wooten Oil",
      message: row.message || "",
      created_at: row.created_at,
      read: !!row.read_at,
      sender_name: "Wooten Oil Co Inc.",
      sender_email: "support@wootenoil.com",
      recipient_email: String(customer.email || ""),
      action_type: String(row.action_type || ""),
      action_id: row.action_id == null ? null : Number(row.action_id),
      document_title: String(row.document_title || ""),
      document_filename: String(row.document_filename || ""),
      attachments: attachmentsByNotification.get(Number(row.id)) || []
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




async function customerNotificationDocumentResolve({request,env}){
  try{
    if(!env.DB) return notificationJson({success:false,error:"Customer database is not configured."},503);
    const customer=await getCustomerFromSession(request,env);
    if(!customer) return notificationJson({success:false,error:"Unauthorized."},401);

    const url=new URL(request.url);
    const notificationId=Number(url.searchParams.get("notification_id")||0);
    if(!Number.isInteger(notificationId)||notificationId<=0){
      return notificationJson({success:false,error:"Notification was not found."},404);
    }

    await ensureCustomerNotificationsTable(env);
    await ensureCustomerDocumentsTable(env);
    const account=normalizeNotificationAccount(customer.account_number);

    const notification=await env.DB.prepare(`
      SELECT id,title,message,created_at,action_type,action_id
      FROM portal_notifications
      WHERE id=? AND account_number=?
      LIMIT 1
    `).bind(notificationId,account).first();

    if(!notification) return notificationJson({success:false,error:"Notification was not found."},404);

    if(String(notification.action_type||"")==="customer_documents" && Number(notification.action_id||0)>0){
      return notificationJson({success:true,document_id:Number(notification.action_id)});
    }

    const text=String(notification.title||"")+" "+String(notification.message||"");
    if(!/statement|invoice/i.test(text)){
      return notificationJson({success:false,error:"This notification is not linked to a document."},404);
    }

    let doc=null;
    const match=String(notification.message||"").match(/^(.*?)\s+is now available in your Statements & Invoices\./i);
    if(match && match[1]){
      doc=await env.DB.prepare(`
        SELECT id FROM portal_customer_documents
        WHERE account_number=? AND title=?
        ORDER BY id DESC LIMIT 1
      `).bind(account,String(match[1]).trim()).first();
    }

    if(!doc){
      doc=await env.DB.prepare(`
        SELECT id FROM portal_customer_documents
        WHERE account_number=?
          AND datetime(created_at) <= datetime(?,'+5 minutes')
        ORDER BY datetime(created_at) DESC,id DESC
        LIMIT 1
      `).bind(account,notification.created_at).first();
    }

    if(!doc) return notificationJson({success:false,error:"The related document could not be found."},404);

    try{
      await env.DB.prepare(`
        UPDATE portal_notifications
        SET action_type='customer_documents',action_id=?
        WHERE id=? AND account_number=?
      `).bind(Number(doc.id),notificationId,account).run();
    }catch(error){
      console.error("Could not repair document notification link",error);
    }

    return notificationJson({success:true,document_id:Number(doc.id)});
  }catch(error){
    console.error("customerNotificationDocumentResolve failed",error);
    return notificationJson({success:false,error:"The related document could not be located."},500);
  }
}
__name(customerNotificationDocumentResolve,"customerNotificationDocumentResolve");

async function customerNotificationDetailGet({ request, env }) {
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
    await ensureCustomerDocumentsTable(env);

    const url = new URL(request.url);
    const idPart = url.pathname.split("/").filter(Boolean).pop() || "";
    const notificationId = Number(idPart);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return notificationJson({ success: false, error: "Notification was not found." }, 404);
    }

    const account = normalizeNotificationAccount(customer.account_number);

    const row = await env.DB.prepare(`
      SELECT
        n.id,
        n.title,
        n.message,
        n.read_at,
        n.created_at,
        n.action_type,
        n.action_id,
        d.title AS document_title,
        d.filename AS document_filename
      FROM portal_notifications n
      LEFT JOIN portal_customer_documents d
        ON n.action_type='customer_documents'
       AND n.action_id=d.id
       AND d.account_number=n.account_number
      WHERE n.id = ? AND n.account_number = ?
      LIMIT 1
    `).bind(notificationId, account).first();

    if (!row) {
      return notificationJson({ success: false, error: "Notification was not found." }, 404);
    }

    const attachmentResult = await env.DB.prepare(`
      SELECT id, filename, content_type, size_bytes
      FROM portal_notification_attachments
      WHERE notification_id = ? AND account_number = ?
      ORDER BY id ASC
    `).bind(notificationId, account).all();

    const attachments = (attachmentResult?.results || []).map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename || "Attachment",
      content_type: attachment.content_type || "application/octet-stream",
      size_bytes: Number(attachment.size_bytes || 0),
      url: `/api/customer/notification-attachments/${encodeURIComponent(attachment.id)}`
    }));

    return notificationJson({
      success: true,
      authenticated: true,
      notification: {
        id: row.id,
        title: row.title || "Wooten Oil",
        message: row.message || "",
        created_at: row.created_at,
        read: !!row.read_at,
        sender_name: "Wooten Oil Co Inc.",
        sender_email: "support@wootenoil.com",
        recipient_email: String(customer.email || ""),
        action_type: String(row.action_type || ""),
        action_id: row.action_id == null ? null : Number(row.action_id),
        document_title: String(row.document_title || ""),
        document_filename: String(row.document_filename || ""),
        attachments
      }
    });
  } catch (error) {
    console.error("customerNotificationDetailGet failed", error);
    return notificationJson({
      success: false,
      error: "Notification could not be opened. " + String(error?.message || error)
    }, 500);
  }
}
__name(customerNotificationDetailGet, "customerNotificationDetailGet");

async function customerNotificationAttachmentGet({ request, env }) {
  try {
    if (!env.DB || !env.NOTIFICATION_ATTACHMENTS) {
      return new Response("Attachment storage is not configured.", { status: 503 });
    }

    const customer = await getCustomerFromSession(request, env);
    if (!customer) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const url = new URL(request.url);
    const idPart = url.pathname.split("/").filter(Boolean).pop() || "";
    const attachmentId = Number(idPart);
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
      return new Response("Attachment not found.", { status: 404 });
    }

    await ensureCustomerNotificationsTable(env);
    const account = normalizeNotificationAccount(customer.account_number);

    const row = await env.DB.prepare(`
      SELECT id, object_key, filename, content_type, size_bytes
      FROM portal_notification_attachments
      WHERE id = ? AND account_number = ?
      LIMIT 1
    `).bind(attachmentId, account).first();

    if (!row) {
      return new Response("Attachment not found.", { status: 404 });
    }

    const object = await env.NOTIFICATION_ATTACHMENTS.get(row.object_key);
    if (!object) {
      return new Response("Attachment file is unavailable.", { status: 404 });
    }

    const filename = notificationSafeFilename(row.filename);
    const disposition = notificationAttachmentDisposition(row.content_type);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", row.content_type || "application/octet-stream");
    headers.set(
      "Content-Disposition",
      `${disposition}; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Security-Policy", "default-src 'none'; sandbox");

    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    console.error("customerNotificationAttachmentGet failed", error);
    return new Response("Attachment could not be opened.", { status: 500 });
  }
}
__name(customerNotificationAttachmentGet, "customerNotificationAttachmentGet");

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

async function customerNotificationsClearPost({ request, env }) {
  try {
    if (!env.DB) {
      return notificationJson({ success: false, error: "Customer database is not configured." }, 503);
    }

    const customer = await getCustomerFromSession(request, env);
    if (!customer) {
      return notificationJson({ success: false, authenticated: false }, 401);
    }

    await ensureCustomerNotificationsTable(env);
    await ensurePortalDocumentLinksTable(env);
    const account = normalizeNotificationAccount(customer.account_number);

    const attachmentResult = await env.DB.prepare(`
      SELECT id, object_key
      FROM portal_notification_attachments
      WHERE account_number = ?
    `).bind(account).all();
    const attachments = attachmentResult?.results || [];

    await env.DB.prepare(`
      DELETE FROM portal_document_links
      WHERE account_number = ?
        AND attachment_id IN (
          SELECT id FROM portal_notification_attachments WHERE account_number = ?
        )
    `).bind(account, account).run();

    await env.DB.prepare(`
      DELETE FROM portal_notification_attachments
      WHERE account_number = ?
    `).bind(account).run();

    const deleted = await env.DB.prepare(`
      DELETE FROM portal_notifications
      WHERE account_number = ?
    `).bind(account).run();

    if (env.NOTIFICATION_ATTACHMENTS) {
      for (const attachment of attachments) {
        const key = String(attachment?.object_key || "").trim();
        if (!key) continue;
        try { await env.NOTIFICATION_ATTACHMENTS.delete(key); } catch (error) {
          console.error("Notification attachment cleanup failed", key, error);
        }
      }
    }

    return notificationJson({
      success: true,
      cleared: Number(deleted?.meta?.changes || deleted?.changes || 0)
    });
  } catch (error) {
    console.error("customerNotificationsClearPost failed", error);
    return notificationJson({
      success: false,
      error: String(error?.message || error)
    }, 500);
  }
}
__name(customerNotificationsClearPost, "customerNotificationsClearPost");

// worker.js

async function ensureGmailPortalSyncTables(env) {
  if (!env?.DB) throw new Error("Customer database is not configured.");
  await ensureCustomerNotificationsTable(env);
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS gmail_portal_sync (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gmail_message_id TEXT NOT NULL,
      account_number TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      notification_id INTEGER,
      synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(gmail_message_id, account_number)
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS gmail_portal_sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_checked_at TEXT,
      last_internal_date INTEGER NOT NULL DEFAULT 0,
      last_success_at TEXT,
      last_error TEXT
    )
  `).run();
  await env.DB.prepare(`
    INSERT INTO gmail_portal_sync_state
      (id,last_checked_at,last_internal_date,last_success_at,last_error)
    VALUES (1,NULL,0,NULL,'')
    ON CONFLICT(id) DO NOTHING
  `).run();
}
__name(ensureGmailPortalSyncTables,"ensureGmailPortalSyncTables");

function gmailSyncExtractEmails(value) {
  const matches=String(value||"").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
  return [...new Set(matches.map(v=>v.toLowerCase().trim()))];
}
__name(gmailSyncExtractEmails,"gmailSyncExtractEmails");

function gmailSyncDecode(data) {
  const s=String(data||"").replace(/-/g,"+").replace(/_/g,"/");
  if(!s) return "";
  try{
    const padded=s+"=".repeat((4-s.length%4)%4);
    const bin=atob(padded);
    return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)));
  }catch{return "";}
}
__name(gmailSyncDecode,"gmailSyncDecode");

function gmailSyncStripHtml(html) {
  return String(html||"")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/p>|<\/div>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/[ \t]+\n/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .replace(/[ \t]{2,}/g," ")
    .trim();
}
__name(gmailSyncStripHtml,"gmailSyncStripHtml");

function gmailSyncBody(payload) {
  let plain="",html="";
  const walk=part=>{
    if(!part) return;
    const mime=String(part.mimeType||"").toLowerCase();
    const data=part?.body?.data||"";
    if(data){
      const decoded=gmailSyncDecode(data);
      if(mime==="text/plain"&&!plain) plain=decoded;
      if(mime==="text/html"&&!html) html=decoded;
    }
    for(const child of part.parts||[]) walk(child);
  };
  walk(payload);
  return (plain.trim()||gmailSyncStripHtml(html)).slice(0,5000);
}
__name(gmailSyncBody,"gmailSyncBody");

function gmailSyncHeader(payload,name) {
  const found=(payload?.headers||[]).find(h=>String(h?.name||"").toLowerCase()===name.toLowerCase());
  return String(found?.value||"");
}
__name(gmailSyncHeader,"gmailSyncHeader");


function gmailSyncDecodeBytes(data) {
  const s=String(data||"").replace(/-/g,"+").replace(/_/g,"/");
  if(!s) return new Uint8Array();
  const padded=s+"=".repeat((4-s.length%4)%4);
  const bin=atob(padded);
  return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
__name(gmailSyncDecodeBytes,"gmailSyncDecodeBytes");

function gmailSyncCollectAttachmentParts(payload) {
  const found=[];
  const walk=part=>{
    if(!part) return;
    const filename=notificationSafeFilename(part?.filename||"");
    const mime=String(part?.mimeType||"application/octet-stream").toLowerCase().trim();
    const attachmentId=String(part?.body?.attachmentId||"").trim();
    const inlineData=String(part?.body?.data||"").trim();
    const size=Number(part?.body?.size||0);

    if(filename && filename!=="attachment" && (attachmentId||inlineData)){
      found.push({
        filename,
        content_type:mime||"application/octet-stream",
        attachment_id:attachmentId,
        inline_data:inlineData,
        size_bytes:Number.isFinite(size)?size:0
      });
    }
    for(const child of part.parts||[]) walk(child);
  };
  walk(payload);
  return found;
}
__name(gmailSyncCollectAttachmentParts,"gmailSyncCollectAttachmentParts");

async function gmailSyncLoadAttachments({message,accessToken}) {
  const parts=gmailSyncCollectAttachmentParts(message?.payload);
  const loaded=[];
  let totalBytes=0;

  for(const part of parts){
    if(loaded.length>=3) break;
    if(!notificationAllowedAttachmentType(part.content_type)) continue;
    if(part.size_bytes>5*1024*1024) continue;

    let bytes=new Uint8Array();

    if(part.inline_data){
      try{bytes=gmailSyncDecodeBytes(part.inline_data);}catch{bytes=new Uint8Array();}
    } else if(part.attachment_id){
      const ar=await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(part.attachment_id)}`,
        {headers:{Authorization:`Bearer ${accessToken}`}}
      );
      const ad=await ar.json().catch(()=>({}));
      if(!ar.ok || !ad?.data) continue;
      try{bytes=gmailSyncDecodeBytes(ad.data);}catch{bytes=new Uint8Array();}
    }

    if(!bytes.byteLength) continue;
    if(bytes.byteLength>5*1024*1024) continue;
    if(totalBytes+bytes.byteLength>10*1024*1024) continue;

    totalBytes+=bytes.byteLength;
    loaded.push({
      filename:part.filename,
      content_type:part.content_type,
      bytes
    });
  }

  return loaded;
}
__name(gmailSyncLoadAttachments,"gmailSyncLoadAttachments");

async function gmailSyncStoreNotificationAttachments(env,{notificationId,accountNumber,attachments}) {
  if(!attachments?.length) return [];
  if(!env.NOTIFICATION_ATTACHMENTS){
    throw new Error("Gmail attachment storage is not configured. Add the NOTIFICATION_ATTACHMENTS R2 binding.");
  }

  const saved=[];
  const storedKeys=[];

  try{
    for(const attachment of attachments){
      const objectKey=
        `notifications/${accountNumber}/${notificationId}/`+
        `${crypto.randomUUID()}-${notificationSafeFilename(attachment.filename)}`;

      await env.NOTIFICATION_ATTACHMENTS.put(objectKey,attachment.bytes,{
        httpMetadata:{
          contentType:attachment.content_type,
          contentDisposition:
            `${notificationAttachmentDisposition(attachment.content_type)}; filename="${notificationSafeFilename(attachment.filename).replace(/"/g,"")}"`
        },
        customMetadata:{
          account_number:String(accountNumber),
          notification_id:String(notificationId),
          filename:notificationSafeFilename(attachment.filename),
          source:"gmail-sync"
        }
      });
      storedKeys.push(objectKey);

      const row=await env.DB.prepare(`
        INSERT INTO portal_notification_attachments
          (notification_id,account_number,object_key,filename,content_type,size_bytes,created_at)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
      `).bind(
        notificationId,
        accountNumber,
        objectKey,
        notificationSafeFilename(attachment.filename),
        attachment.content_type,
        attachment.bytes.byteLength
      ).run();

      saved.push({
        id:row?.meta?.last_row_id||row?.meta?.last_insert_rowid||null,
        filename:notificationSafeFilename(attachment.filename),
        content_type:attachment.content_type,
        size_bytes:attachment.bytes.byteLength
      });
    }
    return saved;
  }catch(error){
    for(const key of storedKeys){
      try{await env.NOTIFICATION_ATTACHMENTS.delete(key);}catch{}
    }
    try{
      await env.DB.prepare(`DELETE FROM portal_notification_attachments WHERE notification_id=?`)
        .bind(notificationId).run();
    }catch{}
    throw error;
  }
}
__name(gmailSyncStoreNotificationAttachments,"gmailSyncStoreNotificationAttachments");

async function syncGmailSentToPortal(env,options={}) {
  const force=options?.force===true;
  const maxMessages=Math.min(Math.max(Number(options?.maxMessages||50),1),100);
  if(!env?.DB) return {success:false,error:"Customer database is not configured."};

  await ensureGmailPortalSyncTables(env);
  const state=await env.DB.prepare(`
    SELECT last_checked_at,last_internal_date
    FROM gmail_portal_sync_state WHERE id=1
  `).first();

  const lastChecked=state?.last_checked_at?new Date(state.last_checked_at).getTime():0;
  if(!force&&lastChecked&&Date.now()-lastChecked<60000){
    return {success:true,skipped:true,reason:"Gmail was checked less than one minute ago."};
  }

  await env.DB.prepare(`
    UPDATE gmail_portal_sync_state SET last_checked_at=CURRENT_TIMESTAMP WHERE id=1
  `).run();

  try{
    const accessToken=await getGmailAccessToken(env);
    const listUrl=new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("maxResults",String(maxMessages));
    listUrl.searchParams.set("q","in:sent newer_than:2d");

    const lr=await fetch(listUrl.toString(),{headers:{Authorization:`Bearer ${accessToken}`}});
    const ld=await lr.json().catch(()=>({}));
    if(!lr.ok) throw new Error(ld?.error?.message||"Unable to read Gmail Sent messages.");

    let checked=0,matched=0,created=0,duplicates=0,unmatched=0,attachmentMessages=0,attachmentsFound=0;
    let newest=Number(state?.last_internal_date||0);
    const cutoff=newest>0?newest-120000:Date.now()-30*60*1000;

    for(const item of ld.messages||[]){
      const mr=await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,
        {headers:{Authorization:`Bearer ${accessToken}`}}
      );
      const m=await mr.json().catch(()=>({}));
      if(!mr.ok) continue;
      checked++;

      const internalDate=Number(m.internalDate||0);
      if(internalDate>newest) newest=internalDate;
      if(internalDate&&internalDate<cutoff) continue;

      const subject=(gmailSyncHeader(m.payload,"Subject")||"(No subject)").trim().slice(0,160);
      const body=gmailSyncBody(m.payload)||String(m.snippet||"").trim().slice(0,5000)||"(Email message)";

      /* Gmail messages need their binary attachments fetched separately.
         The previous sync only copied Subject + body, so portal notifications
         created from real email never had rows in portal_notification_attachments. */
      let gmailAttachments=[];
      try{
        gmailAttachments=await gmailSyncLoadAttachments({message:m,accessToken});
        if(gmailAttachments.length){
          attachmentMessages++;
          attachmentsFound+=gmailAttachments.length;
        }
      }catch(attachmentLoadError){
        console.error("Gmail attachment download skipped",attachmentLoadError);
        gmailAttachments=[];
      }

      const recipients=[...new Set([
        ...gmailSyncExtractEmails(gmailSyncHeader(m.payload,"To")),
        ...gmailSyncExtractEmails(gmailSyncHeader(m.payload,"Cc")),
        ...gmailSyncExtractEmails(gmailSyncHeader(m.payload,"Bcc"))
      ])];

      let any=false;
      for(const email of recipients){
        const rows=await env.DB.prepare(`
          SELECT account_number,account_name,email
          FROM customers
          WHERE lower(trim(email))=lower(trim(?))
            AND (account_status IS NULL OR lower(account_status)='active')
        `).bind(email).all();

        for(const c of rows?.results||[]){
          any=true;
          const account=normalizeNotificationAccount(c.account_number);
          if(!account) continue;
          matched++;

          const exists=await env.DB.prepare(`
            SELECT id FROM gmail_portal_sync
            WHERE gmail_message_id=? AND account_number=? LIMIT 1
          `).bind(m.id,account).first();

          if(exists){duplicates++;continue;}

          const ins=await env.DB.prepare(`
            INSERT INTO portal_notifications
              (account_number,title,message,email_sent,email_id,created_at)
            VALUES (?,?,?,?,?,?)
          `).bind(
            account,subject,body,1,`gmail:${m.id}`,
            internalDate?new Date(internalDate).toISOString():new Date().toISOString()
          ).run();

          const notificationId=ins?.meta?.last_row_id||ins?.meta?.last_insert_rowid||null;

          if(notificationId && gmailAttachments.length){
            try{
              await gmailSyncStoreNotificationAttachments(env,{
                notificationId,
                accountNumber:account,
                attachments:gmailAttachments
              });
            }catch(attachmentStoreError){
              /* Keep the notification itself even if one attachment cannot be stored.
                 This matches the existing Gmail sync behavior of not losing the email notification. */
              console.error("Gmail portal attachment storage failed",attachmentStoreError);
            }
          }

          await env.DB.prepare(`
            INSERT OR IGNORE INTO gmail_portal_sync
              (gmail_message_id,account_number,recipient_email,notification_id,synced_at)
            VALUES (?,?,?,?,CURRENT_TIMESTAMP)
          `).bind(m.id,account,email,notificationId).run();

          created++;
        }
      }
      if(!any) unmatched++;
    }

    await env.DB.prepare(`
      UPDATE gmail_portal_sync_state
      SET last_internal_date=?,last_success_at=CURRENT_TIMESTAMP,last_error=''
      WHERE id=1
    `).bind(newest).run();

    return {
      success:true,checked,matched_customers:matched,
      notifications_created:created,duplicates,unmatched_messages:unmatched,
      gmail_messages_with_attachments:attachmentMessages,
      attachments_found:attachmentsFound
    };
  }catch(error){
    const msg=String(error?.message||error);
    try{
      await env.DB.prepare(`UPDATE gmail_portal_sync_state SET last_error=? WHERE id=1`)
        .bind(msg.slice(0,1000)).run();
    }catch{}
    console.error("Gmail portal synchronization failed",error);
    return {success:false,error:msg};
  }
}
__name(syncGmailSentToPortal,"syncGmailSentToPortal");

async function adminGmailPortalSync({request,env}) {
  const supplied=request.headers.get("X-Admin-Key")||"";
  if(!env.ADMIN_IMPORT_KEY||supplied!==env.ADMIN_IMPORT_KEY)
    return notificationJson({success:false,error:"Unauthorized."},401);
  const result=await syncGmailSentToPortal(env,{force:true,maxMessages:100});
  return notificationJson(result,result.success===false?500:200);
}
__name(adminGmailPortalSync,"adminGmailPortalSync");

async function adminGmailPortalSyncStatus({request,env}) {
  const supplied=request.headers.get("X-Admin-Key")||"";
  if(!env.ADMIN_IMPORT_KEY||supplied!==env.ADMIN_IMPORT_KEY)
    return notificationJson({success:false,error:"Unauthorized."},401);

  await ensureGmailPortalSyncTables(env);
  const state=await env.DB.prepare(`
    SELECT last_checked_at,last_success_at,last_error
    FROM gmail_portal_sync_state WHERE id=1
  `).first();
  const count=await env.DB.prepare(`SELECT COUNT(*) AS total FROM gmail_portal_sync`).first();

  return notificationJson({
    success:true,
    last_checked_at:state?.last_checked_at||null,
    last_success_at:state?.last_success_at||null,
    last_error:state?.last_error||"",
    synced_notifications:Number(count?.total||0)
  });
}
__name(adminGmailPortalSyncStatus,"adminGmailPortalSyncStatus");



async function adminCustomerOnlineDeactivate({ request, env }) {
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({
        success: false,
        error: "Customer database is not configured."
      }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    const supplied = request.headers.get("X-Admin-Key") || "";
    if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
      return new Response(JSON.stringify({
        success: false,
        error: "Unauthorized."
      }), {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid request."
      }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    const raw = String(body?.account_number || body?.accountNumber || "").replace(/\D/g, "");
    const account = raw ? raw.padStart(7, "0") : "";
    if (!account) {
      return new Response(JSON.stringify({
        success: false,
        error: "Customer Number is required."
      }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    const customer = await env.DB.prepare(`
      SELECT id, account_number, account_name, password_hash
      FROM customers
      WHERE account_number = ?
      LIMIT 1
    `).bind(account).first();

    if (!customer) {
      return new Response(JSON.stringify({
        success: false,
        error: "Customer was not found."
      }), {
        status: 404,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    if (!String(customer.password_hash || "").trim()) {
      return new Response(JSON.stringify({
        success: true,
        already_deactivated: true,
        account_number: customer.account_number,
        account_name: customer.account_name,
        message: "This customer's online account is already not activated."
      }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    /* Only remove WEBSITE LOGIN access. Do not alter account_status,
       balances, email, customer number, or accounting data. */
    await env.DB.prepare(`
      UPDATE customers
      SET
        password_hash = NULL,
        must_change_password = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(customer.id).run();

    /* Immediately sign out every active customer portal session. */
    try {
      await env.DB.prepare(`
        DELETE FROM customer_sessions
        WHERE customer_id = ?
      `).bind(customer.id).run();
    } catch (error) {
      console.error("customer session cleanup during online deactivation failed", error);
    }

    /* Invalidate any unused password-reset codes/tokens. */
    try {
      await env.DB.prepare(`
        UPDATE password_reset_tokens
        SET used_at = CURRENT_TIMESTAMP
        WHERE customer_id = ?
          AND used_at IS NULL
      `).bind(customer.id).run();
    } catch (error) {
      console.error("password reset cleanup during online deactivation failed", error);
    }

    /* Invalidate old activation codes so a fresh code is required. */
    try {
      await env.DB.prepare(`
        UPDATE customer_activation_codes
        SET used_at = CURRENT_TIMESTAMP
        WHERE customer_id = ?
          AND used_at IS NULL
      `).bind(customer.id).run();
    } catch (error) {
      console.error("activation code cleanup during online deactivation failed", error);
    }

    return new Response(JSON.stringify({
      success: true,
      account_number: customer.account_number,
      account_name: customer.account_name,
      online_activated: false,
      message: "Online account deactivated."
    }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("adminCustomerOnlineDeactivate failed", error);
    return new Response(JSON.stringify({
      success: false,
      error: "Could not deactivate the online account. " + String(error?.message || error)
    }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
__name(adminCustomerOnlineDeactivate, "adminCustomerOnlineDeactivate");

async function ensureAdminContactPreferencesTable(env) {
  if (!env?.DB) throw new Error("Customer database is not configured.");
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_customer_contact_preferences (
      account_number TEXT PRIMARY KEY,
      email_enabled INTEGER NOT NULL DEFAULT 1,
      sms_enabled INTEGER NOT NULL DEFAULT 1,
      portal_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}
__name(ensureAdminContactPreferencesTable, "ensureAdminContactPreferencesTable");

async function adminCustomerContactPreferencesPost({ request, env }) {
  try {
    const supplied = request.headers.get("X-Admin-Key") || "";
    if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
      return notificationJson({ success: false, error: "Unauthorized." }, 401);
    }
    if (!env.DB) return notificationJson({ success: false, error: "Customer database is not configured." }, 503);

    let body = {};
    try { body = await request.json(); } catch {
      return notificationJson({ success: false, error: "Invalid request data." }, 400);
    }

    const account = normalizeNotificationAccount(body.account_number || "");
    const channel = String(body.channel || "").trim().toLowerCase();
    const enabled = body.enabled === true || body.enabled === 1;
    if (!account) return notificationJson({ success: false, error: "Customer Number is required." }, 400);
    if (!["email", "sms", "portal"].includes(channel)) {
      return notificationJson({ success: false, error: "Choose Email, Phone/SMS, or Portal." }, 400);
    }

    const customer = await env.DB.prepare(`
      SELECT account_number, account_name, email, phone
      FROM customers WHERE account_number = ? LIMIT 1
    `).bind(account).first();
    if (!customer) return notificationJson({ success: false, error: "Customer was not found." }, 404);
    if (channel === "email" && !String(customer.email || "").trim()) {
      return notificationJson({ success: false, error: "This customer does not have an email address." }, 400);
    }
    if (channel === "sms" && !String(customer.phone || "").trim()) {
      return notificationJson({ success: false, error: "This customer does not have a phone number." }, 400);
    }

    await ensureAdminContactPreferencesTable(env);
    await env.DB.prepare(`
      INSERT INTO admin_customer_contact_preferences
        (account_number, email_enabled, sms_enabled, portal_enabled, updated_at)
      VALUES (?, 1, 1, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(account_number) DO NOTHING
    `).bind(account).run();

    const column = channel === "email" ? "email_enabled" : channel === "sms" ? "sms_enabled" : "portal_enabled";
    await env.DB.prepare(`
      UPDATE admin_customer_contact_preferences
      SET ${column} = ?, updated_at = CURRENT_TIMESTAMP
      WHERE account_number = ?
    `).bind(enabled ? 1 : 0, account).run();

    return notificationJson({
      success: true,
      account_number: account,
      channel,
      enabled
    });
  } catch (error) {
    console.error("adminCustomerContactPreferencesPost failed", error);
    return notificationJson({ success: false, error: "Contact preference could not be updated. " + String(error?.message || error) }, 500);
  }
}
__name(adminCustomerContactPreferencesPost, "adminCustomerContactPreferencesPost");

async function adminCustomersDatabaseGet({ request, env }) {
  try {
    const supplied = request.headers.get("X-Admin-Key") || "";
    if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized." }), {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: "Customer database is not configured." }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    await ensureAdminContactPreferencesTable(env);
    const url = new URL(request.url);
    const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const pageSize = Math.max(10, Math.min(100, Number.parseInt(url.searchParams.get("page_size") || "50", 10) || 50));
    const search = String(url.searchParams.get("search") || "").trim().slice(0, 160);
    const email = String(url.searchParams.get("email") || "all");
    const phone = String(url.searchParams.get("phone") || "all");
    const online = String(url.searchParams.get("online") || "all");
    const status = String(url.searchParams.get("status") || "all");
    const sort = String(url.searchParams.get("sort") || "account_asc");

    const where = [];
    const args = [];

    if (search) {
      const q = `%${search}%`;
      where.push(`(
        account_number LIKE ? OR
        account_name LIKE ? OR
        email LIKE ? OR
        phone LIKE ? OR
        city LIKE ? OR
        state LIKE ? OR
        zip_code LIKE ?
      )`);
      args.push(q, q, q, q, q, q, q);
    }

    if (email === "with") {
      where.push(`email IS NOT NULL AND trim(email) <> ''`);
    } else if (email === "without") {
      where.push(`email IS NULL OR trim(email) = ''`);
    }

    if (phone === "with") {
      where.push(`phone IS NOT NULL AND trim(phone) <> ''`);
    } else if (phone === "without") {
      where.push(`phone IS NULL OR trim(phone) = ''`);
    }

    if (online === "activated") {
      where.push(`password_hash IS NOT NULL AND trim(password_hash) <> ''`);
    } else if (online === "not_activated") {
      where.push(`password_hash IS NULL OR trim(password_hash) = ''`);
    }

    if (status === "active") {
      where.push(`(account_status IS NULL OR trim(account_status) = '' OR lower(trim(account_status)) = 'active')`);
    } else if (status === "inactive") {
      where.push(`account_status IS NOT NULL AND trim(account_status) <> '' AND lower(trim(account_status)) <> 'active'`);
    }

    const sortSql = {
      account_asc: "account_number ASC",
      account_desc: "account_number DESC",
      name_asc: "account_name COLLATE NOCASE ASC, account_number ASC",
      name_desc: "account_name COLLATE NOCASE DESC, account_number ASC",
      balance_desc: "COALESCE(current_balance,0) DESC, account_number ASC",
      balance_asc: "COALESCE(current_balance,0) ASC, account_number ASC",
      updated_desc: "datetime(updated_at) DESC, account_number ASC"
    }[sort] || "account_number ASC";

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countRow = await env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM customers
      ${whereSql}
    `).bind(...args).first();

    const total = Number(countRow?.total || 0);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * pageSize;

    const result = await env.DB.prepare(`
      SELECT
        account_number,
        account_name,
        email,
        phone,
        city,
        state,
        zip_code,
        current_balance,
        aging_category_1,
        aging_category_2,
        aging_category_3,
        aging_category_4,
        account_status,
        COALESCE((SELECT p.email_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_email_enabled,
        COALESCE((SELECT p.sms_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_sms_enabled,
        COALESCE((SELECT p.portal_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_portal_enabled,
        CASE
          WHEN password_hash IS NOT NULL AND trim(password_hash) <> '' THEN 1
          ELSE 0
        END AS online_activated,
        updated_at
      FROM customers
      ${whereSql}
      ORDER BY ${sortSql}
      LIMIT ? OFFSET ?
    `).bind(...args, pageSize, offset).all();

    return new Response(JSON.stringify({
      success: true,
      read_only: true,
      page: safePage,
      page_size: pageSize,
      total,
      pages,
      customers: result?.results || []
    }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("adminCustomersDatabaseGet failed", error);
    return new Response(JSON.stringify({
      success: false,
      error: "Could not load customer database. " + String(error?.message || error)
    }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
__name(adminCustomersDatabaseGet, "adminCustomersDatabaseGet");


async function adminCustomerPaymentsDatabaseGet({request,env}){
  const supplied=request.headers.get("X-Admin-Key")||"";
  if(!env.ADMIN_IMPORT_KEY || supplied!==env.ADMIN_IMPORT_KEY){
    return json3({success:false,error:"Unauthorized."},401);
  }
  if(!env.DB) return json3({success:false,error:"Customer database is not configured."},503);

  try{
    await ensureCustomerPaymentsSchema(env);

    const url=new URL(request.url);
    const page=Math.max(1,parseInt(url.searchParams.get("page")||"1",10)||1);
    const pageSize=Math.min(100,Math.max(10,parseInt(url.searchParams.get("page_size")||"50",10)||50));
    const search=(url.searchParams.get("search")||"").trim().slice(0,200);
    const depType=(url.searchParams.get("deposit_type")||"all").trim().slice(0,100);
    const dateFrom=(url.searchParams.get("date_from")||"").trim().slice(0,10);
    const dateTo=(url.searchParams.get("date_to")||"").trim().slice(0,10);
    const amount=(url.searchParams.get("amount")||"all").trim();
    const sort=(url.searchParams.get("sort")||"posting_desc").trim();

    const where=[];
    const args=[];

    if(search){
      const q=`%${search.replace(/[%_]/g,m=>"\\"+m)}%`;
      where.push(`(
        account_number LIKE ? ESCAPE '\\'
        OR customer_name LIKE ? ESCAPE '\\'
        OR reference LIKE ? ESCAPE '\\'
        OR source_invoice_no LIKE ? ESCAPE '\\'
        OR deposit_no LIKE ? ESCAPE '\\'
        OR deposit_type LIKE ? ESCAPE '\\'
      )`);
      args.push(q,q,q,q,q,q);
    }

    if(depType && depType!=="all"){where.push(`deposit_type=?`);args.push(depType);}
    if(dateFrom){where.push(`COALESCE(NULLIF(posting_date,''),payment_date)>=?`);args.push(dateFrom);}
    if(dateTo){where.push(`COALESCE(NULLIF(posting_date,''),payment_date)<=?`);args.push(dateTo);}

    if(amount==="positive") where.push(`COALESCE(amount,0)>0`);
    else if(amount==="zero") where.push(`ABS(COALESCE(amount,0))<0.005`);
    else if(amount==="negative") where.push(`COALESCE(amount,0)<0`);

    const sortSql={
      posting_desc:`COALESCE(NULLIF(posting_date,''),payment_date) DESC,id DESC`,
      posting_asc:`COALESCE(NULLIF(posting_date,''),payment_date) ASC,id ASC`,
      customer_asc:`account_number ASC,COALESCE(NULLIF(posting_date,''),payment_date) DESC,id DESC`,
      customer_desc:`account_number DESC,COALESCE(NULLIF(posting_date,''),payment_date) DESC,id DESC`,
      amount_desc:`COALESCE(amount,0) DESC,id DESC`,
      amount_asc:`COALESCE(amount,0) ASC,id ASC`,
      check_asc:`reference COLLATE NOCASE ASC,id ASC`
    }[sort]||`COALESCE(NULLIF(posting_date,''),payment_date) DESC,id DESC`;

    const whereSql=where.length?`WHERE ${where.join(" AND ")}`:"";

    const countRow=await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM customer_payments ${whereSql}
    `).bind(...args).first();

    const total=Number(countRow?.total||0);
    const pages=Math.max(1,Math.ceil(total/pageSize));
    const safePage=Math.min(page,pages);
    const offset=(safePage-1)*pageSize;

    const result=await env.DB.prepare(`
      SELECT
        id,deposit_date,deposit_no,deposit_type,account_number,reference,
        posting_date,payment_date,customer_name,
        source_invoice_no AS invoice_no,amount,discount_amount,imported_at
      FROM customer_payments
      ${whereSql}
      ORDER BY ${sortSql}
      LIMIT ? OFFSET ?
    `).bind(...args,pageSize,offset).all();

    const types=await env.DB.prepare(`
      SELECT DISTINCT deposit_type
      FROM customer_payments
      WHERE deposit_type IS NOT NULL AND trim(deposit_type)<>''
      ORDER BY deposit_type COLLATE NOCASE ASC
      LIMIT 100
    `).all();

    return json3({
      success:true,
      read_only:true,
      page:safePage,
      page_size:pageSize,
      total,
      pages,
      payments:result?.results||[],
      deposit_types:(types?.results||[]).map(r=>String(r.deposit_type||"")).filter(Boolean)
    });
  }catch(error){
    console.error("adminCustomerPaymentsDatabaseGet failed",error);
    return json3({success:false,error:"Could not load customer payments database. "+String(error?.message||error)},500);
  }
}
__name(adminCustomerPaymentsDatabaseGet,"adminCustomerPaymentsDatabaseGet");



async function adminClearDatabasePost({request,env}){
  const supplied=request.headers.get("X-Admin-Key")||"";
  if(!env.ADMIN_IMPORT_KEY || supplied!==env.ADMIN_IMPORT_KEY){
    return json3({success:false,error:"Invalid Admin Import Key."},401);
  }
  if(!env.DB){
    return json3({success:false,error:"Customer database is not configured."},503);
  }

  let body;
  try{body=await request.json();}
  catch{return json3({success:false,error:"Invalid request."},400);}

  const database=String(body?.database||"").trim().toLowerCase();
  if(database!=="customers"&&database!=="payments"){
    return json3({success:false,error:"Unknown database selection."},400);
  }

  try{
    await ensureAdminImportMetadataSchema(env);

    if(database==="payments"){
      await ensureCustomerPaymentsSchema(env);
      const count=await env.DB.prepare(`SELECT COUNT(*) AS total FROM customer_payments`).first();
      const deleted=Number(count?.total||0);

      await env.DB.batch([
        env.DB.prepare(`DELETE FROM customer_payments`),
        env.DB.prepare(`DELETE FROM admin_import_metadata WHERE import_type='payments'`)
      ]);

      return json3({success:true,database:"payments",deleted});
    }

    const exists=await env.DB.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='customers'
      LIMIT 1
    `).first();

    const passwordAction=String(body?.password_action||"keep").trim().toLowerCase();
    if(passwordAction!=="keep" && passwordAction!=="clear"){
      return json3({success:false,error:"Unknown customer password option."},400);
    }

    let deleted=0;
    let passwordsPreserved=false;

    if(exists?.name){
      const count=await env.DB.prepare(`SELECT COUNT(*) AS total FROM customers`).first();
      deleted=Number(count?.total||0);

      if(passwordAction==="clear"){
        await env.DB.batch([
          env.DB.prepare(`DELETE FROM customers`),
          env.DB.prepare(`DELETE FROM admin_import_metadata WHERE import_type='customers'`)
        ]);
      }else{
        // Preserve online-account/login fields in-place, but clear imported MAS 90 data.
        // We dynamically inspect the actual customers schema so this remains compatible
        // with older/newer portal versions.
        const info=await env.DB.prepare(`PRAGMA table_info(customers)`).all();
        const columns=(info?.results||[]).map(r=>String(r.name||"")).filter(Boolean);

        const preserveNames=new Set([
          "id",
          "account_number",
          "customer_no",
          "customer_number",
          "password_hash",
          "password_salt",
          "password",
          "password_set_at",
          "password_updated_at",
          "online_account",
          "online_account_enabled",
          "online_enabled",
          "account_active",
          "account_status",
          "login_enabled",
          "email_verified",
          "first_login",
          "first_login_completed",
          "activation_code",
          "activation_token",
          "password_reset_code",
          "password_reset_expires",
          "reset_code",
          "reset_expires",
          "created_at"
        ]);

        const preservePatterns=[
          /password/i,
          /login/i,
          /activation/i,
          /reset/i,
          /online.*account/i,
          /account.*online/i
        ];

        const clearable=columns.filter(name=>{
          const lower=name.toLowerCase();
          if(preserveNames.has(lower)) return false;
          if(preservePatterns.some(rx=>rx.test(name))) return false;
          if(lower==="account_number" || lower==="customerno") return false;
          return true;
        });

        if(clearable.length){
          const assignments=clearable.map(name=>{
            const safe=`"${name.replace(/"/g,'""')}"`;
            // Numeric MAS90 values should reset to zero, text/date values to blank.
            const infoRow=(info?.results||[]).find(r=>String(r.name||"")===name);
            const type=String(infoRow?.type||"").toUpperCase();
            const numeric=/(INT|REAL|NUM|DEC|DOUBLE|FLOAT)/.test(type);
            return `${safe}=${numeric?"0":"''"}`;
          }).join(",");

          await env.DB.prepare(`UPDATE customers SET ${assignments}`).run();
        }

        await env.DB.prepare(`DELETE FROM admin_import_metadata WHERE import_type='customers'`).run();
        passwordsPreserved=true;
      }
    }else{
      await env.DB.prepare(`DELETE FROM admin_import_metadata WHERE import_type='customers'`).run();
    }

    return json3({
      success:true,
      database:"customers",
      deleted,
      passwords_preserved:passwordsPreserved,
      password_action:passwordAction
    });
  }catch(error){
    console.error("adminClearDatabasePost failed",error);
    return json3({success:false,error:"Database could not be cleared. "+String(error?.message||error)},500);
  }
}
__name(adminClearDatabasePost,"adminClearDatabasePost");


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

async function ensureCustomerDocumentsTable(env){
  if(!env.DB) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS portal_customer_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_number TEXT NOT NULL,
      document_type TEXT NOT NULL,
      title TEXT NOT NULL,
      document_date TEXT,
      object_key TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'application/pdf',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_portal_customer_documents_account_date
    ON portal_customer_documents(account_number, document_date, created_at, id)
  `).run();
}
__name(ensureCustomerDocumentsTable,"ensureCustomerDocumentsTable");

function customerDocumentType(value){
  const v=String(value||"").trim().toLowerCase();
  return v==="invoice" ? "invoice" : "statement";
}
__name(customerDocumentType,"customerDocumentType");

function customerDocumentTitle(type,title,filename){
  const clean=String(title||"").trim().slice(0,160);
  if(clean) return clean;
  const base=notificationSafeFilename(filename||"document.pdf").replace(/\.pdf$/i,"");
  return type==="invoice" ? `Invoice ${base}` : `Statement ${base}`;
}
__name(customerDocumentTitle,"customerDocumentTitle");

async function adminCustomerDocumentsGet({request,env}){
  try{
    const supplied=request.headers.get("X-Admin-Key")||"";
    if(!env.ADMIN_IMPORT_KEY || supplied!==env.ADMIN_IMPORT_KEY){
      return notificationJson({success:false,error:"Unauthorized."},401);
    }
    if(!env.DB) return notificationJson({success:false,error:"Customer database is not configured."},503);

    await ensureCustomerDocumentsTable(env);
    const url=new URL(request.url);
    const account=normalizeNotificationAccount(url.searchParams.get("account_number")||"");
    if(!account) return notificationJson({success:false,error:"Enter a valid Customer Number."},400);

    const customer=await env.DB.prepare(`
      SELECT account_number,account_name,email
      FROM customers WHERE account_number=? LIMIT 1
    `).bind(account).first();
    if(!customer) return notificationJson({success:false,error:"Customer was not found."},404);

    const rows=await env.DB.prepare(`
      SELECT id,document_type,title,document_date,filename,content_type,size_bytes,created_at
      FROM portal_customer_documents
      WHERE account_number=?
      ORDER BY COALESCE(document_date,created_at) DESC,id DESC
      LIMIT 100
    `).bind(account).all();

    return notificationJson({
      success:true,
      customer,
      documents:rows?.results||[]
    });
  }catch(error){
    console.error("adminCustomerDocumentsGet failed",error);
    return notificationJson({success:false,error:"Customer documents could not be loaded."},500);
  }
}
__name(adminCustomerDocumentsGet,"adminCustomerDocumentsGet");

async function adminCustomerDocumentUpload({request,env}){
  try{
    const supplied=request.headers.get("X-Admin-Key")||"";
    if(!env.ADMIN_IMPORT_KEY || supplied!==env.ADMIN_IMPORT_KEY){
      return notificationJson({success:false,error:"Unauthorized."},401);
    }
    if(!env.DB) return notificationJson({success:false,error:"Customer database is not configured."},503);
    if(!env.NOTIFICATION_ATTACHMENTS){
      return notificationJson({success:false,error:"Document storage is not configured. Add the NOTIFICATION_ATTACHMENTS R2 binding."},503);
    }

    const form=await request.formData();
    const account=normalizeNotificationAccount(form.get("account_number")||"");
    const type=customerDocumentType(form.get("document_type"));
    const documentDate=String(form.get("document_date")||"").trim().slice(0,10);
    const file=form.get("file");
    const rawTitle=String(form.get("title")||"").trim();

    if(!account) return notificationJson({success:false,error:"Enter a valid Customer Number."},400);
    const customer=await env.DB.prepare(`SELECT account_number,account_name FROM customers WHERE account_number=? LIMIT 1`).bind(account).first();
    if(!customer) return notificationJson({success:false,error:"Customer was not found."},404);

    if(!(file instanceof File)) return notificationJson({success:false,error:"Choose a PDF statement or invoice."},400);
    const filename=notificationSafeFilename(file.name||"document.pdf");
    const contentType=String(file.type||"application/pdf").toLowerCase();
    if(contentType!=="application/pdf" && !filename.toLowerCase().endsWith(".pdf")){
      return notificationJson({success:false,error:"Statements and invoices must be PDF files."},400);
    }
    if(file.size<=0) return notificationJson({success:false,error:"The selected PDF is empty."},400);
    if(file.size>10*1024*1024) return notificationJson({success:false,error:"PDF files must be 10 MB or smaller."},413);

    await ensureCustomerDocumentsTable(env);
    const title=customerDocumentTitle(type,rawTitle,filename);
    const objectKey=`customer-documents/${account}/${crypto.randomUUID()}-${filename}`;

    await env.NOTIFICATION_ATTACHMENTS.put(objectKey,file.stream(),{
      httpMetadata:{
        contentType:"application/pdf",
        contentDisposition:`inline; filename="${filename.replace(/"/g,"")}"`
      },
      customMetadata:{
        account_number:account,
        document_type:type,
        filename
      }
    });

    try{
      const result=await env.DB.prepare(`
        INSERT INTO portal_customer_documents
          (account_number,document_type,title,document_date,object_key,filename,content_type,size_bytes,created_at)
        VALUES (?,?,?,?,?,?,?, ?,CURRENT_TIMESTAMP)
      `).bind(
        account,type,title,documentDate||null,objectKey,filename,"application/pdf",file.size
      ).run();

      const documentId=result?.meta?.last_row_id||result?.meta?.last_insert_rowid||null;

      /* Create a portal notification linked to the Statements & Invoices screen. */
      await ensureCustomerNotificationsTable(env);
      const notificationTitle=type==="invoice" ? "New Invoice Available" : "New Statement Available";
      const notificationMessage=type==="invoice"
        ? `${title} is now available in your Statements & Invoices.`
        : `${title} is now available in your Statements & Invoices.`;

      const notificationResult=await env.DB.prepare(`
        INSERT INTO portal_notifications
          (account_number,title,message,email_sent,action_type,action_id,created_at)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
      `).bind(
        account,
        notificationTitle,
        notificationMessage,
        0,
        "customer_documents",
        documentId
      ).run();

      return notificationJson({
        success:true,
        message:`${type==="invoice"?"Invoice":"Statement"} uploaded successfully and the customer was notified.`,
        notification_id:notificationResult?.meta?.last_row_id||notificationResult?.meta?.last_insert_rowid||null,
        document:{
          id:documentId,
          account_number:account,
          document_type:type,
          title,
          document_date:documentDate||null,
          filename,
          size_bytes:file.size
        }
      });
    }catch(error){
      try{await env.NOTIFICATION_ATTACHMENTS.delete(objectKey);}catch{}
      throw error;
    }
  }catch(error){
    console.error("adminCustomerDocumentUpload failed",error);
    return notificationJson({success:false,error:"Document upload failed. "+String(error?.message||error)},500);
  }
}
__name(adminCustomerDocumentUpload,"adminCustomerDocumentUpload");


async function adminCustomerDocumentFileGet({request,env}){
  try{
    const supplied=request.headers.get("X-Admin-Key")||"";
    if(!env.ADMIN_IMPORT_KEY || supplied!==env.ADMIN_IMPORT_KEY){
      return new Response("Unauthorized.",{status:401});
    }
    if(!env.DB || !env.NOTIFICATION_ATTACHMENTS){
      return new Response("Document storage is not configured.",{status:503});
    }

    const url=new URL(request.url);
    const parts=url.pathname.split("/").filter(Boolean);
    const id=Number(parts[parts.length-2]);
    if(!Number.isInteger(id)||id<=0) return new Response("Document not found.",{status:404});

    await ensureCustomerDocumentsTable(env);
    const row=await env.DB.prepare(`
      SELECT id,object_key,filename,content_type,size_bytes
      FROM portal_customer_documents
      WHERE id=?
      LIMIT 1
    `).bind(id).first();

    if(!row) return new Response("Document not found.",{status:404});
    const object=await env.NOTIFICATION_ATTACHMENTS.get(row.object_key);
    if(!object) return new Response("Document file is unavailable.",{status:404});

    const filename=notificationSafeFilename(row.filename||"document.pdf");
    const headers=new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type","application/pdf");
    headers.set("Content-Disposition",`inline; filename="${filename.replace(/"/g,"")}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    headers.set("Cache-Control","private, no-store");
    headers.set("X-Content-Type-Options","nosniff");
    return new Response(object.body,{status:200,headers});
  }catch(error){
    console.error("adminCustomerDocumentFileGet failed",error);
    return new Response("Document could not be opened.",{status:500});
  }
}
__name(adminCustomerDocumentFileGet,"adminCustomerDocumentFileGet");

async function customerDocumentsGet({request,env}){
  try{
    if(!env.DB) return notificationJson({success:false,error:"Customer database is not configured."},503);
    const customer=await getCustomerFromSession(request,env);
    if(!customer) return notificationJson({success:false,error:"Please sign in to view statements and invoices."},401);

    await ensureCustomerDocumentsTable(env);
    const account=normalizeNotificationAccount(customer.account_number);
    const rows=await env.DB.prepare(`
      SELECT id,document_type,title,document_date,filename,size_bytes,created_at
      FROM portal_customer_documents
      WHERE account_number=?
      ORDER BY COALESCE(document_date,created_at) DESC,id DESC
      LIMIT 100
    `).bind(account).all();

    return notificationJson({success:true,documents:rows?.results||[]});
  }catch(error){
    console.error("customerDocumentsGet failed",error);
    return notificationJson({success:false,error:"Statements and invoices could not be loaded."},500);
  }
}
__name(customerDocumentsGet,"customerDocumentsGet");

async function customerDocumentFileGet({request,env}){
  try{
    if(!env.DB || !env.NOTIFICATION_ATTACHMENTS){
      return new Response("Document storage is not configured.",{status:503});
    }
    const customer=await getCustomerFromSession(request,env);
    if(!customer) return new Response("Unauthorized.",{status:401});

    const url=new URL(request.url);
    const parts=url.pathname.split("/").filter(Boolean);
    const id=Number(parts[parts.length-2]);
    if(!Number.isInteger(id)||id<=0) return new Response("Document not found.",{status:404});

    await ensureCustomerDocumentsTable(env);
    const account=normalizeNotificationAccount(customer.account_number);
    const row=await env.DB.prepare(`
      SELECT id,object_key,filename,content_type,size_bytes
      FROM portal_customer_documents
      WHERE id=? AND account_number=?
      LIMIT 1
    `).bind(id,account).first();

    if(!row) return new Response("Document not found.",{status:404});
    const object=await env.NOTIFICATION_ATTACHMENTS.get(row.object_key);
    if(!object) return new Response("Document file is unavailable.",{status:404});

    const filename=notificationSafeFilename(row.filename||"document.pdf");
    const headers=new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type","application/pdf");
    headers.set("Content-Disposition",`inline; filename="${filename.replace(/"/g,"")}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    headers.set("Cache-Control","private, no-store");
    headers.set("X-Content-Type-Options","nosniff");
    headers.set("Content-Length",String(Number(object.size||row.size_bytes||0)));
    return new Response(object.body,{status:200,headers});
  }catch(error){
    console.error("customerDocumentFileGet failed",error);
    return new Response("Document could not be opened.",{status:500});
  }
}
__name(customerDocumentFileGet,"customerDocumentFileGet");



function statementNumber(value){
  const n=Number(String(value??"").replace(/[$,]/g,""));
  return Number.isFinite(n)?n:0;
}
__name(statementNumber,"statementNumber");

function statementMoney(value){
  const n=statementNumber(value);
  const abs=Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",");
  return `${n<0?"-":""}$${abs}`;
}
__name(statementMoney,"statementMoney");

function statementPdfSafeText(value){
  return String(value??"")
    .replace(/[^\x20-\x7E]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
__name(statementPdfSafeText,"statementPdfSafeText");

function statementPdfEscape(value){
  return statementPdfSafeText(value)
    .replace(/\\/g,"\\\\")
    .replace(/\(/g,"\\(")
    .replace(/\)/g,"\\)");
}
__name(statementPdfEscape,"statementPdfEscape");

function statementPdfDate(value){
  const raw=String(value||"").trim();
  let d;
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
    const [y,m,day]=raw.split("-").map(Number);
    d=new Date(Date.UTC(y,m-1,day,12,0,0));
  }else{
    d=new Date(raw||Date.now());
  }
  if(Number.isNaN(d.getTime())) d=new Date();
  return d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"});
}
__name(statementPdfDate,"statementPdfDate");

function statementPdfShortDate(value){
  const raw=String(value||"").trim();
  let d;
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
    const [y,m,day]=raw.split("-").map(Number);
    d=new Date(Date.UTC(y,m-1,day,12,0,0));
  }else{
    d=new Date(raw||Date.now());
  }
  if(Number.isNaN(d.getTime())) d=new Date();
  const y=d.getUTCFullYear();
  const m=String(d.getUTCMonth()+1).padStart(2,"0");
  const day=String(d.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
__name(statementPdfShortDate,"statementPdfShortDate");

function statementCustomerAddress(customer){
  const street=[customer?.address1,customer?.address2,customer?.address3]
    .map(statementPdfSafeText).filter(Boolean).join(", ");
  const cityState=[statementPdfSafeText(customer?.city),statementPdfSafeText(customer?.state)]
    .filter(Boolean).join(", ");
  const cityLine=[cityState,statementPdfSafeText(customer?.zip_code)].filter(Boolean).join(" ");
  return [street,cityLine].filter(Boolean);
}
__name(statementCustomerAddress,"statementCustomerAddress");

function statementBuildPdf(customer,statementDate){
  const current=statementNumber(customer?.current_balance);
  const age1=statementNumber(customer?.aging_category_1);
  const age2=statementNumber(customer?.aging_category_2);
  const age3=statementNumber(customer?.aging_category_3);
  const age4=statementNumber(customer?.aging_category_4);
  const previous=age1+age2+age3+age4;
  const total=current+previous;

  const commands=[];
  const add=(s)=>commands.push(s);
  const rgb=(r,g,b)=>`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;

  const navy=[0.055,0.145,0.235];
  const blue=[0.12,0.29,0.43];
  const red=[0.78,0.11,0.16];
  const slate=[0.32,0.38,0.44];
  const light=[0.965,0.975,0.983];
  const line=[0.84,0.88,0.91];
  const white=[1,1,1];

  function text(x,y,size,value,bold=false,color=navy){
    add(`BT /${bold?"F2":"F1"} ${size} Tf ${rgb(...color)} rg ${x} ${y} Td (${statementPdfEscape(value)}) Tj ET`);
  }
  function rect(x,y,w,h,fillColor,strokeColor=null,width=1){
    if(fillColor) add(`${rgb(...fillColor)} rg ${x} ${y} ${w} ${h} re f`);
    if(strokeColor) add(`${width} w ${rgb(...strokeColor)} RG ${x} ${y} ${w} ${h} re S`);
  }
  function lineTo(x1,y1,x2,y2,color=line,width=1){
    add(`${width} w ${rgb(...color)} RG ${x1} ${y1} m ${x2} ${y2} l S`);
  }
  function rightText(right,y,size,value,bold=false,color=navy){
    const s=statementPdfSafeText(value);
    const avg=(bold?0.56:0.52)*size;
    text(Math.max(42,right-s.length*avg),y,size,s,bold,color);
  }

  // Header
  rect(0,700,612,92,navy);
  rect(0,696,612,4,red);
  text(42,751,22,"WOOTEN OIL CO INC.",true,white);
  text(42,730,10,"513 East Sanford Avenue, Covington, TN 38019",false,[0.88,0.92,0.96]);
  text(42,714,9.5,"(901) 476-2684  |  support@wootenoil.com",false,[0.88,0.92,0.96]);
  rightText(548,750,20,"ACCOUNT STATEMENT",true,white);

  // Statement meta
  text(42,657,13,"Statement Date",true,slate);
  text(42,638,12,statementPdfDate(statementDate),false,navy);
  rightText(570,657,10,"Customer #",true,slate);
  rightText(570,638,12,statementPdfSafeText(customer?.account_number)||"-",true,navy);

  // Customer box
  rect(42,552,528,64,light,line,0.8);
  text(56,592,10,"BILL TO",true,slate);
  text(56,574,13,statementPdfSafeText(customer?.account_name)||"Customer",true,navy);
  const address=statementCustomerAddress(customer);
  if(address[0]) text(300,590,10,address[0],false,slate);
  if(address[1]) text(300,573,10,address[1],false,slate);

  // Summary heading
  text(42,522,15,"Account Summary",true,navy);
  text(42,505,9.5,"Balances shown reflect the latest information available in the Wooten Oil customer portal.",false,slate);

  // Summary cards
  const cardY=438, cardH=52, cardW=168, gap=12;
  rect(42,cardY,cardW,cardH,[0.94,0.96,0.98],line,0.8);
  rect(42+cardW+gap,cardY,cardW,cardH,[0.975,0.978,0.982],line,0.8);
  rect(42+(cardW+gap)*2,cardY,cardW,cardH,[0.94,0.96,0.98],line,0.8);

  text(55,472,8.5,"CURRENT BALANCE",true,slate);
  text(55,449,18,statementMoney(current),true,navy);

  text(55+cardW+gap,472,8.5,"PREVIOUS BALANCE",true,slate);
  text(55+cardW+gap,449,18,statementMoney(previous),true,previous>0?red:navy);

  text(55+(cardW+gap)*2,472,8.5,"TOTAL BALANCE",true,slate);
  text(55+(cardW+gap)*2,449,18,statementMoney(total),true,navy);

  // Aging table
  text(42,420,15,"Aging Breakdown",true,navy);
  text(42,404,9.5,"Previous Balance is the total of all 31+ day aging categories.",false,slate);

  const tableX=42, tableY=205, tableW=528, rowH=27;
  rect(tableX,tableY+rowH*6,tableW,rowH,navy);
  text(56,tableY+rowH*6+9,9,"AGING PERIOD",true,white);
  rightText(556,tableY+rowH*6+9,9,"BALANCE",true,white);

  const rows=[
    ["Current (0-30 Days)",current],
    ["31-60 Days",age1],
    ["61-90 Days",age2],
    ["91-120 Days",age3],
    ["120+ Days",age4],
    ["Previous Balance (31+ Days)",previous]
  ];
  rows.forEach((row,idx)=>{
    const y=tableY+rowH*(5-idx);
    rect(tableX,y,tableW,rowH,idx%2===0?[0.985,0.989,0.992]:white,line,0.5);
    text(56,y+9,9.5,row[0],idx===5,idx===5?navy:slate);
    rightText(556,y+9,10,statementMoney(row[1]),idx===5,idx===5?navy:slate);
  });

  // Total row
  rect(tableX,tableY-rowH,tableW,rowH,[0.94,0.96,0.98],navy,0.8);
  text(56,tableY-rowH+9,10.5,"TOTAL BALANCE",true,navy);
  rightText(556,tableY-rowH+9,12,statementMoney(total),true,navy);

  // Payment/info note
  rect(42,112,528,54,[1.0,0.975,0.91],[0.91,0.78,0.45],0.8);
  text(56,145,9.5,"PAYMENT NOTICE",true,[0.43,0.30,0.08]);
  text(56,128,9,"Payments submitted through the Wooten Oil Customer Portal may take up to",false,[0.43,0.30,0.08]);
  text(56,115,9,"24 business hours to appear on your account.",false,[0.43,0.30,0.08]);

  // Footer
  lineTo(42,82,570,82,line,0.7);
  text(42,63,8.5,"Wooten Oil Co Inc.  |  West Tennessee Petroleum Delivery",false,slate);
  rightText(570,63,8.5,"Thank you for your business.",false,slate);

  const stream=commands.join("\n");
  const objects=[];
  objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
  objects[2]="<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>";
  objects[4]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[5]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[6]=`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;

  let pdf="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets=[0];
  for(let i=1;i<=6;i++){
    offsets[i]=new TextEncoder().encode(pdf).length;
    pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset=new TextEncoder().encode(pdf).length;
  pdf+="xref\n0 7\n";
  pdf+="0000000000 65535 f \n";
  for(let i=1;i<=6;i++){
    pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  }
  pdf+=`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}
__name(statementBuildPdf,"statementBuildPdf");

function statementBytesToBase64(bytes){
  let binary="";
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+chunk)));
  }
  return btoa(binary);
}
__name(statementBytesToBase64,"statementBytesToBase64");

async function adminStatementCustomersGet({request,env}){
  try{
    const supplied=request.headers.get("X-Admin-Key")||"";
    if(!env.ADMIN_IMPORT_KEY || supplied!==env.ADMIN_IMPORT_KEY){
      return notificationJson({success:false,error:"Unauthorized."},401);
    }
    if(!env.DB) return notificationJson({success:false,error:"Customer database is not configured."},503);

    await ensureAdminContactPreferencesTable(env);
    const result=await env.DB.prepare(`
      SELECT
        account_number,account_name,email,phone,
        address1,address2,address3,city,state,zip_code,
        current_balance,
        aging_category_1,aging_category_2,aging_category_3,aging_category_4,
        account_status,
        COALESCE((SELECT p.email_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_email_enabled,
        COALESCE((SELECT p.sms_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_sms_enabled,
        COALESCE((SELECT p.portal_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_portal_enabled,
        CASE WHEN password_hash IS NOT NULL AND trim(password_hash)<>'' THEN 1 ELSE 0 END AS online_activated
      FROM customers
      ORDER BY account_name COLLATE NOCASE ASC,account_number ASC
      LIMIT 5000
    `).all();

    const customers=(result?.results||[]).map(c=>{
      const current=statementNumber(c.current_balance);
      const previous=
        statementNumber(c.aging_category_1)+
        statementNumber(c.aging_category_2)+
        statementNumber(c.aging_category_3)+
        statementNumber(c.aging_category_4);
      return {
        account_number:c.account_number,
        account_name:c.account_name||"",
        email:c.email||"",
        phone:c.phone||"",
        address1:c.address1||"",
        address2:c.address2||"",
        address3:c.address3||"",
        city:c.city||"",
        state:c.state||"",
        zip_code:c.zip_code||"",
        current_balance:current,
        previous_balance:previous,
        total_balance:current+previous,
        contact_email_enabled:Number(c.contact_email_enabled)!==0,
        contact_sms_enabled:Number(c.contact_sms_enabled)!==0,
        contact_portal_enabled:Number(c.contact_portal_enabled)!==0,
        online_activated:!!c.online_activated,
        account_status:c.account_status||""
      };
    });

    return notificationJson({success:true,count:customers.length,customers});
  }catch(error){
    console.error("adminStatementCustomersGet failed",error);
    return notificationJson({success:false,error:"Statement customer list could not be loaded."},500);
  }
}
__name(adminStatementCustomersGet,"adminStatementCustomersGet");

async function statementSendEmail(env,customer,pdfBytes,filename,statementDate,total){
  if(!customer?.email || !env.RESEND_API_KEY) return {sent:false,reason:!customer?.email?"no_email":"email_not_configured"};
  try{
    const fromAddress=String(env.FUEL_FROM_EMAIL||"support@wootenoil.com").trim();
    const dateLabel=statementPdfDate(statementDate);
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${env.RESEND_API_KEY}`,
        "Content-Type":"application/json",
        "User-Agent":"WootenOilCustomerPortal/1.0"
      },
      body:JSON.stringify({
        from:`Wooten Oil <${fromAddress}>`,
        to:[customer.email],
        subject:`Wooten Oil Account Statement - ${dateLabel}`,
        html:`
          <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.6">
            <h2 style="color:#0b2239;margin-bottom:8px">Wooten Oil Co Inc.</h2>
            <p>Hello ${notificationEscapeHtml(customer.account_name||"Customer")},</p>
            <p>Your Wooten Oil account statement for <strong>${notificationEscapeHtml(dateLabel)}</strong> is attached as a PDF.</p>
            <p><strong>Total Balance: ${notificationEscapeHtml(statementMoney(total))}</strong></p>
            <p style="margin-top:24px;color:#64748b;font-size:13px">The same statement is also available securely in your Wooten Oil Customer Portal.</p>
          </div>
        `,
        text:`Hello ${customer.account_name||"Customer"},\n\nYour Wooten Oil account statement for ${dateLabel} is attached as a PDF.\nTotal Balance: ${statementMoney(total)}\n\nThe same statement is also available securely in your Wooten Oil Customer Portal.`,
        attachments:[{
          filename,
          content:statementBytesToBase64(pdfBytes)
        }]
      })
    });
    const data=await response.json().catch(()=>({}));
    return response.ok?{sent:true,id:data.id||""}:{sent:false,reason:data?.message||data?.error||"email_failed"};
  }catch(error){
    console.error("statement email failed",error);
    return {sent:false,reason:String(error?.message||error)};
  }
}
__name(statementSendEmail,"statementSendEmail");

async function adminGenerateStatementsPost({request,env}){
  try{
    const supplied=request.headers.get("X-Admin-Key")||"";
    if(!env.ADMIN_IMPORT_KEY || supplied!==env.ADMIN_IMPORT_KEY){
      return notificationJson({success:false,error:"Unauthorized."},401);
    }
    if(!env.DB) return notificationJson({success:false,error:"Customer database is not configured."},503);
    if(!env.NOTIFICATION_ATTACHMENTS){
      return notificationJson({success:false,error:"Statement storage is not configured."},503);
    }

    let body={};
    try{body=await request.json();}catch{
      return notificationJson({success:false,error:"Invalid request data."},400);
    }

    const accounts=[...new Set((Array.isArray(body.accounts)?body.accounts:[])
      .map(normalizeNotificationAccount).filter(Boolean))];
    if(!accounts.length) return notificationJson({success:false,error:"Select at least one customer."},400);
    if(accounts.length>20) return notificationJson({success:false,error:"Send statements in batches of 20 customers or fewer."},413);

    const statementDate=statementPdfShortDate(body.statement_date||new Date().toISOString());
    const emailPdf=body.email_pdf!==false;
    const portalNotification=body.portal_notification!==false;
    const smsLink=body.sms_link===true;

    await ensureCustomerDocumentsTable(env);
    await ensureCustomerNotificationsTable(env);
    await ensureAdminContactPreferencesTable(env);

    const results=[];

    for(const account of accounts){
      let objectKey="";
      try{
        const customer=await env.DB.prepare(`
          SELECT
            account_number,account_name,address1,address2,address3,city,state,zip_code,phone,email,
            current_balance,aging_category_1,aging_category_2,aging_category_3,aging_category_4,
            COALESCE((SELECT p.email_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_email_enabled,
            COALESCE((SELECT p.sms_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_sms_enabled,
            COALESCE((SELECT p.portal_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_portal_enabled
          FROM customers
          WHERE account_number=?
          LIMIT 1
        `).bind(account).first();

        if(!customer){
          results.push({account_number:account,success:false,error:"Customer not found."});
          continue;
        }

        const current=statementNumber(customer.current_balance);
        const previous=
          statementNumber(customer.aging_category_1)+
          statementNumber(customer.aging_category_2)+
          statementNumber(customer.aging_category_3)+
          statementNumber(customer.aging_category_4);
        const total=current+previous;

        const pdfBytes=statementBuildPdf(customer,statementDate);
        const filename=`Wooten-Oil-Statement-${account}-${statementDate}.pdf`;
        const title=`Statement ${statementPdfDate(statementDate)}`;
        objectKey=`customer-documents/${account}/${crypto.randomUUID()}-${filename}`;

        await env.NOTIFICATION_ATTACHMENTS.put(objectKey,pdfBytes,{
          httpMetadata:{
            contentType:"application/pdf",
            contentDisposition:`inline; filename="${filename}"`
          },
          customMetadata:{
            account_number:account,
            document_type:"statement",
            filename,
            generated:"true"
          }
        });

        const docResult=await env.DB.prepare(`
          INSERT INTO portal_customer_documents
            (account_number,document_type,title,document_date,object_key,filename,content_type,size_bytes,created_at)
          VALUES (?,?,?,?,?,?,?, ?,CURRENT_TIMESTAMP)
        `).bind(
          account,"statement",title,statementDate,objectKey,filename,"application/pdf",pdfBytes.byteLength
        ).run();

        const documentId=docResult?.meta?.last_row_id||docResult?.meta?.last_insert_rowid||null;

        const notificationMessage=
          `${filename} is ready. Current Balance: ${statementMoney(current)}. `+
          `Previous Balance: ${statementMoney(previous)}. Total Balance: ${statementMoney(total)}.`;

        const customerPortalNotification=portalNotification && Number(customer.contact_portal_enabled)!==0;
        const customerEmailPdf=emailPdf && Number(customer.contact_email_enabled)!==0;
        const customerSmsLink=smsLink && Number(customer.contact_sms_enabled)!==0;

        let notificationId=null;
        if(customerPortalNotification){
          const notificationResult=await env.DB.prepare(`
            INSERT INTO portal_notifications
              (account_number,title,message,email_sent,action_type,action_id,created_at)
            VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
          `).bind(
            account,
            "New Statement Available",
            notificationMessage,
            0,
            "customer_documents",
            documentId
          ).run();
          notificationId=notificationResult?.meta?.last_row_id||notificationResult?.meta?.last_insert_rowid||null;
        }

        const emailResult=customerEmailPdf
          ? await statementSendEmail(env,customer,pdfBytes,filename,statementDate,total)
          : {sent:false,reason:emailPdf?"email_not_selected":"email_disabled"};

        if(notificationId && emailResult.sent){
          try{
            await env.DB.prepare(`
              UPDATE portal_notifications
              SET email_sent=1,email_id=?
              WHERE id=? AND account_number=?
            `).bind(emailResult.id||"",notificationId,account).run();
          }catch(error){
            console.error("statement notification email status update failed",error);
          }
        }

        let smsResult={sent:false,reason:customerSmsLink?"no_phone":(smsLink?"sms_not_selected":"sms_disabled")};
        if(customerSmsLink && customer.phone){
          try{
            const secureLink=await createPortalStatementLink({
              request,
              env,
              documentId,
              accountNumber:account
            });
            const statementMonth=new Date(`${statementDate}T12:00:00Z`).toLocaleDateString(
              "en-US",{month:"long",timeZone:"UTC"}
            );
            const smsBody=
              `WOOTEN OIL CO INC\n\n`+
              `${statementMonth} Statement\n\n`+
              `Your new statement is ready. View or download it here:\n\n`+
              `${secureLink}\n\n`+
              `Please do not reply to this message.`;
            const sent=await twilioSendSms(env,customer.phone,smsBody);
            smsResult={sent:true,sid:sent.sid||""};
          }catch(error){
            smsResult={sent:false,reason:String(error?.message||error)};
            console.error("statement SMS failed",account,error);
          }
        }

        try{
          if(notificationId){
            await env.DB.prepare(`
              UPDATE portal_notifications
              SET sms_sent=?,sms_sid=?,sms_error=?
              WHERE id=? AND account_number=?
            `).bind(
              smsResult.sent?1:0,smsResult.sid||"",smsResult.sent?"":(smsResult.reason||""),notificationId,account
            ).run();
          }
          await ensureAdminCommunicationLogTable(env);
          const logSourceType=notificationId?"notification":"document";
          const logSourceId=notificationId||documentId;
          await env.DB.prepare(`
            INSERT INTO admin_communication_log
              (account_number,event_type,title,detail,source_type,source_id,portal_sent,email_sent,sms_sent,email_id,sms_sid,error_text,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(source_type,source_id) DO UPDATE SET
              portal_sent=excluded.portal_sent,email_sent=excluded.email_sent,sms_sent=excluded.sms_sent,
              email_id=excluded.email_id,sms_sid=excluded.sms_sid,error_text=excluded.error_text
          `).bind(
            account,"statement",title,notificationMessage,logSourceType,logSourceId,
            notificationId?1:0,emailResult.sent?1:0,smsResult.sent?1:0,emailResult.id||"",smsResult.sid||"",
            [emailResult.sent?"":(emailResult.reason||""),smsResult.sent?"":(smsResult.reason||"")].filter(Boolean).join(" | ")
          ).run();
        }catch(error){
          console.error("statement communication log update failed",error);
        }

        results.push({
          account_number:account,
          account_name:customer.account_name||"",
          email:customer.email||"",
          success:true,
          document_id:documentId,
          notification_id:notificationId,
          filename,
          current_balance:current,
          previous_balance:previous,
          total_balance:total,
          portal_notified:!!notificationId,
          email_sent:!!emailResult.sent,
          email_warning:emailResult.sent?"":(emailResult.reason||""),
          sms_sent:!!smsResult.sent,
          sms_sid:smsResult.sid||"",
          sms_warning:smsResult.sent?"":(smsResult.reason||"")
        });
      }catch(error){
        if(objectKey){
          try{await env.NOTIFICATION_ATTACHMENTS.delete(objectKey);}catch{}
        }
        console.error("statement generation failed",account,error);
        results.push({
          account_number:account,
          success:false,
          error:String(error?.message||error)
        });
      }
    }

    const succeeded=results.filter(r=>r.success).length;
    const failed=results.length-succeeded;
    return notificationJson({
      success:failed===0,
      processed:results.length,
      succeeded,
      failed,
      statement_date:statementDate,
      results
    },failed && !succeeded?500:200);

  }catch(error){
    console.error("adminGenerateStatementsPost failed",error);
    return notificationJson({success:false,error:"Statements could not be generated. "+String(error?.message||error)},500);
  }
}
__name(adminGenerateStatementsPost,"adminGenerateStatementsPost");


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
    if (url.pathname === "/api/admin/customer-online-deactivate") {
      if (request.method === "POST") {
        return adminCustomerOnlineDeactivate({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/customers-database") {
      if (request.method === "GET") {
        return adminCustomersDatabaseGet({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/customer-contact-preferences") {
      if (request.method === "POST") {
        return adminCustomerContactPreferencesPost({ request, env });
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

    if (url.pathname === "/api/admin/customer-payments-import") {
      if (request.method === "POST") {
        return adminCustomerPaymentsImport({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/customer-payments-database") {
      if (request.method === "GET") {
        return adminCustomerPaymentsDatabaseGet({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/clear-database") {
      if (request.method === "POST") {
        return adminClearDatabasePost({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/import-status") {
      if (request.method === "GET") {
        return adminImportStatusGet({ request, env });
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
    

    if (url.pathname === "/api/admin/gmail-portal-sync") {
      if (request.method === "POST") return adminGmailPortalSync({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/gmail-portal-sync/status") {
      if (request.method === "GET") return adminGmailPortalSyncStatus({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/statement-customers") {
      if (request.method === "GET") return adminStatementCustomersGet({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/communication-log") {
      if (request.method === "GET") return adminCommunicationLogGet({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/statements/generate") {
      if (request.method === "POST") return adminGenerateStatementsPost({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/customer-documents") {
      if (request.method === "GET") return adminCustomerDocumentsGet({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/customer-documents/upload") {
      if (request.method === "POST") return adminCustomerDocumentUpload({ request, env });
      return methodNotAllowed();
    }

    if (/^\/api\/admin\/customer-documents\/\d+\/file$/.test(url.pathname)) {
      if (request.method === "GET") return adminCustomerDocumentFileGet({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/customer-notifications") {
      if (request.method === "POST") {
        return adminSendCustomerNotification({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/twilio/status") {
      if (request.method === "GET") return adminTwilioStatusGet({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/documents") {
      if (request.method === "GET") return customerDocumentsGet({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/payments") {
      if (request.method === "GET") return customerPaymentsGet({ request, env });
      return methodNotAllowed();
    }

    if (/^\/api\/customer\/documents\/\d+\/file$/.test(url.pathname)) {
      if (request.method === "GET") return customerDocumentFileGet({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname.startsWith("/open-document/")) {
      if (request.method === "GET") return portalDocumentLinkGet({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/notifications") {
      if (request.method === "GET") {
        return customerNotificationsGet({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/notifications/document-resolve") {
      if (request.method === "GET") {
        return customerNotificationDocumentResolve({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname.startsWith("/api/customer/notifications/detail/")) {
      if (request.method === "GET") {
        return customerNotificationDetailGet({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname.startsWith("/api/customer/notification-attachments/")) {
      if (request.method === "GET") {
        return customerNotificationAttachmentGet({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/notifications/read") {
      if (request.method === "POST") {
        return customerNotificationsReadPost({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/notifications/clear") {
      if (request.method === "POST") {
        return customerNotificationsClearPost({ request, env });
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/fuel-requests") {
      if (request.method === "GET") {
        return customerFuelRequestHistoryGet({ request, env });
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
    if (url.pathname === "/api/admin/customer-password-reset-code") {
      if (request.method === "POST") {
        return adminGeneratePasswordResetCode({
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

  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(syncGmailSentToPortal(env,{force:true,maxMessages:100}));
  }

};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
