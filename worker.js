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
  if(!columns.includes("decision_status")) await env.DB.prepare(`ALTER TABLE fuel_requests ADD COLUMN decision_status TEXT NOT NULL DEFAULT 'pending'`).run();
  if(!columns.includes("decision_note")) await env.DB.prepare(`ALTER TABLE fuel_requests ADD COLUMN decision_note TEXT`).run();
  if(!columns.includes("decision_by")) await env.DB.prepare(`ALTER TABLE fuel_requests ADD COLUMN decision_by TEXT`).run();
  if(!columns.includes("decision_at")) await env.DB.prepare(`ALTER TABLE fuel_requests ADD COLUMN decision_at TEXT`).run();
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
        email_status,
        COALESCE(decision_status,'pending') AS status,
        decision_note AS admin_response,
        decision_at
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
        email_status:String(row.email_status||""),
        status:String(row.status||"pending"),
        admin_response:String(row.admin_response||""),
        decision_at:String(row.decision_at||"")
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
async function ensureCustomerStatementCycleColumn(env){
  const info=await env.DB.prepare(`PRAGMA table_info(customers)`).all();
  const columns=new Set((info?.results||[]).map(row=>String(row.name||"").toLowerCase()));
  if(!columns.has("statement_cycle")){
    await env.DB.prepare(`ALTER TABLE customers ADD COLUMN statement_cycle TEXT NOT NULL DEFAULT 'A'`).run();
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_schema_migrations (migration_key TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  const migration=await env.DB.prepare(`INSERT OR IGNORE INTO portal_schema_migrations(migration_key) VALUES ('statement_cycles_ab_v2')`).run();
  if(Number(migration?.meta?.changes||0)>0){
    await env.DB.prepare(`UPDATE customers SET statement_cycle=CASE WHEN upper(trim(COALESCE(statement_cycle,''))) IN ('C','W') THEN 'B' ELSE 'A' END,updated_at=CURRENT_TIMESTAMP`).run();
  }
  await env.DB.prepare(`UPDATE customers SET statement_cycle='B' WHERE upper(trim(COALESCE(statement_cycle,''))) IN ('C','W')`).run();
  await env.DB.prepare(`UPDATE customers SET statement_cycle='A' WHERE upper(trim(COALESCE(statement_cycle,''))) NOT IN ('A','B','E')`).run();
}
__name(ensureCustomerStatementCycleColumn,"ensureCustomerStatementCycleColumn");
async function onRequestPost3({ request, env }) {
  const supplied = request.headers.get("X-Admin-Key") || "";
  if (!env.ADMIN_IMPORT_KEY || supplied !== env.ADMIN_IMPORT_KEY) {
    return json3({ success: false, error: "Unauthorized." }, 401);
  }
  if (!env.DB) {
    return json3({ success: false, error: "Customer database is not configured." }, 503);
  }
  const customerCancellation=await adminAutomaticImportCancellation(env,request);
  if(customerCancellation?.cancelled){
    return json3({success:false,cancelled:true,error:"This automatic MAS 90 upload was canceled from the admin page.",cancelled_by:customerCancellation.cancel_requested_by||"Wooten Oil Admin",cancelled_at:customerCancellation.cancel_requested_at||""},409);
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
  if (customers.length > 500) {
    return json3({ success: false, error: "Too many records in one customer import batch." }, 413);
  }

  await ensureCustomerStatementCycleColumn(env);
  await ensureTwilioPhoneToolsSchema(env);
  const areaSetting=await env.DB.prepare(`SELECT default_area_code FROM twilio_phone_settings WHERE id=1`).first();
  const defaultAreaCode=String(areaSetting?.default_area_code||"").replace(/\D/g,"");
  const fixAreaCodeAutomatically=body?.fix_area_code_automatically===true;

  const parsed=[];
  let skipped=0;
  for(const row of customers){
    const acct=accountNumber(row?.account_number);
    const name=text(row?.account_name);
    if(!acct||!name){skipped++;continue;}
    const importedCycle=text(row?.statement_cycle).toUpperCase();
    parsed.push({
      acct,
      name:name.slice(0,200),
      address1:text(row?.address1).slice(0,250),
      address2:text(row?.address2).slice(0,250),
      city:text(row?.city).slice(0,120),
      state:text(row?.state).slice(0,30),
      zip:text(row?.zip_code).slice(0,20),
      importedPhone:text(row?.phone).slice(0,60),
      importedEmail:text(row?.email).slice(0,254),
      currentBalance:numberValue(row?.current_balance),
      aging1:numberValue(row?.aging_category_1),
      aging2:numberValue(row?.aging_category_2),
      aging3:numberValue(row?.aging_category_3),
      aging4:numberValue(row?.aging_category_4),
      normalizedCycle:importedCycle==="C"||importedCycle==="W"?"B":"A",
      hasImportedCycle:importedCycle!==""
    });
  }
  if(!parsed.length)return json3({success:false,error:"No valid customer records were found."},400);

  const phoneNumbersFound=parsed.reduce((count,row)=>count+(String(row.importedPhone||"").trim()?1:0),0);
  const phoneAreaCodeCandidates=parsed.reduce((count,row)=>count+(String(row.importedPhone||"").replace(/\D/g,"").length===7?1:0),0);
  if(fixAreaCodeAutomatically&&phoneAreaCodeCandidates>0&&!/^[2-9]\d{2}$/.test(defaultAreaCode)){
    return json3({success:false,error:"Fix Area Code Automatically is selected, but a valid Default U.S. Area Code has not been saved in Twilio settings."},400);
  }

  const accounts=parsed.map(row=>row.acct);
  const existingByAccount=new Map();
  try{
    for(let start=0;start<accounts.length;start+=100){
      const chunk=accounts.slice(start,start+100);
      const placeholders=chunk.map(()=>"?").join(",");
      const existing=await env.DB.prepare(`SELECT account_number,email,phone FROM customers WHERE account_number IN (${placeholders})`).bind(...chunk).all();
      for(const current of existing?.results||[])existingByAccount.set(String(current.account_number),current);
    }
  }catch(error){
    console.error("Customer existing-record detection failed",error);
    return json3({success:false,error:"The import could not safely compare existing customer records."},500);
  }

  const changedEmailAccounts=[];
  const changedPhoneAccounts=[];
  const lookupWork=[];
  let phoneUnchanged=0;
  let phoneChangedVsServer=0;
  let phoneServerMatches=0;
  let phoneAreaCodeFixed=0;
  let phoneUpdated=0;
  let phoneRejected=0;
  let phoneLookupErrors=0;
  let phoneLookupInvalid=0;

  for(const row of parsed){
    const current=existingByAccount.get(row.acct);
    const incomingEmail=String(row.importedEmail||"").trim();
    const previousEmail=String(current?.email||"").trim();
    if(current&&incomingEmail&&incomingEmail.toLowerCase()!==previousEmail.toLowerCase())changedEmailAccounts.push(row.acct);

    const incomingRaw=String(row.importedPhone||"").trim();
    const existingRaw=String(current?.phone||"").trim();
    const incomingDigits=incomingRaw.replace(/\D/g,"");
    const isSevenDigitImport=incomingDigits.length===7;

    // Customer.mdb is authoritative for the stored phone number.
    // ON: add the saved area code only to 7-digit imported values.
    // OFF: store the imported phone exactly as supplied (trimmed), including 7-digit values.
    let finalPhone=incomingRaw;
    if(fixAreaCodeAutomatically&&isSevenDigitImport){
      const corrected=`+1${defaultAreaCode}${incomingDigits}`;
      finalPhone=twilioFormatUsNational(corrected);
      phoneAreaCodeFixed++;
    }
    row.finalPhone=finalPhone;

    const changed=existingRaw!==finalPhone;
    if(current){
      if(changed){
        phoneChangedVsServer++;
        changedPhoneAccounts.push(row.acct);
      }else{
        phoneServerMatches++;
      }
    }
    if(changed||!current){
      row.phoneDecision="updated";
      phoneUpdated++;
    }else{
      row.phoneDecision="unchanged";
      phoneUnchanged++;
    }

    // Twilio validation never blocks the MDB phone update. It only updates SMS eligibility/status.
    // Blank/7-digit/malformed values remain stored exactly per the import rule and are marked
    // unverified/invalid for SMS until a complete U.S. number can be checked.
    const lookupPhone=twilioUsPhoneWithArea(finalPhone,"");
    if(!finalPhone){
      lookupWork.push({row,action:"clear",raw:finalPhone,normalized:""});
    }else if(!lookupPhone||!/^\+1\d{10}$/.test(lookupPhone)){
      phoneLookupInvalid++;
      lookupWork.push({row,action:"invalid_format",raw:finalPhone,normalized:lookupPhone||""});
    }else{
      lookupWork.push({row,action:"lookup",raw:finalPhone,normalized:lookupPhone});
    }
  }

  const lookupConcurrency=8;
  for(let start=0;start<lookupWork.length;start+=lookupConcurrency){
    const group=lookupWork.slice(start,start+lookupConcurrency);
    await Promise.all(group.map(async item=>{
      const {row,action,raw,normalized}=item;
      if(action==="clear"){
        try{await env.DB.prepare(`DELETE FROM twilio_phone_lookup_cache WHERE account_number=?`).bind(row.acct).run();}catch(cacheError){console.error("Customer import phone lookup cache clear failed",row.acct,cacheError);}
        return;
      }
      if(action==="invalid_format"){
        try{
          await env.DB.prepare(`INSERT INTO twilio_phone_lookup_cache(account_number,raw_phone,normalized_phone,national_format,valid,line_type,carrier_name,error_code,checked_at) VALUES(?,?,?,?,0,'','','INVALID_US_FORMAT',CURRENT_TIMESTAMP) ON CONFLICT(account_number) DO UPDATE SET raw_phone=excluded.raw_phone,normalized_phone=excluded.normalized_phone,national_format=excluded.national_format,valid=0,line_type='',carrier_name='',error_code='INVALID_US_FORMAT',checked_at=CURRENT_TIMESTAMP`).bind(row.acct,raw,normalized||"",raw).run();
        }catch(cacheError){console.error("Customer import invalid phone cache failed",row.acct,cacheError);}
        return;
      }

      let valid=0,lineType="",carrier="",errorCode="",national="",countryCode="";
      try{
        const data=await twilioLookupPhone(env,normalized);
        valid=data?.valid?1:0;
        lineType="";
        carrier="";
        errorCode="";
        national=String(data?.national_format||twilioFormatUsNational(normalized));
        countryCode=String(data?.country_code||"").toUpperCase();
        if(valid!==1||countryCode!=="US"){
          phoneLookupInvalid++;
          if(countryCode&&countryCode!=="US")errorCode=errorCode||"NOT_US_NUMBER";
        }
      }catch(error){
        valid=-1;
        errorCode=String(error?.twilioCode||"LOOKUP_ERROR");
        phoneLookupErrors++;
      }
      try{
        await env.DB.prepare(`INSERT INTO twilio_phone_lookup_cache(account_number,raw_phone,normalized_phone,national_format,valid,line_type,carrier_name,error_code,checked_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(account_number) DO UPDATE SET raw_phone=excluded.raw_phone,normalized_phone=excluded.normalized_phone,national_format=excluded.national_format,valid=excluded.valid,line_type=CASE WHEN twilio_phone_lookup_cache.raw_phone=excluded.raw_phone THEN twilio_phone_lookup_cache.line_type ELSE '' END,carrier_name=CASE WHEN twilio_phone_lookup_cache.raw_phone=excluded.raw_phone THEN twilio_phone_lookup_cache.carrier_name ELSE '' END,error_code=excluded.error_code,checked_at=CURRENT_TIMESTAMP`).bind(row.acct,raw,normalized||"",national,valid,lineType,carrier,errorCode).run();
      }catch(cacheError){console.error("Customer import phone lookup cache failed",row.acct,cacheError);}
    }));
  }

  const statement = env.DB.prepare(`
    INSERT INTO customers
      (account_number, account_name, address1, address2, city, state, zip_code, phone, email, current_balance, aging_category_1, aging_category_2, aging_category_3, aging_category_4, statement_cycle, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
      password_hash = CASE
        WHEN excluded.email IS NOT NULL AND trim(excluded.email) <> ''
          AND lower(trim(excluded.email)) <> lower(trim(COALESCE(customers.email,''))) THEN NULL
        ELSE customers.password_hash
      END,
      must_change_password = CASE
        WHEN excluded.email IS NOT NULL AND trim(excluded.email) <> ''
          AND lower(trim(excluded.email)) <> lower(trim(COALESCE(customers.email,''))) THEN 0
        ELSE customers.must_change_password
      END,
      current_balance = excluded.current_balance,
      aging_category_1 = excluded.aging_category_1,
      aging_category_2 = excluded.aging_category_2,
      aging_category_3 = excluded.aging_category_3,
      aging_category_4 = excluded.aging_category_4,
      statement_cycle = CASE WHEN ?=1 THEN excluded.statement_cycle ELSE customers.statement_cycle END,
      updated_at = CURRENT_TIMESTAMP
  `);
  const batch=[];
  for(const row of parsed){
    batch.push(statement.bind(
      row.acct,row.name,row.address1,row.address2,row.city,row.state,row.zip,row.finalPhone,row.importedEmail,
      row.currentBalance,row.aging1,row.aging2,row.aging3,row.aging4,row.normalizedCycle,row.hasImportedCycle?1:0
    ));
  }
  for(let start=0;start<changedEmailAccounts.length;start+=100){
    const chunk=changedEmailAccounts.slice(start,start+100);
    const placeholders=chunk.map(()=>"?").join(",");
    batch.push(env.DB.prepare(`DELETE FROM customer_sessions WHERE customer_id IN (SELECT id FROM customers WHERE account_number IN (${placeholders}))`).bind(...chunk));
  }
  for(let start=0;start<changedPhoneAccounts.length;start+=100){
    const chunk=changedPhoneAccounts.slice(start,start+100);
    const placeholders=chunk.map(()=>"?").join(",");
    batch.push(env.DB.prepare(`DELETE FROM twilio_sms_verification WHERE account_number IN (${placeholders})`).bind(...chunk));
  }

  try{await env.DB.batch(batch);}catch(error){
    console.error("Customer import failed",error);
    return json3({success:false,error:"Database import failed."},500);
  }

  if(changedEmailAccounts.length){
    for(let start=0;start<changedEmailAccounts.length;start+=100){
      const chunk=changedEmailAccounts.slice(start,start+100);
      const placeholders=chunk.map(()=>"?").join(",");
      await env.DB.prepare(`UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE used_at IS NULL AND customer_id IN (SELECT id FROM customers WHERE account_number IN (${placeholders}))`).bind(...chunk).run().catch(()=>{});
      await env.DB.prepare(`UPDATE customer_activation_codes SET used_at=CURRENT_TIMESTAMP WHERE used_at IS NULL AND customer_id IN (SELECT id FROM customers WHERE account_number IN (${placeholders}))`).bind(...chunk).run().catch(()=>{});
    }
  }

  const customerRecordCount=parsed.length;
  let importMeta=null;
  try{
    importMeta=await recordAdminImport(env,request,"customers",customerRecordCount,adminRequestActor(request,env).name);
if(importMeta?.last_import_status==="completed")await adminAudit(env,adminImportAuditRequest(request,importMeta),"customer_import_completed","customers","",`${importMeta.last_record_count} source records; ${importMeta.last_import_mode} import completed in ${importMeta.last_import_batch_count} batch(es)`);
  }catch(error){console.error("Customer import timestamp could not be recorded",error);}

  return json3({
    success:true,
    processed:customerRecordCount,
    skipped,
    email_changes_requiring_reactivation:changedEmailAccounts.length,
    phone_updates:phoneUpdated,
    phone_rejected:phoneRejected,
    phone_lookup_errors:phoneLookupErrors,
    phone_lookup_invalid:phoneLookupInvalid,
    phone_unchanged:phoneUnchanged,
    phone_numbers_found:phoneNumbersFound,
    phone_area_code_candidates:phoneAreaCodeCandidates,
    phone_area_code_fixed:phoneAreaCodeFixed,
    phone_changed_vs_server:phoneChangedVsServer,
    phone_server_matches:phoneServerMatches,
    fix_area_code_automatically:fixAreaCodeAutomatically,
    default_area_code:fixAreaCodeAutomatically?defaultAreaCode:"",
    imported_at:importMeta?.last_import_at||new Date().toISOString(),
    import_mode:importMeta?.last_import_mode||"manual",
    import_status:importMeta?.last_import_status||"completed",
    imported_by:importMeta?.last_import_by||adminRequestActor(request,env).name,
    import_record_count:Number(importMeta?.last_record_count||customerRecordCount),
    import_batch_number:Number(importMeta?.last_import_batch_number||1),
    import_batch_count:Number(importMeta?.last_import_batch_count||1),
    cancel_requested:Boolean(importMeta?.cancel_requested),
    cancelled_by:importMeta?.cancel_requested_by||"",
    cancelled_at:importMeta?.cancel_requested_at||""
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
      last_record_count INTEGER NOT NULL DEFAULT 0,
      last_import_by TEXT NOT NULL DEFAULT '',
      last_import_mode TEXT NOT NULL DEFAULT 'manual',
      last_import_status TEXT NOT NULL DEFAULT 'completed',
      last_import_batch_number INTEGER NOT NULL DEFAULT 1,
      last_import_batch_count INTEGER NOT NULL DEFAULT 1,
      last_import_run_id TEXT NOT NULL DEFAULT ''
    )
  `).run();
  const info=await env.DB.prepare(`PRAGMA table_info(admin_import_metadata)`).all();
  const columns=new Set((info?.results||[]).map(row=>String(row.name||"").toLowerCase()));
  const additions=[
    ["last_import_by","TEXT NOT NULL DEFAULT ''"],
    ["last_import_mode","TEXT NOT NULL DEFAULT 'manual'"],
    ["last_import_status","TEXT NOT NULL DEFAULT 'completed'"],
    ["last_import_batch_number","INTEGER NOT NULL DEFAULT 1"],
    ["last_import_batch_count","INTEGER NOT NULL DEFAULT 1"],
    ["last_import_run_id","TEXT NOT NULL DEFAULT ''"]
  ];
  for(const [name,definition] of additions)if(!columns.has(name))await env.DB.prepare(`ALTER TABLE admin_import_metadata ADD COLUMN ${name} ${definition}`).run();
}
__name(ensureAdminImportMetadataSchema,"ensureAdminImportMetadataSchema");

async function ensureAdminImportControlSchema(env){
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_import_control (
      id INTEGER PRIMARY KEY CHECK (id=1),
      active_run_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'idle',
      active_import_type TEXT NOT NULL DEFAULT '',
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      cancel_requested_at TEXT,
      cancel_requested_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    )
  `).run();
}
__name(ensureAdminImportControlSchema,"ensureAdminImportControlSchema");

function adminImportRunId(request){
  const value=String(request?.headers?.get("X-Import-Run-Id")||"").trim();
  return /^[A-Za-z0-9_-]{8,100}$/.test(value)?value:"";
}
__name(adminImportRunId,"adminImportRunId");

async function adminAutomaticImportCancellation(env,request){
  const automatic=String(request?.headers?.get("X-Import-Mode")||"").trim().toLowerCase()==="automatic";
  const runId=adminImportRunId(request);
  if(!automatic||!runId||!env?.DB)return null;
  await ensureAdminImportControlSchema(env);
  const row=await env.DB.prepare(`SELECT active_run_id,status,cancel_requested,cancel_requested_at,cancel_requested_by,updated_at FROM admin_import_control WHERE id=1`).first();
  if(!row||String(row.active_run_id||"")!==runId)return {cancelled:false,run_id:runId};
  return {...row,run_id:runId,cancelled:Number(row.cancel_requested||0)===1||String(row.status||"").toLowerCase()==="cancelled"};
}
__name(adminAutomaticImportCancellation,"adminAutomaticImportCancellation");

async function recordAutomaticImportControl(env,request,type,batchNumber,batchCount){
  const automatic=String(request?.headers?.get("X-Import-Mode")||"").trim().toLowerCase()==="automatic";
  const runId=adminImportRunId(request);
  if(!automatic||!runId)return null;
  await ensureAdminImportControlSchema(env);
  const normalStatus=String(type)==="payments"&&Number(batchNumber)>=Number(batchCount)?"completed":"in_progress";
  await env.DB.prepare(`
    INSERT INTO admin_import_control(id,active_run_id,status,active_import_type,cancel_requested,cancel_requested_at,cancel_requested_by,updated_at,completed_at)
    VALUES (1,?,?,?,0,NULL,'',CURRENT_TIMESTAMP,CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT(id) DO UPDATE SET
      active_run_id=excluded.active_run_id,
      status=CASE WHEN admin_import_control.active_run_id=excluded.active_run_id AND admin_import_control.cancel_requested=1 THEN 'cancelled' ELSE excluded.status END,
      active_import_type=excluded.active_import_type,
      cancel_requested=CASE WHEN admin_import_control.active_run_id=excluded.active_run_id THEN admin_import_control.cancel_requested ELSE 0 END,
      cancel_requested_at=CASE WHEN admin_import_control.active_run_id=excluded.active_run_id THEN admin_import_control.cancel_requested_at ELSE NULL END,
      cancel_requested_by=CASE WHEN admin_import_control.active_run_id=excluded.active_run_id THEN admin_import_control.cancel_requested_by ELSE '' END,
      updated_at=CURRENT_TIMESTAMP,
      completed_at=CASE WHEN admin_import_control.active_run_id=excluded.active_run_id AND admin_import_control.cancel_requested=1 THEN CURRENT_TIMESTAMP WHEN excluded.status='completed' THEN CURRENT_TIMESTAMP ELSE NULL END
  `).bind(runId,normalStatus,String(type||""),normalStatus).run();
  return await env.DB.prepare(`SELECT active_run_id,status,active_import_type,cancel_requested,cancel_requested_at,cancel_requested_by,updated_at,completed_at FROM admin_import_control WHERE id=1`).first();
}
__name(recordAutomaticImportControl,"recordAutomaticImportControl");

function adminImportPositiveInteger(value,fallback,maximum=10000000){
  const parsed=Math.trunc(Number(value));
  return Number.isFinite(parsed)&&parsed>0?Math.min(parsed,maximum):fallback;
}
__name(adminImportPositiveInteger,"adminImportPositiveInteger");

function adminImportAuditRequest(request,metadata){
  if(metadata?.last_import_mode!=="automatic")return request;
  const headers=new Headers(request.headers);
  headers.delete("X-Admin-Actor-Id");
  headers.set("X-Admin-Actor-Name","Automatic MAS 90 Sync");
  headers.set("X-Admin-Actor-Owner","1");
  return new Request(request.url,{method:"GET",headers});
}
__name(adminImportAuditRequest,"adminImportAuditRequest");

async function recordAdminImport(env,request,type,count,actorName="Wooten Oil Admin"){
  await ensureAdminImportMetadataSchema(env);
  const mode=String(request?.headers?.get("X-Import-Mode")||"").trim().toLowerCase()==="automatic"?"automatic":"manual";
  const runId=mode==="automatic"?adminImportRunId(request):"";
  const batchNumber=adminImportPositiveInteger(request?.headers?.get("X-Import-Batch-Number"),1,1000000);
  const batchCount=Math.max(batchNumber,adminImportPositiveInteger(request?.headers?.get("X-Import-Batch-Count"),1,1000000));
  const runTotal=adminImportPositiveInteger(request?.headers?.get("X-Import-Run-Total"),Number(count||0),10000000);
  const control=await recordAutomaticImportControl(env,request,type,batchNumber,batchCount);
  const cancelled=Number(control?.cancel_requested||0)===1||String(control?.status||"").toLowerCase()==="cancelled";
  const status=cancelled?"cancelled":(batchNumber>=batchCount?"completed":"in_progress");
  const recordedBy=mode==="automatic"?"Automatic MAS 90 Sync":String(actorName||"Wooten Oil Admin");
  await env.DB.prepare(`
    INSERT INTO admin_import_metadata(import_type,last_import_at,last_record_count,last_import_by,last_import_mode,last_import_status,last_import_batch_number,last_import_batch_count,last_import_run_id)
    VALUES (?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?)
    ON CONFLICT(import_type) DO UPDATE SET
      last_import_at=CURRENT_TIMESTAMP,
      last_record_count=excluded.last_record_count,
      last_import_by=excluded.last_import_by,
      last_import_mode=excluded.last_import_mode,
      last_import_status=excluded.last_import_status,
      last_import_batch_number=excluded.last_import_batch_number,
      last_import_batch_count=excluded.last_import_batch_count,
      last_import_run_id=excluded.last_import_run_id
  `).bind(String(type||""),runTotal,recordedBy,mode,status,batchNumber,batchCount,runId).run();

  const row=await env.DB.prepare(`
    SELECT last_import_at,last_record_count,last_import_by,last_import_mode,last_import_status,last_import_batch_number,last_import_batch_count,last_import_run_id
    FROM admin_import_metadata
    WHERE import_type=?
  `).bind(String(type||"")).first();
  return row?{...row,cancel_requested:cancelled,cancel_requested_at:control?.cancel_requested_at||"",cancel_requested_by:control?.cancel_requested_by||""}:null;
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
    await ensureAdminImportControlSchema(env);
    await env.DB.prepare(`UPDATE admin_import_control SET status='interrupted',updated_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP WHERE id=1 AND status='in_progress' AND datetime(updated_at)<datetime('now','-10 minutes')`).run();
    await env.DB.prepare(`UPDATE admin_import_metadata SET last_import_status='interrupted' WHERE last_import_mode='automatic' AND last_import_status='in_progress' AND datetime(last_import_at)<datetime('now','-10 minutes')`).run();
    const result=await env.DB.prepare(`
      SELECT import_type,last_import_at,last_record_count,last_import_by,last_import_mode,last_import_status,last_import_batch_number,last_import_batch_count,last_import_run_id
      FROM admin_import_metadata
      WHERE import_type IN ('customers','payments')
    `).all();
    const control=await env.DB.prepare(`SELECT active_run_id,status,active_import_type,cancel_requested,cancel_requested_at,cancel_requested_by,updated_at,completed_at FROM admin_import_control WHERE id=1`).first();

    let customersLast="",paymentsLast="",customersBy="",paymentsBy="";
    let customersCount=0,paymentsCount=0;
    let customersMode="manual",paymentsMode="manual",customersStatus="completed",paymentsStatus="completed";
    let customersBatchNumber=1,customersBatchCount=1,paymentsBatchNumber=1,paymentsBatchCount=1;

    for(const row of result?.results||[]){
      if(row.import_type==="customers"){
        customersLast=row.last_import_at||"";
        customersCount=Number(row.last_record_count||0);
        customersBy=row.last_import_by||"";
        customersMode=row.last_import_mode||"manual";
        customersStatus=row.last_import_status||"completed";
        customersBatchNumber=Number(row.last_import_batch_number||1);
        customersBatchCount=Number(row.last_import_batch_count||1);
      }else if(row.import_type==="payments"){
        paymentsLast=row.last_import_at||"";
        paymentsCount=Number(row.last_record_count||0);
        paymentsBy=row.last_import_by||"";
        paymentsMode=row.last_import_mode||"manual";
        paymentsStatus=row.last_import_status||"completed";
        paymentsBatchNumber=Number(row.last_import_batch_number||1);
        paymentsBatchCount=Number(row.last_import_batch_count||1);
      }
    }

    return json3({
      success:true,
      customers_last_import_at:customersLast,
      customers_last_record_count:customersCount,
      customers_last_import_by:customersBy,
      customers_last_import_mode:customersMode,
      customers_last_import_status:customersStatus,
      customers_last_import_batch_number:customersBatchNumber,
      customers_last_import_batch_count:customersBatchCount,
      payments_last_import_at:paymentsLast,
      payments_last_record_count:paymentsCount,
      payments_last_import_by:paymentsBy,
      payments_last_import_mode:paymentsMode,
      payments_last_import_status:paymentsStatus,
      payments_last_import_batch_number:paymentsBatchNumber,
      payments_last_import_batch_count:paymentsBatchCount,
      active_run_id:control?.active_run_id||"",
      import_control_status:control?.status||"idle",
      active_import_type:control?.active_import_type||"",
      cancel_requested:Number(control?.cancel_requested||0)===1,
      cancel_requested_at:control?.cancel_requested_at||"",
      cancel_requested_by:control?.cancel_requested_by||"",
      import_control_updated_at:control?.updated_at||"",
      import_control_completed_at:control?.completed_at||""
    });
  }catch(error){
    console.error("adminImportStatusGet failed",error);
    return json3({success:false,error:"Import update information could not be loaded."},500);
  }
}
__name(adminImportStatusGet,"adminImportStatusGet");

async function adminImportCancelPost({request,env}){
  if(!env?.DB)return json3({success:false,error:"Customer database is not configured."},503);
  try{
    await ensureAdminImportMetadataSchema(env);
    await ensureAdminImportControlSchema(env);
    const control=await env.DB.prepare(`SELECT active_run_id,status,active_import_type,cancel_requested,cancel_requested_at,cancel_requested_by FROM admin_import_control WHERE id=1`).first();
    if(!control?.active_run_id||String(control.status||"").toLowerCase()!=="in_progress"){
      return json3({success:false,error:"No automatic MAS 90 upload is currently running."},409);
    }
    const actor=adminRequestActor(request,env);
    await env.DB.prepare(`UPDATE admin_import_control SET status='cancelled',cancel_requested=1,cancel_requested_at=CURRENT_TIMESTAMP,cancel_requested_by=?,updated_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP WHERE id=1 AND active_run_id=?`).bind(actor.name,String(control.active_run_id)).run();
    await env.DB.prepare(`UPDATE admin_import_metadata SET last_import_status='cancelled',last_import_at=CURRENT_TIMESTAMP WHERE last_import_mode='automatic' AND last_import_run_id=? AND last_import_status='in_progress'`).bind(String(control.active_run_id)).run();
    await adminAudit(env,request,"automatic_import_cancelled","database",String(control.active_run_id),`Automatic MAS 90 upload canceled while processing ${control.active_import_type||"data"}`);
    const saved=await env.DB.prepare(`SELECT active_run_id,status,active_import_type,cancel_requested,cancel_requested_at,cancel_requested_by,updated_at,completed_at FROM admin_import_control WHERE id=1`).first();
    return json3({success:true,cancelled:true,message:"The MAS 90 computer was told to stop after its current batch.",...saved});
  }catch(error){
    console.error("adminImportCancelPost failed",error);
    return json3({success:false,error:"The automatic upload could not be canceled."},500);
  }
}
__name(adminImportCancelPost,"adminImportCancelPost");

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
  const paymentCancellation=await adminAutomaticImportCancellation(env,request);
  if(paymentCancellation?.cancelled){
    return json3({success:false,cancelled:true,error:"This automatic MAS 90 upload was canceled from the admin page.",cancelled_by:paymentCancellation.cancel_requested_by||"Wooten Oil Admin",cancelled_at:paymentCancellation.cancel_requested_at||""},409);
  }

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
    importMeta=await recordAdminImport(env,request,"payments",valid.length,adminRequestActor(request,env).name);
if(importMeta?.last_import_status==="completed")await adminAudit(env,adminImportAuditRequest(request,importMeta),"payment_import_completed","payments","",`${importMeta.last_record_count} source records; ${importMeta.last_import_mode} import completed in ${importMeta.last_import_batch_count} batch(es)`);
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
    imported_at:importMeta?.last_import_at||new Date().toISOString(),
    import_mode:importMeta?.last_import_mode||"manual",
    import_status:importMeta?.last_import_status||"completed",
    imported_by:importMeta?.last_import_by||adminRequestActor(request,env).name,
    import_record_count:Number(importMeta?.last_record_count||valid.length),
    import_batch_number:Number(importMeta?.last_import_batch_number||1),
    import_batch_count:Number(importMeta?.last_import_batch_count||1),
    cancel_requested:Boolean(importMeta?.cancel_requested),
    cancelled_by:importMeta?.cancel_requested_by||"",
    cancelled_at:importMeta?.cancel_requested_at||""
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
async function ensureCustomerSessionScopeColumns(env) {
  if (!env?.DB) return;
  const info = await env.DB.prepare(`PRAGMA table_info(customer_sessions)`).all();
  const columns = new Set((info?.results || []).map((row) => String(row.name || "").toLowerCase()));
  if (!columns.has("login_method")) {
    await env.DB.prepare(`ALTER TABLE customer_sessions ADD COLUMN login_method TEXT NOT NULL DEFAULT 'account'`).run();
  }
  if (!columns.has("session_scope")) {
    await env.DB.prepare(`ALTER TABLE customer_sessions ADD COLUMN session_scope TEXT NOT NULL DEFAULT 'single'`).run();
  }
  if (!columns.has("verified_email")) {
    await env.DB.prepare(`ALTER TABLE customer_sessions ADD COLUMN verified_email TEXT`).run();
  }
}
__name(ensureCustomerSessionScopeColumns, "ensureCustomerSessionScopeColumns");
async function createSession(env, customerId, rememberMe = false, loginMethod = "account", verifiedEmail = "") {
  await ensureCustomerSessionScopeColumns(env);
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
      created_at,
      login_method,
      session_scope,
      verified_email
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    customerId,
    tokenHash,
    expires.toISOString(),
    now.toISOString(),
    now.toISOString(),
    loginMethod === "email" ? "email" : "account",
    loginMethod === "email" ? "linked" : "single",
    loginMethod === "email" ? clean(verifiedEmail).toLowerCase() : null
  ).run();
  return token;
}
__name(createSession, "createSession");
async function ensureCustomerLoginActivityTable(env){
  if(!env?.DB)return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS customer_login_activity (id INTEGER PRIMARY KEY AUTOINCREMENT,customer_id INTEGER,account_number TEXT NOT NULL,result TEXT NOT NULL,user_agent TEXT,ip_hash TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_customer_login_activity_account_created ON customer_login_activity(account_number,created_at DESC,id DESC)`).run();
}
async function recordCustomerLoginActivity(env,request,customer,result){
  try{await ensureCustomerLoginActivityTable(env);const ipHash=await accountApplicationIpHash(request);await env.DB.prepare(`INSERT INTO customer_login_activity(customer_id,account_number,result,user_agent,ip_hash) VALUES (?,?,?,?,?)`).bind(Number(customer?.id||0)||null,String(customer?.account_number||""),String(result||"unknown").slice(0,40),String(request.headers.get("User-Agent")||"").slice(0,300),ipHash||null).run();}catch(error){console.error("Customer login activity could not be recorded",error);}
}
async function getCustomerFromSession(request, env) {
  await ensureCustomerSessionScopeColumns(env);
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
        s.login_method,
        s.session_scope,
        s.verified_email,

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
async function ensureSharedEmailCredentialTable(env) {
  if (!env?.DB) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_shared_email_credentials (
      email_key TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}
__name(ensureSharedEmailCredentialTable, "ensureSharedEmailCredentialTable");
async function getSharedEmailCredential(env, email) {
  await ensureSharedEmailCredentialTable(env);
  const emailKey = clean(email).toLowerCase();
  if (!emailKey) return null;
  return env.DB.prepare(`SELECT email_key,password_hash FROM customer_shared_email_credentials WHERE email_key=? LIMIT 1`).bind(emailKey).first();
}
__name(getSharedEmailCredential, "getSharedEmailCredential");
async function verifyLegacySharedEmailPassword(env, email, password) {
  const emailKey = clean(email).toLowerCase();
  if (!emailKey || !password) return false;
  const rows = await env.DB.prepare(`
    SELECT password_hash,account_status
    FROM customers
    WHERE lower(trim(email)) = ?
  `).bind(emailKey).all();
  for (const row of rows?.results || []) {
    const status = clean(row.account_status).toLowerCase();
    if (status && status !== "active") continue;
    if (clean(row.password_hash) && await verifyPassword(password, row.password_hash)) return true;
  }
  return false;
}
__name(verifyLegacySharedEmailPassword, "verifyLegacySharedEmailPassword");
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
  let emailMatches = [];
  const loginMethod = user.includes("@") ? "email" : "account";
  const normalizedAccount = loginMethod === "account" ? normalizeAccount(user) : "";
  if (normalizedAccount) {
    customer = await env.DB.prepare(`
        SELECT *
        FROM customers
        WHERE account_number = ?
        LIMIT 1
      `).bind(normalizedAccount).first();
  }
  if (!customer && loginMethod === "email") {
    const emailKey = clean(user).toLowerCase();
    const matches = await env.DB.prepare(`
        SELECT *
        FROM customers
        WHERE lower(trim(email)) = ?
        ORDER BY account_number
      `).bind(emailKey).all();
    emailMatches = matches?.results || [];
    const activeMatches = emailMatches.filter((candidate) => {
      const candidateStatus = clean(candidate.account_status).toLowerCase();
      return !candidateStatus || candidateStatus === "active";
    });
    const sharedCredential = await getSharedEmailCredential(env, emailKey);
    if (sharedCredential && clean(sharedCredential.password_hash)) {
      if (await verifyPassword(password, sharedCredential.password_hash)) customer = activeMatches[0] || null;
    } else {
      // Backward-compatible migration: until a shared-email password is created,
      // an existing linked account password can still establish the email-scoped session.
      for (const candidate of activeMatches) {
        if (!clean(candidate.password_hash)) continue;
        if (await verifyPassword(password, candidate.password_hash)) {
          customer = candidate;
          break;
        }
      }
    }
  }
  if (!customer) {
    const activeEmailMatches = emailMatches.filter((candidate) => {
      const candidateStatus = clean(candidate.account_status).toLowerCase();
      return !candidateStatus || candidateStatus === "active";
    });
    if (loginMethod === "email" && activeEmailMatches.length === 1 && !clean(activeEmailMatches[0].password_hash)) {
      await recordCustomerLoginActivity(env,request,activeEmailMatches[0],"activation_required");
      return json4({
        success: false,
        setup_required: true,
        account_number: activeEmailMatches[0].account_number,
        error: "This account has not been activated for online access yet."
      }, 403);
    }
    return json4({
      success: false,
      error: "Customer Number or password is incorrect."
    }, 401);
  }
  const status = clean(customer.account_status).toLowerCase();
  if (status && status !== "active") {
    await recordCustomerLoginActivity(env,request,customer,"blocked_inactive");
    return json4({
      success: false,
      error: "This customer account is not active. Please contact Wooten Oil."
    }, 403);
  }
  let valid = loginMethod === "email";
  if (loginMethod === "account") {
    valid = clean(customer.password_hash) ? await verifyPassword(password, customer.password_hash) : false;
  }
  if (!valid && !clean(customer.password_hash)) {
    await recordCustomerLoginActivity(env,request,customer,"activation_required");
    return json4({
      success: false,
      setup_required: true,
      account_number: customer.account_number,
      error: "This account has not been activated for online access yet."
    }, 403);
  }
  if (!valid) {
    await recordCustomerLoginActivity(env,request,customer,"failed_password");
    return json4({
      success: false,
      error: "Customer Number or password is incorrect."
    }, 401);
  }
  const token = await createSession(
    env,
    customer.id,
    rememberMe,
    loginMethod,
    loginMethod === "email" ? user : ""
  );
  await recordCustomerLoginActivity(env,request,customer,"success");
  return json4(
    {
      success: true,
      customer: publicCustomer(customer),
      login_method: loginMethod,
      account_scope: loginMethod === "email" ? "linked" : "single"
    },
    200,
    {
      "Set-Cookie": sessionCookie(token, rememberMe)
    }
  );
}
__name(customerLoginPost, "customerLoginPost");
function linkedAccountSummary(customer) {
  const totalBalance=Number(customer.current_balance||0)+Number(customer.aging_category_1||0)+Number(customer.aging_category_2||0)+Number(customer.aging_category_3||0)+Number(customer.aging_category_4||0);
  return {
    account_number: customer.account_number,
    account_name: customer.account_name || "Customer Account",
    current_balance: Number(customer.current_balance || 0),
    total_balance: totalBalance
  };
}
__name(linkedAccountSummary, "linkedAccountSummary");
async function customerLinkedAccounts(customer, env) {
  const email = clean(customer?.email).toLowerCase();
  if (!email) return [linkedAccountSummary(customer)];
  const rows = await env.DB.prepare(`
    SELECT account_number,account_name,current_balance,aging_category_1,aging_category_2,aging_category_3,aging_category_4,account_status
    FROM customers
    WHERE lower(trim(email)) = ?
    ORDER BY account_name COLLATE NOCASE,account_number
  `).bind(email).all();
  return (rows?.results || []).filter((row) => {
    const status = clean(row.account_status).toLowerCase();
    return !status || status === "active";
  }).map(linkedAccountSummary);
}
__name(customerLinkedAccounts, "customerLinkedAccounts");
async function customerAccountsGet({request,env}) {
  if (!env.DB) return json4({success:false,error:"Customer database is not configured."},503);
  const customer = await getCustomerFromSession(request,env);
  if (!customer) return json4({success:false,authenticated:false},401);
  const linkedScope = clean(customer.login_method).toLowerCase() === "email" && clean(customer.session_scope).toLowerCase() === "linked";
  const accounts = linkedScope ? await customerLinkedAccounts(customer,env) : [linkedAccountSummary(customer)];
  return json4({success:true,current_account_number:customer.account_number,account_scope:linkedScope?"linked":"single",accounts});
}
__name(customerAccountsGet, "customerAccountsGet");
async function customerAccountSwitchPost({request,env}) {
  if (!env.DB) return json4({success:false,error:"Customer database is not configured."},503);
  const current = await getCustomerFromSession(request,env);
  if (!current) return json4({success:false,authenticated:false},401);
  let body;
  try { body = await request.json(); }
  catch { return json4({success:false,error:"Invalid account switch request."},400); }
  const targetAccount = normalizeAccount(body?.account_number);
  if (!targetAccount) return json4({success:false,error:"Choose an account."},400);
  const linkedScope = clean(current.login_method).toLowerCase() === "email" && clean(current.session_scope).toLowerCase() === "linked";
  if (!linkedScope) return json4({success:false,error:"Account switching is available only when you sign in with your email address."},403);
  const email = clean(current.verified_email).toLowerCase();
  if (!email) return json4({success:false,error:"No linked accounts are available for this email login."},403);
  const target = await env.DB.prepare(`
    SELECT * FROM customers
    WHERE account_number = ?
      AND lower(trim(email)) = ?
    LIMIT 1
  `).bind(targetAccount,email).first();
  const targetStatus = clean(target?.account_status).toLowerCase();
  if (!target || (targetStatus && targetStatus !== "active")) {
    return json4({success:false,error:"That account is not available for this portal login."},403);
  }
  if (target.id !== current.id) {
    await env.DB.prepare(`UPDATE customer_sessions SET customer_id=?,last_seen_at=? WHERE id=?`).bind(target.id,new Date().toISOString(),current.session_id).run();
    await recordCustomerLoginActivity(env,request,target,"account_switch");
  }
  return json4({success:true,customer:publicCustomer(target),account_scope:"linked",accounts:await customerLinkedAccounts(target,env)});
}
__name(customerAccountSwitchPost, "customerAccountSwitchPost");
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
  const linkedScope = clean(customer.login_method).toLowerCase() === "email" && clean(customer.session_scope).toLowerCase() === "linked";
  return json4({
    success: true,
    authenticated: true,
    customer: publicCustomer(customer),
    login_method: linkedScope ? "email" : "account",
    account_scope: linkedScope ? "linked" : "single"
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
    return json5({ success: false, error: "Customer database is not configured." }, 503);
  }
  let body;
  try { body = await request.json(); }
  catch { return json5({ success: false, error: "Invalid activation request." }, 400); }

  const rawIdentifier = clean2(body?.identifier || body?.email || body?.account_number || body?.accountNumber);
  if (!rawIdentifier) return json5({ success: false, error: "Enter your Email Address or Customer Number." }, 400);

  // Email first-time setup: if the same active email is linked to multiple accounts,
  // create one dedicated shared-email credential without changing individual account passwords.
  if (rawIdentifier.includes("@")) {
    const emailKey = rawIdentifier.toLowerCase();
    const rows = await env.DB.prepare(`
      SELECT id,account_number,account_name,email,phone,password_hash,must_change_password,account_status
      FROM customers
      WHERE lower(trim(email))=?
      ORDER BY account_number
    `).bind(emailKey).all();
    const active = (rows?.results || []).filter((c) => {
      const status = clean2(c.account_status).toLowerCase();
      return !status || status === "active";
    });
    if (!active.length) return json5({ success: false, error: "We could not locate an active customer account for that email address." }, 404);

    if (active.length > 1) {
      const existingShared = await getSharedEmailCredential(env, emailKey);
      if (existingShared && clean2(existingShared.password_hash)) {
        return json5({ success: false, already_activated: true, activation_scope: "shared_email", error: "This shared email login has already been set up. Please use Customer Login." }, 409);
      }
      const customer = active[0];
      const recent = await env.DB.prepare(`
        SELECT id FROM customer_activation_codes
        WHERE customer_id=? AND purpose='shared_email_activation' AND used_at IS NULL
          AND created_at > datetime('now','-60 seconds')
        LIMIT 1
      `).bind(customer.id).first();
      if (!recent) {
        const code = randomCode();
        await storeCode(env, customer.id, code, "shared_email_activation");
        try { await sendActivationEmail(env, customer, code); }
        catch (error) {
          console.error(error);
          return json5({ success: false, error: "We could not send the verification email. Please contact Wooten Oil." }, 503);
        }
      }
      return json5({
        success: true,
        method: "email",
        activation_scope: "shared_email",
        identifier: emailKey,
        email: maskEmail(emailKey),
        linked_count: active.length,
        message: recent ? "A verification code was already sent to this email. Please check your inbox." : "A verification code was sent to your shared email address."
      });
    }

    // One account on this email: activate that specific customer account.
    body = { ...body, account_number: active[0].account_number };
  }

  const account = normalizeAccount2(body?.account_number || body?.accountNumber || rawIdentifier);
  if (!account) return json5({ success: false, error: "Enter a valid Customer Number." }, 400);
  const customer = await getCustomerByAccount(env, account);
  if (!customer) return json5({ success: false, error: "We could not locate that Customer Number." }, 404);
  const status = clean2(customer.account_status).toLowerCase();
  if (status && status !== "active") return json5({ success: false, error: "This account is not active. Please contact Wooten Oil." }, 403);
  if (clean2(customer.password_hash)) {
    return json5({ success: false, already_activated: true, activation_scope: "account", error: "This online account has already been activated. Please use Customer Login." }, 409);
  }
  if (clean2(customer.email)) {
    const recent = await env.DB.prepare(`
      SELECT id FROM customer_activation_codes
      WHERE customer_id=? AND purpose='email_activation' AND used_at IS NULL
        AND created_at > datetime('now','-60 seconds')
      LIMIT 1
    `).bind(customer.id).first();
    if (!recent) {
      const code = randomCode();
      await storeCode(env, customer.id, code, "email_activation");
      try { await sendActivationEmail(env, customer, code); }
      catch (error) {
        console.error(error);
        return json5({ success: false, error: "We could not send the verification email. Please contact Wooten Oil." }, 503);
      }
    }
    return json5({
      success: true,
      method: "email",
      activation_scope: "account",
      identifier: customer.account_number,
      account_number: customer.account_number,
      account_name: customer.account_name,
      email: maskEmail(customer.email),
      message: recent ? "A verification code was already sent to the email address on your account. Please check your inbox." : "A verification code was sent to the email address on your account."
    });
  }
  return json5({
    success: true,
    method: "office",
    activation_scope: "account",
    identifier: customer.account_number,
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
  if (!env.DB) return json5({ success: false, error: "Customer database is not configured." }, 503);
  let body;
  try { body = await request.json(); }
  catch { return json5({ success: false, error: "Invalid password request." }, 400); }

  const code = clean2(body?.code);
  const password = String(body?.password ?? "");
  const confirmPassword = String(body?.confirm_password ?? body?.confirmPassword ?? "");
  const activationScope = clean2(body?.activation_scope || body?.activationScope).toLowerCase();
  const identifier = clean2(body?.identifier || body?.email || body?.account_number);
  if (!identifier || !code || !password) return json5({ success: false, error: "Verification code and password are required." }, 400);
  if (confirmPassword && password !== confirmPassword) return json5({ success: false, error: "The passwords do not match." }, 400);
  if (password.length < 8 || !/[A-Za-z]/.test(password)) return json5({ success: false, error: "Your password must be at least 8 characters and contain at least one letter." }, 400);
  if (password.length > 128) return json5({ success: false, error: "Your password is too long." }, 400);

  if (activationScope === "shared_email") {
    const emailKey = identifier.toLowerCase();
    if (!emailKey.includes("@")) return json5({ success: false, error: "Invalid shared email activation request." }, 400);
    const rows = await env.DB.prepare(`
      SELECT id,account_number,account_name,email,account_status
      FROM customers
      WHERE lower(trim(email))=?
      ORDER BY account_number
    `).bind(emailKey).all();
    const active = (rows?.results || []).filter((c) => {
      const status = clean2(c.account_status).toLowerCase();
      return !status || status === "active";
    });
    if (active.length < 2) return json5({ success: false, error: "This email is not linked to multiple active customer accounts." }, 400);
    const existingShared = await getSharedEmailCredential(env, emailKey);
    if (existingShared && clean2(existingShared.password_hash)) {
      return json5({ success: false, already_activated: true, error: "This shared email login has already been set up." }, 409);
    }
    const customer = active[0];
    const activation = await findValidCode(env, customer.id, code);
    if (!activation || clean2(activation.purpose) !== "shared_email_activation") {
      return json5({ success: false, error: "The verification code is incorrect or has expired." }, 400);
    }
    let passwordHash;
    try { passwordHash = await createPasswordHash(password); }
    catch (error) {
      console.error("Shared email password hashing failed", error);
      return json5({ success: false, error: "We could not securely create your password. Please try again." }, 500);
    }
    try {
      await ensureSharedEmailCredentialTable(env);
      await env.DB.prepare(`
        INSERT INTO customer_shared_email_credentials(email_key,password_hash,created_at,updated_at)
        VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(email_key) DO UPDATE SET password_hash=excluded.password_hash,updated_at=CURRENT_TIMESTAMP
      `).bind(emailKey,passwordHash).run();
      await env.DB.prepare(`UPDATE customer_activation_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?`).bind(activation.id).run();
    } catch (error) {
      console.error("Shared email activation failed", error);
      return json5({ success: false, error: "We could not set up the shared email login." }, 500);
    }
    return json5({
      success: true,
      activated: true,
      shared_email_activated: true,
      activation_scope: "shared_email",
      email: emailKey,
      linked_count: active.length,
      message: "Your shared email login has been set up. Sign in with your email address and new password."
    });
  }

  const account = normalizeAccount2(body?.account_number || identifier);
  if (!account) return json5({ success: false, error: "Customer Number, verification code and password are required." }, 400);
  const customer = await getCustomerByAccount(env, account);
  if (!customer) return json5({ success: false, error: "Unable to activate this account." }, 400);
  if (clean2(customer.password_hash)) return json5({ success: false, already_activated: true, error: "This online account has already been activated." }, 409);
  const activation = await findValidCode(env, customer.id, code);
  if (!activation || clean2(activation.purpose) === "shared_email_activation") return json5({ success: false, error: "The verification code is incorrect or has expired." }, 400);
  let passwordHash;
  try { passwordHash = await createPasswordHash(password); }
  catch (error) {
    console.error("Password hashing failed", error);
    return json5({ success: false, error: "We could not securely create your password. Please try again." }, 500);
  }
  try {
    await env.DB.prepare(`
      UPDATE customers
      SET password_hash=?,must_change_password=0,account_status='active',updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(passwordHash,customer.id).run();
    await env.DB.prepare(`UPDATE customer_activation_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?`).bind(activation.id).run();
  } catch (error) {
    console.error("Customer activation failed", error);
    return json5({ success: false, error: "We could not activate the online account." }, 500);
  }
  return json5({
    success: true,
    activated: true,
    activation_scope: "account",
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

async function ensureSharedEmailPasswordResetTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS shared_email_password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_key TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      used_at TEXT
    )
  `).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_shared_email_reset_email ON shared_email_password_reset_tokens(email_key,created_at)`).run().catch(()=>{});
}
__name(ensureSharedEmailPasswordResetTable, "ensureSharedEmailPasswordResetTable");
async function sharedEmailResetHash(emailKey, code) {
  return sha2563(`shared-email:${clean3(emailKey).toLowerCase()}:${clean3(code)}`);
}
__name(sharedEmailResetHash, "sharedEmailResetHash");
async function storeSharedEmailResetCode(env, emailKey, code) {
  await ensureSharedEmailPasswordResetTable(env);
  const key = clean3(emailKey).toLowerCase();
  const hash = await sharedEmailResetHash(key, code);
  const expires = new Date(Date.now() + CODE_MINUTES2 * 60 * 1e3).toISOString();
  await env.DB.prepare(`UPDATE shared_email_password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE email_key=? AND used_at IS NULL`).bind(key).run();
  await env.DB.prepare(`INSERT INTO shared_email_password_reset_tokens(email_key,token_hash,expires_at,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`).bind(key,hash,expires).run();
  return expires;
}
__name(storeSharedEmailResetCode, "storeSharedEmailResetCode");
async function sendSharedEmailResetEmail(env, email, code) {
  if (!env.RESEND_API_KEY) throw new Error("Email service is not configured.");
  const fromAddress = clean3(env.FUEL_FROM_EMAIL) || "support@wootenoil.com";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "WootenOilCustomerPortal/1.0" },
    body: JSON.stringify({
      from: `Wooten Oil <${fromAddress}>`,
      to: [email],
      subject: "Wooten Oil Shared Email Login Password Reset",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033;line-height:1.6"><h2 style="color:#0b2239">Wooten Oil</h2><p>Use this verification code to reset the password for your <strong>Shared Email Login</strong>:</p><div style="font-size:32px;font-weight:800;letter-spacing:7px;background:#f3f6f9;border-radius:12px;padding:18px;text-align:center">${code}</div><p>This reset applies only to the password used to sign in with <strong>${escapeHtml2(email)}</strong> and switch between linked accounts. Individual customer account passwords will not be changed.</p><p>This code expires in ${CODE_MINUTES2} minutes. If you did not request this password reset, you can ignore this email.</p></div>`
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Resend shared email password reset error", data);
    throw new Error("Shared email password reset email could not be sent.");
  }
}
__name(sendSharedEmailResetEmail, "sendSharedEmailResetEmail");

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
  const sid = clean3(env.TWILIO_ACCOUNT_SID), token = clean3(env.TWILIO_AUTH_TOKEN);
  const messagingServiceSid = clean3(env.TWILIO_MESSAGING_SERVICE_SID);
  const from = clean3(env.TWILIO_PHONE_NUMBER || env.TWILIO_FROM_NUMBER);
  if (!sid || !token || (!messagingServiceSid && !from)) throw new Error("SMS service is not configured.");
  let digits = clean3(customer.phone).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) throw new Error("The phone number on this account is not a complete U.S. number.");
  const to = `+1${digits}`;
  const bodyData = { To: to, Body: `WOOTEN OIL CO INC\nPassword reset code: ${code}\nExpires in ${CODE_MINUTES2} minutes.\nPlease do not reply.` };
  if (messagingServiceSid) bodyData.MessagingServiceSid = messagingServiceSid;
  else bodyData.From = from;
  const body = new URLSearchParams(bodyData);
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
  try { body = await request.json(); } catch { return json6({ success: false, error: "Invalid password reset request." }, 400); }
  const identifier = clean3(body?.identifier || body?.user || body?.account_number || body?.email);
  const requestedMethod = clean3(body?.method).toLowerCase();
  if (!identifier) return json6({ success: false, error: "Enter the email address or Customer Number on the account." }, 400);

  // Shared-email recovery is an email-level credential. Never attach it to a specific customer account.
  if (identifier.includes("@")) {
    const emailKey = identifier.toLowerCase();
    const sharedCredential = await getSharedEmailCredential(env, emailKey);
    const linked = await env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM customers
      WHERE lower(trim(email))=?
        AND (account_status IS NULL OR trim(account_status)='' OR lower(trim(account_status))='active')
    `).bind(emailKey).first();
    const linkedCount = Number(linked?.total || 0);
    if (sharedCredential && linkedCount > 1) {
      const methods = [{ method: "email", label: "Email", destination: maskEmail2(emailKey) }];
      if (!requestedMethod) {
        return json6({
          success: true,
          method: "choose",
          reset_scope: "shared_email",
          email: emailKey,
          methods,
          message: "Reset the password for your Shared Email Login. This will not change any individual customer account password."
        });
      }
      if (requestedMethod !== "email") return json6({ success: false, error: "Shared Email Login password recovery is available by email only." }, 400);
      await ensureSharedEmailPasswordResetTable(env);
      const recent = await env.DB.prepare(`SELECT id FROM shared_email_password_reset_tokens WHERE email_key=? AND used_at IS NULL AND created_at > datetime('now','-60 seconds') LIMIT 1`).bind(emailKey).first();
      if (recent) return json6({ success: false, wait: true, error: "A reset code was already requested recently. Please wait about one minute before trying again." }, 429);
      const code = randomCode2();
      await storeSharedEmailResetCode(env, emailKey, code);
      try {
        await sendSharedEmailResetEmail(env, emailKey, code);
      } catch (e) {
        console.error(e);
        return json6({ success: false, error: "We could not send the Shared Email Login password reset email. Please contact Wooten Oil." }, 503);
      }
      return json6({
        success: true,
        method: "email",
        reset_scope: "shared_email",
        email: emailKey,
        destination: maskEmail2(emailKey),
        message: "A 6-digit Shared Email Login password reset code was sent to your email."
      });
    }
  }

  const customer = await findCustomer(env, identifier);
  if (!customer) return json6({ success: false, error: "We could not locate an account with that email or Customer Number." }, 404);
  if (clean3(customer.account_status).toLowerCase() && clean3(customer.account_status).toLowerCase() !== "active") return json6({ success: false, error: "This account is not active. Please contact Wooten Oil." }, 403);
  if (!clean3(customer.password_hash)) return json6({ success: false, setup_required: true, account_number: customer.account_number, error: "This online account has not been activated yet. Please use First time here? Activate Online Account." }, 409);

  const emailAvailable = !!clean3(customer.email);
  let phoneDigits = clean3(customer.phone).replace(/\D/g, "");
  if (phoneDigits.length === 11 && phoneDigits.startsWith("1")) phoneDigits = phoneDigits.slice(1);
  const smsConfigured = !!(clean3(env.TWILIO_ACCOUNT_SID) && clean3(env.TWILIO_AUTH_TOKEN) && (clean3(env.TWILIO_MESSAGING_SERVICE_SID) || clean3(env.TWILIO_PHONE_NUMBER) || clean3(env.TWILIO_FROM_NUMBER)));
  const smsAvailable = phoneDigits.length === 10 && smsConfigured;
  const methods = [];
  if (emailAvailable) methods.push({ method: "email", label: "Email", destination: maskEmail2(customer.email) });
  if (smsAvailable) methods.push({ method: "sms", label: "Text Message", destination: maskPhone(customer.phone) });

  if (!requestedMethod) {
    if (!methods.length) return json6({ success: true, method: "office", account_number: customer.account_number, methods: [], message: "There is no email address or SMS-capable phone setup available for automatic recovery. Please contact Wooten Oil for password assistance." });
    return json6({ success: true, method: "choose", reset_scope: "account", account_number: customer.account_number, methods, message: methods.length > 1 ? "Choose where you want to receive your 6-digit verification code." : "Choose the available recovery method to receive your 6-digit verification code." });
  }

  if (!methods.some(m => m.method === requestedMethod)) return json6({ success: false, error: "That password recovery method is not available for this account." }, 400);
  const recent = await env.DB.prepare(`SELECT id FROM password_reset_tokens WHERE customer_id=? AND used_at IS NULL AND created_at > datetime('now','-60 seconds') LIMIT 1`).bind(customer.id).first();
  if (recent) return json6({ success: false, wait: true, error: "A reset code was already requested recently. Please wait about one minute before trying again." }, 429);
  const code = randomCode2();
  await storeResetCode(env, customer.id, code);
  try {
    if (requestedMethod === "email") await sendResetEmail(env, customer, code);
    else await sendResetSms(env, customer, code);
  } catch (e) {
    console.error(e);
    return json6({ success: false, error: requestedMethod === "email" ? "We could not send the password reset email. Please contact Wooten Oil." : "We could not send the password reset text. Please contact Wooten Oil." }, 503);
  }
  const destination = requestedMethod === "email" ? maskEmail2(customer.email) : maskPhone(customer.phone);
  return json6({ success: true, method: requestedMethod, reset_scope: "account", account_number: customer.account_number, destination, message: `A 6-digit password reset code was sent ${requestedMethod === "email" ? "to your email" : "by text message"}.` });
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
    if (password.length < 8 || !/[A-Za-z]/.test(password)) return json6({ success: false, error: "Your password must be at least 8 characters and contain at least one letter." }, 400);
    if (password.length > 128) return json6({ success: false, error: "Your password is too long." }, 400);

    // For an email identifier, first check for a valid Shared Email Login reset token.
    if (identifier.includes("@")) {
      const emailKey = identifier.toLowerCase();
      await ensureSharedEmailPasswordResetTable(env);
      const sharedHash = await sharedEmailResetHash(emailKey, code);
      const sharedToken = await env.DB.prepare(`
        SELECT id
        FROM shared_email_password_reset_tokens
        WHERE email_key=? AND token_hash=? AND used_at IS NULL
          AND datetime(expires_at) > datetime('now')
        ORDER BY id DESC LIMIT 1
      `).bind(emailKey,sharedHash).first();
      if (sharedToken) {
        const existingShared = await getSharedEmailCredential(env,emailKey);
        if (!existingShared) return json6({ success: false, error: "This Shared Email Login is not set up. Please use First Time Login." }, 409);
        const passwordHash = await createPasswordHash2(password);
        await env.DB.prepare(`UPDATE customer_shared_email_credentials SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE email_key=?`).bind(passwordHash,emailKey).run();
        await env.DB.prepare(`UPDATE shared_email_password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?`).bind(sharedToken.id).run().catch(()=>{});
        await ensureCustomerSessionScopeColumns(env);
        await env.DB.prepare(`DELETE FROM customer_sessions WHERE login_method='email' AND lower(trim(COALESCE(verified_email,'')))=?`).bind(emailKey).run().catch(()=>{});
        return json6({ success: true, reset_scope: "shared_email", email: emailKey, message: "Your Shared Email Login password has been reset. You can now sign in with your email and new password." });
      }
    }

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


async function customerChangePassword({ request, env }) {
  try {
    if (!env.DB) return json6({ success: false, error: "Customer database is not configured." }, 503);
    const session = await getCustomerFromSession(request, env);
    if (!session) return json6({ success: false, error: "Your customer session has expired. Please sign in again." }, 401);
    let body;
    try { body = await request.json(); } catch { return json6({ success: false, error: "Invalid password change request." }, 400); }
    const currentPassword = String(body?.current_password ?? body?.currentPassword ?? "");
    const newPassword = String(body?.new_password ?? body?.newPassword ?? "");
    const confirmPassword = String(body?.confirm_password ?? body?.confirmPassword ?? "");
    if (!currentPassword) return json6({ success: false, error: "Enter your current password." }, 400);
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword)) return json6({ success: false, error: "Your new password must be at least 8 characters and contain at least one letter." }, 400);
    if (newPassword.length > 128) return json6({ success: false, error: "Your new password is too long." }, 400);
    if (newPassword !== confirmPassword) return json6({ success: false, error: "The new passwords do not match." }, 400);
    if (newPassword === currentPassword) return json6({ success: false, error: "Choose a new password that is different from your current password." }, 400);
    const customer = await env.DB.prepare(`SELECT id,password_hash,account_number FROM customers WHERE id=? LIMIT 1`).bind(session.id).first();
    if (!customer || !clean(customer.password_hash) || !(await verifyPassword(currentPassword, customer.password_hash))) {
      return json6({ success: false, error: "Your current password is incorrect." }, 403);
    }
    const passwordHash = await createPasswordHash2(newPassword);
    const result = await env.DB.prepare(`UPDATE customers SET password_hash=?,must_change_password=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(passwordHash, customer.id).run();
    const changed = Number(result?.meta?.changes ?? result?.changes ?? 0);
    if (changed < 1) return json6({ success: false, error: "The new password could not be saved." }, 500);
    // Password changes invalidate every existing session for this customer, including the current one.
    try { await env.DB.prepare(`DELETE FROM customer_sessions WHERE customer_id=?`).bind(customer.id).run(); } catch (e) { console.error("password change session cleanup failed", e); }
    return json6({ success: true, account_number: customer.account_number, message: "Your password has been changed. Please sign in again." }, 200, { "Set-Cookie": clearSessionCookie() });
  } catch (e) {
    console.error("Customer password change failed", e);
    return json6({ success: false, error: "Password could not be changed right now." }, 500);
  }
}
__name(customerChangePassword, "customerChangePassword");

async function customerChangeSharedEmailPassword({ request, env }) {
  try {
    if (!env.DB) return json6({ success: false, error: "Customer database is not configured." }, 503);
    const session = await getCustomerFromSession(request, env);
    if (!session) return json6({ success: false, error: "Your customer session has expired. Please sign in again." }, 401);
    const linkedScope = clean(session.login_method).toLowerCase() === "email" && clean(session.session_scope).toLowerCase() === "linked";
    const emailKey = clean(session.verified_email || session.email).toLowerCase();
    if (!linkedScope || !emailKey) return json6({ success: false, error: "Shared-email password changes are available only when you sign in with your email address." }, 403);
    let body;
    try { body = await request.json(); } catch { return json6({ success: false, error: "Invalid password change request." }, 400); }
    const currentPassword = String(body?.current_password ?? body?.currentPassword ?? "");
    const newPassword = String(body?.new_password ?? body?.newPassword ?? "");
    const confirmPassword = String(body?.confirm_password ?? body?.confirmPassword ?? "");
    if (!currentPassword) return json6({ success: false, error: "Enter your current shared-email password." }, 400);
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword)) return json6({ success: false, error: "Your new password must be at least 8 characters and contain at least one letter." }, 400);
    if (newPassword.length > 128) return json6({ success: false, error: "Your new password is too long." }, 400);
    if (newPassword !== confirmPassword) return json6({ success: false, error: "The new passwords do not match." }, 400);
    if (newPassword === currentPassword) return json6({ success: false, error: "Choose a new password that is different from your current password." }, 400);

    const existing = await getSharedEmailCredential(env, emailKey);
    let currentValid = false;
    if (existing && clean(existing.password_hash)) currentValid = await verifyPassword(currentPassword, existing.password_hash);
    else currentValid = await verifyLegacySharedEmailPassword(env, emailKey, currentPassword);
    if (!currentValid) return json6({ success: false, error: "Your current shared-email password is incorrect." }, 403);

    const passwordHash = await createPasswordHash2(newPassword);
    await ensureSharedEmailCredentialTable(env);
    await env.DB.prepare(`
      INSERT INTO customer_shared_email_credentials(email_key,password_hash,created_at,updated_at)
      VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(email_key) DO UPDATE SET password_hash=excluded.password_hash,updated_at=CURRENT_TIMESTAMP
    `).bind(emailKey,passwordHash).run();

    // Sign out every linked-email session for this shared email, but leave account-number sessions alone.
    await ensureCustomerSessionScopeColumns(env);
    try {
      await env.DB.prepare(`DELETE FROM customer_sessions WHERE login_method='email' AND lower(trim(COALESCE(verified_email,'')))=?`).bind(emailKey).run();
    } catch (e) { console.error("shared email password session cleanup failed", e); }
    return json6({ success: true, email: emailKey, message: "Your shared-email password has been changed. Please sign in again." }, 200, { "Set-Cookie": clearSessionCookie() });
  } catch (e) {
    console.error("Shared email password change failed", e);
    return json6({ success: false, error: "Shared-email password could not be changed right now." }, 500);
  }
}
__name(customerChangeSharedEmailPassword, "customerChangeSharedEmailPassword");

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
    if(!cols.includes("sms_status")){
      await env.DB.prepare(`ALTER TABLE portal_notifications ADD COLUMN sms_status TEXT`).run();
    }
    if(!cols.includes("sms_error_code")){
      await env.DB.prepare(`ALTER TABLE portal_notifications ADD COLUMN sms_error_code TEXT`).run();
    }
    if(!cols.includes("sms_updated_at")){
      await env.DB.prepare(`ALTER TABLE portal_notifications ADD COLUMN sms_updated_at TEXT`).run();
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
  const info=await env.DB.prepare(`PRAGMA table_info(admin_communication_log)`).all();
  const cols=(info?.results||[]).map(row=>String(row.name||"").toLowerCase());
  const additions=[
    ["sms_status","TEXT"],["sms_error_code","TEXT"],["sms_error_message","TEXT"],
    ["sms_to","TEXT"],["sms_body","TEXT"],["sms_updated_at","TEXT"],
    ["sms_delivered_at","TEXT"],["sms_failed_at","TEXT"],["sms_opted_out_at","TEXT"],
    ["resend_of_id","INTEGER"],["attempt_no","INTEGER NOT NULL DEFAULT 1"]
  ];
  for(const [name,type] of additions){
    if(!cols.includes(name)) await env.DB.prepare(`ALTER TABLE admin_communication_log ADD COLUMN ${name} ${type}`).run();
  }
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_communication_log_account_created
    ON admin_communication_log(account_number,created_at DESC,id DESC)
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_communication_log_sms_sid
    ON admin_communication_log(sms_sid)
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS sms_contact_preferences (
      phone_e164 TEXT PRIMARY KEY,
      opted_out INTEGER NOT NULL DEFAULT 0,
      opt_out_type TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare(`
    UPDATE admin_communication_log SET sms_status='pending'
    WHERE COALESCE(sms_status,'')='' AND sms_sent=1 AND COALESCE(sms_sid,'')<>''
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
    const page=Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get("page")||"1",10)||1));
    const pageSize=20;
    const clauses=[];
    const binds=[];
    if(from){clauses.push("date(l.created_at)>=date(?)");binds.push(from);}
    if(to){clauses.push("date(l.created_at)<=date(?)");binds.push(to);}
    if(["notification","statement","invoice"].includes(type)){clauses.push("l.event_type=?");binds.push(type);}
    if(account){clauses.push("l.account_number=?");binds.push(account);}
    if(q){clauses.push("(lower(l.account_number) LIKE ? OR lower(COALESCE(c.account_name,'')) LIKE ?)");binds.push(`%${q}%`,`%${q}%`);}
    const where=clauses.length?`WHERE ${clauses.join(" AND ")}`:"";
    if(account){
      const countRow=await env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM admin_communication_log l
        LEFT JOIN customers c ON c.account_number=l.account_number
        ${where}
      `).bind(...binds).first();
      const total=Number(countRow?.total||0);
      const pages=Math.max(1,Math.ceil(total/pageSize));
      const safePage=Math.min(page,pages);
      const offset=(safePage-1)*pageSize;
      const result=await env.DB.prepare(`
        SELECT l.*,COALESCE(c.account_name,'Customer') AS account_name,c.phone,c.email,
          CASE
            WHEN l.event_type IN ('statement','invoice') AND l.source_type='document' THEN l.source_id
            WHEN l.event_type IN ('statement','invoice') AND l.source_type='notification' THEN (
              SELECT n.action_id FROM portal_notifications n
              WHERE n.id=l.source_id AND n.action_type='customer_documents'
              LIMIT 1
            )
            ELSE NULL
          END AS document_id
        FROM admin_communication_log l
        LEFT JOIN customers c ON c.account_number=l.account_number
        ${where}
        ORDER BY l.created_at DESC,l.id DESC
        LIMIT ? OFFSET ?
      `).bind(...binds,pageSize,offset).all();
      return notificationJson({success:true,account_number:account,page:safePage,page_size:pageSize,total,pages,entries:result?.results||[]});
    }
    const countRow=await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM (
        SELECT l.account_number
        FROM admin_communication_log l
        LEFT JOIN customers c ON c.account_number=l.account_number
        ${where}
        GROUP BY l.account_number,c.account_name,c.phone,c.email
      ) grouped_customers
    `).bind(...binds).first();
    const total=Number(countRow?.total||0);
    const pages=Math.max(1,Math.ceil(total/pageSize));
    const safePage=Math.min(page,pages);
    const offset=(safePage-1)*pageSize;
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
      LIMIT ? OFFSET ?
    `).bind(...binds,pageSize,offset).all();
    return notificationJson({success:true,page:safePage,page_size:pageSize,total,pages,customers:result?.results||[]});
  }catch(error){
    console.error("adminCommunicationLogGet failed",error);
    return notificationJson({success:false,error:"Communication log could not be loaded. "+String(error?.message||error)},500);
  }
}
__name(adminCommunicationLogGet,"adminCommunicationLogGet");

async function adminCommunicationLogResend({request,env}){
  try{
    const supplied=request.headers.get("X-Admin-Key")||"";
    if(!env.ADMIN_IMPORT_KEY||supplied!==env.ADMIN_IMPORT_KEY) return notificationJson({success:false,error:"Unauthorized."},401);
    const body=await request.json().catch(()=>({}));
    const id=Number.parseInt(body.id,10);
    if(!id) return notificationJson({success:false,error:"A communication log ID is required."},400);
    await ensureAdminCommunicationLogTable(env);
    const original=await env.DB.prepare(`SELECT * FROM admin_communication_log WHERE id=? LIMIT 1`).bind(id).first();
    if(!original) return notificationJson({success:false,error:"Communication record was not found."},404);
    if(String(original.sms_status||"")!=="failed") return notificationJson({success:false,error:"Only a failed SMS can be resent."},409);
    const to=twilioNormalizePhone(original.sms_to||"");
    if(!to||!String(original.sms_body||"").trim()) return notificationJson({success:false,error:"This older record does not contain the phone number and message needed for resend."},409);
    const preference=await env.DB.prepare(`SELECT opted_out FROM sms_contact_preferences WHERE phone_e164=?`).bind(to).first();
    if(Number(preference?.opted_out||0)===1) return notificationJson({success:false,error:"This customer has opted out of SMS messages."},409);
    const rootId=Number(original.resend_of_id||original.id);
    const attemptRow=await env.DB.prepare(`SELECT MAX(attempt_no) AS attempt FROM admin_communication_log WHERE id=? OR resend_of_id=?`).bind(rootId,rootId).first();
    const attempt=Math.max(1,Number(attemptRow?.attempt||1))+1;
    let sent=null,error=null,status="failed",code="";
    try{
      sent=await twilioSendSms(env,to,original.sms_body,{statusCallbackUrl:twilioCallbackUrl(request,"/api/twilio/message-status")});
      status="pending";
    }catch(caught){
      error=caught;
      code=String(caught?.twilioCode||"");
      status=code==="21610"?"opted_out":"failed";
      if(status==="opted_out") await twilioRememberOptOut(env,to,true,"STOP");
    }
    const errorMessage=error?twilioErrorDescription(code,String(error?.message||error)):"";
    const sourceType=`sms_resend_${crypto.randomUUID()}`;
    const inserted=await env.DB.prepare(`
      INSERT INTO admin_communication_log
        (account_number,event_type,title,detail,source_type,source_id,portal_sent,email_sent,sms_sent,sms_sid,error_text,
         sms_status,sms_error_code,sms_error_message,sms_to,sms_body,sms_updated_at,sms_failed_at,sms_opted_out_at,resend_of_id,attempt_no,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,
        CASE WHEN ?='failed' THEN CURRENT_TIMESTAMP ELSE NULL END,
        CASE WHEN ?='opted_out' THEN CURRENT_TIMESTAMP ELSE NULL END,?,?,CURRENT_TIMESTAMP)
    `).bind(
      original.account_number,original.event_type,original.title,original.detail,sourceType,rootId,0,0,sent?1:0,
      sent?.sid||"",errorMessage,status,code,errorMessage,to,original.sms_body,status,status,rootId,attempt
    ).run();
    const newId=inserted?.meta?.last_row_id||inserted?.meta?.last_insert_rowid||null;
    if(error) return notificationJson({success:false,error:errorMessage,status,log_id:newId},422);
    return notificationJson({success:true,status:"pending",sms_sid:sent.sid||"",log_id:newId,attempt_no:attempt});
  }catch(error){
    console.error("adminCommunicationLogResend failed",error);
    return notificationJson({success:false,error:"The SMS could not be resent. "+String(error?.message||error)},500);
  }
}
__name(adminCommunicationLogResend,"adminCommunicationLogResend");

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
function twilioCallbackUrl(request,path){
  const url=new URL(request.url);
  return `${url.origin}${path}`;
}
__name(twilioCallbackUrl,"twilioCallbackUrl");
function twilioDeliveryStatus(value,errorCode=""){
  const status=String(value||"").trim().toLowerCase();
  if(String(errorCode||"")==="21610") return "opted_out";
  if(status==="delivered") return "delivered";
  if(status==="failed"||status==="undelivered") return "failed";
  if(status==="opted_out") return "opted_out";
  return "pending";
}
__name(twilioDeliveryStatus,"twilioDeliveryStatus");
function twilioErrorDescription(code,fallback=""){
  const messages={
    "21610":"The customer has opted out of SMS messages.","21211":"The destination phone number is invalid.",
    "21614":"The destination is not a mobile number.","30003":"The destination handset is unavailable.",
    "30004":"The message was blocked by the destination carrier.","30005":"The destination number is unknown or inactive.",
    "30006":"The destination is a landline or cannot receive SMS.","30007":"The message was filtered by the carrier.",
    "30008":"The carrier could not deliver the message.","30017":"The carrier network is congested.",
    "30034":"The message requires an approved A2P campaign."
  };
  return String(fallback||messages[String(code||"")]||(`Twilio delivery error ${code||"unknown"}.`));
}
__name(twilioErrorDescription,"twilioErrorDescription");
async function twilioSendSms(env,to,body,options={}){
  const config=twilioConfig(env);
  if(!config.configured) throw new Error(`Twilio is not configured. Missing: ${config.missing.join(", ")}.`);
  const normalizedTo=twilioNormalizePhone(to);
  if(!normalizedTo) throw new Error("Customer phone number is not a valid U.S./E.164 number.");
  if(env?.DB){
    await ensureAdminCommunicationLogTable(env);
    const preference=await env.DB.prepare(`SELECT opted_out FROM sms_contact_preferences WHERE phone_e164=?`).bind(normalizedTo).first();
    if(Number(preference?.opted_out||0)===1){
      const optedOutError=new Error("The customer has opted out of SMS messages.");
      optedOutError.twilioCode="21610";
      throw optedOutError;
    }
  }
  const text=String(body||"").trim();
  if(!text) throw new Error("SMS message is empty.");
  const params=new URLSearchParams();
  params.set("To",normalizedTo);
  params.set("Body",text.slice(0,1500));
  if(config.messagingServiceSid) params.set("MessagingServiceSid",config.messagingServiceSid);
  else params.set("From",config.phoneNumber);
  if(options.statusCallbackUrl) params.set("StatusCallback",String(options.statusCallbackUrl));
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,{
    method:"POST",
    headers:{"Authorization":`Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,"Content-Type":"application/x-www-form-urlencoded"},
    body:params.toString()
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(String(data?.message||`Twilio request failed with status ${response.status}.`));
    error.twilioCode=String(data?.code||"");
    error.twilioStatus=response.status;
    throw error;
  }
  return {sid:String(data?.sid||""),status:String(data?.status||""),to:normalizedTo};
}
__name(twilioSendSms,"twilioSendSms");

async function twilioValidateWebhook(request,params,env){
  const supplied=String(request.headers.get("X-Twilio-Signature")||"");
  const token=String(env.TWILIO_AUTH_TOKEN||"");
  if(!supplied||!token) return false;
  const entries=[...params.entries()].sort((a,b)=>a[0]===b[0]?a[1].localeCompare(b[1]):a[0].localeCompare(b[0]));
  let signed=request.url;
  for(const [key,value] of entries) signed+=key+value;
  const cryptoKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(token),{name:"HMAC",hash:"SHA-1"},false,["sign"]);
  const digest=new Uint8Array(await crypto.subtle.sign("HMAC",cryptoKey,new TextEncoder().encode(signed)));
  const expected=btoa(String.fromCharCode(...digest));
  if(expected.length!==supplied.length) return false;
  let difference=0;
  for(let index=0;index<expected.length;index++) difference|=expected.charCodeAt(index)^supplied.charCodeAt(index);
  return difference===0;
}
__name(twilioValidateWebhook,"twilioValidateWebhook");
async function twilioRememberOptOut(env,phone,optedOut,type=""){
  const normalized=twilioNormalizePhone(phone);
  if(!normalized) return;
  await ensureAdminCommunicationLogTable(env);
  await env.DB.prepare(`
    INSERT INTO sms_contact_preferences(phone_e164,opted_out,opt_out_type,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(phone_e164) DO UPDATE SET opted_out=excluded.opted_out,opt_out_type=excluded.opt_out_type,updated_at=CURRENT_TIMESTAMP
  `).bind(normalized,optedOut?1:0,String(type||"")).run();
}
__name(twilioRememberOptOut,"twilioRememberOptOut");
async function twilioMessageStatusPost({request,env}){
  const params=new URLSearchParams(await request.text());
  if(!await twilioValidateWebhook(request,params,env)) return notificationJson({success:false,error:"Invalid Twilio signature."},403);
  await ensureCustomerNotificationsTable(env);
  await ensureAdminCommunicationLogTable(env);
  const sid=String(params.get("MessageSid")||params.get("SmsSid")||"");
  const code=String(params.get("ErrorCode")||"");
  const status=twilioDeliveryStatus(params.get("MessageStatus")||params.get("SmsStatus"),code);
  const errorMessage=(status==="failed"||status==="opted_out")?twilioErrorDescription(code,params.get("ErrorMessage")||""):"";
  const current=await env.DB.prepare(`SELECT sms_status,sms_to FROM admin_communication_log WHERE sms_sid=? LIMIT 1`).bind(sid).first();
  const currentStatus=String(current?.sms_status||"");
  if(currentStatus==="opted_out"||(status==="pending"&&["delivered","failed","opted_out"].includes(currentStatus))) return new Response(null,{status:204});
  if(code==="21610"){
    if(current?.sms_to) await twilioRememberOptOut(env,current.sms_to,true,"STOP");
  }
  await env.DB.prepare(`
    UPDATE admin_communication_log SET
      sms_status=?,sms_error_code=?,sms_error_message=?,sms_updated_at=CURRENT_TIMESTAMP,
      sms_delivered_at=CASE WHEN ?='delivered' THEN CURRENT_TIMESTAMP ELSE sms_delivered_at END,
      sms_failed_at=CASE WHEN ?='failed' THEN CURRENT_TIMESTAMP ELSE sms_failed_at END,
      sms_opted_out_at=CASE WHEN ?='opted_out' THEN CURRENT_TIMESTAMP ELSE sms_opted_out_at END,
      error_text=CASE WHEN ?<>'' THEN ? ELSE error_text END
    WHERE sms_sid=? AND COALESCE(sms_status,'')<>'delivered'
  `).bind(status,code,errorMessage,status,status,status,errorMessage,errorMessage,sid).run();
  await env.DB.prepare(`
    UPDATE portal_notifications SET sms_status=?,sms_error_code=?,sms_error=?,sms_updated_at=CURRENT_TIMESTAMP
    WHERE sms_sid=?
  `).bind(status,code,errorMessage,sid).run();
  try{
    await ensureTwilioPhoneToolsSchema(env);
    const verification=await env.DB.prepare(`SELECT phone_e164 FROM twilio_sms_verification WHERE sms_sid=? LIMIT 1`).bind(sid).first();
    if(code==="21610"&&verification?.phone_e164)await twilioRememberOptOut(env,verification.phone_e164,true,"STOP");
    await env.DB.prepare(`UPDATE twilio_sms_verification SET status=?,error_code=?,error_message=?,updated_at=CURRENT_TIMESTAMP,delivered_at=CASE WHEN ?='delivered' THEN CURRENT_TIMESTAMP ELSE delivered_at END WHERE sms_sid=?`).bind(status,code,errorMessage,status,sid).run();
  }catch(verificationError){console.error("Twilio SMS verification callback update failed",verificationError);}
  return new Response(null,{status:204});
}
__name(twilioMessageStatusPost,"twilioMessageStatusPost");
async function twilioIncomingMessagePost({request,env}){
  const params=new URLSearchParams(await request.text());
  if(!await twilioValidateWebhook(request,params,env)) return notificationJson({success:false,error:"Invalid Twilio signature."},403);
  const phone=String(params.get("From")||"");
  const optType=String(params.get("OptOutType")||"").trim().toUpperCase();
  const body=String(params.get("Body")||"").trim().toUpperCase();
  const action=optType||(["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT"].includes(body)?"STOP":["START","YES","UNSTOP"].includes(body)?"START":"");
  if(action==="STOP"){
    await twilioRememberOptOut(env,phone,true,"STOP");
    const normalized=twilioNormalizePhone(phone);
    await env.DB.prepare(`UPDATE admin_communication_log SET sms_status='opted_out',sms_opted_out_at=CURRENT_TIMESTAMP,sms_updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM admin_communication_log WHERE sms_to=? ORDER BY created_at DESC,id DESC LIMIT 1)`).bind(normalized).run();
  }else if(action==="START") await twilioRememberOptOut(env,phone,false,"START");
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>',{status:200,headers:{"Content-Type":"text/xml; charset=utf-8"}});
}
__name(twilioIncomingMessagePost,"twilioIncomingMessagePost");

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

async function ensurePortalShortStatementLinksTable(env){
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS portal_short_statement_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code_hash TEXT NOT NULL UNIQUE,
      document_id INTEGER NOT NULL,
      account_number TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_portal_short_statement_links_account
    ON portal_short_statement_links(account_number, document_id)
  `).run();
}
__name(ensurePortalShortStatementLinksTable,"ensurePortalShortStatementLinksTable");

function portalShortCode(){
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes=new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code="";
  for(const value of bytes) code+=alphabet[value%alphabet.length];
  return code;
}
__name(portalShortCode,"portalShortCode");

async function createPortalShortStatementLink({request,env,documentId,accountNumber}){
  await ensurePortalShortStatementLinksTable(env);
  for(let attempt=0;attempt<6;attempt++){
    const code=portalShortCode();
    const result=await env.DB.prepare(`
      INSERT OR IGNORE INTO portal_short_statement_links
        (code_hash, document_id, account_number, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(await sha256(code),documentId,accountNumber).run();
    if(Number(result?.meta?.changes||0)>0){
      return `${new URL(request.url).origin}/s/${code}`;
    }
  }
  throw new Error("A short statement link could not be created.");
}
__name(createPortalShortStatementLink,"createPortalShortStatementLink");

async function portalShortStatementLinkGet({request,env}){
  try{
    if(!env.DB) return new Response("Document storage is not configured.",{status:503});
    const url=new URL(request.url);
    const code=decodeURIComponent(url.pathname.split("/").filter(Boolean).pop()||"");
    if(!/^[A-Za-z0-9]{6,16}$/.test(code)) return new Response("Document link is invalid.",{status:404});
    await ensureCustomerDocumentsTable(env);
    await ensurePortalShortStatementLinksTable(env);
    const row=await env.DB.prepare(`
      SELECT l.document_id,l.account_number
      FROM portal_short_statement_links l
      INNER JOIN portal_customer_documents d ON d.id=l.document_id
      WHERE l.code_hash=? AND d.account_number=l.account_number
      LIMIT 1
    `).bind(await sha256(code)).first();
    if(!row) return new Response("Document link was not found.",{status:404});
    const longLink=await createPortalStatementLink({
      request,env,documentId:Number(row.document_id),accountNumber:row.account_number
    });
    return Response.redirect(longLink,302);
  }catch(error){
    console.error("portalShortStatementLinkGet failed",error);
    return new Response("Document could not be opened.",{status:500});
  }
}
__name(portalShortStatementLinkGet,"portalShortStatementLinkGet");

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
      // Cross-account document access is allowed only for sessions that were
      // authenticated by email and explicitly carry linked-account scope.
      // Account-number logins remain locked to their exact customer account.
      const linkedScope=clean(customer.login_method).toLowerCase()==="email" && clean(customer.session_scope).toLowerCase()==="linked";
      if(!linkedScope){
        return new Response("This document belongs to a different customer account.",{status:403});
      }
      const linkedEmail=clean(customer.verified_email).toLowerCase();
      let linkedTarget=null;
      if(linkedEmail){
        linkedTarget=await env.DB.prepare(`
          SELECT *
          FROM customers
          WHERE account_number = ?
            AND lower(trim(email)) = ?
          LIMIT 1
        `).bind(normalizeNotificationAccount(row.account_number),linkedEmail).first();
      }
      const linkedTargetStatus=clean(linkedTarget?.account_status).toLowerCase();
      if(!linkedTarget || (linkedTargetStatus && linkedTargetStatus!=="active")){
        return new Response("This document belongs to a different customer account.",{status:403});
      }

      // Switch the existing authenticated session to the linked account that
      // owns this document before returning it. This is the same permission
      // boundary used by /api/customer/account-switch.
      await env.DB.prepare(`
        UPDATE customer_sessions
        SET customer_id = ?, last_seen_at = ?
        WHERE id = ?
      `).bind(linkedTarget.id,new Date().toISOString(),customer.session_id).run();
      await recordCustomerLoginActivity(env,request,linkedTarget,"document_link_switch");
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
async function twilioStatusRequest(url,config){
  const response=await fetch(url,{headers:{Authorization:`Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,Accept:"application/json"}});
  const data=await response.json().catch(()=>({}));
  const code=String(data?.code||response.status||"");
  const message=String(data?.message||data?.detail||data?.status||`HTTP ${response.status}`);
  return {ok:response.ok,status:response.status,code,message,data};
}
__name(twilioStatusRequest,"twilioStatusRequest");
async function adminTwilioBalanceGet({request,env}){
  const supplied=request.headers.get("X-Admin-Key")||"";
  if(!env.ADMIN_IMPORT_KEY||supplied!==env.ADMIN_IMPORT_KEY) return notificationJson({success:false,error:"Unauthorized."},401);
  const config=twilioConfig(env);
  if(!config.accountSid||!config.authToken) return notificationJson({success:false,error:"Twilio Account SID or Auth Token is not configured."},400);
  const balanceTest=await twilioStatusRequest(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Balance.json`,config);
  if(!balanceTest.ok){
    const detail=`${balanceTest.message}${balanceTest.code?` — ${balanceTest.code}`:""}`;
    return notificationJson({success:false,error:detail,balance_error:detail},balanceTest.status||502);
  }
  const parsed=Number(balanceTest.data?.balance);
  if(!Number.isFinite(parsed)) return notificationJson({success:false,error:"Twilio returned an unreadable balance."},502);
  return notificationJson({success:true,balance:parsed,balance_currency:String(balanceTest.data?.currency||"USD").trim().toUpperCase()});
}
__name(adminTwilioBalanceGet,"adminTwilioBalanceGet");

async function adminTwilioStatusGet({request,env}){
  const supplied=request.headers.get("X-Admin-Key")||"";
  if(!env.ADMIN_IMPORT_KEY||supplied!==env.ADMIN_IMPORT_KEY) return notificationJson({success:false,error:"Unauthorized."},401);
  const config=twilioConfig(env);
  const tests=[];
  tests.push({key:"configuration",label:"Configuration",ok:config.configured,detail:config.configured?"Required Twilio settings are present.":`Missing: ${config.missing.join(", ")}`});
  if(!config.accountSid||!config.authToken){
    tests.push({key:"authentication",label:"Account authentication",ok:false,skipped:true,detail:"Skipped until Account SID and Auth Token are configured."});
    tests.push({key:"sender",label:"Messaging Service / Sender",ok:false,skipped:true,detail:"Skipped until Twilio authentication is available."});
    tests.push({key:"lookup",label:"Twilio Lookup",ok:false,skipped:true,detail:"Skipped until Twilio authentication is available."});
    return notificationJson({success:true,configured:false,missing:config.missing,tests,account_sid_masked:config.accountSid?`${config.accountSid.slice(0,4)}…${config.accountSid.slice(-4)}`:"",sender_label:config.messagingServiceSid?`Messaging Service ${config.messagingServiceSid.slice(0,6)}…`:(config.phoneNumber||"")});
  }

  const accountTest=await twilioStatusRequest(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}.json`,config);
  tests.push({key:"authentication",label:"Account authentication",ok:accountTest.ok,code:accountTest.ok?"":accountTest.code,detail:accountTest.ok?`Authenticated as ${String(accountTest.data?.friendly_name||accountTest.data?.sid||config.accountSid)}.`:`${accountTest.message}${accountTest.code?` — ${accountTest.code}`:""}`});

  let balance=null;
  let balanceCurrency="";
  let balanceError="";
  if(accountTest.ok){
    const balanceTest=await twilioStatusRequest(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Balance.json`,config);
    if(balanceTest.ok){
      const parsed=Number(balanceTest.data?.balance);
      if(Number.isFinite(parsed)) balance=parsed;
      balanceCurrency=String(balanceTest.data?.currency||"").trim().toUpperCase();
    }else{
      balanceError=`${balanceTest.message}${balanceTest.code?` — ${balanceTest.code}`:""}`;
    }
  }

  let senderOk=false;
  if(accountTest.ok&&config.messagingServiceSid){
    const senderTest=await twilioStatusRequest(`https://messaging.twilio.com/v1/Services/${encodeURIComponent(config.messagingServiceSid)}`,config);
    senderOk=senderTest.ok;
    tests.push({key:"sender",label:"Messaging Service",ok:senderTest.ok,code:senderTest.ok?"":senderTest.code,detail:senderTest.ok?`Available: ${String(senderTest.data?.friendly_name||config.messagingServiceSid)}.`:`${senderTest.message}${senderTest.code?` — ${senderTest.code}`:""}`});
  }else if(accountTest.ok&&config.phoneNumber){
    senderOk=true;
    tests.push({key:"sender",label:"SMS sender",ok:true,detail:`Configured sender ${config.phoneNumber}.`});
  }else{
    tests.push({key:"sender",label:"Messaging Service / Sender",ok:false,skipped:!accountTest.ok,detail:accountTest.ok?"No Messaging Service SID or sender phone number is configured.":"Skipped because account authentication failed."});
  }

  let testPhone="";
  if(accountTest.ok&&env.DB){
    try{
      const candidates=await env.DB.prepare(`SELECT phone FROM customers WHERE trim(COALESCE(phone,''))<>'' LIMIT 40`).all();
      for(const row of (candidates?.results||[])){const normalized=twilioNormalizePhone(row?.phone);if(normalized){testPhone=normalized;break;}}
    }catch(error){console.error("Twilio status test phone selection failed",error);}
  }
  if(!testPhone&&config.phoneNumber)testPhone=twilioNormalizePhone(config.phoneNumber);
  if(!testPhone)testPhone="+12025550123";

  let lookupOk=false;
  if(accountTest.ok){
    const lookupTest=await twilioStatusRequest(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(testPhone)}`,config);
    lookupOk=lookupTest.ok;
    tests.push({key:"lookup",label:"Twilio Lookup",ok:lookupTest.ok,code:lookupTest.ok?"":lookupTest.code,detail:lookupTest.ok?`Lookup authenticated successfully using ${testPhone}.`:`${lookupTest.message}${lookupTest.code?` — ${lookupTest.code}`:""}`});
  }else{
    tests.push({key:"lookup",label:"Twilio Lookup",ok:false,skipped:true,detail:"Skipped because account authentication failed."});
  }

  const requiredTests=tests.filter(test=>["configuration","authentication","sender","lookup"].includes(test.key));
  const connected=requiredTests.every(test=>test.ok);
  return notificationJson({
    success:true,
    configured:config.configured,
    connected,
    sender_ok:senderOk,
    missing:config.missing,
    tests,
    test_phone:testPhone,
    balance,
    balance_currency:balanceCurrency,
    balance_error:balanceError,
    account_sid_masked:config.accountSid?`${config.accountSid.slice(0,4)}…${config.accountSid.slice(-4)}`:"",
    sender_label:config.messagingServiceSid?`Messaging Service ${config.messagingServiceSid.slice(0,6)}…`:(config.phoneNumber||"")
  });
}
__name(adminTwilioStatusGet,"adminTwilioStatusGet");

async function ensureTwilioPhoneToolsSchema(env){
  if(!env.DB) throw new Error("Customer database is not configured.");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS twilio_phone_settings (
    id INTEGER PRIMARY KEY CHECK(id=1),
    default_area_code TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO twilio_phone_settings(id,default_area_code) VALUES(1,'')`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS twilio_phone_lookup_cache (
    account_number TEXT PRIMARY KEY,
    raw_phone TEXT NOT NULL DEFAULT '',
    normalized_phone TEXT NOT NULL DEFAULT '',
    national_format TEXT NOT NULL DEFAULT '',
    valid INTEGER NOT NULL DEFAULT 0,
    line_type TEXT NOT NULL DEFAULT '',
    carrier_name TEXT NOT NULL DEFAULT '',
    error_code TEXT NOT NULL DEFAULT '',
    checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_twilio_phone_lookup_checked ON twilio_phone_lookup_cache(checked_at DESC)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS twilio_sms_verification (
    account_number TEXT PRIMARY KEY,
    phone_e164 TEXT NOT NULL DEFAULT '',
    sms_sid TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    error_code TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_twilio_sms_verification_status ON twilio_sms_verification(status,updated_at DESC)`).run();
}
__name(ensureTwilioPhoneToolsSchema,"ensureTwilioPhoneToolsSchema");
function adminTwilioAuthorized(request,env){
  const supplied=request.headers.get("X-Admin-Key")||"";
  return !!env.ADMIN_IMPORT_KEY&&supplied===env.ADMIN_IMPORT_KEY;
}
__name(adminTwilioAuthorized,"adminTwilioAuthorized");
function twilioUsPhoneWithArea(value,areaCode=""){
  const raw=String(value||"").trim();
  if(!raw)return "";
  if(raw.startsWith("+")){
    const digits=raw.slice(1).replace(/\D/g,"");
    return digits.length>=10&&digits.length<=15?`+${digits}`:"";
  }
  let digits=raw.replace(/\D/g,"");
  const area=String(areaCode||"").replace(/\D/g,"");
  if(digits.length===7&&/^\d{3}$/.test(area))digits=area+digits;
  if(digits.length===10)return `+1${digits}`;
  if(digits.length===11&&digits.startsWith("1"))return `+${digits}`;
  return "";
}
__name(twilioUsPhoneWithArea,"twilioUsPhoneWithArea");
function twilioFormatUsNational(value){
  const digits=String(value||"").replace(/\D/g,"").replace(/^1(?=\d{10}$)/,"");
  return digits.length===10?`(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`:String(value||"");
}
__name(twilioFormatUsNational,"twilioFormatUsNational");
async function twilioLookupPhone(env,phone){
  const config=twilioConfig(env);
  if(!config.accountSid||!config.authToken)throw new Error("Twilio account SID and auth token are required for Lookup.");
  const auth=btoa(`${config.accountSid}:${config.authToken}`);
  const endpoint=`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}`;
  const response=await fetch(endpoint,{headers:{Authorization:`Basic ${auth}`,Accept:"application/json"}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(String(data?.message||data?.detail||`Twilio Lookup failed (${response.status}).`));error.twilioCode=String(data?.code||response.status||"");throw error;}
  return data||{};
}
__name(twilioLookupPhone,"twilioLookupPhone");
async function adminTwilioPhoneToolsGet({request,env}){
  try{
    if(!adminTwilioAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
    await ensureTwilioPhoneToolsSchema(env);
    const setting=await env.DB.prepare(`SELECT default_area_code FROM twilio_phone_settings WHERE id=1`).first();
    const phoneStats=await env.DB.prepare(`SELECT COUNT(*) AS customer_phone_count,SUM(CASE WHEN length(replace(replace(replace(replace(replace(replace(trim(phone),'(',''),')',''),'-',''),' ',''),'.',''),'+',''))=7 THEN 1 ELSE 0 END) AS seven_digit_count FROM customers WHERE trim(COALESCE(phone,''))<>''`).first();
    const lookupStats=await env.DB.prepare(`SELECT SUM(CASE WHEN l.valid=1 THEN 1 ELSE 0 END) AS valid_count,SUM(CASE WHEN l.valid=0 THEN 1 ELSE 0 END) AS invalid_count,SUM(CASE WHEN l.valid=-1 THEN 1 ELSE 0 END) AS error_count,SUM(CASE WHEN l.account_number IS NULL THEN 1 ELSE 0 END) AS not_checked_count FROM customers c LEFT JOIN twilio_phone_lookup_cache l ON l.account_number=c.account_number AND trim(COALESCE(l.raw_phone,''))=trim(COALESCE(c.phone,'')) WHERE trim(COALESCE(c.phone,''))<>''`).first();
    const rows=await env.DB.prepare(`SELECT l.account_number,c.account_name,l.raw_phone,l.normalized_phone,l.national_format,l.valid,l.line_type,l.carrier_name,l.error_code,l.checked_at FROM twilio_phone_lookup_cache l LEFT JOIN customers c ON c.account_number=l.account_number ORDER BY datetime(l.checked_at) DESC,l.account_number LIMIT 100`).all();
    return notificationJson({success:true,default_area_code:String(setting?.default_area_code||""),stats:{customer_phone_count:Number(phoneStats?.customer_phone_count||0),seven_digit_count:Number(phoneStats?.seven_digit_count||0),valid_count:Number(lookupStats?.valid_count||0),invalid_count:Number(lookupStats?.invalid_count||0),error_count:Number(lookupStats?.error_count||0),not_checked_count:Number(lookupStats?.not_checked_count||0)},results:rows?.results||[]});
  }catch(error){console.error("adminTwilioPhoneToolsGet failed",error);return notificationJson({success:false,error:String(error?.message||error)},500);}
}
__name(adminTwilioPhoneToolsGet,"adminTwilioPhoneToolsGet");
async function adminTwilioPhoneResultsGet({request,env}){
  try{
    if(!adminTwilioAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
    await ensureTwilioPhoneToolsSchema(env);
    const url=new URL(request.url);
    const allowed=new Set(["all","valid","invalid","error","unchecked"]);
    const group=allowed.has(String(url.searchParams.get("group")||""))?String(url.searchParams.get("group")):"all";
    const page=Math.max(1,Math.floor(Number(url.searchParams.get("page"))||1));
    const pageSize=50;
    const q=String(url.searchParams.get("q")||"").trim().slice(0,120).toLowerCase();
    const where=[`trim(COALESCE(c.phone,''))<>''`];
    const params=[];
    if(group==="valid")where.push(`l.valid=1`);
    else if(group==="invalid")where.push(`l.valid=0`);
    else if(group==="error")where.push(`l.valid=-1`);
    else if(group==="unchecked")where.push(`l.account_number IS NULL`);
    if(q){
      const like=`%${q}%`;
      where.push(`(lower(COALESCE(c.account_number,'')) LIKE ? OR lower(COALESCE(c.account_name,'')) LIKE ? OR lower(COALESCE(c.phone,'')) LIKE ? OR lower(COALESCE(l.national_format,'')) LIKE ? OR lower(COALESCE(l.normalized_phone,'')) LIKE ? OR lower(COALESCE(l.error_code,'')) LIKE ?)`);
      params.push(like,like,like,like,like,like);
    }
    const fromSql=` FROM customers c LEFT JOIN twilio_phone_lookup_cache l ON l.account_number=c.account_number AND trim(COALESCE(l.raw_phone,''))=trim(COALESCE(c.phone,'')) WHERE ${where.join(" AND ")}`;
    const countStmt=env.DB.prepare(`SELECT COUNT(*) AS n${fromSql}`);
    const countRow=params.length?await countStmt.bind(...params).first():await countStmt.first();
    const total=Math.max(0,Number(countRow?.n||0));
    const pages=Math.max(1,Math.ceil(total/pageSize));
    const safePage=Math.min(page,pages);
    const offset=(safePage-1)*pageSize;
    const listSql=`SELECT c.account_number,c.account_name,c.phone AS customer_phone,l.raw_phone,l.normalized_phone,l.national_format,l.valid,l.line_type,l.carrier_name,l.error_code,l.checked_at,v.phone_e164 AS sms_verification_phone,v.sms_sid AS sms_verification_sid,v.status AS sms_verification_status,v.error_code AS sms_verification_error_code,v.error_message AS sms_verification_error_message,v.sent_at AS sms_verification_sent_at,v.delivered_at AS sms_verification_delivered_at,v.updated_at AS sms_verification_updated_at FROM customers c LEFT JOIN twilio_phone_lookup_cache l ON l.account_number=c.account_number AND trim(COALESCE(l.raw_phone,''))=trim(COALESCE(c.phone,'')) LEFT JOIN twilio_sms_verification v ON v.account_number=c.account_number WHERE ${where.join(" AND ")} ORDER BY CASE WHEN l.checked_at IS NULL THEN 1 ELSE 0 END,datetime(l.checked_at) DESC,c.account_number LIMIT ? OFFSET ?`;
    const listParams=[...params,pageSize,offset];
    const rows=await env.DB.prepare(listSql).bind(...listParams).all();
    return notificationJson({success:true,group,q,page:safePage,page_size:pageSize,pages,total,results:rows?.results||[]});
  }catch(error){console.error("adminTwilioPhoneResultsGet failed",error);return notificationJson({success:false,error:String(error?.message||error)},500);}
}
__name(adminTwilioPhoneResultsGet,"adminTwilioPhoneResultsGet");
async function adminTwilioPhoneSettingsPost({request,env}){
  try{
    if(!adminTwilioAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
    await ensureTwilioPhoneToolsSchema(env);
    const body=await request.json().catch(()=>({}));const area=String(body?.default_area_code||"").replace(/\D/g,"");
    if(!/^[2-9]\d{2}$/.test(area))return notificationJson({success:false,error:"Enter a valid 3-digit U.S. area code."},400);
    await env.DB.prepare(`UPDATE twilio_phone_settings SET default_area_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`).bind(area).run();
    return notificationJson({success:true,default_area_code:area});
  }catch(error){return notificationJson({success:false,error:String(error?.message||error)},500);}
}
__name(adminTwilioPhoneSettingsPost,"adminTwilioPhoneSettingsPost");
async function adminTwilioApplyAreaCodePost({request,env}){
  try{
    if(!adminTwilioAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
    await ensureTwilioPhoneToolsSchema(env);
    const body=await request.json().catch(()=>({}));let area=String(body?.default_area_code||"").replace(/\D/g,"");
    if(!/^[2-9]\d{2}$/.test(area)){const setting=await env.DB.prepare(`SELECT default_area_code FROM twilio_phone_settings WHERE id=1`).first();area=String(setting?.default_area_code||"").replace(/\D/g,"");}
    if(!/^[2-9]\d{2}$/.test(area))return notificationJson({success:false,error:"Save a valid 3-digit U.S. area code first."},400);
    const cursor=Math.max(0,Math.floor(Number(body?.cursor)||0));
    const limit=Math.min(250,Math.max(1,Math.floor(Number(body?.limit)||100)));
    const totals=await env.DB.prepare(`SELECT COUNT(*) AS n,COALESCE(MAX(id),0) AS max_id FROM customers WHERE trim(COALESCE(phone,''))<>''`).first();
    const total=Math.max(0,Number(totals?.n||0));
    const maxId=Math.max(0,Number(totals?.max_id||0));
    const rows=await env.DB.prepare(`SELECT id,phone FROM customers WHERE trim(COALESCE(phone,''))<>'' AND id>? ORDER BY id LIMIT ?`).bind(cursor,limit).all();
    const list=rows?.results||[];let updated=0;
    for(const row of list){
      const digits=String(row.phone||"").replace(/\D/g,"");
      if(digits.length===7){const formatted=`(${area}) ${digits.slice(0,3)}-${digits.slice(3)}`;await env.DB.prepare(`UPDATE customers SET phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(formatted,row.id).run();updated++;}
    }
    const nextCursor=list.length?Number(list[list.length-1].id||cursor):cursor;
    const done=list.length===0||nextCursor>=maxId;
    return notificationJson({success:true,default_area_code:area,total,processed_batch:list.length,updated_batch:updated,next_cursor:nextCursor,done});
  }catch(error){console.error("adminTwilioApplyAreaCodePost failed",error);return notificationJson({success:false,error:String(error?.message||error)},500);}
}
__name(adminTwilioApplyAreaCodePost,"adminTwilioApplyAreaCodePost");
async function adminTwilioLookupBatchPost({request,env}){
  try{
    if(!adminTwilioAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
    await ensureTwilioPhoneToolsSchema(env);
    const body=await request.json().catch(()=>({}));const cursor=Math.max(0,Number(body?.cursor)||0);const limit=Math.min(25,Math.max(1,Number(body?.limit)||20));
    const setting=await env.DB.prepare(`SELECT default_area_code FROM twilio_phone_settings WHERE id=1`).first();const area=String(setting?.default_area_code||"");
    const totalRow=await env.DB.prepare(`SELECT COUNT(*) AS n FROM customers WHERE trim(COALESCE(phone,''))<>''`).first();const total=Number(totalRow?.n||0);
    const rows=await env.DB.prepare(`SELECT account_number,phone FROM customers WHERE trim(COALESCE(phone,''))<>'' ORDER BY id LIMIT ? OFFSET ?`).bind(limit,cursor).all();
    const list=rows?.results||[];let processed=0;
    for(const row of list){
      const raw=String(row.phone||"");const normalized=twilioUsPhoneWithArea(raw,area);let valid=0,lineType="",carrier="",errorCode="",national="";
      if(!normalized){errorCode="INVALID_FORMAT";}
      else{
        try{const data=await twilioLookupPhone(env,normalized);valid=data?.valid?1:0;lineType="";carrier="";errorCode="";national=String(data?.national_format||twilioFormatUsNational(normalized));}
        catch(error){valid=-1;errorCode=String(error?.twilioCode||"LOOKUP_ERROR");}
      }
      await env.DB.prepare(`INSERT INTO twilio_phone_lookup_cache(account_number,raw_phone,normalized_phone,national_format,valid,line_type,carrier_name,error_code,checked_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(account_number) DO UPDATE SET raw_phone=excluded.raw_phone,normalized_phone=excluded.normalized_phone,national_format=excluded.national_format,valid=excluded.valid,line_type=CASE WHEN twilio_phone_lookup_cache.raw_phone=excluded.raw_phone THEN twilio_phone_lookup_cache.line_type ELSE '' END,carrier_name=CASE WHEN twilio_phone_lookup_cache.raw_phone=excluded.raw_phone THEN twilio_phone_lookup_cache.carrier_name ELSE '' END,error_code=excluded.error_code,checked_at=CURRENT_TIMESTAMP`).bind(String(row.account_number||""),raw,normalized,national,valid,lineType,carrier,errorCode).run();processed++;
    }
    const next=cursor+list.length;return notificationJson({success:true,total,processed_batch:processed,processed_total:Math.min(next,total),next_cursor:next,done:next>=total||list.length===0});
  }catch(error){console.error("adminTwilioLookupBatchPost failed",error);return notificationJson({success:false,error:String(error?.message||error)},500);}
}
__name(adminTwilioLookupBatchPost,"adminTwilioLookupBatchPost");
async function adminTwilioVerifySmsPost({request,env}){
  try{
    if(!adminTwilioAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
    await ensureTwilioPhoneToolsSchema(env);
    const body=await request.json().catch(()=>({}));
    const account=normalizeNotificationAccount(body?.account_number||body?.accountNumber);
    if(!account)return notificationJson({success:false,error:"Customer account number is required."},400);
    const row=await env.DB.prepare(`SELECT c.account_number,c.account_name,c.phone,l.normalized_phone,l.valid FROM customers c LEFT JOIN twilio_phone_lookup_cache l ON l.account_number=c.account_number WHERE c.account_number=? LIMIT 1`).bind(account).first();
    if(!row)return notificationJson({success:false,error:"Customer was not found."},404);
    const setting=await env.DB.prepare(`SELECT default_area_code FROM twilio_phone_settings WHERE id=1`).first();
    const currentPhone=twilioUsPhoneWithArea(row.phone,String(setting?.default_area_code||""));
    const lookupPhone=String(row.normalized_phone||"");
    if(!currentPhone)return notificationJson({success:false,error:"Customer phone number is not a valid U.S. number."},400);
    if(!lookupPhone||currentPhone!==lookupPhone)return notificationJson({success:false,error:"Run Twilio Phone Validation again before verifying SMS capability for this phone number."},409);
    if(Number(row.valid)!==1)return notificationJson({success:false,error:"Twilio Lookup does not identify this phone number as valid."},400);
    const message="Wooten Oil SMS verification test. No action is required.";
    let sent;
    try{
      sent=await twilioSendSms(env,currentPhone,message,{statusCallbackUrl:twilioCallbackUrl(request,"/api/twilio/message-status")});
    }catch(error){
      const code=String(error?.twilioCode||"");
      const errorMessage=twilioErrorDescription(code,String(error?.message||"SMS verification could not be sent."));
      await env.DB.prepare(`INSERT INTO twilio_sms_verification(account_number,phone_e164,sms_sid,status,error_code,error_message,sent_at,delivered_at,updated_at) VALUES(?,?,?,'failed',?,?,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP) ON CONFLICT(account_number) DO UPDATE SET phone_e164=excluded.phone_e164,sms_sid=excluded.sms_sid,status='failed',error_code=excluded.error_code,error_message=excluded.error_message,sent_at=CURRENT_TIMESTAMP,delivered_at=NULL,updated_at=CURRENT_TIMESTAMP`).bind(account,currentPhone,"",code,errorMessage).run();
      return notificationJson({success:false,error:errorMessage,status:"failed",error_code:code},400);
    }
    const initialStatus=twilioDeliveryStatus(sent?.status||"");
    await env.DB.prepare(`INSERT INTO twilio_sms_verification(account_number,phone_e164,sms_sid,status,error_code,error_message,sent_at,delivered_at,updated_at) VALUES(?,?,?,?,?,'',CURRENT_TIMESTAMP,CASE WHEN ?='delivered' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP) ON CONFLICT(account_number) DO UPDATE SET phone_e164=excluded.phone_e164,sms_sid=excluded.sms_sid,status=excluded.status,error_code='',error_message='',sent_at=CURRENT_TIMESTAMP,delivered_at=CASE WHEN excluded.status='delivered' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP`).bind(account,currentPhone,String(sent?.sid||""),initialStatus,"",initialStatus).run();
    return notificationJson({success:true,account_number:account,phone_e164:currentPhone,sid:String(sent?.sid||""),status:initialStatus});
  }catch(error){console.error("adminTwilioVerifySmsPost failed",error);return notificationJson({success:false,error:String(error?.message||error)},500);}
}
__name(adminTwilioVerifySmsPost,"adminTwilioVerifySmsPost");

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
    let smsErrorCode="";
    let smsBodyStored="";
    const smsTo=twilioNormalizePhone(customer.phone||"");
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
          smsBodyStored=smsBody;
          const smsResult=await twilioSendSms(env,customer.phone,smsBody,{statusCallbackUrl:twilioCallbackUrl(request,"/api/twilio/message-status")});
          smsSent=true;
          smsSid=smsResult.sid||"";
        }catch(error){
          smsErrorCode=String(error?.twilioCode||"");
          smsError=String(error?.message||error);
          if(smsErrorCode==="21610") await twilioRememberOptOut(env,smsTo,true,"STOP");
          warning=warning?`${warning} SMS was not sent: ${smsError}`:`Portal notification was saved, but SMS was not sent: ${smsError}`;
          console.error("Twilio customer notification SMS failed",error);
        }
      }
    }

    if(notificationId){
      try{
        await env.DB.prepare(`
          UPDATE portal_notifications
          SET sms_sent=?,sms_sid=?,sms_error=?,sms_status=?,sms_error_code=?,sms_updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND account_number=?
        `).bind(smsSent?1:0,smsSid,smsError,smsSent?"pending":(smsErrorCode==="21610"?"opted_out":(sendSms&&customer.phone)?"failed":""),smsErrorCode,notificationId,customer.account_number).run();
        await ensureAdminCommunicationLogTable(env);
        await env.DB.prepare(`
          INSERT INTO admin_communication_log
            (account_number,event_type,title,detail,source_type,source_id,portal_sent,email_sent,sms_sent,email_id,sms_sid,error_text,
             sms_status,sms_error_code,sms_error_message,sms_to,sms_body,sms_updated_at,sms_failed_at,sms_opted_out_at,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,
            CASE WHEN ?='failed' THEN CURRENT_TIMESTAMP ELSE NULL END,
            CASE WHEN ?='opted_out' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP)
          ON CONFLICT(source_type,source_id) DO UPDATE SET
            portal_sent=excluded.portal_sent,email_sent=excluded.email_sent,sms_sent=excluded.sms_sent,
            email_id=excluded.email_id,sms_sid=excluded.sms_sid,error_text=excluded.error_text,
            sms_status=excluded.sms_status,sms_error_code=excluded.sms_error_code,sms_error_message=excluded.sms_error_message,
            sms_to=excluded.sms_to,sms_body=excluded.sms_body,sms_updated_at=excluded.sms_updated_at
        `).bind(
          customer.account_number,"notification",title,message,"notification",notificationId,
          1,emailSent?1:0,smsSent?1:0,emailId,smsSid,smsError,
          smsSent?"pending":(smsErrorCode==="21610"?"opted_out":(sendSms&&customer.phone)?"failed":""),smsErrorCode,smsError,smsTo,smsBodyStored,
          smsSent?"pending":(smsErrorCode==="21610"?"opted_out":"failed"),smsSent?"pending":(smsErrorCode==="21610"?"opted_out":"failed")
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
    await ensureCustomerStatementCycleColumn(env);
    await ensureTwilioPhoneToolsSchema(env);
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
        zip_code LIKE ? OR
        statement_cycle LIKE ?
      )`);
      args.push(q, q, q, q, q, q, q, q);
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

    const portalAccessSql = `(password_hash IS NOT NULL AND trim(password_hash) <> '' OR (email IS NOT NULL AND trim(email) <> '' AND EXISTS (SELECT 1 FROM customers linked_login WHERE lower(trim(linked_login.email))=lower(trim(customers.email)) AND linked_login.password_hash IS NOT NULL AND trim(linked_login.password_hash)<>'')))`;
    if (online === "activated") {
      where.push(portalAccessSql);
    } else if (online === "not_activated") {
      where.push(`NOT ${portalAccessSql}`);
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
        statement_cycle,
        account_status,
        COALESCE((SELECT p.email_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_email_enabled,
        COALESCE((SELECT p.sms_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_sms_enabled,
        COALESCE((SELECT p.portal_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS contact_portal_enabled,
        COALESCE((SELECT l.valid FROM twilio_phone_lookup_cache l WHERE l.account_number=customers.account_number),-2) AS twilio_phone_valid,
        COALESCE((SELECT l.line_type FROM twilio_phone_lookup_cache l WHERE l.account_number=customers.account_number),'') AS twilio_phone_line_type,
        COALESCE((SELECT l.normalized_phone FROM twilio_phone_lookup_cache l WHERE l.account_number=customers.account_number),'') AS twilio_phone_normalized,
        COALESCE((SELECT l.error_code FROM twilio_phone_lookup_cache l WHERE l.account_number=customers.account_number),'') AS twilio_phone_error,
        COALESCE((SELECT l.checked_at FROM twilio_phone_lookup_cache l WHERE l.account_number=customers.account_number),'') AS twilio_phone_checked_at,
        COALESCE((SELECT v.phone_e164 FROM twilio_sms_verification v WHERE v.account_number=customers.account_number),'') AS twilio_sms_verification_phone,
        COALESCE((SELECT v.status FROM twilio_sms_verification v WHERE v.account_number=customers.account_number),'') AS twilio_sms_verification_status,
        COALESCE((SELECT v.error_code FROM twilio_sms_verification v WHERE v.account_number=customers.account_number),'') AS twilio_sms_verification_error_code,
        COALESCE((SELECT v.delivered_at FROM twilio_sms_verification v WHERE v.account_number=customers.account_number),'') AS twilio_sms_verification_delivered_at,
        CASE WHEN ${portalAccessSql} THEN 1 ELSE 0 END AS online_activated,
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

async function adminCustomerDocumentSendEmail(env,customer,pdfBytes,filename,title,type,documentDate){
  if(!customer?.email||!env.RESEND_API_KEY) return {sent:false,reason:!customer?.email?"no_email":"email_not_configured"};
  try{
    const fromAddress=String(env.FUEL_FROM_EMAIL||"support@wootenoil.com").trim();
    const typeLabel=type==="invoice"?"Invoice":"Statement";
    const dateLabel=documentDate?statementPdfDate(documentDate):"";
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json","User-Agent":"WootenOilCustomerPortal/1.0"},
      body:JSON.stringify({
        from:`Wooten Oil <${fromAddress}>`,to:[customer.email],subject:`Wooten Oil ${typeLabel} - ${title}`,
        html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.6"><h2 style="color:#0b2239">Wooten Oil Co Inc.</h2><p>Hello ${notificationEscapeHtml(customer.account_name||"Customer")},</p><p>Your <strong>${notificationEscapeHtml(title)}</strong>${dateLabel?` dated ${notificationEscapeHtml(dateLabel)}`:""} is attached as a PDF.</p><p style="margin-top:24px;color:#64748b;font-size:13px">This document is also available securely in your Wooten Oil Customer Portal when portal delivery is selected.</p></div>`,
        text:`Hello ${customer.account_name||"Customer"},\n\nYour ${title}${dateLabel?` dated ${dateLabel}`:""} is attached as a PDF.\n\nWooten Oil Co Inc.`,
        attachments:[{filename,content:statementBytesToBase64(pdfBytes)}]
      })
    });
    const data=await response.json().catch(()=>({}));
    return response.ok?{sent:true,id:data.id||""}:{sent:false,reason:data?.message||data?.error||"email_failed"};
  }catch(error){
    console.error("customer document email failed",error);
    return {sent:false,reason:String(error?.message||error)};
  }
}
__name(adminCustomerDocumentSendEmail,"adminCustomerDocumentSendEmail");

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
    const portalRequested=String(form.get("portal_notification")||"")==="1";
    const emailRequested=String(form.get("email_pdf")||"")==="1";
    const smsRequested=String(form.get("sms_link")||"")==="1";

    if(!account) return notificationJson({success:false,error:"Enter a valid Customer Number."},400);
    if(!portalRequested&&!emailRequested&&!smsRequested) return notificationJson({success:false,error:"Select at least one Sending Option."},400);
    await ensureAdminContactPreferencesTable(env);
    const customer=await env.DB.prepare(`
      SELECT c.account_number,c.account_name,c.email,c.phone,
        COALESCE(p.email_enabled,1) AS contact_email_enabled,
        COALESCE(p.sms_enabled,1) AS contact_sms_enabled,
        COALESCE(p.portal_enabled,1) AS contact_portal_enabled
      FROM customers c LEFT JOIN admin_customer_contact_preferences p ON p.account_number=c.account_number
      WHERE c.account_number=? LIMIT 1
    `).bind(account).first();
    if(!customer) return notificationJson({success:false,error:"Customer was not found."},404);

    if(!(file instanceof File)) return notificationJson({success:false,error:"Choose a PDF statement or invoice."},400);
    const filename=notificationSafeFilename(file.name||"document.pdf");
    const contentType=String(file.type||"application/pdf").toLowerCase();
    if(contentType!=="application/pdf" && !filename.toLowerCase().endsWith(".pdf")){
      return notificationJson({success:false,error:"Statements and invoices must be PDF files."},400);
    }
    if(file.size<=0) return notificationJson({success:false,error:"The selected PDF is empty."},400);
    if(file.size>10*1024*1024) return notificationJson({success:false,error:"PDF files must be 10 MB or smaller."},413);
    const pdfBytes=new Uint8Array(await file.arrayBuffer());

    await ensureCustomerDocumentsTable(env);
    const title=customerDocumentTitle(type,rawTitle,filename);
    const objectKey=`customer-documents/${account}/${crypto.randomUUID()}-${filename}`;

    await env.NOTIFICATION_ATTACHMENTS.put(objectKey,pdfBytes,{
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

      await ensureCustomerNotificationsTable(env);
      const notificationTitle=type==="invoice" ? "New Invoice Available" : "New Statement Available";
      const notificationMessage=`${title} is now available in your Statements & Invoices.`;
      const portalEnabled=portalRequested&&Number(customer.contact_portal_enabled)!==0;
      const emailEnabled=emailRequested&&Number(customer.contact_email_enabled)!==0;
      const smsEnabled=smsRequested&&Number(customer.contact_sms_enabled)!==0;

      let notificationId=null;
      if(portalEnabled){
        const notificationResult=await env.DB.prepare(`
          INSERT INTO portal_notifications
            (account_number,title,message,email_sent,action_type,action_id,created_at)
          VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
        `).bind(account,notificationTitle,notificationMessage,0,"customer_documents",documentId).run();
        notificationId=notificationResult?.meta?.last_row_id||notificationResult?.meta?.last_insert_rowid||null;
      }

      const emailResult=emailEnabled
        ? await adminCustomerDocumentSendEmail(env,customer,pdfBytes,filename,title,type,documentDate)
        : {sent:false,reason:emailRequested?"email_delivery_not_selected_for_customer":"email_not_requested"};

      let smsResult={sent:false,reason:smsRequested?"sms_delivery_not_selected_for_customer":"sms_not_requested",sid:"",status:"",code:"",body:"",to:twilioNormalizePhone(customer.phone||"")};
      if(smsEnabled&&customer.phone){
        let smsBody="";
        try{
          const secureLink=await createPortalShortStatementLink({request,env,documentId,accountNumber:account});
          const smsLink=secureLink.replace(/^https?:\/\//i,"");
          const typeLabel=type==="invoice"?"Invoice":"Statement";
          const effectiveDate=documentDate||new Date().toISOString().slice(0,10);
          const dateText=statementSmsDate(effectiveDate);
          if(type==="statement"){
            smsBody=`WOOTEN OIL CO INC\nCustomer #${account}\n${statementSmsMonth(effectiveDate)} Statement\nStatement Date: ${dateText}\nView PDF: ${smsLink}\nPlease do not reply.`;
          }else{
            smsBody=`WOOTEN OIL CO INC\nCustomer #${account}\n${typeLabel}\nDate: ${dateText}\nView PDF: ${smsLink}\nPlease do not reply.`;
          }
          const sent=await twilioSendSms(env,customer.phone,smsBody,{statusCallbackUrl:twilioCallbackUrl(request,"/api/twilio/message-status")});
          smsResult={sent:true,reason:"",sid:sent.sid||"",status:"pending",code:"",body:smsBody,to:sent.to||twilioNormalizePhone(customer.phone)};
        }catch(error){
          const code=String(error?.twilioCode||"");
          const status=code==="21610"?"opted_out":"failed";
          smsResult={sent:false,reason:String(error?.message||error),sid:"",status,code,body:smsBody,to:twilioNormalizePhone(customer.phone)};
          if(status==="opted_out") await twilioRememberOptOut(env,customer.phone,true,"STOP");
        }
      }else if(smsEnabled&&!customer.phone){
        smsResult.reason="no_phone";
      }

      if(notificationId){
        await env.DB.prepare(`
          UPDATE portal_notifications SET email_sent=?,email_id=?,sms_sent=?,sms_sid=?,sms_error=?,sms_status=?,sms_error_code=?,sms_updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND account_number=?
        `).bind(emailResult.sent?1:0,emailResult.id||"",smsResult.sent?1:0,smsResult.sid||"",smsResult.sent?"":smsResult.reason||"",smsResult.status||"",smsResult.code||"",notificationId,account).run();
      }

      await ensureAdminCommunicationLogTable(env);
      const logStatus=smsResult.status||"";
      const logErrors=[emailRequested&&!emailResult.sent?emailResult.reason:"",smsRequested&&!smsResult.sent?smsResult.reason:""].filter(Boolean).join(" | ");
      await env.DB.prepare(`
        INSERT INTO admin_communication_log
          (account_number,event_type,title,detail,source_type,source_id,portal_sent,email_sent,sms_sent,email_id,sms_sid,error_text,
           sms_status,sms_error_code,sms_error_message,sms_to,sms_body,sms_updated_at,sms_failed_at,sms_opted_out_at,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,
          CASE WHEN ?='failed' THEN CURRENT_TIMESTAMP ELSE NULL END,
          CASE WHEN ?='opted_out' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP)
        ON CONFLICT(source_type,source_id) DO UPDATE SET
          portal_sent=excluded.portal_sent,email_sent=excluded.email_sent,sms_sent=excluded.sms_sent,email_id=excluded.email_id,
          sms_sid=excluded.sms_sid,error_text=excluded.error_text,sms_status=excluded.sms_status,sms_error_code=excluded.sms_error_code,
          sms_error_message=excluded.sms_error_message,sms_to=excluded.sms_to,sms_body=excluded.sms_body,sms_updated_at=excluded.sms_updated_at
      `).bind(
        account,type,title,notificationMessage,notificationId?"notification":"document",notificationId||documentId,
        portalEnabled?1:0,emailResult.sent?1:0,smsResult.sent?1:0,emailResult.id||"",smsResult.sid||"",logErrors,
        logStatus,smsResult.code||"",smsResult.sent?"":smsResult.reason||"",smsResult.to||"",smsResult.body||"",logStatus,logStatus
      ).run();

      const delivered=[];
      if(portalEnabled) delivered.push("Customer Portal");
      if(emailResult.sent) delivered.push("Email PDF");
      if(smsResult.sent) delivered.push("SMS link");
      const skipped=[];
      if(portalRequested&&!portalEnabled) skipped.push("Portal");
      if(emailRequested&&!emailResult.sent) skipped.push("Email");
      if(smsRequested&&!smsResult.sent) skipped.push("SMS");

      return notificationJson({
        success:true,
        message:`${type==="invoice"?"Invoice":"Statement"} uploaded successfully.${delivered.length?` Sent by: ${delivered.join(", ")}.`:""}${skipped.length?` Skipped: ${skipped.join(", ")}.`:""}`,
        notification_id:notificationId,
        portal_sent:portalEnabled,email_sent:emailResult.sent,sms_sent:smsResult.sent,sms_status:smsResult.status||"",
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

function statementSmsDate(value){
  const iso=statementPdfShortDate(value);
  const parts=iso.split("-");
  return parts.length===3?`${parts[1]}/${parts[2]}/${parts[0]}`:iso;
}
__name(statementSmsDate,"statementSmsDate");

function statementSmsMonth(value){
  const raw=String(value||"").trim();
  const iso=/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:statementPdfShortDate(raw);
  const d=new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())?"Statement":d.toLocaleDateString("en-US",{month:"long",timeZone:"UTC"});
}
__name(statementSmsMonth,"statementSmsMonth");

function statementCustomerAddress(customer){
  const street=[customer?.address1,customer?.address2,customer?.address3]
    .map(statementPdfSafeText).filter(Boolean).join(", ");
  const cityState=[statementPdfSafeText(customer?.city),statementPdfSafeText(customer?.state)]
    .filter(Boolean).join(", ");
  const cityLine=[cityState,statementPdfSafeText(customer?.zip_code)].filter(Boolean).join(" ");
  return [street,cityLine].filter(Boolean);
}
__name(statementCustomerAddress,"statementCustomerAddress");

function statementBuildPdf(customer,statementDate,recentPayments=[]){
  const current=statementNumber(customer?.current_balance);
  const age1=statementNumber(customer?.aging_category_1);
  const age2=statementNumber(customer?.aging_category_2);
  const age3=statementNumber(customer?.aging_category_3);
  const age4=statementNumber(customer?.aging_category_4);
  const previous=age1+age2+age3+age4;
  const total=current+previous;
  const payments=Array.isArray(recentPayments)?recentPayments.slice(0,20):[];
  const latestPayment=payments[0]||null;

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
  text(56,148,9.5,"PAYMENT NOTICE",true,[0.43,0.30,0.08]);
  text(56,133,8.5,"Portal payments may take up to 24 business hours",false,[0.43,0.30,0.08]);
  text(56,120,8.5,"to appear on your account.",false,[0.43,0.30,0.08]);

  if(latestPayment){
    lineTo(410,120,410,158,[0.88,0.72,0.35],0.7);
    text(424,148,8.5,"LAST PAYMENT",true,[0.43,0.30,0.08]);
    text(424,133,10,statementMoney(latestPayment.amount),true,navy);
    text(424,120,8.5,statementPdfDate(latestPayment.posting_date||latestPayment.payment_date),false,slate);
  }

  // Footer
  lineTo(42,82,570,82,line,0.7);
  text(42,63,8.5,"Wooten Oil Co Inc.  |  West Tennessee Petroleum Delivery",false,slate);
  rightText(570,63,8.5,"Thank you for your business.",false,slate);

  const pageStreams=[commands.join("\n")];

  if(payments.length){
    const paymentCommands=[];
    const pAdd=(s)=>paymentCommands.push(s);
    const clip=(value,max)=>{
      const safe=statementPdfSafeText(value);
      return safe.length>max?safe.slice(0,Math.max(0,max-3))+"...":safe;
    };
    const pText=(x,y,size,value,bold=false,color=navy)=>{
      pAdd(`BT /${bold?"F2":"F1"} ${size} Tf ${rgb(...color)} rg ${x} ${y} Td (${statementPdfEscape(value)}) Tj ET`);
    };
    const pRect=(x,y,w,h,fillColor,strokeColor=null,width=1)=>{
      if(fillColor) pAdd(`${rgb(...fillColor)} rg ${x} ${y} ${w} ${h} re f`);
      if(strokeColor) pAdd(`${width} w ${rgb(...strokeColor)} RG ${x} ${y} ${w} ${h} re S`);
    };
    const pLine=(x1,y1,x2,y2,color=line,width=1)=>pAdd(`${width} w ${rgb(...color)} RG ${x1} ${y1} m ${x2} ${y2} l S`);
    const pRight=(right,y,size,value,bold=false,color=navy)=>{
      const safe=statementPdfSafeText(value);
      const avg=(bold?0.56:0.52)*size;
      pText(Math.max(42,right-safe.length*avg),y,size,safe,bold,color);
    };
    const pCenter=(center,y,size,value,bold=false,color=navy)=>{
      const safe=statementPdfSafeText(value);
      const avg=(bold?0.56:0.52)*size;
      pText(center-(safe.length*avg/2),y,size,safe,bold,color);
    };

    pRect(0,700,612,92,navy);
    pRect(0,696,612,4,red);
    pText(42,751,22,"WOOTEN OIL CO INC.",true,white);
    pText(42,730,10,"RECENT PAYMENTS",true,[0.88,0.92,0.96]);
    pRight(570,750,12,`Customer # ${statementPdfSafeText(customer?.account_number)||"-"}`,true,white);
    pText(42,658,15,statementPdfSafeText(customer?.account_name)||"Customer",true,navy);
    pText(42,638,9.5,`${payments.length} most recent payment${payments.length===1?"":"s"} included with statement dated ${statementPdfDate(statementDate)}.`,false,slate);

    const columns=[
      {x:42,label:"PAYMENT DATE"},
      {x:125,label:"CHECK #"},
      {x:202,label:"INVOICE #"},
      {x:300,label:"AMOUNT"},
      {x:375,label:"POSTED DATE"},
      {x:472,label:"DEPOSIT DATE"}
    ];
    const headerY=600,rowH=24,tableRight=570;
    pRect(42,headerY,528,28,navy);
    columns.forEach(col=>{
      if(col.label==="AMOUNT")pCenter(337.5,headerY+9,9,col.label,true,white);
      else pText(col.x+5,headerY+9,9,col.label,true,white);
    });
    payments.forEach((payment,index)=>{
      const y=headerY-rowH*(index+1);
      pRect(42,y,528,rowH,index%2===0?[0.975,0.981,0.987]:white,line,0.45);
      pText(47,y+9,9.5,clip(payment.payment_date||"-",12),false,slate);
      pText(130,y+9,9.5,clip(payment.check_number||"-",11),false,slate);
      pText(207,y+9,9.5,clip(payment.invoice_number||"-",14),false,slate);
      pCenter(337.5,y+9,10,statementMoney(payment.amount),false,slate);
      pText(380,y+9,9.5,clip(payment.posting_date||"-",12),false,slate);
      pText(477,y+9,9.5,clip(payment.deposit_date||"-",12),false,slate);
    });
    const tableBottom=headerY-rowH*payments.length;
    [125,202,300,375,472].forEach(x=>pLine(x,tableBottom,x,headerY+28,line,0.45));
    pLine(42,82,570,82,line,0.7);
    pText(42,63,8.5,"Wooten Oil Co Inc.  |  West Tennessee Petroleum Delivery",false,slate);
    pRight(570,63,8.5,"Payment History",false,slate);
    pageStreams.push(paymentCommands.join("\n"));
  }

  // Add per-customer page numbering after all pages for this statement are known.
  // The count resets for every customer statement, including statements that are
  // later merged into an admin combined PDF.
  const statementTotalPages=pageStreams.length;
  for(let pageIndex=0;pageIndex<statementTotalPages;pageIndex++){
    const pageLabel=`Page ${pageIndex+1} of ${statementTotalPages}`;
    const pageLabelSize=8.5;
    const pageLabelX=Math.max(42,570-pageLabel.length*(0.52*pageLabelSize));
    pageStreams[pageIndex]+=`\nBT /F1 ${pageLabelSize} Tf ${rgb(...slate)} rg ${pageLabelX.toFixed(1)} 43 Td (${statementPdfEscape(pageLabel)}) Tj ET`;
  }

  const objects=[];
  objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
  objects[2]=pageStreams.length===2
    ?"<< /Type /Pages /Kids [3 0 R 7 0 R] /Count 2 >>"
    :"<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>";
  objects[4]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[5]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[6]=`<< /Length ${new TextEncoder().encode(pageStreams[0]).length} >>\nstream\n${pageStreams[0]}\nendstream`;
  if(pageStreams.length===2){
    objects[7]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 8 0 R >>";
    objects[8]=`<< /Length ${new TextEncoder().encode(pageStreams[1]).length} >>\nstream\n${pageStreams[1]}\nendstream`;
  }

  let pdf="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets=[0];
  const objectCount=pageStreams.length===2?8:6;
  for(let i=1;i<=objectCount;i++){
    offsets[i]=new TextEncoder().encode(pdf).length;
    pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset=new TextEncoder().encode(pdf).length;
  pdf+=`xref\n0 ${objectCount+1}\n`;
  pdf+="0000000000 65535 f \n";
  for(let i=1;i<=objectCount;i++){
    pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  }
  pdf+=`trailer\n<< /Size ${objectCount+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}
__name(statementBuildPdf,"statementBuildPdf");

function statementExtractPdfPageStreams(pdfBytes){
  const source=new TextDecoder().decode(pdfBytes instanceof Uint8Array?pdfBytes:new Uint8Array(pdfBytes||[]));
  const streams=[];
  const pattern=/\d+ 0 obj\s*<< \/Length \d+ >>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while((match=pattern.exec(source)))streams.push(match[1]);
  return streams;
}
__name(statementExtractPdfPageStreams,"statementExtractPdfPageStreams");

function statementBuildCombinedPdf(pdfParts){
  const pageStreams=[];
  for(const part of pdfParts||[])pageStreams.push(...statementExtractPdfPageStreams(part));
  if(!pageStreams.length)throw new Error("No generated statement pages were available for the combined PDF.");
  const objects=[];
  objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
  objects[3]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  const kids=[];
  pageStreams.forEach((stream,index)=>{
    const pageId=5+index*2,contentId=pageId+1;
    kids.push(`${pageId} 0 R`);
    objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId]=`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
  });
  objects[2]=`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageStreams.length} >>`;
  const objectCount=4+pageStreams.length*2;
  let pdf="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets=[0];
  for(let i=1;i<=objectCount;i++){
    offsets[i]=new TextEncoder().encode(pdf).length;
    pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset=new TextEncoder().encode(pdf).length;
  pdf+=`xref\n0 ${objectCount+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=objectCount;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf+=`trailer\n<< /Size ${objectCount+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
__name(statementBuildCombinedPdf,"statementBuildCombinedPdf");

const STATEMENT_COMBINED_CUSTOMERS_PER_PART=250;

function statementCombinedFilename(run,partNumber=1,totalParts=1){
  const id=Math.max(0,Number(run?.id||0));
  const type=String(run?.run_type||"");
  const cycle=type.includes("weekly")?"Cycle-B":type.includes("monthly")?"Cycle-A":"Statements";
  const test=type.startsWith("test_")?"Test-":"";
  const suffix=Number(totalParts||1)>1?`-Part-${Math.max(1,Number(partNumber||1))}`:"";
  return `Wooten-Oil-${test}${cycle}-Combined-Run-${id}${suffix}.pdf`;
}
__name(statementCombinedFilename,"statementCombinedFilename");

async function appendStatementRunCombinedPdf(env,run,batchObjectKey,partNumber=1,partStartCustomer=1,partEndCustomer=1){
  if(!env.NOTIFICATION_ATTACHMENTS||!batchObjectKey)return String(run?.combined_working_parts_json||"[]");
  const runId=Math.max(0,Number(run?.id||0));
  if(!runId)return "[]";
  let parts=[];
  try{parts=JSON.parse(run?.combined_working_parts_json||"[]");}catch{}
  if(!Array.isArray(parts))parts=[];
  const number=Math.max(1,Number(partNumber||1));
  let part=parts.find(item=>Number(item?.part_number)===number);
  const workingKey=String(part?.key||`statement-runs/${runId}/combined-part-${number}.pdf`);
  const batchObject=await env.NOTIFICATION_ATTACHMENTS.get(batchObjectKey);
  if(!batchObject)throw new Error("A statement batch PDF could not be found while building the combined PDF part.");
  const batchBytes=new Uint8Array(await batchObject.arrayBuffer());
  let combinedBytes=batchBytes;
  const existing=await env.NOTIFICATION_ATTACHMENTS.get(workingKey);
  if(existing){
    const existingBytes=new Uint8Array(await existing.arrayBuffer());
    combinedBytes=statementBuildCombinedPdf([existingBytes,batchBytes]);
  }
  await env.NOTIFICATION_ATTACHMENTS.put(workingKey,combinedBytes,{httpMetadata:{contentType:"application/pdf",contentDisposition:"inline"},customMetadata:{statement_run_id:String(runId),kind:"combined-working-part",part_number:String(number)}});
  if(batchObjectKey!==workingKey)await env.NOTIFICATION_ATTACHMENTS.delete(batchObjectKey).catch(()=>{});
  const updated={part_number:number,key:workingKey,start_customer:Math.max(1,Number(part?.start_customer||partStartCustomer||1)),end_customer:Math.max(Number(part?.end_customer||0),Number(partEndCustomer||partStartCustomer||1))};
  parts=parts.filter(item=>Number(item?.part_number)!==number);parts.push(updated);parts.sort((a,b)=>Number(a.part_number)-Number(b.part_number));
  return JSON.stringify(parts);
}
__name(appendStatementRunCombinedPdf,"appendStatementRunCombinedPdf");

async function finalizeStatementRunCombinedPdf(env,runId){
  const id=Math.max(0,Number(runId||0));
  if(!id)return null;
  const run=await env.DB.prepare(`SELECT * FROM statement_schedule_runs WHERE id=? LIMIT 1`).bind(id).first();
  if(!run)return null;
  let existingParts=[];try{existingParts=JSON.parse(run.combined_pdf_parts_json||"[]");}catch{}
  if(Array.isArray(existingParts)&&existingParts.length)return run;
  let workingParts=[];try{workingParts=JSON.parse(run.combined_working_parts_json||"[]");}catch{}
  if(!Array.isArray(workingParts)||!workingParts.length){
    // Backward compatibility for Ver138 runs that used one working key.
    const legacyKey=String(run.combined_working_key||"");
    if(legacyKey)workingParts=[{part_number:1,key:legacyKey,start_customer:1,end_customer:Number(run.success_count||run.customer_count||1)}];
  }
  if(!workingParts.length){
    const message=Number(run.success_count||0)>0?"Combined PDF could not be created because no generated batch PDF was saved.":"No statements were generated for this run.";
    await env.DB.prepare(`UPDATE statement_schedule_runs SET combined_pdf_error=? WHERE id=?`).bind(message,id).run();
    return {...run,combined_pdf_error:message};
  }
  const finalParts=[];
  const totalParts=workingParts.length;
  for(const item of workingParts.sort((a,b)=>Number(a.part_number)-Number(b.part_number))){
    const key=String(item.key||"");if(!key)continue;
    const object=env.NOTIFICATION_ATTACHMENTS?await env.NOTIFICATION_ATTACHMENTS.get(key):null;
    if(!object)throw new Error(`Combined PDF Part ${item.part_number} is unavailable in statement storage.`);
    const filename=statementCombinedFilename(run,item.part_number,totalParts);
    await env.NOTIFICATION_ATTACHMENTS.put(key,await object.arrayBuffer(),{httpMetadata:{contentType:"application/pdf",contentDisposition:`inline; filename="${filename}"`},customMetadata:{statement_run_id:String(id),kind:"combined-final-part",part_number:String(item.part_number),filename}});
    finalParts.push({part_number:Number(item.part_number),key,filename,start_customer:Number(item.start_customer||1),end_customer:Number(item.end_customer||0)});
  }
  if(!finalParts.length)throw new Error("No combined PDF parts could be finalized.");
  const first=finalParts[0];
  await env.DB.prepare(`UPDATE statement_schedule_runs SET combined_pdf_key=?,combined_pdf_filename=?,combined_pdf_parts_json=?,combined_pdf_error='' WHERE id=?`).bind(first.key,first.filename,JSON.stringify(finalParts),id).run();
  const finalized={...run,combined_pdf_key:first.key,combined_pdf_filename:first.filename,combined_pdf_parts_json:JSON.stringify(finalParts),combined_pdf_error:""};
  if(String(run.combined_group_id||""))await finalizeStatementRunCombinedGroup(env,String(run.combined_group_id)).catch(error=>console.error("Statement Test All combined PDF parts failed",error));
  return finalized;
}
__name(finalizeStatementRunCombinedPdf,"finalizeStatementRunCombinedPdf");

async function finalizeStatementRunCombinedGroup(env,groupId){
  const group=String(groupId||"").trim();
  if(!group||!env.NOTIFICATION_ATTACHMENTS)return null;
  const rows=await env.DB.prepare(`SELECT * FROM statement_schedule_runs WHERE combined_group_id=? ORDER BY id`).bind(group).all();
  const runs=rows?.results||[];
  if(!runs.length||runs.some(run=>String(run.status||"")==="running"))return null;
  const groupParts=[];
  for(const run of runs){
    let parts=[];try{parts=JSON.parse(run.combined_pdf_parts_json||"[]");}catch{}
    if(Number(run.success_count||0)>0&&(!Array.isArray(parts)||!parts.length)){
      const message="Test All combined PDFs are waiting for every cycle part to finish.";
      await env.DB.prepare(`UPDATE statement_schedule_runs SET group_combined_pdf_error=? WHERE combined_group_id=?`).bind(message,group).run();
      return null;
    }
    for(const part of (parts||[]))groupParts.push({...part,cycle:String(run.statement_cycle||"")});
  }
  if(!groupParts.length){
    const message="No statements were generated for this Test All job.";
    await env.DB.prepare(`UPDATE statement_schedule_runs SET group_combined_pdf_error=? WHERE combined_group_id=?`).bind(message,group).run();
    return null;
  }
  const normalized=groupParts.map((part,index)=>({part_number:index+1,key:String(part.key||""),filename:`Wooten-Oil-Test-All-Combined-Part-${index+1}.pdf`,start_customer:Number(part.start_customer||0),end_customer:Number(part.end_customer||0),cycle:part.cycle||""}));
  const first=normalized[0];
  await env.DB.prepare(`UPDATE statement_schedule_runs SET group_combined_pdf_key=?,group_combined_pdf_filename=?,group_combined_pdf_parts_json=?,group_combined_pdf_error='' WHERE combined_group_id=?`).bind(first.key,first.filename,JSON.stringify(normalized),group).run();
  return {group_combined_pdf_key:first.key,group_combined_pdf_filename:first.filename,group_combined_pdf_parts_json:JSON.stringify(normalized)};
}
__name(finalizeStatementRunCombinedGroup,"finalizeStatementRunCombinedGroup");

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

async function statementSendEmail(env,customer,pdfBytes,filename,statementDate,total,idempotencyKey=""){
  if(!customer?.email || !env.RESEND_API_KEY) return {sent:false,reason:!customer?.email?"no_email":"email_not_configured"};
  try{
    const fromAddress=String(env.FUEL_FROM_EMAIL||"support@wootenoil.com").trim();
    const dateLabel=statementPdfDate(statementDate);
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${env.RESEND_API_KEY}`,
        "Content-Type":"application/json",
        "User-Agent":"WootenOilCustomerPortal/1.0",
        ...(idempotencyKey?{"Idempotency-Key":String(idempotencyKey)}:{})
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
    let body={};
    try{body=await request.json();}catch{
      return notificationJson({success:false,error:"Invalid request data."},400);
    }
    const dryRun=body.dry_run===true;
    const statementRunId=Math.max(0,Number(body.statement_run_id||body.run_id||0));
    if(statementRunId)await ensureStatementSchedulingSchema(env);
    if(!dryRun&&!env.NOTIFICATION_ATTACHMENTS){
      return notificationJson({success:false,error:"Statement storage is not configured."},503);
    }

    const accounts=[...new Set((Array.isArray(body.accounts)?body.accounts:[])
      .map(normalizeNotificationAccount).filter(Boolean))];
    if(!accounts.length) return notificationJson({success:false,error:"Select at least one customer."},400);
    if(accounts.length>20) return notificationJson({success:false,error:"Send statements in batches of 20 customers or fewer."},413);

    const statementDate=statementPdfShortDate(body.statement_date||new Date().toISOString());
    const paymentCount=Math.max(0,Math.min(20,Number.parseInt(body.payment_count,10)||0));
    const emailPdf=body.email_pdf!==false;
    const portalNotification=body.portal_notification!==false;
    const smsLink=body.sms_link===true;

    if(!dryRun){
      await ensureCustomerDocumentsTable(env);
      await ensureCustomerNotificationsTable(env);
    }
    await ensureAdminContactPreferencesTable(env);
    await ensureCustomerPaymentsSchema(env);

    const results=[];
    const generatedPdfParts=[];

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

        let recentPayments=[];
        if(paymentCount>0){
          const paymentResult=await env.DB.prepare(`
            SELECT
              payment_date,
              reference AS check_number,
              source_invoice_no AS invoice_number,
              amount,
              posting_date,
              deposit_date
            FROM customer_payments
            WHERE account_number=?
            ORDER BY COALESCE(NULLIF(posting_date,''),payment_date) DESC,id DESC
            LIMIT ?
          `).bind(account,paymentCount).all();
          recentPayments=paymentResult?.results||[];
        }

        const pdfBytes=statementBuildPdf(customer,statementDate,recentPayments);
        generatedPdfParts.push(pdfBytes);
        const filename=`Wooten-Oil-Statement-${account}-${statementDate}.pdf`;
        const title=`Statement ${statementPdfDate(statementDate)}`;

        if(dryRun){
          results.push({
            account_number:account,
            account_name:customer.account_name||"",
            success:true,
            test_mode:true,
            filename,
            pdf_bytes:pdfBytes.byteLength,
            payment_count:recentPayments.length,
            current_balance:current,
            previous_balance:previous,
            total_balance:total,
            portal_notified:false,
            email_sent:false,
            sms_sent:false
          });
          continue;
        }

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
        let portalDuplicatePrevented=false;
        if(customerPortalNotification){
          const portalClaimed=await claimStatementRunDelivery(env,statementRunId,account,"portal");
          if(!portalClaimed){
            portalDuplicatePrevented=true;
          }else{
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
          await finishStatementRunDelivery(env,statementRunId,account,"portal",{status:notificationId?"sent":"failed",deliveryId:notificationId||"",errorText:notificationId?"":"portal_insert_failed"}).catch(()=>{});
          }
        }

        const portalWarning=notificationId?"":(!portalNotification?"Portal delivery is disabled in Statement & Delivery Settings.":Number(customer.contact_portal_enabled)===0?"Portal delivery is disabled for this customer.":portalDuplicatePrevented?"Duplicate portal delivery was prevented for safety.":"The portal notification could not be created.");

        let emailResult={sent:false,reason:emailPdf?"email_not_selected":"email_disabled"};
        let emailDuplicatePrevented=false;
        if(customerEmailPdf){
          const emailClaimed=await claimStatementRunDelivery(env,statementRunId,account,"email");
          if(!emailClaimed){
            emailDuplicatePrevented=true;
            emailResult={sent:false,reason:"duplicate_send_prevented"};
          }else{
            const emailIdempotencyKey=statementRunId?`statement-run-${statementRunId}-${account}-email`:"";
            emailResult=await statementSendEmail(env,customer,pdfBytes,filename,statementDate,total,emailIdempotencyKey);
            await finishStatementRunDelivery(env,statementRunId,account,"email",{status:emailResult.sent?"sent":"failed",deliveryId:emailResult.id||"",errorText:emailResult.sent?"":(emailResult.reason||"")}).catch(()=>{});
          }
        }

        const emailWarning=emailResult.sent?"":(!emailPdf?"Email delivery is disabled in Statement & Delivery Settings.":Number(customer.contact_email_enabled)===0?"Email delivery is disabled for this customer.":emailDuplicatePrevented?"Duplicate email delivery was prevented for safety.":emailResult.reason==="no_email"?"No email address is on file for this customer.":emailResult.reason==="email_not_configured"?"Email delivery service is not configured.":String(emailResult.reason||"Email delivery failed."));

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

        let smsResult={sent:false,reason:customerSmsLink?"no_phone":(smsLink?"sms_not_selected":"sms_disabled"),body:"",to:twilioNormalizePhone(customer.phone||""),code:""};
        let smsDuplicatePrevented=false;
        if(customerSmsLink && customer.phone){
          const smsClaimed=await claimStatementRunDelivery(env,statementRunId,account,"sms");
          if(!smsClaimed){
            smsDuplicatePrevented=true;
            smsResult={sent:false,reason:"duplicate_send_prevented",body:"",to:twilioNormalizePhone(customer.phone||""),code:""};
          }else{
          let smsBody="";
          try{
            const secureLink=await createPortalShortStatementLink({
              request,
              env,
              documentId,
              accountNumber:account
            });
            const smsLink=secureLink.replace(/^https?:\/\//i,"");
            const statementMonth=statementSmsMonth(statementDate);
            smsBody=
              `WOOTEN OIL CO INC\n`+
              `Customer #${account}\n`+
              `${statementMonth} Statement\n`+
              `Statement Date: ${statementSmsDate(statementDate)}\n`+
              `View PDF: ${smsLink}\n`+
              `Please do not reply.`;
            const sent=await twilioSendSms(env,customer.phone,smsBody,{statusCallbackUrl:twilioCallbackUrl(request,"/api/twilio/message-status")});
            smsResult={sent:true,sid:sent.sid||"",body:smsBody,to:sent.to||twilioNormalizePhone(customer.phone),code:""};
            await finishStatementRunDelivery(env,statementRunId,account,"sms",{status:"sent",deliveryId:smsResult.sid||""}).catch(()=>{});
          }catch(error){
            const code=String(error?.twilioCode||"");
            smsResult={sent:false,reason:String(error?.message||error),body:smsBody,to:twilioNormalizePhone(customer.phone),code};
            await finishStatementRunDelivery(env,statementRunId,account,"sms",{status:"failed",errorText:smsResult.reason||""}).catch(()=>{});
            if(code==="21610") await twilioRememberOptOut(env,customer.phone,true,"STOP");
            console.error("statement SMS failed",account,error);
          }
          }
        }

        const smsWarning=smsResult.sent?"":(!smsLink?"SMS delivery is disabled in Statement & Delivery Settings.":Number(customer.contact_sms_enabled)===0?"SMS delivery is disabled for this customer.":!customer.phone?"No phone number is on file for this customer.":smsDuplicatePrevented?"Duplicate SMS delivery was prevented for safety.":String(smsResult.code||"")==="21610"?"Customer has opted out of SMS messages (Twilio 21610).":String(smsResult.reason||"SMS delivery failed."));

        try{
          if(notificationId){
            await env.DB.prepare(`
              UPDATE portal_notifications
              SET sms_sent=?,sms_sid=?,sms_error=?,sms_status=?,sms_error_code=?,sms_updated_at=CURRENT_TIMESTAMP
              WHERE id=? AND account_number=?
            `).bind(
              smsResult.sent?1:0,smsResult.sid||"",smsResult.sent?"":(smsResult.reason||""),
              smsResult.sent?"pending":(smsResult.code==="21610"?"opted_out":(customerSmsLink&&customer.phone)?"failed":""),smsResult.code||"",notificationId,account
            ).run();
          }
          await ensureAdminCommunicationLogTable(env);
          const logSourceType=notificationId?"notification":"document";
          const logSourceId=notificationId||documentId;
          await env.DB.prepare(`
            INSERT INTO admin_communication_log
              (account_number,event_type,title,detail,source_type,source_id,portal_sent,email_sent,sms_sent,email_id,sms_sid,error_text,
               sms_status,sms_error_code,sms_error_message,sms_to,sms_body,sms_updated_at,sms_failed_at,sms_opted_out_at,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,
              CASE WHEN ?='failed' THEN CURRENT_TIMESTAMP ELSE NULL END,
              CASE WHEN ?='opted_out' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP)
            ON CONFLICT(source_type,source_id) DO UPDATE SET
              portal_sent=excluded.portal_sent,email_sent=excluded.email_sent,sms_sent=excluded.sms_sent,
              email_id=excluded.email_id,sms_sid=excluded.sms_sid,error_text=excluded.error_text,
              sms_status=excluded.sms_status,sms_error_code=excluded.sms_error_code,sms_error_message=excluded.sms_error_message,
              sms_to=excluded.sms_to,sms_body=excluded.sms_body,sms_updated_at=excluded.sms_updated_at
          `).bind(
            account,"statement",title,notificationMessage,logSourceType,logSourceId,
            notificationId?1:0,emailResult.sent?1:0,smsResult.sent?1:0,emailResult.id||"",smsResult.sid||"",
            [portalWarning,emailWarning,smsWarning].filter(Boolean).join(" | "),
            smsResult.sent?"pending":(smsResult.code==="21610"?"opted_out":(customerSmsLink&&customer.phone)?"failed":""),smsResult.code||"",smsResult.sent?"":(smsResult.reason||""),
            smsResult.to||"",smsResult.body||"",
            smsResult.sent?"pending":(smsResult.code==="21610"?"opted_out":"failed"),smsResult.sent?"pending":(smsResult.code==="21610"?"opted_out":"failed")
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
          portal_duplicate_prevented:portalDuplicatePrevented,
          portal_warning:portalWarning,
          email_sent:!!emailResult.sent,
          email_duplicate_prevented:emailDuplicatePrevented,
          email_warning:emailWarning,
          sms_sent:!!smsResult.sent,
          sms_duplicate_prevented:smsDuplicatePrevented,
          sms_sid:smsResult.sid||"",
          sms_warning:smsWarning
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
    let batchCombinedKey="",batchCombinedError="";
    if(statementRunId&&generatedPdfParts.length&&env.NOTIFICATION_ATTACHMENTS){
      try{
        const batchBytes=statementBuildCombinedPdf(generatedPdfParts);
        batchCombinedKey=`statement-runs/${statementRunId}/batch-${crypto.randomUUID()}.pdf`;
        await env.NOTIFICATION_ATTACHMENTS.put(batchCombinedKey,batchBytes,{httpMetadata:{contentType:"application/pdf",contentDisposition:"inline"},customMetadata:{statement_run_id:String(statementRunId),kind:"combined-batch"}});
      }catch(error){batchCombinedError=String(error?.message||error);console.error("statement batch combined PDF failed",error);}
    }else if(statementRunId&&generatedPdfParts.length&&!env.NOTIFICATION_ATTACHMENTS){
      batchCombinedError="Statement storage is not configured for combined PDFs.";
    }
    return notificationJson({
      success:failed===0,
      processed:results.length,
      succeeded,
      failed,
      statement_date:statementDate,
      dry_run:dryRun,
      batch_combined_key:batchCombinedKey,
      batch_combined_error:batchCombinedError,
      results
    },failed && !succeeded?500:200);

  }catch(error){
    console.error("adminGenerateStatementsPost failed",error);
    return notificationJson({success:false,error:"Statements could not be generated. "+String(error?.message||error)},500);
  }
}
__name(adminGenerateStatementsPost,"adminGenerateStatementsPost");

async function ensureStatementSchedulingSchema(env){
  await ensureCustomerStatementCycleColumn(env);
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS statement_schedule_config (
      id INTEGER PRIMARY KEY CHECK(id=1),
      weekly_enabled INTEGER NOT NULL DEFAULT 0,
      weekly_weekday INTEGER NOT NULL DEFAULT 1,
      weekly_hour INTEGER NOT NULL DEFAULT 8,
      monthly_enabled INTEGER NOT NULL DEFAULT 0,
      monthly_day INTEGER NOT NULL DEFAULT 1,
      monthly_hour INTEGER NOT NULL DEFAULT 8,
      monthly_cycles TEXT NOT NULL DEFAULT 'A',
      positive_balance_only INTEGER NOT NULL DEFAULT 1,
      payment_count INTEGER NOT NULL DEFAULT 1,
      portal_enabled INTEGER NOT NULL DEFAULT 1,
      email_enabled INTEGER NOT NULL DEFAULT 1,
      sms_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO statement_schedule_config(id) VALUES(1)
  `).run();
  const configInfo=await env.DB.prepare(`PRAGMA table_info(statement_schedule_config)`).all();
  const configColumns=new Set((configInfo?.results||[]).map(row=>String(row.name||"").toLowerCase()));
  if(!configColumns.has("midmonth_enabled"))await env.DB.prepare(`ALTER TABLE statement_schedule_config ADD COLUMN midmonth_enabled INTEGER NOT NULL DEFAULT 0`).run();
  if(!configColumns.has("midmonth_day"))await env.DB.prepare(`ALTER TABLE statement_schedule_config ADD COLUMN midmonth_day INTEGER NOT NULL DEFAULT 15`).run();
  if(!configColumns.has("midmonth_hour"))await env.DB.prepare(`ALTER TABLE statement_schedule_config ADD COLUMN midmonth_hour INTEGER NOT NULL DEFAULT 8`).run();
  if(!configColumns.has("weekly_frequency"))await env.DB.prepare(`ALTER TABLE statement_schedule_config ADD COLUMN weekly_frequency TEXT NOT NULL DEFAULT 'weekly'`).run();
  if(!configColumns.has("weekly_anchor_date"))await env.DB.prepare(`ALTER TABLE statement_schedule_config ADD COLUMN weekly_anchor_date TEXT NOT NULL DEFAULT ''`).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS statement_schedule_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_key TEXT NOT NULL UNIQUE,
      run_type TEXT NOT NULL,
      statement_cycle TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      customer_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      portal_success INTEGER NOT NULL DEFAULT 0,
      portal_failure INTEGER NOT NULL DEFAULT 0,
      email_success INTEGER NOT NULL DEFAULT 0,
      email_failure INTEGER NOT NULL DEFAULT 0,
      sms_success INTEGER NOT NULL DEFAULT 0,
      sms_failure INTEGER NOT NULL DEFAULT 0,
      detail_json TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    )
  `).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_statement_schedule_runs_started ON statement_schedule_runs(started_at DESC,id DESC)`).run();
  const runInfo=await env.DB.prepare(`PRAGMA table_info(statement_schedule_runs)`).all();
  const runColumns=new Set((runInfo?.results||[]).map(row=>String(row.name||"").toLowerCase()));
  const runAdditions=[
    ["target_json","TEXT NOT NULL DEFAULT '[]'"],
    ["cursor_position","INTEGER NOT NULL DEFAULT 0"],
    ["processed_count","INTEGER NOT NULL DEFAULT 0"],
    ["combined_working_key","TEXT NOT NULL DEFAULT ''"],
    ["combined_working_parts_json","TEXT NOT NULL DEFAULT '[]'"],
    ["combined_pdf_key","TEXT NOT NULL DEFAULT ''"],
    ["combined_pdf_filename","TEXT NOT NULL DEFAULT ''"],
    ["combined_pdf_error","TEXT NOT NULL DEFAULT ''"],
    ["combined_pdf_parts_json","TEXT NOT NULL DEFAULT '[]'"],
    ["combined_group_id","TEXT NOT NULL DEFAULT ''"],
    ["group_combined_pdf_key","TEXT NOT NULL DEFAULT ''"],
    ["group_combined_pdf_filename","TEXT NOT NULL DEFAULT ''"],
    ["group_combined_pdf_error","TEXT NOT NULL DEFAULT ''"],
    ["group_combined_pdf_parts_json","TEXT NOT NULL DEFAULT '[]'"]
  ];
  for(const [name,definition] of runAdditions){
    if(!runColumns.has(name))await env.DB.prepare(`ALTER TABLE statement_schedule_runs ADD COLUMN ${name} ${definition}`).run();
  }
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS statement_run_delivery_guard (
      run_id INTEGER NOT NULL,
      account_number TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'claimed',
      delivery_id TEXT NOT NULL DEFAULT '',
      error_text TEXT NOT NULL DEFAULT '',
      claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      PRIMARY KEY(run_id,account_number,channel)
    )
  `).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_statement_run_delivery_guard_run ON statement_run_delivery_guard(run_id,account_number)`).run();
}
__name(ensureStatementSchedulingSchema,"ensureStatementSchedulingSchema");

async function claimStatementRunDelivery(env,runId,account,channel){
  const id=Math.max(0,Number(runId||0));
  if(!id)return true;
  const normalized=normalizeNotificationAccount(account);
  if(!normalized)return false;
  const inserted=await env.DB.prepare(`
    INSERT OR IGNORE INTO statement_run_delivery_guard(run_id,account_number,channel,status,claimed_at)
    VALUES(?,?,?,'claimed',CURRENT_TIMESTAMP)
  `).bind(id,normalized,String(channel||'')).run();
  return Number(inserted?.meta?.changes||0)===1;
}
__name(claimStatementRunDelivery,"claimStatementRunDelivery");

async function finishStatementRunDelivery(env,runId,account,channel,{status='completed',deliveryId='',errorText=''}={}){
  const id=Math.max(0,Number(runId||0));
  if(!id)return;
  await env.DB.prepare(`
    UPDATE statement_run_delivery_guard
    SET status=?,delivery_id=?,error_text=?,completed_at=CURRENT_TIMESTAMP
    WHERE run_id=? AND account_number=? AND channel=?
  `).bind(String(status||'completed'),String(deliveryId||''),String(errorText||''),id,normalizeNotificationAccount(account),String(channel||'')).run();
}
__name(finishStatementRunDelivery,"finishStatementRunDelivery");

function statementCentralParts(date=new Date()){
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",hourCycle:"h23"
  }).formatToParts(date).reduce((acc,part)=>{acc[part.type]=part.value;return acc;},{});
  const weekday={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[parts.weekday]??0;
  return {year:parts.year,month:parts.month,day:parts.day,weekday,hour:Number(parts.hour||0),date:`${parts.year}-${parts.month}-${parts.day}`};
}
__name(statementCentralParts,"statementCentralParts");

async function statementScheduleConfig(env){
  await ensureStatementSchedulingSchema(env);
  return env.DB.prepare(`SELECT * FROM statement_schedule_config WHERE id=1`).first();
}
__name(statementScheduleConfig,"statementScheduleConfig");

async function statementScheduleCustomers(env,type,config){
  const exceptional=type==="exceptional";
  const cycles=type==="weekly"?["B"]:type==="midmonth"?[]:exceptional?["E"]:["A"];
  if(!cycles.length)return [];
  const placeholders=cycles.map(()=>"?").join(",");
  const balanceExpr=`COALESCE(current_balance,0)+COALESCE(aging_category_1,0)+COALESCE(aging_category_2,0)+COALESCE(aging_category_3,0)+COALESCE(aging_category_4,0)`;
  const clauses=[`upper(trim(COALESCE(statement_cycle,''))) IN (${placeholders})`];
  if(!exceptional)clauses.push(`(account_status IS NULL OR trim(account_status)='' OR lower(trim(account_status))='active')`);
  if(!exceptional&&Number(config.positive_balance_only)!==0)clauses.push(`${balanceExpr}>0.004`);
  const result=await env.DB.prepare(`
    SELECT account_number,account_name,statement_cycle,${balanceExpr} AS total_balance,phone,email
    FROM customers
    WHERE ${clauses.join(" AND ")}
    ORDER BY account_name COLLATE NOCASE,account_number
    LIMIT 5000
  `).bind(...cycles).all();
  return result?.results||[];
}
__name(statementScheduleCustomers,"statementScheduleCustomers");

async function startStatementSchedule(env,type,origin,{force=false,dryRun=false,testSend=false,accountNumbers=null}={}){
  const config=await statementScheduleConfig(env);
  const central=statementCentralParts();
  const cycleLabel=type==="weekly"?"B":type==="midmonth"?"LEGACY":"A";
  const baseKey=type==="weekly"?`weekly:${central.date}`:`${type}:${central.year}-${central.month}`;
  const isTest=!!dryRun||!!testSend;
  const runKey=dryRun?`testdry:${type}:${crypto.randomUUID()}`:testSend?`testsend:${type}:${crypto.randomUUID()}`:force?`${baseKey}:manual:${crypto.randomUUID()}`:baseKey;
  const storedRunType=isTest?`test_${type}`:type;
  const allCustomers=await statementScheduleCustomers(env,type,config);
  let requestedAccounts=null;
  let customers=allCustomers;
  if(Array.isArray(accountNumbers)){
    requestedAccounts=[...new Set(accountNumbers.map(value=>{const digits=String(value||"").replace(/\D/g,"");return digits?digits.padStart(7,"0"):"";}).filter(Boolean))];
    if(!requestedAccounts.length)throw new Error("Select at least one customer before starting a manual statement run.");
    const eligibleByAccount=new Map(allCustomers.map(customer=>[String(customer.account_number||""),customer]));
    customers=requestedAccounts.map(account=>eligibleByAccount.get(account)).filter(Boolean);
    if(!customers.length)throw new Error(`None of the selected customers currently match Cycle ${cycleLabel} and the saved statement eligibility rules.`);
  }
  const manualSelectedRun=Array.isArray(requestedAccounts);
  if(manualSelectedRun){
    // A manual Test/Run must NEVER inherit or resume a previous run for the whole cycle.
    // Close older unfinished manual/test runs of the same type before creating this exact-selection run.
    await env.DB.prepare(`
      UPDATE statement_schedule_runs
      SET status='cancelled_selection_superseded', completed_at=CURRENT_TIMESTAMP
      WHERE run_type=? AND status='running'
        AND (run_key LIKE 'testdry:%' OR run_key LIKE 'testsend:%' OR run_key LIKE '%:manual:%')
    `).bind(storedRunType).run();
  }else{
    // Only an automatic scheduled run may resume, and only when its exact deterministic run key matches.
    const active=await env.DB.prepare(`
      SELECT id,customer_count,processed_count,success_count,failure_count,target_json
      FROM statement_schedule_runs
      WHERE run_key=? AND status='running'
      LIMIT 1
    `).bind(runKey).first();
    if(active)return {success:true,dry_run:dryRun,test_send:testSend,run_id:active.id,processed:Number(active.processed_count||0),total:Number(active.customer_count||0),succeeded:Number(active.success_count||0),failed:Number(active.failure_count||0),complete:false,resumed:true,selection_enforced:false,target_accounts:(()=>{try{return JSON.parse(active.target_json||'[]');}catch{return [];}})()};
  }
  const inserted=await env.DB.prepare(`
    INSERT OR IGNORE INTO statement_schedule_runs(run_key,run_type,statement_cycle,status)
    VALUES(?,?,?,'running')
  `).bind(runKey,storedRunType,cycleLabel).run();
  if(Number(inserted?.meta?.changes||0)===0)return {success:true,skipped:true,reason:"This schedule has already run for the current period."};
  const runId=inserted?.meta?.last_row_id||inserted?.meta?.last_insert_rowid;
  try{
    await env.DB.prepare(`
      UPDATE statement_schedule_runs SET
        customer_count=?,target_json=?,cursor_position=0,processed_count=0,detail_json='[]'
      WHERE id=?
    `).bind(customers.length,JSON.stringify(customers.map(c=>c.account_number)),runId).run();
    if(!customers.length){
      await env.DB.prepare(`UPDATE statement_schedule_runs SET status=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(isTest?"test_completed":"completed",runId).run();
    }
    return {success:true,dry_run:dryRun,test_send:testSend,run_id:runId,processed:0,total:customers.length,requested:requestedAccounts?.length??customers.length,eligible:customers.length,skipped:selectedAccountsSkipped(requestedAccounts,customers),succeeded:0,failed:0,complete:customers.length===0,selection_enforced:Array.isArray(requestedAccounts),target_accounts:customers.map(customer=>String(customer.account_number||''))};
  }catch(error){
    await env.DB.prepare(`UPDATE statement_schedule_runs SET status=?,failure_count=1,detail_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(isTest?"test_failed":"failed",JSON.stringify([{error:String(error?.message||error)}]),runId).run();
    throw error;
  }
}
function selectedAccountsSkipped(requestedAccounts,customers){
  if(!Array.isArray(requestedAccounts))return 0;
  return Math.max(0,requestedAccounts.length-(Array.isArray(customers)?customers.length:0));
}
__name(startStatementSchedule,"startStatementSchedule");

async function continueStatementSchedule(env,runId,origin){
  await ensureStatementSchedulingSchema(env);
  const run=await env.DB.prepare(`SELECT * FROM statement_schedule_runs WHERE id=? LIMIT 1`).bind(runId).first();
  if(!run)throw new Error("Statement run was not found.");
  if(String(run.status||"")!=="running")return {success:true,run_id:runId,complete:true,status:run.status};
  let targets=[];let results=[];
  try{targets=JSON.parse(run.target_json||"[]");}catch{}
  try{results=JSON.parse(run.detail_json||"[]");}catch{}
  if(!Array.isArray(targets))targets=[];if(!Array.isArray(results))results=[];
  const manualSelectedRun=String(run.run_key||'').startsWith('testdry:')||String(run.run_key||'').startsWith('testsend:')||String(run.run_key||'').includes(':manual:');
  if(manualSelectedRun){
    const normalizedTargets=[...new Set(targets.map(value=>{const digits=String(value||'').replace(/\D/g,'');return digits?digits.padStart(7,'0'):'';}).filter(Boolean))];
    if(!normalizedTargets.length||normalizedTargets.length!==Number(run.customer_count||0)){
      await env.DB.prepare(`UPDATE statement_schedule_runs SET status='failed_selection_guard',failure_count=CASE WHEN failure_count<1 THEN 1 ELSE failure_count END,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(runId).run();
      throw new Error('Selected-customer safety check failed. No statement batch was processed.');
    }
    targets=normalizedTargets;
  }
  const preIsTest=String(run.run_type||"").startsWith("test_");
  const preTestSend=preIsTest&&String(run.run_key||"").startsWith("testsend:");
  const preDryRun=preIsTest&&!preTestSend;
  const cursor=Math.max(0,Number(run.cursor_position||0));
  const processedBefore=Math.max(0,Number(run.processed_count||0));
  if(processedBefore<cursor){
    return {success:true,run_id:runId,complete:false,status:"running",processed:processedBefore,total:targets.length,succeeded:Number(run.success_count||0),failed:Number(run.failure_count||0),batch_in_progress:true};
  }
  const baseBatchSize=preDryRun?20:5;
  const remainingInCombinedPart=STATEMENT_COMBINED_CUSTOMERS_PER_PART-(cursor%STATEMENT_COMBINED_CUSTOMERS_PER_PART);
  const batchSize=Math.min(baseBatchSize,remainingInCombinedPart);
  const accounts=targets.slice(cursor,cursor+batchSize);
  if(!accounts.length){
    const failure=results.filter(r=>!r.success).length;
    await env.DB.prepare(`UPDATE statement_schedule_runs SET status=?,processed_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(run.run_type||"").startsWith("test_")?(failure?"test_completed_with_errors":"test_completed"):(failure?"completed_with_errors":"completed"),results.length,runId).run();
    await finalizeStatementRunCombinedPdf(env,runId).catch(async error=>{console.error("Statement combined PDF finalization failed",error);await env.DB.prepare(`UPDATE statement_schedule_runs SET combined_pdf_error=? WHERE id=?`).bind(String(error?.message||error),runId).run().catch(()=>{});});
    return {success:failure===0,run_id:runId,complete:true,processed:results.length,total:targets.length,succeeded:results.length-failure,failed:failure};
  }

  // Claim this exact batch BEFORE generating or sending anything. This prevents duplicate
  // SMS/email/portal delivery if two browser/network continuation requests overlap.
  const claimedThrough=cursor+accounts.length;
  const claim=await env.DB.prepare(`
    UPDATE statement_schedule_runs
    SET cursor_position=?
    WHERE id=? AND status='running' AND cursor_position=?
  `).bind(claimedThrough,runId,cursor).run();
  if(Number(claim?.meta?.changes||0)!==1){
    const current=await env.DB.prepare(`
      SELECT status,cursor_position,processed_count,success_count,failure_count,customer_count
      FROM statement_schedule_runs WHERE id=? LIMIT 1
    `).bind(runId).first();
    return {
      success:true,run_id:runId,complete:String(current?.status||'')!=='running',
      status:current?.status||'running',processed:Number(current?.processed_count||0),
      total:Number(current?.customer_count||targets.length),succeeded:Number(current?.success_count||0),
      failed:Number(current?.failure_count||0),batch_already_claimed:true
    };
  }

  const isTest=preIsTest;
  const testSend=preTestSend;
  const dryRun=preDryRun;
  const config=await statementScheduleConfig(env);
  const central=statementCentralParts();
  const siteOrigin=String(origin||env.PUBLIC_SITE_URL||"https://wootenoil.com").replace(/\/$/,"");
  const generateRequest=new Request(`${siteOrigin}/api/admin/statements/generate`,{
    method:"POST",headers:{"X-Admin-Key":String(env.ADMIN_IMPORT_KEY||""),"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({accounts,statement_run_id:runId,statement_date:central.date,payment_count:Math.max(0,Math.min(20,Number(config.payment_count||0))),portal_notification:dryRun?false:Number(config.portal_enabled)!==0,email_pdf:dryRun?false:Number(config.email_enabled)!==0,sms_link:dryRun?false:Number(config.sms_enabled)!==0,dry_run:dryRun})
  });
  let batch=[];let batchCombinedKey="";let batchCombinedError="";
  try{
    const response=await adminGenerateStatementsPost({request:generateRequest,env});
    const data=await response.json().catch(()=>({}));
    batch=Array.isArray(data.results)?data.results:accounts.map(account=>({account_number:account,success:false,error:data.error||"Statement batch failed."}));
    batchCombinedKey=String(data.batch_combined_key||"");
    batchCombinedError=String(data.batch_combined_error||"");
  }catch(error){batch=accounts.map(account=>({account_number:account,success:false,error:String(error?.message||error)}));}
  results.push(...batch);
  let combinedWorkingPartsJson=String(run.combined_working_parts_json||"[]");
  if(batchCombinedKey){
    try{
      const partNumber=Math.floor(cursor/STATEMENT_COMBINED_CUSTOMERS_PER_PART)+1;
      combinedWorkingPartsJson=await appendStatementRunCombinedPdf(env,{...run,combined_working_parts_json:combinedWorkingPartsJson},batchCombinedKey,partNumber,cursor+1,claimedThrough);
    }catch(error){batchCombinedError=String(error?.message||error);console.error("Statement combined PDF part append failed",error);}
  }
  const processed=claimedThrough;
  const success=results.filter(r=>r.success).length;
  const failure=results.length-success;
  const portalSuccess=results.filter(r=>r.success&&r.portal_notified).length;
  const emailSuccess=results.filter(r=>r.success&&r.email_sent).length;
  const smsSuccess=results.filter(r=>r.success&&r.sms_sent).length;
  const enabledPortal=!dryRun&&Number(config.portal_enabled)!==0,enabledEmail=!dryRun&&Number(config.email_enabled)!==0,enabledSms=!dryRun&&Number(config.sms_enabled)!==0;
  const complete=processed>=targets.length;
  const finalStatus=complete?(isTest?(failure?"test_completed_with_errors":"test_completed"):(failure?"completed_with_errors":"completed")):"running";
  await env.DB.prepare(`UPDATE statement_schedule_runs SET status=?,cursor_position=?,processed_count=?,success_count=?,failure_count=?,portal_success=?,portal_failure=?,email_success=?,email_failure=?,sms_success=?,sms_failure=?,detail_json=?,combined_working_parts_json=?,combined_pdf_error=CASE WHEN ?<>'' THEN ? ELSE combined_pdf_error END,completed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?`).bind(finalStatus,processed,processed,success,failure,portalSuccess,enabledPortal?processed-portalSuccess:0,emailSuccess,enabledEmail?processed-emailSuccess:0,smsSuccess,enabledSms?processed-smsSuccess:0,JSON.stringify(results),combinedWorkingPartsJson,batchCombinedError,batchCombinedError,complete?1:0,runId).run();
  if(complete)await finalizeStatementRunCombinedPdf(env,runId).catch(async error=>{console.error("Statement combined PDF finalization failed",error);await env.DB.prepare(`UPDATE statement_schedule_runs SET combined_pdf_error=? WHERE id=?`).bind(String(error?.message||error),runId).run().catch(()=>{});});
  return {success:failure===0,run_id:runId,complete,processed,total:targets.length,succeeded:success,failed:failure};
}
__name(continueStatementSchedule,"continueStatementSchedule");

async function processDueStatementSchedules(env){
  if(!env.DB||!env.ADMIN_IMPORT_KEY||!env.NOTIFICATION_ATTACHMENTS)return;
  await ensureStatementSchedulingSchema(env);
  // Cron may continue automatic schedules only. Manual Test/Run batches are controlled by the admin browser
  // so an abandoned or older full-cycle manual run can never restart in the background.
  const activeRuns=await env.DB.prepare(`
    SELECT id FROM statement_schedule_runs
    WHERE status='running'
      AND run_key NOT LIKE 'testdry:%'
      AND run_key NOT LIKE 'testsend:%'
      AND run_key NOT LIKE '%:manual:%'
    ORDER BY id LIMIT 3
  `).all();
  for(const active of activeRuns?.results||[]){
    await continueStatementSchedule(env,active.id,env.PUBLIC_SITE_URL||"https://wootenoil.com").catch(error=>console.error("Statement run continuation failed",active.id,error));
  }
  const config=await statementScheduleConfig(env);
  const central=statementCentralParts();
  const weeklyFrequency=String(config.weekly_frequency||"weekly").toLowerCase();
  const anchorDate=/^\d{4}-\d{2}-\d{2}$/.test(String(config.weekly_anchor_date||""))?String(config.weekly_anchor_date):"";
  const anchorTime=anchorDate?Date.parse(anchorDate+"T00:00:00Z"):NaN;
  const currentTime=Date.parse(central.date+"T00:00:00Z");
  const anchorDays=Number.isFinite(anchorTime)&&Number.isFinite(currentTime)?Math.floor((currentTime-anchorTime)/86400000):-1;
  const weeklyDateDue=weeklyFrequency==="biweekly"?anchorDays>=0&&anchorDays%14===0:central.weekday===Number(config.weekly_weekday);
  if(Number(config.weekly_enabled)!==0&&weeklyDateDue&&central.hour===Number(config.weekly_hour)){
    await launchDueStatementSchedule(env,"weekly").catch(error=>console.error("Weekly statement schedule failed",error));
  }
  if(Number(config.monthly_enabled)!==0&&Number(central.day)===Number(config.monthly_day)&&central.hour===Number(config.monthly_hour)){
    await launchDueStatementSchedule(env,"monthly").catch(error=>console.error("Monthly statement schedule failed",error));
  }
}
__name(processDueStatementSchedules,"processDueStatementSchedules");

async function launchDueStatementSchedule(env,type){
  const origin=env.PUBLIC_SITE_URL||"https://wootenoil.com";
  const started=await startStatementSchedule(env,type,origin);
  if(started.run_id&&!started.complete)await continueStatementSchedule(env,started.run_id,origin);
  return started;
}
__name(launchDueStatementSchedule,"launchDueStatementSchedule");

function statementScheduleAuthorized(request,env){return !!env.ADMIN_IMPORT_KEY&&(request.headers.get("X-Admin-Key")||"")===env.ADMIN_IMPORT_KEY;}
__name(statementScheduleAuthorized,"statementScheduleAuthorized");

async function adminCustomerStatementCycle({request,env}){
  if(!statementScheduleAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
  if(!env.DB)return notificationJson({success:false,error:"Customer database is not configured."},503);
  try{
    const body=await request.json().catch(()=>({}));
    const cycle=String(body.statement_cycle||"").trim().toUpperCase();
    if(!["A","B","E"].includes(cycle))return notificationJson({success:false,error:"Statement assignment must be Cycle A, Cycle B, or Exceptional Customers."},400);
    await ensureCustomerStatementCycleColumn(env);
    if(Array.isArray(body.account_numbers)){
      const accounts=[...new Set(body.account_numbers.map(value=>{const digits=String(value||"").replace(/\D/g,"");return digits?digits.padStart(7,"0"):"";}).filter(Boolean))];
      if(!accounts.length)return notificationJson({success:false,error:"Select at least one customer."},400);
      if(accounts.length>5000)return notificationJson({success:false,error:"No more than 5,000 customers can be moved at once."},413);
      let updated=0;
      for(let start=0;start<accounts.length;start+=100){
        const chunk=accounts.slice(start,start+100),placeholders=chunk.map(()=>"?").join(",");
        const result=await env.DB.prepare(`UPDATE customers SET statement_cycle=?,updated_at=CURRENT_TIMESTAMP WHERE account_number IN (${placeholders}) AND upper(trim(COALESCE(statement_cycle,'')))<>?`).bind(cycle,...chunk,cycle).run();
        updated+=Number(result?.meta?.changes||0);
      }
      return notificationJson({success:true,bulk:true,selected:accounts.length,updated,statement_cycle:cycle});
    }
    const digits=String(body.account_number||"").replace(/\D/g,"");
    const account=digits?digits.padStart(7,"0"):"";
    if(!account)return notificationJson({success:false,error:"A valid customer account number is required."},400);
    const customer=await env.DB.prepare(`SELECT account_number,account_name FROM customers WHERE account_number=? LIMIT 1`).bind(account).first();
    if(!customer)return notificationJson({success:false,error:"Customer account was not found."},404);
    await env.DB.prepare(`UPDATE customers SET statement_cycle=?,updated_at=CURRENT_TIMESTAMP WHERE account_number=?`).bind(cycle,account).run();
    return notificationJson({success:true,account_number:account,account_name:customer.account_name||"Customer",statement_cycle:cycle});
  }catch(error){
    console.error("Customer statement cycle update failed",error);
    return notificationJson({success:false,error:"Customer statement cycle could not be updated."},500);
  }
}
__name(adminCustomerStatementCycle,"adminCustomerStatementCycle");

async function adminStatementScheduling({request,env}){
  if(!statementScheduleAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
  try{
    await ensureStatementSchedulingSchema(env);
    if(request.method==="POST"){
      const body=await request.json().catch(()=>({}));
      await env.DB.prepare(`
        UPDATE statement_schedule_config SET
          weekly_enabled=?,weekly_weekday=?,weekly_hour=?,weekly_frequency=?,weekly_anchor_date=?,midmonth_enabled=?,midmonth_day=?,midmonth_hour=?,monthly_enabled=?,monthly_day=?,monthly_hour=?,monthly_cycles='A',
          positive_balance_only=?,payment_count=?,portal_enabled=?,email_enabled=?,sms_enabled=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=1
      `).bind(
        body.weekly_enabled?1:0,Math.max(0,Math.min(6,Number(body.weekly_weekday)||0)),Math.max(0,Math.min(23,Number(body.weekly_hour)||0)),String(body.weekly_frequency||"").toLowerCase()==="biweekly"?"biweekly":"weekly",/^\d{4}-\d{2}-\d{2}$/.test(String(body.weekly_anchor_date||""))?String(body.weekly_anchor_date):statementCentralParts().date,
        0,Math.max(1,Math.min(28,Number(body.midmonth_day)||15)),Math.max(0,Math.min(23,Number(body.midmonth_hour)||0)),
        body.monthly_enabled?1:0,Math.max(1,Math.min(28,Number(body.monthly_day)||1)),Math.max(0,Math.min(23,Number(body.monthly_hour)||0)),
        body.positive_balance_only!==false?1:0,Math.max(0,Math.min(20,Number(body.payment_count)||0)),body.portal_enabled?1:0,body.email_enabled?1:0,body.sms_enabled?1:0
      ).run();
    }
    const config=await statementScheduleConfig(env);
    const compact=new URL(request.url).searchParams.get("compact")==="1";
    const runs=await env.DB.prepare(`SELECT * FROM statement_schedule_runs ORDER BY started_at DESC,id DESC LIMIT 20`).all();
    const parsed=(runs?.results||[]).map(row=>({...row,detail_json:compact?undefined:row.detail_json,results:compact?[]:(()=>{try{return JSON.parse(row.detail_json||"[]");}catch{return [];}})(),combined_pdf_parts:(()=>{try{return JSON.parse(row.combined_pdf_parts_json||"[]");}catch{return [];}})(),group_combined_pdf_parts:(()=>{try{return JSON.parse(row.group_combined_pdf_parts_json||"[]");}catch{return [];}})()}));
    return notificationJson({success:true,config,runs:parsed,central_time:statementCentralParts(),capabilities:{selected_statement_recipients_v2:true,selected_statement_test_all_v1:true,statement_batch_claim_v1:true,statement_channel_dedupe_v1:true,statement_delivery_reasons_v1:true,statement_dry_test_v1:true,statement_combined_pdf_v1:true,statement_combined_pdf_parts_v1:true,exceptional_statement_customers_v1:true}});
  }catch(error){
    console.error("Statement scheduling settings failed",error);
    return notificationJson({success:false,error:"Statement scheduling settings could not be processed. "+String(error?.message||error)},500);
  }
}
__name(adminStatementScheduling,"adminStatementScheduling");

async function adminStatementSchedulingPreview({request,env}){
  if(!statementScheduleAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
  try{
    const requested=new URL(request.url).searchParams.get("type");
    const type=requested==="weekly"?"weekly":requested==="midmonth"?"midmonth":requested==="exceptional"?"exceptional":"monthly";
    const config=await statementScheduleConfig(env);
    const customers=await statementScheduleCustomers(env,type,config);
    return notificationJson({success:true,type,count:customers.length,customers});
  }catch(error){return notificationJson({success:false,error:"Scheduled customers could not be previewed. "+String(error?.message||error)},500);}
}
__name(adminStatementSchedulingPreview,"adminStatementSchedulingPreview");

async function adminStatementSchedulingCombinedPdf({request,env}){
  if(!statementScheduleAuthorized(request,env))return new Response("Unauthorized.",{status:401});
  if(!env.NOTIFICATION_ATTACHMENTS)return new Response("Statement storage is not configured.",{status:503});
  await ensureStatementSchedulingSchema(env);
  const url=new URL(request.url);
  const groupId=String(url.searchParams.get("group_id")||"").trim();
  const runId=Math.max(0,Number(url.searchParams.get("run_id")||0));
  const requestedPart=Math.max(1,Number(url.searchParams.get("part")||1));
  let row=null,parts=[];
  if(groupId){
    row=await env.DB.prepare(`SELECT * FROM statement_schedule_runs WHERE combined_group_id=? ORDER BY id LIMIT 1`).bind(groupId).first();
    if(row&&!String(row.group_combined_pdf_parts_json||"").includes('"key"'))await finalizeStatementRunCombinedGroup(env,groupId).catch(()=>{});
    row=await env.DB.prepare(`SELECT * FROM statement_schedule_runs WHERE combined_group_id=? ORDER BY id LIMIT 1`).bind(groupId).first();
    try{parts=JSON.parse(row?.group_combined_pdf_parts_json||"[]");}catch{}
    if((!Array.isArray(parts)||!parts.length)&&row?.group_combined_pdf_key)parts=[{part_number:1,key:row.group_combined_pdf_key,filename:row.group_combined_pdf_filename||"Wooten-Oil-Test-All-Combined.pdf"}];
  }else if(runId){
    row=await env.DB.prepare(`SELECT * FROM statement_schedule_runs WHERE id=? LIMIT 1`).bind(runId).first();
    if(row&&String(row.status||"")!=="running"&&!String(row.combined_pdf_parts_json||"").includes('"key"'))await finalizeStatementRunCombinedPdf(env,runId).catch(()=>{});
    row=await env.DB.prepare(`SELECT * FROM statement_schedule_runs WHERE id=? LIMIT 1`).bind(runId).first();
    try{parts=JSON.parse(row?.combined_pdf_parts_json||"[]");}catch{}
    if((!Array.isArray(parts)||!parts.length)&&row?.combined_pdf_key)parts=[{part_number:1,key:row.combined_pdf_key,filename:row.combined_pdf_filename||statementCombinedFilename(row||{id:runId})}];
  }
  if(!row)return new Response("Statement run was not found.",{status:404});
  const part=(Array.isArray(parts)?parts:[]).find(item=>Number(item?.part_number)===requestedPart);
  if(!part||!part.key)return new Response(String(groupId?row.group_combined_pdf_error:row.combined_pdf_error)||`Combined PDF Part ${requestedPart} is not available for this run.`,{status:404});
  const object=await env.NOTIFICATION_ATTACHMENTS.get(String(part.key));
  if(!object)return new Response("Combined PDF file is unavailable.",{status:404});
  const filename=String(part.filename||`Wooten-Oil-Combined-Part-${requestedPart}.pdf`);
  const headers=new Headers();object.writeHttpMetadata(headers);headers.set("Content-Type","application/pdf");headers.set("Content-Disposition",`inline; filename="${filename.replace(/"/g,"")}"; filename*=UTF-8''${encodeURIComponent(filename)}`);headers.set("Cache-Control","private, no-store");headers.set("X-Content-Type-Options","nosniff");
  return new Response(object.body,{status:200,headers});
}
__name(adminStatementSchedulingCombinedPdf,"adminStatementSchedulingCombinedPdf");


function statementCleanupPartEntries(row){
  const out=[];
  const add=(jsonValue,fallbackKey,fallbackFilename,scope)=>{
    let parts=[];try{parts=JSON.parse(jsonValue||"[]");}catch{}
    if((!Array.isArray(parts)||!parts.length)&&fallbackKey)parts=[{part_number:1,key:fallbackKey,filename:fallbackFilename||"Combined Statement PDF.pdf"}];
    for(const part of Array.isArray(parts)?parts:[]){
      const key=String(part?.key||"").trim();if(!key)continue;
      out.push({key,filename:String(part?.filename||fallbackFilename||key.split("/").pop()||"Combined Statement PDF.pdf"),part_number:Number(part?.part_number||1),scope});
    }
  };
  add(row.combined_pdf_parts_json,row.combined_pdf_key,row.combined_pdf_filename,"run");
  add(row.group_combined_pdf_parts_json,row.group_combined_pdf_key,row.group_combined_pdf_filename,"group");
  return out;
}
__name(statementCleanupPartEntries,"statementCleanupPartEntries");

async function adminStatementSchedulingPdfCleanup({request,env}){
  if(!statementScheduleAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
  if(!env.NOTIFICATION_ATTACHMENTS)return notificationJson({success:false,error:"Statement storage is not configured."},503);
  await ensureStatementSchedulingSchema(env);
  try{
    const oldRows=await env.DB.prepare(`SELECT id,run_type,started_at,completed_at,combined_group_id,combined_pdf_key,combined_pdf_filename,combined_pdf_parts_json,group_combined_pdf_key,group_combined_pdf_filename,group_combined_pdf_parts_json FROM statement_schedule_runs WHERE COALESCE(completed_at,started_at) <= datetime('now','-90 days') ORDER BY COALESCE(completed_at,started_at) DESC,id DESC`).all();
    const allowed=new Map();
    for(const row of oldRows?.results||[]){
      for(const part of statementCleanupPartEntries(row)){
        if(!part.key.startsWith("statement-runs/"))continue;
        const existing=allowed.get(part.key);
        const item={...part,run_id:Number(row.id||0),group_id:String(row.combined_group_id||""),run_type:String(row.run_type||""),created_at:String(row.completed_at||row.started_at||"")};
        if(!existing||part.scope==="group")allowed.set(part.key,item);
      }
    }
    if(request.method==="GET"){
      const files=[];
      for(const item of allowed.values()){
        let object=null;try{object=await env.NOTIFICATION_ATTACHMENTS.head(item.key);}catch{}
        if(!object)continue;
        files.push({...item,size:Number(object.size||0),uploaded_at:object.uploaded?new Date(object.uploaded).toISOString():item.created_at});
      }
      files.sort((a,b)=>String(b.uploaded_at||b.created_at).localeCompare(String(a.uploaded_at||a.created_at)));
      return notificationJson({success:true,retention_days:90,count:files.length,files});
    }
    if(request.method!=="POST")return methodNotAllowed();
    const body=await request.json().catch(()=>({}));
    const requested=[...new Set((Array.isArray(body.keys)?body.keys:[]).map(v=>String(v||"").trim()).filter(Boolean))];
    if(!requested.length)return notificationJson({success:false,error:"Select at least one PDF file to delete."},400);
    const invalid=requested.filter(key=>!allowed.has(key));
    if(invalid.length)return notificationJson({success:false,error:"One or more selected files are not eligible for 90-day cleanup. Refresh the list and try again."},409);
    for(const key of requested)await env.NOTIFICATION_ATTACHMENTS.delete(key);
    const affectedRows=new Set();
    for(const key of requested){const item=allowed.get(key);if(item?.run_id)affectedRows.add(Number(item.run_id));}
    // Remove deleted file references from every run row so report links disappear cleanly.
    const allRows=await env.DB.prepare(`SELECT id,combined_pdf_key,combined_pdf_filename,combined_pdf_parts_json,group_combined_pdf_key,group_combined_pdf_filename,group_combined_pdf_parts_json FROM statement_schedule_runs WHERE combined_pdf_key<>'' OR group_combined_pdf_key<>'' OR combined_pdf_parts_json<>'[]' OR group_combined_pdf_parts_json<>'[]'`).all();
    for(const row of allRows?.results||[]){
      let runParts=[],groupParts=[];try{runParts=JSON.parse(row.combined_pdf_parts_json||"[]");}catch{}try{groupParts=JSON.parse(row.group_combined_pdf_parts_json||"[]");}catch{}
      runParts=(Array.isArray(runParts)?runParts:[]).filter(part=>!requested.includes(String(part?.key||"")));
      groupParts=(Array.isArray(groupParts)?groupParts:[]).filter(part=>!requested.includes(String(part?.key||"")));
      const runKey=requested.includes(String(row.combined_pdf_key||""))?String(runParts[0]?.key||""):String(row.combined_pdf_key||"");
      const runFilename=runKey?String((runParts.find(p=>String(p?.key||"")===runKey)||{}).filename||row.combined_pdf_filename||""):"";
      const groupKey=requested.includes(String(row.group_combined_pdf_key||""))?String(groupParts[0]?.key||""):String(row.group_combined_pdf_key||"");
      const groupFilename=groupKey?String((groupParts.find(p=>String(p?.key||"")===groupKey)||{}).filename||row.group_combined_pdf_filename||""):"";
      await env.DB.prepare(`UPDATE statement_schedule_runs SET combined_pdf_key=?,combined_pdf_filename=?,combined_pdf_parts_json=?,group_combined_pdf_key=?,group_combined_pdf_filename=?,group_combined_pdf_parts_json=? WHERE id=?`).bind(runKey,runFilename,JSON.stringify(runParts),groupKey,groupFilename,JSON.stringify(groupParts),row.id).run();
    }
    return notificationJson({success:true,deleted_count:requested.length,deleted_keys:requested});
  }catch(error){
    console.error("Statement PDF cleanup failed",error);
    return notificationJson({success:false,error:"Statement PDF cleanup could not be processed. "+String(error?.message||error)},500);
  }
}
__name(adminStatementSchedulingPdfCleanup,"adminStatementSchedulingPdfCleanup");

async function adminStatementSchedulingRun({request,env}){
  if(!statementScheduleAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
  const body=await request.json().catch(()=>({}));
  const type=body.type==="weekly"?"weekly":body.type==="midmonth"?"midmonth":"monthly";
  try{
    const config=await statementScheduleConfig(env);
    const cycleEnabled=type==="weekly"?Number(config.weekly_enabled)!==0:type==="monthly"?Number(config.monthly_enabled)!==0:false;
    if(!cycleEnabled){
      const cycleName=type==="weekly"?"Cycle B":"Cycle A";
      return notificationJson({success:false,error:cycleName+" is disabled. Enable its checkbox and save the schedule before testing or running statements."},409);
    }
    if(body.selected_only!==true){
      return notificationJson({success:false,error:"Selected-customer safety mode is required for every manual Test/Run. Refresh the Admin page and try again."},400);
    }
    if(!Array.isArray(body.account_numbers)||!body.account_numbers.length){
      return notificationJson({success:false,error:"Select at least one customer in the cycle preview. Manual Test and Run actions only process explicitly selected customers."},400);
    }
    const normalized=[...new Set(body.account_numbers.map(value=>{const digits=String(value||"").replace(/\D/g,"");return digits?digits.padStart(7,"0"):"";}).filter(Boolean))];
    if(!normalized.length)return notificationJson({success:false,error:"Select at least one valid customer account."},400);
    if(normalized.length>5000)return notificationJson({success:false,error:"No more than 5,000 customers can be selected for one statement run."},413);
    const origin=new URL(request.url).origin;
    const started=await startStatementSchedule(env,type,origin,{force:true,dryRun:body.dry_run===true,testSend:body.test_send===true,accountNumbers:normalized});
    return notificationJson(started);
  }
  catch(error){return notificationJson({success:false,error:"Scheduled statement run failed. "+String(error?.message||error)},500);}
}
__name(adminStatementSchedulingRun,"adminStatementSchedulingRun");

async function adminStatementSchedulingTestAll({request,env}){
  if(!statementScheduleAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
  const body=await request.json().catch(()=>({}));
  try{
    if(body.selected_only!==true){
      return notificationJson({success:false,error:"Selected-customer safety mode is required for Test All Cycles."},400);
    }
    const source=body.selections&&typeof body.selections==="object"?body.selections:{};
    const normalizeList=(value)=>[...new Set((Array.isArray(value)?value:[]).map(item=>{const digits=String(item||"").replace(/\D/g,"");return digits?digits.padStart(7,"0"):"";}).filter(Boolean))];
    const selections={monthly:normalizeList(source.monthly),weekly:normalizeList(source.weekly)};
    const types=["monthly","weekly"].filter(type=>selections[type].length);
    if(!types.length)return notificationJson({success:false,error:"Select at least one customer in Cycle A or Cycle B before using Test All Cycles."},400);
    if(selections.monthly.length>5000||selections.weekly.length>5000)return notificationJson({success:false,error:"No more than 5,000 customers may be selected in one cycle."},413);

    const duplicateAcrossCycles=selections.monthly.filter(account=>selections.weekly.includes(account));
    if(duplicateAcrossCycles.length){
      return notificationJson({success:false,error:"SAFETY STOP: the same customer appears in both Cycle A and Cycle B selections. Refresh both previews before testing."},409);
    }

    const config=await statementScheduleConfig(env);
    if(selections.monthly.length&&Number(config.monthly_enabled)===0)return notificationJson({success:false,error:"Cycle A is disabled. Enable Cycle A and save the schedule before Test All Cycles."},409);
    if(selections.weekly.length&&Number(config.weekly_enabled)===0)return notificationJson({success:false,error:"Cycle B is disabled. Enable Cycle B and save the schedule before Test All Cycles."},409);

    // Validate every selected account in every selected cycle BEFORE creating or continuing any run.
    const validated={};
    for(const type of types){
      const eligible=await statementScheduleCustomers(env,type,config);
      const eligibleSet=new Set(eligible.map(row=>String(row.account_number||"")));
      const invalid=selections[type].filter(account=>!eligibleSet.has(account));
      if(invalid.length){
        const cycleName=type==="weekly"?"Cycle B":"Cycle A";
        return notificationJson({success:false,error:`SAFETY STOP: ${invalid.length} selected customer(s) no longer match ${cycleName} or the saved eligibility rules. Refresh the preview and select again. No statements were sent.`,invalid_accounts:invalid,cycle:type},409);
      }
      validated[type]=selections[type];
    }

    const origin=new URL(request.url).origin;
    const created=[];
    const combinedGroupId=`testall:${crypto.randomUUID()}`;
    try{
      for(const type of types){
        const started=await startStatementSchedule(env,type,origin,{force:true,dryRun:true,testSend:false,accountNumbers:validated[type]});
        const returned=[...new Set((Array.isArray(started?.target_accounts)?started.target_accounts:[]).map(item=>{const digits=String(item||"").replace(/\D/g,"");return digits?digits.padStart(7,"0"):"";}).filter(Boolean))];
        const requested=validated[type];
        const exact=started?.selection_enforced===true&&Number(started?.total)===requested.length&&returned.length===requested.length&&requested.every(account=>returned.includes(account))&&started?.resumed!==true;
        if(!exact)throw new Error(`Selected-customer target confirmation failed for ${type==="weekly"?"Cycle B":"Cycle A"}.`);
        if(started?.run_id)await env.DB.prepare(`UPDATE statement_schedule_runs SET combined_group_id=? WHERE id=?`).bind(combinedGroupId,started.run_id).run();
        created.push({...started,type,combined_group_id:combinedGroupId});
      }
    }catch(error){
      for(const run of created){
        if(run?.run_id)await env.DB.prepare(`UPDATE statement_schedule_runs SET status='cancelled_test_all_safety',completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='running'`).bind(run.run_id).run().catch(()=>{});
      }
      throw error;
    }

    return notificationJson({success:true,selected_only:true,test_send:false,dry_run:true,total_selected:types.reduce((sum,type)=>sum+validated[type].length,0),cycles:types,combined_group_id:combinedGroupId,runs:created});
  }catch(error){
    console.error("Selected Test All Cycles failed",error);
    return notificationJson({success:false,error:"Selected-customer Test All Cycles failed. "+String(error?.message||error)},500);
  }
}
__name(adminStatementSchedulingTestAll,"adminStatementSchedulingTestAll");

async function adminStatementSchedulingContinue({request,env}){
  if(!statementScheduleAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
  const body=await request.json().catch(()=>({}));
  const runId=Math.max(0,Number(body.run_id||0));
  if(!runId)return notificationJson({success:false,error:"A valid statement run is required."},400);
  try{
    const origin=new URL(request.url).origin;
    const progress=await continueStatementSchedule(env,runId,origin);
    return notificationJson(progress);
  }catch(error){
    await env.DB.prepare(`UPDATE statement_schedule_runs SET status='failed',failure_count=CASE WHEN failure_count<1 THEN 1 ELSE failure_count END,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(runId).run().catch(()=>{});
    return notificationJson({success:false,error:"Statement batch could not continue. "+String(error?.message||error)},500);
  }
}
__name(adminStatementSchedulingContinue,"adminStatementSchedulingContinue");

const ADMIN_PERMISSION_KEYS=["database","customer_activity","notifications","statements","communication","communications_settings","applications","activation"];
async function ensureAdminUsersTables(env){
  if(!env?.DB) throw new Error("Admin user database is not configured.");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE COLLATE NOCASE,display_name TEXT NOT NULL,password_salt TEXT NOT NULL,password_hash TEXT NOT NULL,permissions TEXT NOT NULL DEFAULT '[]',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  const userInfo=await env.DB.prepare(`PRAGMA table_info(admin_users)`).all();const userColumns=new Set((userInfo?.results||[]).map(row=>String(row.name||"").toLowerCase()));
  const userAdditions=[["username","TEXT NOT NULL DEFAULT ''"],["display_name","TEXT NOT NULL DEFAULT ''"],["password_salt","TEXT NOT NULL DEFAULT ''"],["password_hash","TEXT NOT NULL DEFAULT ''"],["permissions","TEXT NOT NULL DEFAULT '[]'"],["active","INTEGER NOT NULL DEFAULT 1"],["created_at","TEXT"],["updated_at","TEXT"]];
  for(const [name,definition] of userAdditions)if(!userColumns.has(name))await env.DB.prepare(`ALTER TABLE admin_users ADD COLUMN ${name} ${definition}`).run();
  await env.DB.prepare(`UPDATE admin_users SET created_at=COALESCE(created_at,CURRENT_TIMESTAMP),updated_at=COALESCE(updated_at,CURRENT_TIMESTAMP),permissions=COALESCE(NULLIF(permissions,''),'[]'),active=COALESCE(active,1)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at TEXT NOT NULL,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES admin_users(id) ON DELETE CASCADE)`).run();
  const sessionInfo=await env.DB.prepare(`PRAGMA table_info(admin_sessions)`).all();const sessionColumns=new Set((sessionInfo?.results||[]).map(row=>String(row.name||"").toLowerCase()));
  const sessionAdditions=[["token_hash","TEXT NOT NULL DEFAULT ''"],["user_id","INTEGER NOT NULL DEFAULT 0"],["expires_at","TEXT NOT NULL DEFAULT ''"],["last_seen_at","TEXT"],["created_at","TEXT"]];
  for(const [name,definition] of sessionAdditions)if(!sessionColumns.has(name))await env.DB.prepare(`ALTER TABLE admin_sessions ADD COLUMN ${name} ${definition}`).run();
  await env.DB.prepare(`UPDATE admin_sessions SET last_seen_at=COALESCE(last_seen_at,CURRENT_TIMESTAMP),created_at=COALESCE(created_at,CURRENT_TIMESTAMP)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id,expires_at)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT,actor_user_id INTEGER,actor_name TEXT NOT NULL,action_type TEXT NOT NULL,target_type TEXT,target_id TEXT,detail TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  const auditInfo=await env.DB.prepare(`PRAGMA table_info(admin_audit_log)`).all();const auditColumns=new Set((auditInfo?.results||[]).map(row=>String(row.name||"").toLowerCase()));
  const auditAdditions=[["id","INTEGER"],["actor_user_id","INTEGER"],["actor_name","TEXT NOT NULL DEFAULT 'Wooten Oil Admin'"],["action_type","TEXT NOT NULL DEFAULT 'activity'"],["target_type","TEXT"],["target_id","TEXT"],["detail","TEXT"],["created_at","TEXT"]];
  for(const [name,definition] of auditAdditions)if(!auditColumns.has(name))await env.DB.prepare(`ALTER TABLE admin_audit_log ADD COLUMN ${name} ${definition}`).run();
  await env.DB.prepare(`UPDATE admin_audit_log SET id=COALESCE(id,rowid),created_at=COALESCE(created_at,CURRENT_TIMESTAMP),actor_name=CASE WHEN actor_name='Wooten Oil Owner' THEN 'Wooten Oil Admin' ELSE COALESCE(NULLIF(actor_name,''),'Wooten Oil Admin') END,action_type=COALESCE(NULLIF(action_type,''),'activity')`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC,id DESC)`).run();
}
__name(ensureAdminUsersTables,"ensureAdminUsersTables");
function adminBytesHex(bytes){return [...bytes].map(v=>v.toString(16).padStart(2,"0")).join("");}
function adminHexBytes(hex){const clean=String(hex||"");const out=new Uint8Array(Math.floor(clean.length/2));for(let i=0;i<out.length;i++)out[i]=parseInt(clean.slice(i*2,i*2+2),16);return out;}
async function adminSha256(value){return adminBytesHex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value||"")))));}
async function adminPasswordHash(password,saltHex){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(password||"")),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:adminHexBytes(saltHex),iterations:100000},key,256);return adminBytesHex(new Uint8Array(bits));}
function adminSafePermissions(value){let source=value;try{if(typeof source==="string")source=JSON.parse(source);}catch{source=[];}return [...new Set((Array.isArray(source)?source:[]).map(v=>String(v||"")).filter(v=>ADMIN_PERMISSION_KEYS.includes(v)))];}
function adminRequestActor(request,env){const ownerHeader=request.headers.get("X-Admin-Actor-Owner");return {id:Number(request.headers.get("X-Admin-Actor-Id")||0)||null,name:String(request.headers.get("X-Admin-Actor-Name")||"Wooten Oil Admin"),owner:ownerHeader!==null?ownerHeader==="1":((request.headers.get("X-Admin-Key")||"")===String(env.ADMIN_IMPORT_KEY||""))};}
async function ensureAdminAuditV2(env){
  if(!env?.DB)throw new Error("Admin activity database is not configured.");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log_v2 (id INTEGER PRIMARY KEY AUTOINCREMENT,actor_user_id INTEGER,actor_name TEXT NOT NULL DEFAULT 'Wooten Oil Admin',action_type TEXT NOT NULL DEFAULT 'activity',target_type TEXT,target_id TEXT,detail TEXT,source TEXT NOT NULL DEFAULT 'v2',legacy_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_audit_v2_created ON admin_audit_log_v2(created_at DESC,id DESC)`).run();
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_audit_v2_legacy ON admin_audit_log_v2(source,legacy_id) WHERE legacy_id IS NOT NULL`).run();
  try{
    await env.DB.prepare(`INSERT OR IGNORE INTO admin_audit_log_v2(actor_user_id,actor_name,action_type,target_type,target_id,detail,source,legacy_id,created_at) SELECT actor_user_id,COALESCE(NULLIF(actor_name,''),'Wooten Oil Admin'),COALESCE(NULLIF(action_type,''),'activity'),target_type,target_id,detail,'legacy',COALESCE(CAST(id AS TEXT),CAST(rowid AS TEXT)),COALESCE(created_at,CURRENT_TIMESTAMP) FROM admin_audit_log`).run();
  }catch(error){console.warn("Legacy admin activity could not be copied",error);}
}
async function adminAudit(env,request,action,targetType="",targetId="",detail=""){try{await ensureAdminAuditV2(env);const actor=adminRequestActor(request,env);await env.DB.prepare(`INSERT INTO admin_audit_log_v2(actor_user_id,actor_name,action_type,target_type,target_id,detail) VALUES (?,?,?,?,?,?)`).bind(actor.id,actor.name,String(action||""),String(targetType||""),String(targetId||""),String(detail||"").slice(0,2000)).run();}catch(error){console.error("Admin audit could not be recorded",error);}}
function adminGeneralAuditDescriptor(request){
  const url=new URL(request.url),path=url.pathname,method=String(request.method||"GET").toUpperCase();
  if(path==="/api/admin/audit")return null;
  if(method==="DELETE"&&/^\/api\/admin\/account-applications\/\d+$/.test(path))return null;
  if(method==="POST"&&(path==="/api/admin/users"||path==="/api/admin/customers-import"||path==="/api/admin/customer-payments-import"||path==="/api/admin/account-applications"))return null;
  if(method==="POST"&&path==="/api/admin/import-control/cancel")return null;
  if(method==="GET"&&path==="/api/admin/import-status")return null;
  if(path==="/api/admin/customer-activity"&&url.searchParams.get("account_number"))return null;
  const account=url.searchParams.get("account_number")||url.searchParams.get("account")||"";
  const routes={
    "/api/admin/users":["admin_users_viewed","administration","Administrator user list viewed"],
    "/api/admin/customer-activity":["customer_activity_searched","customer_activity","Customer Activity searched"],
    "/api/admin/customers-database":["customer_database_viewed","database","Live Customer Data loaded or searched"],
    "/api/admin/customer-payments-database":["payment_database_viewed","database","Live Customer Payments loaded or searched"],
    "/api/admin/customer-contact-preferences":[method==="GET"?"contact_preferences_viewed":"contact_preferences_changed","customer",method==="GET"?"Customer contact preferences viewed":"Customer contact preferences changed"],
    "/api/admin/customer-online-deactivate":["online_account_deactivated","customer","Customer online account deactivated"],
    "/api/admin/clear-database":["database_cleared","database","Customer or payment database cleared"],
    "/api/admin/import-status":["import_status_viewed","database","Import status viewed"],
    "/api/admin/gmail-inbox":["customer_messages_viewed","communication","Customer message history viewed"],
    "/api/admin/gmail-portal-sync":["gmail_portal_sync_run","communication","Gmail portal synchronization run"],
    "/api/admin/gmail-portal-sync/status":["gmail_portal_sync_status_viewed","communication","Gmail portal synchronization status viewed"],
    "/api/admin/statement-customers":["statement_customers_viewed","statements","Statement customer list viewed"],
    "/api/admin/communication-log":["communication_history_viewed","communication","Communication history viewed"],
    "/api/admin/communication-log/resend":["communication_resent","communication","Communication resend requested"],
    "/api/admin/statements/generate":["statements_generated","statements","Statement generation requested"],
    "/api/admin/statement-scheduling":[method==="GET"?"statement_schedule_viewed":"statement_schedule_changed","statements",method==="GET"?"Statement schedule viewed":"Statement schedule changed"],
    "/api/admin/statement-scheduling/preview":["statement_schedule_previewed","statements","Statement schedule previewed"],
    "/api/admin/statement-scheduling/run":["statement_schedule_run","statements","Statement schedule run started"],
    "/api/admin/statement-scheduling/continue":["statement_schedule_continued","statements","Statement schedule run continued"],
    "/api/admin/customer-statement-cycle":["statement_cycle_changed","customer","Customer statement cycle changed"],
    "/api/admin/customer-documents":[method==="GET"?"customer_documents_viewed":"customer_documents_changed","documents",method==="GET"?"Customer documents viewed":"Customer documents changed"],
    "/api/admin/customer-documents/upload":["customer_document_uploaded","documents","Customer document uploaded"],
    "/api/admin/customer-notifications":["customer_notification_sent","notifications","Customer notification send requested"],
    "/api/admin/twilio/status":["sms_settings_viewed","communication_settings","Twilio SMS connection status viewed"],
    "/api/admin/customer-activation-code":["activation_code_created","activation","Customer activation code created"],
    "/api/admin/customer-password-reset-code":["password_reset_code_created","activation","Customer password reset code created"],
    "/api/admin/account-applications":["account_applications_viewed","applications","Account applications viewed"]
  };
  let descriptor=routes[path];
  if(!descriptor&&path.startsWith("/api/admin/account-applications/"))descriptor=["application_document_viewed","applications","Account application document viewed"];
  if(!descriptor&&path.startsWith("/api/admin/customer-activity/documents/"))descriptor=["customer_document_opened","documents","Customer document opened from Customer Activity"];
  if(!descriptor&&path.startsWith("/api/admin/customer-documents/"))descriptor=["customer_document_opened","documents","Customer document opened"];
  if(!descriptor)descriptor=[`admin_${method.toLowerCase()}_${path.split("/").filter(Boolean).slice(2).join("_").replace(/[^a-z0-9_]/gi,"").toLowerCase()||"activity"}`,"admin",`${method} ${path}`];
  return {action:descriptor[0],targetType:descriptor[1],targetId:String(account||""),detail:descriptor[2]};
}
async function recordGeneralAdminActivity(env,request){const item=adminGeneralAuditDescriptor(request);if(item)await adminAudit(env,request,item.action,item.targetType,item.targetId,item.detail);}
function adminPermissionForPath(path){
  if(path.startsWith("/api/admin/users"))return "manage_users";
  if(path.startsWith("/api/admin/customer-activity"))return "customer_activity";
  if(path.startsWith("/api/admin/account-applications")||path.startsWith("/api/admin/request-center"))return "applications";
  if(path.includes("activation")||path.includes("password-reset-code"))return "activation";
  if(path.includes("gmail")||path.includes("twilio"))return "communications_settings";
  if(path.includes("communication-log"))return "communication";
  if(path.includes("statement")||path.includes("customer-documents"))return "statements";
  if(path.includes("notification"))return "notifications";
  if(path.includes("customer")||path.includes("import")||path.includes("database"))return "database";
  return "manage_users";
}
function adminTimeZoneOffsetMs(date,timeZone="America/Chicago"){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const values={};for(const part of parts)if(part.type!=="literal")values[part.type]=Number(part.value);
  return Date.UTC(values.year,values.month-1,values.day,values.hour,values.minute,values.second)-date.getTime();
}
function adminNextCentralMidnightIso(){
  const now=new Date();
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const values={};for(const part of parts)if(part.type!=="literal")values[part.type]=Number(part.value);
  const nextLocal=new Date(Date.UTC(values.year,values.month-1,values.day+1,0,0,0));
  let guess=new Date(nextLocal.getTime()-adminTimeZoneOffsetMs(nextLocal));
  guess=new Date(nextLocal.getTime()-adminTimeZoneOffsetMs(guess));
  return guess.toISOString().replace("T"," ").replace(".000Z","");
}
async function adminSessionFromCredential(env,credential){
  if(!env?.DB||!credential)return null;await ensureAdminUsersTables(env);const tokenHash=await adminSha256(credential);
  const row=await env.DB.prepare(`SELECT s.token_hash,s.user_id,s.expires_at,u.username,u.display_name,u.permissions,u.active FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=? AND u.active=1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(tokenHash).first();
  if(!row)return null;await env.DB.prepare(`UPDATE admin_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?`).bind(tokenHash).run();return {...row,permissions:adminSafePermissions(row.permissions)};
}
async function adminAuthorizeRequest(request,env,path){
  const credential=String(request.headers.get("X-Admin-Key")||"");
  if(env.ADMIN_IMPORT_KEY&&credential===String(env.ADMIN_IMPORT_KEY)){const headers=new Headers(request.headers);headers.set("X-Admin-Actor-Name","Wooten Oil Admin");headers.set("X-Admin-Actor-Owner","1");return {request:new Request(request,{headers}),actor:{name:"Wooten Oil Admin",owner:true,permissions:ADMIN_PERMISSION_KEYS}};}
  const session=await adminSessionFromCredential(env,credential);if(!session)return {response:notificationJson({success:false,error:"Your admin session is invalid or expired."},401)};
  if(path.startsWith("/api/admin/users"))return {response:notificationJson({success:false,error:"Only the Wooten Oil Admin can manage administrator users."},403)};
  if(!path.startsWith("/api/admin/audit")){const permission=adminPermissionForPath(path);if(!session.permissions.includes(permission))return {response:notificationJson({success:false,error:"You do not have permission to use this admin section."},403)};}
  const headers=new Headers(request.headers);headers.set("X-Admin-Key",String(env.ADMIN_IMPORT_KEY||""));headers.set("X-Admin-Actor-Id",String(session.user_id));headers.set("X-Admin-Actor-Name",String(session.display_name||session.username));headers.set("X-Admin-Actor-Owner","0");return {request:new Request(request,{headers}),actor:{id:session.user_id,name:session.display_name,owner:false,permissions:session.permissions}};
}
async function adminAuthLogin({request,env}){
  try{if(!env.DB)return notificationJson({success:false,error:"Admin user database is not configured."},503);const body=await request.json();const username=String(body.username||"").trim();const password=String(body.password||"");if(!username||!password)return notificationJson({success:false,error:"Enter your username and password."},400);
    if(env.ADMIN_IMPORT_KEY&&username==="Admin"&&password===String(env.ADMIN_IMPORT_KEY)){const headers=new Headers();headers.set("X-Admin-Key",String(env.ADMIN_IMPORT_KEY));headers.set("X-Admin-Actor-Name","Wooten Oil Admin");headers.set("X-Admin-Actor-Owner","1");await adminAudit(env,new Request(request.url,{headers}),"admin_login","admin_owner","Admin","Signed in");return notificationJson({success:true,token:password,user:{display_name:"Wooten Oil Admin",username:"Admin",owner:true,permissions:ADMIN_PERMISSION_KEYS}});}
    await ensureAdminUsersTables(env);const user=await env.DB.prepare(`SELECT id,username,display_name,password_salt,password_hash,permissions,active FROM admin_users WHERE username=? COLLATE BINARY LIMIT 1`).bind(username).first();if(!user||!Number(user.active))return notificationJson({success:false,error:"Invalid username or password."},401);const hash=await adminPasswordHash(password,user.password_salt);if(hash!==user.password_hash)return notificationJson({success:false,error:"Invalid username or password."},401);
    const token=crypto.randomUUID()+crypto.randomUUID();const tokenHash=await adminSha256(token);const expiresAt=adminNextCentralMidnightIso();await env.DB.prepare(`DELETE FROM admin_sessions WHERE expires_at<=CURRENT_TIMESTAMP`).run();await env.DB.prepare(`INSERT INTO admin_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)`).bind(tokenHash,user.id,expiresAt).run();const permissions=adminSafePermissions(user.permissions);const auditHeaders=new Headers();auditHeaders.set("X-Admin-Actor-Id",String(user.id));auditHeaders.set("X-Admin-Actor-Name",user.display_name);auditHeaders.set("X-Admin-Actor-Owner","0");await adminAudit(env,new Request(request.url,{headers:auditHeaders}),"admin_login","admin_user",String(user.id),"Signed in");return notificationJson({success:true,token,user:{id:user.id,username:user.username,display_name:user.display_name,owner:false,permissions}});
  }catch(error){console.error("adminAuthLogin failed",error);return notificationJson({success:false,error:"Administrator login is unavailable."},500);}
}
async function adminAuthMe({request,env}){const credential=String(request.headers.get("X-Admin-Key")||"");if(env.ADMIN_IMPORT_KEY&&credential===String(env.ADMIN_IMPORT_KEY))return notificationJson({success:true,user:{display_name:"Wooten Oil Admin",username:"Admin",owner:true,permissions:ADMIN_PERMISSION_KEYS}});const session=await adminSessionFromCredential(env,credential);if(!session)return notificationJson({success:false,error:"Session expired."},401);return notificationJson({success:true,user:{id:session.user_id,username:session.username,display_name:session.display_name,owner:false,permissions:session.permissions}});}
async function adminAuthLogout({request,env}){const credential=String(request.headers.get("X-Admin-Key")||"");if(!credential||!env?.DB)return notificationJson({success:true});if(credential===String(env.ADMIN_IMPORT_KEY||"")){const headers=new Headers();headers.set("X-Admin-Key",credential);headers.set("X-Admin-Actor-Name","Wooten Oil Admin");headers.set("X-Admin-Actor-Owner","1");await adminAudit(env,new Request(request.url,{headers}),"admin_logout","admin_owner","Admin","Signed out");return notificationJson({success:true});}await ensureAdminUsersTables(env);const session=await adminSessionFromCredential(env,credential);if(session){const headers=new Headers();headers.set("X-Admin-Actor-Id",String(session.user_id));headers.set("X-Admin-Actor-Name",String(session.display_name||session.username));headers.set("X-Admin-Actor-Owner","0");await adminAudit(env,new Request(request.url,{headers}),"admin_logout","admin_user",String(session.user_id),"Signed out");}await env.DB.prepare(`DELETE FROM admin_sessions WHERE token_hash=?`).bind(await adminSha256(credential)).run();return notificationJson({success:true});}
async function adminUsersApi({request,env}){
  try{await ensureAdminUsersTables(env);if(request.method==="GET"){const users=await env.DB.prepare(`SELECT id,username,display_name,permissions,active,created_at,updated_at FROM admin_users ORDER BY display_name COLLATE NOCASE`).all();return notificationJson({success:true,users:(users?.results||[]).map(u=>({...u,permissions:adminSafePermissions(u.permissions)}))});}
    const body=await request.json();const id=Number(body.id||0);const username=String(body.username||"").trim().slice(0,60);const displayName=String(body.display_name||"").trim().slice(0,100);const password=String(body.password||"");const permissions=adminSafePermissions(body.permissions);const active=body.active===false||body.active===0?0:1;if(!username||!displayName)return notificationJson({success:false,error:"Enter the user's name and username."},400);if(!/^[A-Za-z0-9._-]+$/.test(username))return notificationJson({success:false,error:"Username may contain only letters, numbers, periods, underscores, and hyphens. Spaces are not allowed."},400);if((!id||password)&&!(password.length>=8&&/[A-Za-z]/.test(password)&&/\d/.test(password)))return notificationJson({success:false,error:"Password must contain at least 8 characters, including at least one letter and one number."},400);const duplicateUser=await env.DB.prepare(`SELECT id FROM admin_users WHERE username=? COLLATE NOCASE AND id<>? LIMIT 1`).bind(username,id||0).first();if(duplicateUser)return notificationJson({success:false,error:"That username is already in use."},409);
    let userId=id;if(id){const existing=await env.DB.prepare(`SELECT id FROM admin_users WHERE id=?`).bind(id).first();if(!existing)return notificationJson({success:false,error:"Admin user not found."},404);if(password){const salt=adminBytesHex(crypto.getRandomValues(new Uint8Array(16)));const hash=await adminPasswordHash(password,salt);await env.DB.prepare(`UPDATE admin_users SET username=?,display_name=?,password_salt=?,password_hash=?,permissions=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(username,displayName,salt,hash,JSON.stringify(permissions),active,id).run();}else await env.DB.prepare(`UPDATE admin_users SET username=?,display_name=?,permissions=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(username,displayName,JSON.stringify(permissions),active,id).run();if(!active)await env.DB.prepare(`DELETE FROM admin_sessions WHERE user_id=?`).bind(id).run();}
    else{const salt=adminBytesHex(crypto.getRandomValues(new Uint8Array(16)));const hash=await adminPasswordHash(password,salt);const result=await env.DB.prepare(`INSERT INTO admin_users(username,display_name,password_salt,password_hash,permissions,active) VALUES (?,?,?,?,?,?)`).bind(username,displayName,salt,hash,JSON.stringify(permissions),active).run();userId=Number(result?.meta?.last_row_id||result?.meta?.last_insert_rowid||0);}
    await adminAudit(env,request,id?"admin_user_updated":"admin_user_created","admin_user",String(userId),`${displayName} (${username})`);return notificationJson({success:true,id:userId});
  }catch(error){console.error("adminUsersApi failed",error);const technicalDetail=String(error?.message||error||"").replace(/\s+/g," ").trim().slice(0,240);const errorText=technicalDetail.toLowerCase();const duplicate=errorText.includes("unique")||errorText.includes("constraint failed")&&errorText.includes("username");return notificationJson({success:false,error:duplicate?"That username is already in use.":`The admin user could not be saved.${technicalDetail?` Technical detail: ${technicalDetail}`:""}`},duplicate?409:500);}
}
async function adminAuditGet({request,env}){try{await ensureAdminAuditV2(env);const rows=await env.DB.prepare(`SELECT id,actor_name,action_type,target_type,target_id,detail,created_at FROM admin_audit_log_v2 ORDER BY created_at DESC,id DESC LIMIT 100`).all();return notificationJson({success:true,entries:rows?.results||[],storage_version:2});}catch(error){console.error("adminAuditGet failed",error);return notificationJson({success:false,error:"Admin activity could not be loaded. "+String(error?.message||error)},500);}}

async function adminCustomerActivityGet({request,env}){
  try{
    if(!env?.DB)return notificationJson({success:false,error:"Customer database is not configured."},503);
    const url=new URL(request.url);const search=String(url.searchParams.get("search")||"").trim().slice(0,160);const account=normalizeNotificationAccount(url.searchParams.get("account_number")||"");
    if(!account){
      if(search.length<2)return notificationJson({success:true,matches:[]});
      const q=`%${search}%`;const rows=await env.DB.prepare(`SELECT account_number,account_name,email,phone,current_balance,account_status,COALESCE(current_balance,0)+COALESCE(aging_category_1,0)+COALESCE(aging_category_2,0)+COALESCE(aging_category_3,0)+COALESCE(aging_category_4,0) AS total_balance FROM customers WHERE account_number LIKE ? OR account_name LIKE ? OR email LIKE ? OR phone LIKE ? ORDER BY CASE WHEN account_number=? THEN 0 ELSE 1 END,account_name COLLATE NOCASE LIMIT 20`).bind(q,q,q,q,normalizeNotificationAccount(search)).all();
      return notificationJson({success:true,matches:rows?.results||[]});
    }
    await Promise.all([ensureCustomerPaymentsSchema(env),ensureCustomerDocumentsTable(env),ensureAdminCommunicationLogTable(env),ensureCustomerLoginActivityTable(env),ensureAccountApplicationsTable(env),ensureAdminContactPreferencesTable(env),ensureFuelRequestHistorySchema(env).catch(()=>{})]);
    const customer=await env.DB.prepare(`SELECT id,account_number,account_name,email,phone,address1,address2,address3,city,state,zip_code,current_balance,aging_category_1,aging_category_2,aging_category_3,aging_category_4,credit_hold,credit_limit,terms_description,salesperson_name,statement_cycle,account_status,updated_at,CASE WHEN password_hash IS NOT NULL AND trim(password_hash)<>'' THEN 1 ELSE 0 END AS online_activated,COALESCE((SELECT email_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS email_enabled,COALESCE((SELECT sms_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS sms_enabled,COALESCE((SELECT portal_enabled FROM admin_customer_contact_preferences p WHERE p.account_number=customers.account_number),1) AS portal_enabled FROM customers WHERE account_number=? LIMIT 1`).bind(account).first();
    if(!customer)return notificationJson({success:false,error:"Customer was not found."},404);
    const pageSize=20;const pageFor=name=>Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get(`${name}_page`)||"1",10)||1));
    const requestedChartMonths=Number.parseInt(url.searchParams.get("chart_months")||"12",10);const chartMonths=[3,6,12,24,0].includes(requestedChartMonths)?requestedChartMonths:12;const chartStartModifier=chartMonths?`-${Math.max(0,chartMonths-1)} months`:"-100 years";
    const pages={payments:pageFor("payments"),documents:pageFor("documents"),communications:pageFor("communications"),fuel:pageFor("fuel"),logins:pageFor("logins")};
    const offset=name=>(pages[name]-1)*pageSize;
    const safeRows=async(promise,label)=>{try{return (await promise)?.results||[];}catch(error){console.error(`Customer activity ${label} query failed`,error);return [];}};
    const [payments,documents,communications,fuelRequests,applications,logins,paymentChart,fuelChartSummary,lastChartPayment,paymentChartEntries]=await Promise.all([
      safeRows(env.DB.prepare(`SELECT id,payment_date,posting_date,deposit_date,reference,source_invoice_no AS invoice_no,amount,description,COUNT(*) OVER() AS total_count FROM customer_payments WHERE account_number=? ORDER BY COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date) DESC,id DESC LIMIT ? OFFSET ?`).bind(account,pageSize,offset("payments")).all(),"payments"),
      safeRows(env.DB.prepare(`SELECT id,document_type,title,document_date,filename,size_bytes,created_at,COUNT(*) OVER() AS total_count FROM portal_customer_documents WHERE account_number=? ORDER BY COALESCE(document_date,created_at) DESC,id DESC LIMIT ? OFFSET ?`).bind(account,pageSize,offset("documents")).all(),"documents"),
      safeRows(env.DB.prepare(`SELECT id,event_type,title,detail,portal_sent,email_sent,sms_sent,sms_status,sms_error_code,error_text,created_at,COUNT(*) OVER() AS total_count FROM admin_communication_log WHERE account_number=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(account,pageSize,offset("communications")).all(),"communications"),
      safeRows(env.DB.prepare(`SELECT request_number,fuel_type,gallons,delivery_date,delivery_address,email_status,received_at,COUNT(*) OVER() AS total_count FROM fuel_requests WHERE customer_account_number=? OR ((customer_account_number IS NULL OR trim(customer_account_number)='') AND (lower(email)=lower(?) OR phone=?)) ORDER BY datetime(received_at) DESC,rowid DESC LIMIT ? OFFSET ?`).bind(account,String(customer.email||""),String(customer.phone||""),pageSize,offset("fuel")).all(),"fuel requests"),
      safeRows(env.DB.prepare(`SELECT application_number,application_type,business_name,full_name,status,reviewed_by,reviewed_at,created_at FROM account_applications WHERE lower(email)=lower(?) OR phone=? ORDER BY created_at DESC,id DESC LIMIT 5`).bind(String(customer.email||""),String(customer.phone||"")).all(),"applications"),
      safeRows(env.DB.prepare(`SELECT result,user_agent,created_at,COUNT(*) OVER() AS total_count FROM customer_login_activity WHERE account_number=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(account,pageSize,offset("logins")).all(),"logins"),
      safeRows(env.DB.prepare(`WITH normalized AS (SELECT amount,CASE WHEN COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date) LIKE '____-__-__%' THEN substr(COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date),1,7) WHEN COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date) LIKE '__/__/____%' THEN substr(COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date),7,4)||'-'||substr(COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date),1,2) ELSE NULL END AS month FROM customer_payments WHERE account_number=?) SELECT month,SUM(COALESCE(amount,0)) AS total_amount,COUNT(*) AS payment_count FROM normalized WHERE month IS NOT NULL AND month>=strftime('%Y-%m','now',?) GROUP BY month ORDER BY month DESC`).bind(account,chartStartModifier).all(),"payment chart"),
      safeRows(env.DB.prepare(`SELECT COUNT(*) AS request_count,SUM(CASE WHEN trim(COALESCE(gallons,'')) GLOB '[0-9]*' THEN CAST(REPLACE(gallons,',','') AS REAL) ELSE 0 END) AS total_gallons FROM fuel_requests WHERE substr(received_at,1,7)>=strftime('%Y-%m','now',?) AND (customer_account_number=? OR ((customer_account_number IS NULL OR trim(customer_account_number)='') AND (lower(email)=lower(?) OR phone=?)))`).bind(chartStartModifier,account,String(customer.email||""),String(customer.phone||"")).all(),"fuel chart"),
      safeRows(env.DB.prepare(`SELECT amount,payment_date,posting_date,deposit_date FROM customer_payments WHERE account_number=? ORDER BY COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date) DESC,id DESC LIMIT 1`).bind(account).all(),"last chart payment"),
      safeRows(env.DB.prepare(`WITH normalized AS (SELECT id,amount,payment_date,posting_date,deposit_date,CASE WHEN COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date) LIKE '____-__-__%' THEN substr(COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date),1,10) WHEN COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date) LIKE '__/__/____%' THEN substr(COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date),7,4)||'-'||substr(COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date),1,2)||'-'||substr(COALESCE(NULLIF(posting_date,''),NULLIF(deposit_date,''),payment_date),4,2) ELSE NULL END AS chart_date FROM customer_payments WHERE account_number=?) SELECT id,amount,payment_date,posting_date,deposit_date,chart_date FROM normalized WHERE chart_date IS NOT NULL AND substr(chart_date,1,7)>=strftime('%Y-%m','now',?) ORDER BY chart_date ASC,id ASC LIMIT 5000`).bind(account,chartStartModifier).all(),"individual payment chart")
    ]);
    const pagination={};for(const [name,rows] of Object.entries({payments,documents,communications,fuel:fuelRequests,logins})){const total=Number(rows[0]?.total_count||0);pagination[name]={page:pages[name],page_size:pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))};}
    await adminAudit(env,request,"customer_activity_viewed","customer",account,String(customer.account_name||"Customer"));
    return notificationJson({success:true,customer,payments,documents,communications,fuel_requests:fuelRequests,applications,login_activity:logins,payment_chart:paymentChart,payment_chart_entries:paymentChartEntries,payment_chart_last:lastChartPayment[0]||null,fuel_chart_summary:paymentChartEntries,fuel_chart_stats:fuelChartSummary[0]||{},chart_months:chartMonths,pagination});
  }catch(error){console.error("adminCustomerActivityGet failed",error);return notificationJson({success:false,error:"Customer activity could not be loaded. "+String(error?.message||error)},500);}
}
__name(adminCustomerActivityGet,"adminCustomerActivityGet");

async function ensureAccountApplicationsTable(env){
  if(!env?.DB) throw new Error("Customer database is not configured.");
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS account_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_number TEXT NOT NULL UNIQUE,
      application_type TEXT NOT NULL,
      business_name TEXT,
      dba_name TEXT,
      tax_id_last4 TEXT,
      years_in_business INTEGER,
      full_name TEXT NOT NULL,
      job_title TEXT,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address_1 TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip_code TEXT NOT NULL,
      preferred_contact TEXT NOT NULL DEFAULT 'phone',
      applicant_notes TEXT,
      tax_document_key TEXT,
      tax_document_name TEXT,
      tax_document_type TEXT,
      identity_document_key TEXT NOT NULL,
      identity_document_name TEXT NOT NULL,
      identity_document_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      admin_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      sms_confirmation_consent INTEGER NOT NULL DEFAULT 0,
      support_email_sent INTEGER NOT NULL DEFAULT 0,
      support_email_id TEXT,
      applicant_email_sent INTEGER NOT NULL DEFAULT 0,
      applicant_email_id TEXT,
      confirmation_sms_sent INTEGER NOT NULL DEFAULT 0,
      confirmation_sms_sid TEXT,
      notification_error TEXT,
      notification_sent_at TEXT,
      submitted_ip_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_account_applications_created ON account_applications(created_at DESC,id DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_account_applications_status ON account_applications(status,created_at DESC)`).run();
  const info=await env.DB.prepare(`PRAGMA table_info(account_applications)`).all();const columns=new Set((info?.results||[]).map(row=>String(row.name||"").toLowerCase()));
  if(!columns.has("reviewed_by"))await env.DB.prepare(`ALTER TABLE account_applications ADD COLUMN reviewed_by TEXT`).run();
  if(!columns.has("reviewed_at"))await env.DB.prepare(`ALTER TABLE account_applications ADD COLUMN reviewed_at TEXT`).run();
  await env.DB.prepare(`UPDATE account_applications SET reviewed_by='Wooten Oil Admin' WHERE reviewed_by='Wooten Oil Owner'`).run();
  const additions=[["sms_confirmation_consent","INTEGER NOT NULL DEFAULT 0"],["support_email_sent","INTEGER NOT NULL DEFAULT 0"],["support_email_id","TEXT"],["applicant_email_sent","INTEGER NOT NULL DEFAULT 0"],["applicant_email_id","TEXT"],["confirmation_sms_sent","INTEGER NOT NULL DEFAULT 0"],["confirmation_sms_sid","TEXT"],["notification_error","TEXT"],["notification_sent_at","TEXT"]];
  for(const [name,definition] of additions)if(!columns.has(name))await env.DB.prepare(`ALTER TABLE account_applications ADD COLUMN ${name} ${definition}`).run();
}
__name(ensureAccountApplicationsTable,"ensureAccountApplicationsTable");

function accountApplicationText(value,max=200){return String(value||"").trim().slice(0,max);}
function accountApplicationFileInfo(file){
  if(!(file instanceof File)||file.size<=0) throw new Error("Choose the required document.");
  if(file.size>10*1024*1024) throw new Error("Each document must be 10 MB or smaller.");
  const name=notificationSafeFilename(file.name||"document");
  const type=String(file.type||"").toLowerCase();
  const extension=(name.split(".").pop()||"").toLowerCase();
  const allowed=(type==="application/pdf"||extension==="pdf")?"application/pdf":
    (type==="image/jpeg"||["jpg","jpeg"].includes(extension))?"image/jpeg":
    (type==="image/png"||extension==="png")?"image/png":"";
  if(!allowed) throw new Error("Documents must be PDF, JPG, or PNG files.");
  return {file,name,type:allowed};
}
async function accountApplicationVerifiedBytes(info){
  const bytes=new Uint8Array(await info.file.arrayBuffer());
  const pdf=bytes.length>=5&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d;
  const jpg=bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const png=bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a;
  if((info.type==="application/pdf"&&!pdf)||(info.type==="image/jpeg"&&!jpg)||(info.type==="image/png"&&!png)) throw new Error("One of the uploaded documents does not match its file type.");
  return bytes;
}
async function accountApplicationIpHash(request){
  const ip=String(request.headers.get("CF-Connecting-IP")||"");if(!ip)return "";
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].slice(0,12).map(v=>v.toString(16).padStart(2,"0")).join("");
}
async function accountApplicationSendEmail(env,{to,subject,html,text,from}){
  if(!env.RESEND_API_KEY)return {sent:false,error:"Email service is not configured."};
  try{
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json","User-Agent":"WootenOilCustomerPortal/1.0"},body:JSON.stringify({from:String(from||env.FUEL_FROM_EMAIL||"support@wootenoil.com").trim(),to:[to],subject,html,text})});
    const result=await response.json().catch(()=>({}));
    return response.ok?{sent:true,id:String(result.id||"")}:{sent:false,error:String(result.message||`Email service returned ${response.status}.`)};
  }catch(error){return {sent:false,error:String(error?.message||"Email could not be sent.")};}
}
async function accountApplicationSendNotifications({request,env,applicationNumber,type,data}){
  const applicantName=data.full_name;const accountName=type==="business"?data.business_name:applicantName;const submitted=new Date().toLocaleString("en-US",{timeZone:"America/Chicago",dateStyle:"long",timeStyle:"short"});
  const applicationsFrom=String(env.APPLICATIONS_FROM_EMAIL||"Wooten Oil Applications <applications@wootenoil.com>").trim();
  const internalHtml=`<h2>New Wooten Oil Account Application</h2><p>A new ${notificationEscapeHtml(type)} account application was submitted.</p><table cellpadding="7" cellspacing="0" style="border-collapse:collapse"><tr><td><strong>Application</strong></td><td>${notificationEscapeHtml(applicationNumber)}</td></tr><tr><td><strong>Applicant</strong></td><td>${notificationEscapeHtml(applicantName)}</td></tr><tr><td><strong>Account name</strong></td><td>${notificationEscapeHtml(accountName)}</td></tr><tr><td><strong>Email</strong></td><td>${notificationEscapeHtml(data.email)}</td></tr><tr><td><strong>Phone</strong></td><td>${notificationEscapeHtml(data.phone)}</td></tr><tr><td><strong>Submitted</strong></td><td>${notificationEscapeHtml(submitted)} Central</td></tr></table><p>Review the application and its private documents in Customer Administration → Account Applications.</p><p><strong>Security:</strong> Identity and Tax ID documents are not attached to this email.</p>`;
  const applicantHtml=`<h2>We received your Wooten Oil account application</h2><p>Hello ${notificationEscapeHtml(applicantName)},</p><p>Your application <strong>${notificationEscapeHtml(applicationNumber)}</strong> has been received. Our team will review it and contact you if additional information is needed.</p><p>Please keep your application number for your records.</p><p>Wooten Oil Co. Inc.<br>support@wootenoil.com</p>`;
  const internalText=`New Wooten Oil ${type} account application\nApplication: ${applicationNumber}\nApplicant: ${applicantName}\nAccount name: ${accountName}\nEmail: ${data.email}\nPhone: ${data.phone}\nSubmitted: ${submitted} Central\n\nReview it in Customer Administration > Account Applications. Sensitive documents are not attached.`;
  const applicantText=`Hello ${applicantName},\n\nWe received your Wooten Oil account application ${applicationNumber}. Our team will review it and contact you if additional information is needed. Please keep this number for your records.\n\nWooten Oil Co. Inc.\nsupport@wootenoil.com`;
  const smsBody=`Wooten Oil: We received your account application ${applicationNumber}. Our team will review it and contact you. Reply STOP to opt out.`;
  const supportPromise=accountApplicationSendEmail(env,{from:applicationsFrom,to:"support@wootenoil.com",subject:`New Wooten Oil Account Application — ${applicationNumber}`,html:internalHtml,text:internalText});
  const applicantPromise=accountApplicationSendEmail(env,{from:applicationsFrom,to:data.email,subject:`Wooten Oil Account Application Received — ${applicationNumber}`,html:applicantHtml,text:applicantText});
  const smsPromise=twilioSendSms(env,data.phone,smsBody,{statusCallbackUrl:twilioCallbackUrl(request,"/api/twilio/message-status")}).then(result=>({sent:true,sid:String(result?.sid||"")})).catch(error=>({sent:false,error:String(error?.message||"SMS could not be sent.")}));
  const [support,applicant,sms]=await Promise.all([supportPromise,applicantPromise,smsPromise]);
  return {support,applicant,sms};
}
async function accountApplicationPost({request,env}){
  let taxKey="",identityKey="";
  try{
    if(!env.DB) return notificationJson({success:false,error:"Account application database is not configured."},503);
    if(!env.NOTIFICATION_ATTACHMENTS) return notificationJson({success:false,error:"Secure application document storage is not configured."},503);
    const form=await request.formData();
    if(accountApplicationText(form.get("website"),100)) return notificationJson({success:true,application_number:"RECEIVED"});
    const type=accountApplicationText(form.get("application_type"),20).toLowerCase();
    if(!["business","personal"].includes(type)) return notificationJson({success:false,error:"Choose Business or Personal account."},400);
    const data={
      business_name:accountApplicationText(form.get("business_name"),120),dba_name:accountApplicationText(form.get("dba_name"),120),
      tax_id_last4:accountApplicationText(form.get("tax_id_last4"),4).replace(/\D/g,""),years_in_business:Number(form.get("years_in_business")||0),
      full_name:accountApplicationText(form.get("full_name"),120),job_title:accountApplicationText(form.get("job_title"),80),
      email:accountApplicationText(form.get("email"),160).toLowerCase(),phone:accountApplicationText(form.get("phone"),30),
      address_1:accountApplicationText(form.get("address_1"),160),city:accountApplicationText(form.get("city"),80),
      state:accountApplicationText(form.get("state"),2).toUpperCase(),zip_code:accountApplicationText(form.get("zip_code"),10),
      preferred_contact:accountApplicationText(form.get("preferred_contact"),10)==="email"?"email":"phone",notes:accountApplicationText(form.get("notes"),1500)
    };
    if(!data.full_name||!data.email||!data.phone||!data.address_1||!data.city||!data.state||!data.zip_code) return notificationJson({success:false,error:"Complete all required contact and address fields."},400);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return notificationJson({success:false,error:"Enter a valid email address."},400);
    if(String(form.get("certification")||"")!=="1") return notificationJson({success:false,error:"Certification is required."},400);
    if(String(form.get("sms_confirmation_consent")||"")!=="1") return notificationJson({success:false,error:"Consent is required to send the application confirmation text message."},400);
    if(type==="business"&&(!data.business_name||data.tax_id_last4.length!==4)) return notificationJson({success:false,error:"Enter the legal business name and the last four digits of its Tax ID."},400);
    const identityInfo=accountApplicationFileInfo(form.get("identity_document"));
    const taxInfo=type==="business"?accountApplicationFileInfo(form.get("tax_id_document")):null;
    const [identityBytes,taxBytes]=await Promise.all([accountApplicationVerifiedBytes(identityInfo),taxInfo?accountApplicationVerifiedBytes(taxInfo):Promise.resolve(null)]);
    await ensureAccountApplicationsTable(env);
    const date=new Date().toISOString().slice(0,10).replaceAll("-","");
    const applicationNumber=`WOA-${date}-${crypto.randomUUID().replaceAll("-","").slice(0,6).toUpperCase()}`;
    const folder=`account-applications/${applicationNumber}`;
    identityKey=`${folder}/identity-${crypto.randomUUID()}-${identityInfo.name}`;
    await env.NOTIFICATION_ATTACHMENTS.put(identityKey,identityBytes,{httpMetadata:{contentType:identityInfo.type,contentDisposition:`inline; filename="${identityInfo.name.replace(/"/g,"")}"`},customMetadata:{application_number:applicationNumber,document_kind:"identity"}});
    if(taxInfo){taxKey=`${folder}/tax-${crypto.randomUUID()}-${taxInfo.name}`;await env.NOTIFICATION_ATTACHMENTS.put(taxKey,taxBytes,{httpMetadata:{contentType:taxInfo.type,contentDisposition:`inline; filename="${taxInfo.name.replace(/"/g,"")}"`},customMetadata:{application_number:applicationNumber,document_kind:"tax_id"}});}
    const ipHash=await accountApplicationIpHash(request);
    await env.DB.prepare(`
      INSERT INTO account_applications
      (application_number,application_type,business_name,dba_name,tax_id_last4,years_in_business,full_name,job_title,email,phone,address_1,city,state,zip_code,preferred_contact,applicant_notes,tax_document_key,tax_document_name,tax_document_type,identity_document_key,identity_document_name,identity_document_type,sms_confirmation_consent,submitted_ip_hash)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(applicationNumber,type,type==="business"?data.business_name:null,type==="business"?data.dba_name:null,type==="business"?data.tax_id_last4:null,Number.isFinite(data.years_in_business)?Math.max(0,Math.round(data.years_in_business)):0,data.full_name,type==="business"?data.job_title:null,data.email,data.phone,data.address_1,data.city,data.state,data.zip_code,data.preferred_contact,data.notes,taxKey||null,taxInfo?.name||null,taxInfo?.type||null,identityKey,identityInfo.name,identityInfo.type,1,ipHash).run();
    const delivery=await accountApplicationSendNotifications({request,env,applicationNumber,type,data});
    const errors=[!delivery.support.sent?`Support email: ${delivery.support.error}`:"",!delivery.applicant.sent?`Applicant email: ${delivery.applicant.error}`:"",!delivery.sms.sent?`Confirmation SMS: ${delivery.sms.error}`:""].filter(Boolean).join(" | ").slice(0,2000);
    await env.DB.prepare(`UPDATE account_applications SET support_email_sent=?,support_email_id=?,applicant_email_sent=?,applicant_email_id=?,confirmation_sms_sent=?,confirmation_sms_sid=?,notification_error=?,notification_sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE application_number=?`).bind(delivery.support.sent?1:0,delivery.support.id||null,delivery.applicant.sent?1:0,delivery.applicant.id||null,delivery.sms.sent?1:0,delivery.sms.sid||null,errors||null,applicationNumber).run();
    return notificationJson({success:true,application_number:applicationNumber,confirmations:{support_email:delivery.support.sent,applicant_email:delivery.applicant.sent,sms:delivery.sms.sent}});
  }catch(error){
    console.error("accountApplicationPost failed",error);
    if(env?.NOTIFICATION_ATTACHMENTS){if(taxKey)try{await env.NOTIFICATION_ATTACHMENTS.delete(taxKey);}catch{}if(identityKey)try{await env.NOTIFICATION_ATTACHMENTS.delete(identityKey);}catch{}}
    return notificationJson({success:false,error:String(error?.message||"The application could not be submitted.")},500);
  }
}
__name(accountApplicationPost,"accountApplicationPost");

function accountApplicationAuthorized(request,env){return Boolean(env.ADMIN_IMPORT_KEY&&(request.headers.get("X-Admin-Key")||"")===env.ADMIN_IMPORT_KEY);}
async function adminAccountApplicationsGet({request,env}){
  try{
    if(!accountApplicationAuthorized(request,env)) return notificationJson({success:false,error:"Unauthorized."},401);
    await ensureRequestCenterSchema(env);const url=new URL(request.url);
    const page=Math.max(1,Number(url.searchParams.get("page")||1));const perPage=20;const offset=(page-1)*perPage;
    const search=accountApplicationText(url.searchParams.get("search"),100);const status=accountApplicationText(url.searchParams.get("status"),20).toLowerCase();const type=accountApplicationText(url.searchParams.get("type"),20).toLowerCase();
    const clauses=["1=1"],values=[];
    if(search){clauses.push("(application_number LIKE ? OR full_name LIKE ? OR business_name LIKE ? OR email LIKE ? OR phone LIKE ?)");const q=`%${search}%`;values.push(q,q,q,q,q);}
    if(["pending","accepted","denied"].includes(status)){clauses.push("status=?");values.push(status);}
    if(["business","personal"].includes(type)){clauses.push("application_type=?");values.push(type);}
    const where=clauses.join(" AND ");
    const totalRow=await env.DB.prepare(`SELECT COUNT(*) AS total FROM account_applications WHERE ${where}`).bind(...values).first();
    const rows=await env.DB.prepare(`SELECT id,application_number,application_type,business_name,dba_name,tax_id_last4,years_in_business,full_name,job_title,email,phone,address_1,city,state,zip_code,preferred_contact,applicant_notes,status,admin_notes,reviewed_by,reviewed_at,sms_confirmation_consent,support_email_sent,applicant_email_sent,confirmation_sms_sent,notification_error,notification_sent_at,created_at,updated_at,CASE WHEN tax_document_key IS NOT NULL THEN 1 ELSE 0 END AS has_tax_document,1 AS has_identity_document,tax_document_name,identity_document_name FROM account_applications WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...values,perPage,offset).all();
    const total=Number(totalRow?.total||0);return notificationJson({success:true,applications:rows?.results||[],page,per_page:perPage,total,total_pages:Math.max(1,Math.ceil(total/perPage))});
  }catch(error){console.error("adminAccountApplicationsGet failed",error);return notificationJson({success:false,error:"Account applications could not be loaded."},500);}
}
__name(adminAccountApplicationsGet,"adminAccountApplicationsGet");

async function adminAccountApplicationUpdate({request,env}){
  try{
    if(!accountApplicationAuthorized(request,env)) return notificationJson({success:false,error:"Unauthorized."},401);
    await ensureRequestCenterSchema(env);const body=await request.json();const id=Number(body.id);const status=accountApplicationText(body.status,20).toLowerCase();const notes=accountApplicationText(body.admin_notes,3000);
    if(!Number.isInteger(id)||id<=0||!["pending","accepted","denied"].includes(status)) return notificationJson({success:false,error:"Choose Pending, Accepted, or Denied."},400);
    const existing=await env.DB.prepare(`SELECT application_number,status,full_name,email,phone FROM account_applications WHERE id=? LIMIT 1`).bind(id).first();if(!existing)return notificationJson({success:false,error:"Application not found."},404);const actor=adminRequestActor(request,env);
    const result=await env.DB.prepare(`UPDATE account_applications SET status=?,admin_notes=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,notes,actor.name,id).run();
    if(!Number(result?.meta?.changes||0)) return notificationJson({success:false,error:"Application not found."},404);
    await adminAudit(env,request,"application_reviewed","account_application",String(existing.application_number||id),`${existing.status} → ${status}`);
    const word=status[0].toUpperCase()+status.slice(1);const message=`Account Application ${existing.application_number} status: ${word}.${notes?`\n\nWooten Oil response: ${notes}`:''}`;
    let account=null;if(body.portal){account=await env.DB.prepare(`SELECT account_number,account_name,email,phone FROM customers WHERE lower(email)=lower(?) OR phone=? ORDER BY id LIMIT 1`).bind(String(existing.email||''),String(existing.phone||'')).first();}
    const delivery=await requestDecisionNotify({request,env,accountNumber:account?.account_number||'',email:existing.email,phone:existing.phone,name:existing.full_name,title:`Wooten Oil Account Application — ${word}`,message,portal:!!body.portal&&!!account,emailSend:!!body.email,smsSend:!!body.sms});
    return notificationJson({success:true,delivery,portal_available:!!account});
  }catch(error){console.error("adminAccountApplicationUpdate failed",error);return notificationJson({success:false,error:"The application review could not be saved."},500);}
}
__name(adminAccountApplicationUpdate,"adminAccountApplicationUpdate");

async function adminAccountApplicationDelete({request,env}){
  try{
    if(!accountApplicationAuthorized(request,env))return notificationJson({success:false,error:"Unauthorized."},401);
    const actor=adminRequestActor(request,env);
    if(!actor.owner){await adminAudit(env,request,"application_delete_denied","account_application","","Regular admin user attempted a Main Admin-only deletion");return notificationJson({success:false,error:"Only the Main Admin can permanently delete account applications."},403);}
    if(!env.DB)return notificationJson({success:false,error:"Account application database is not configured."},503);
    await ensureAccountApplicationsTable(env);
    const match=new URL(request.url).pathname.match(/^\/api\/admin\/account-applications\/(\d+)$/);
    const id=Number(match?.[1]||0);
    if(!Number.isInteger(id)||id<=0)return notificationJson({success:false,error:"Choose a valid account application."},400);
    const application=await env.DB.prepare(`SELECT id,application_number,application_type,business_name,full_name,tax_document_key,identity_document_key FROM account_applications WHERE id=? LIMIT 1`).bind(id).first();
    if(!application)return notificationJson({success:false,error:"Application not found."},404);
    let objectKeys=[application.tax_document_key,application.identity_document_key].map(value=>String(value||"").trim()).filter(Boolean);
    if(objectKeys.length&&!env.NOTIFICATION_ATTACHMENTS)return notificationJson({success:false,error:"Secure document storage is unavailable. The application was not deleted because its uploaded files could not be safely removed."},503);
    if(objectKeys.length){
      try{
        const stored=await env.NOTIFICATION_ATTACHMENTS.list({prefix:`account-applications/${application.application_number}/`});
        objectKeys=[...new Set([...objectKeys,...(stored?.objects||[]).map(object=>String(object.key||"")).filter(Boolean)])];
        await env.NOTIFICATION_ATTACHMENTS.delete(objectKeys);
      }
      catch(error){console.error("Account application files could not be deleted",error);return notificationJson({success:false,error:"The uploaded application files could not be deleted. The application record was kept for safety."},500);}
    }
    const result=await env.DB.prepare(`DELETE FROM account_applications WHERE id=?`).bind(id).run();
    if(!Number(result?.meta?.changes||0))return notificationJson({success:false,error:"Application not found."},404);
    const applicant=String(application.business_name||application.full_name||"Applicant");
    await adminAudit(env,request,"application_deleted","account_application",String(application.application_number||id),`${applicant}; ${objectKeys.length} uploaded file(s) permanently deleted`);
    return notificationJson({success:true,application_number:application.application_number,files_deleted:objectKeys.length});
  }catch(error){console.error("adminAccountApplicationDelete failed",error);return notificationJson({success:false,error:"The application could not be deleted."},500);}
}
__name(adminAccountApplicationDelete,"adminAccountApplicationDelete");

async function adminAccountApplicationFileGet({request,env}){
  try{
    if(!accountApplicationAuthorized(request,env)) return new Response("Unauthorized.",{status:401});
    if(!env.NOTIFICATION_ATTACHMENTS) return new Response("Secure document storage is not configured.",{status:503});
    await ensureAccountApplicationsTable(env);const url=new URL(request.url);const match=url.pathname.match(/^\/api\/admin\/account-applications\/(\d+)\/(tax|identity)$/);if(!match)return new Response("Document not found.",{status:404});
    const id=Number(match[1]),kind=match[2];const keyColumn=kind==="tax"?"tax_document_key":"identity_document_key";const nameColumn=kind==="tax"?"tax_document_name":"identity_document_name";const typeColumn=kind==="tax"?"tax_document_type":"identity_document_type";
    const row=await env.DB.prepare(`SELECT ${keyColumn} AS object_key,${nameColumn} AS filename,${typeColumn} AS content_type FROM account_applications WHERE id=? LIMIT 1`).bind(id).first();
    if(!row?.object_key)return new Response("Document not found.",{status:404});const object=await env.NOTIFICATION_ATTACHMENTS.get(row.object_key);if(!object)return new Response("Document file is unavailable.",{status:404});
    const filename=notificationSafeFilename(row.filename||"document");const headers=new Headers();object.writeHttpMetadata(headers);headers.set("Content-Type",row.content_type||"application/octet-stream");headers.set("Content-Disposition",`inline; filename="${filename.replace(/"/g,"")}"; filename*=UTF-8''${encodeURIComponent(filename)}`);headers.set("Cache-Control","private, no-store");headers.set("X-Content-Type-Options","nosniff");return new Response(object.body,{status:200,headers});
  }catch(error){console.error("adminAccountApplicationFileGet failed",error);return new Response("Document could not be opened.",{status:500});}
}
__name(adminAccountApplicationFileGet,"adminAccountApplicationFileGet");


async function ensureRequestCenterSchema(env){
  if(!env?.DB) throw new Error("Customer database is not configured.");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS profile_change_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_number TEXT NOT NULL UNIQUE,
    account_number TEXT NOT NULL,
    account_name TEXT,
    change_type TEXT NOT NULL,
    current_value TEXT,
    requested_value TEXT NOT NULL,
    customer_note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_response TEXT,
    decided_by TEXT,
    decided_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_profile_change_account_created ON profile_change_requests(account_number,created_at DESC)`).run();
  const fuelInfo=await env.DB.prepare(`PRAGMA table_info(fuel_requests)`).all();
  const fuelCols=new Set((fuelInfo?.results||[]).map(r=>String(r.name||'').toLowerCase()));
  for(const [name,def] of [['decision_status',"TEXT NOT NULL DEFAULT 'pending'"],['decision_note','TEXT'],['decision_by','TEXT'],['decision_at','TEXT']]) if(!fuelCols.has(name)) await env.DB.prepare(`ALTER TABLE fuel_requests ADD COLUMN ${name} ${def}`).run();
  await ensureAccountApplicationsTable(env);
  await env.DB.prepare(`UPDATE account_applications SET status='pending' WHERE status IN ('new','under_review')`).run();
  await env.DB.prepare(`UPDATE account_applications SET status='accepted' WHERE status='approved'`).run();
  await env.DB.prepare(`UPDATE account_applications SET status='denied' WHERE status='declined'`).run();
}
__name(ensureRequestCenterSchema,'ensureRequestCenterSchema');

async function requestCenterCustomerByAccount(env,account){
  if(!account)return null;
  return await env.DB.prepare(`SELECT account_number,account_name,email,phone FROM customers WHERE account_number=? LIMIT 1`).bind(String(account)).first();
}
__name(requestCenterCustomerByAccount,'requestCenterCustomerByAccount');

async function requestDecisionNotify({request,env,accountNumber,email,phone,name,title,message,portal,emailSend,smsSend}){
  const result={portal:{sent:false},email:{sent:false},sms:{sent:false}};
  if(portal&&accountNumber){
    try{await ensureCustomerNotificationsTable(env);const r=await env.DB.prepare(`INSERT INTO portal_notifications (account_number,title,message,email_sent,action_type,created_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(String(accountNumber),title,message,0,'request_status').run();result.portal={sent:true,id:Number(r?.meta?.last_row_id||0)};}catch(e){result.portal={sent:false,error:String(e?.message||e)}}
  }
  if(emailSend){
    if(!email)result.email={sent:false,error:'No email address is available.'};
    else result.email=await accountApplicationSendEmail(env,{to:String(email),subject:title,html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.6"><h2>Wooten Oil</h2><p>Hello ${notificationEscapeHtml(name||'Customer')},</p><p style="white-space:pre-wrap">${notificationEscapeHtml(message)}</p><p>Wooten Oil Co. Inc.<br>support@wootenoil.com</p></div>`,text:`Hello ${name||'Customer'},\n\n${message}\n\nWooten Oil Co. Inc.`});
  }
  if(smsSend){
    if(!phone)result.sms={sent:false,error:'No phone number is available.'};
    else{try{const sent=await twilioSendSms(env,String(phone),`WOOTEN OIL CO INC\n${message}\nPlease do not reply.`,{statusCallbackUrl:twilioCallbackUrl(request,'/api/twilio/message-status')});result.sms={sent:true,sid:String(sent?.sid||'')};}catch(e){result.sms={sent:false,error:String(e?.message||e)}}}
  }
  return result;
}
__name(requestDecisionNotify,'requestDecisionNotify');

async function customerProfileChangeRequests({request,env}){
  try{
    await ensureRequestCenterSchema(env);const customer=await getCustomerFromSession(request,env);if(!customer)return notificationJson({success:false,error:'Please sign in first.'},401);
    if(request.method==='GET'){
      const rows=await env.DB.prepare(`SELECT id,request_number,change_type,current_value,requested_value,customer_note,status,admin_response,decided_at,created_at FROM profile_change_requests WHERE account_number=? ORDER BY created_at DESC,id DESC LIMIT 25`).bind(String(customer.account_number)).all();
      return notificationJson({success:true,requests:rows?.results||[]});
    }
    const body=await request.json();const note=String(body.note||'').trim().slice(0,1500);
    const allowed={address:'Address',phone:'Phone Number',email:'Email Address',contact:'Contact Name',other:'Other'};
    const incoming=Array.isArray(body.changes)?body.changes:[{change_type:body.change_type,requested_value:body.requested_value}];
    const changes=incoming.slice(0,5).map(x=>({type:String(x?.change_type||'').trim().toLowerCase(),requested:String(x?.requested_value||'').trim().slice(0,500)})).filter(x=>x.type||x.requested);
    if(!changes.length||changes.some(x=>!allowed[x.type]||!x.requested))return notificationJson({success:false,error:'Choose what you want changed and enter the requested new value for every change.'},400);
    if(new Set(changes.map(x=>x.type)).size!==changes.length)return notificationJson({success:false,error:'Choose each type of profile change only once.'},400);
    const currentFor=type=>{if(type==='address')return [customer.address_1,customer.address_2,customer.city,customer.state,customer.zip_code].filter(Boolean).join(', ');if(type==='phone')return customer.phone||'';if(type==='email')return customer.email||'';if(type==='contact')return customer.contact_name||'';return ''};
    const normalized=changes.map((x,i)=>({...x,label:allowed[x.type],current:currentFor(x.type),number:i+1}));
    const type=normalized.length===1?normalized[0].type:'multiple_changes';
    const current=normalized.length===1?normalized[0].current:normalized.map(x=>`${x.number}. ${x.label}: ${x.current||'—'}`).join('\n');
    const requested=normalized.length===1?normalized[0].requested:normalized.map(x=>`${x.number}. ${x.label}: ${x.requested}`).join('\n');
    const rn=`PCR-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomUUID().replaceAll('-','').slice(0,6).toUpperCase()}`;
    await env.DB.prepare(`INSERT INTO profile_change_requests (request_number,account_number,account_name,change_type,current_value,requested_value,customer_note) VALUES (?,?,?,?,?,?,?)`).bind(rn,String(customer.account_number),String(customer.account_name||''),type,current,requested,note).run();
    const changeText=normalized.map(x=>`${x.number}. ${x.label}\n   Current: ${x.current||'—'}\n   Requested: ${x.requested}`).join('\n\n');
    const supportText=`Profile change request ${rn}\nCustomer #${customer.account_number} — ${customer.account_name||'Customer'}\n\n${changeText}\n\nNote: ${note||'—'}`;
    const applicationsFrom=String(env.APPLICATIONS_FROM_EMAIL||'Wooten Oil Applications <applications@wootenoil.com>').trim();
    await accountApplicationSendEmail(env,{from:applicationsFrom,to:'support@wootenoil.com',subject:`Profile Change Request — ${rn}`,html:`<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${notificationEscapeHtml(supportText)}</pre>`,text:supportText}).catch(()=>{});
    return notificationJson({success:true,request_number:rn,change_count:normalized.length,message:'Your profile change request was submitted to Wooten Oil.'});
  }catch(e){console.error('customerProfileChangeRequests',e);return notificationJson({success:false,error:'Profile change request could not be processed.'},500)}
}
__name(customerProfileChangeRequests,'customerProfileChangeRequests');

async function adminRequestCenterGet({request,env}){
  try{await ensureRequestCenterSchema(env);const u=new URL(request.url),type=String(u.searchParams.get('type')||'profile'),status=String(u.searchParams.get('status')||''),q=String(u.searchParams.get('q')||'').trim().toLowerCase(),page=Math.max(1,Number(u.searchParams.get('page')||1)),per=20,off=(page-1)*per;let rows=[],total=0;
    if(type==='fuel'){
      let where='1=1',vals=[];if(status){where+=' AND COALESCE(decision_status,\'pending\')=?';vals.push(status)}if(q){where+=' AND lower(COALESCE(request_number,\'\')||\' \'||COALESCE(customer_name,\'\')||\' \'||COALESCE(email,\'\')||\' \'||COALESCE(phone,\'\')) LIKE ?';vals.push('%'+q+'%')}
      total=Number((await env.DB.prepare(`SELECT COUNT(*) total FROM fuel_requests WHERE ${where}`).bind(...vals).first())?.total||0);const r=await env.DB.prepare(`SELECT rowid id,request_number,customer_account_number account_number,customer_name account_name,email,phone,fuel_type,gallons,delivery_date,delivery_address,notes,COALESCE(decision_status,'pending') status,decision_note admin_response,decision_by decided_by,decision_at decided_at,received_at created_at FROM fuel_requests WHERE ${where} ORDER BY datetime(received_at) DESC,rowid DESC LIMIT ? OFFSET ?`).bind(...vals,per,off).all();rows=r?.results||[];
    }else{
      let where='1=1',vals=[];if(status){where+=' AND status=?';vals.push(status)}if(q){where+=' AND lower(request_number||\' \'||account_number||\' \'||COALESCE(account_name,\'\')||\' \'||requested_value) LIKE ?';vals.push('%'+q+'%')}
      total=Number((await env.DB.prepare(`SELECT COUNT(*) total FROM profile_change_requests WHERE ${where}`).bind(...vals).first())?.total||0);const r=await env.DB.prepare(`SELECT id,request_number,account_number,account_name,change_type,current_value,requested_value,customer_note,status,admin_response,decided_by,decided_at,created_at FROM profile_change_requests WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...vals,per,off).all();rows=r?.results||[];for(const row of rows){const c=await requestCenterCustomerByAccount(env,row.account_number);row.email=c?.email||'';row.phone=c?.phone||'';}
    }
    return notificationJson({success:true,type,requests:rows,page,total,total_pages:Math.max(1,Math.ceil(total/per))});
  }catch(e){console.error('adminRequestCenterGet',e);return notificationJson({success:false,error:'Customer requests could not be loaded.'},500)}
}
__name(adminRequestCenterGet,'adminRequestCenterGet');

async function adminRequestCenterDecision({request,env}){
  try{await ensureRequestCenterSchema(env);const b=await request.json(),type=String(b.type||''),id=String(b.id||''),status=String(b.status||'').toLowerCase(),note=String(b.admin_response||'').trim().slice(0,2000);if(!['pending','accepted','denied'].includes(status))return notificationJson({success:false,error:'Choose Pending, Accepted, or Denied.'},400);const actor=adminRequestActor(request,env);let item=null;
    if(type==='fuel'){item=await env.DB.prepare(`SELECT rowid id,request_number,customer_account_number account_number,customer_name account_name,email,phone FROM fuel_requests WHERE rowid=? LIMIT 1`).bind(Number(id)).first();if(!item)return notificationJson({success:false,error:'Fuel request not found.'},404);await env.DB.prepare(`UPDATE fuel_requests SET decision_status=?,decision_note=?,decision_by=?,decision_at=CURRENT_TIMESTAMP WHERE rowid=?`).bind(status,note,actor.name,Number(id)).run();}
    else if(type==='profile'){item=await env.DB.prepare(`SELECT id,request_number,account_number,account_name FROM profile_change_requests WHERE id=? LIMIT 1`).bind(Number(id)).first();if(!item)return notificationJson({success:false,error:'Profile change request not found.'},404);const c=await requestCenterCustomerByAccount(env,item.account_number);item={...item,email:c?.email||'',phone:c?.phone||''};await env.DB.prepare(`UPDATE profile_change_requests SET status=?,admin_response=?,decided_by=?,decided_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,note,actor.name,Number(id)).run();}
    else return notificationJson({success:false,error:'Unknown request type.'},400);
    const word=status[0].toUpperCase()+status.slice(1),kind=type==='fuel'?'Fuel Request':'Profile Change Request',message=`${kind} ${item.request_number} status: ${word}.${note?`\n\nWooten Oil response: ${note}`:''}`;
    const delivery=await requestDecisionNotify({request,env,accountNumber:item.account_number,email:item.email,phone:item.phone,name:item.account_name,title:`Wooten Oil ${kind} — ${word}`,message,portal:!!b.portal,emailSend:!!b.email,smsSend:!!b.sms});
    await adminAudit(env,request,`${type}_request_decision`,`${type}_request`,String(item.request_number),`${status}; portal=${!!b.portal}; email=${!!b.email}; sms=${!!b.sms}`);
    return notificationJson({success:true,status,delivery});
  }catch(e){console.error('adminRequestCenterDecision',e);return notificationJson({success:false,error:'The request decision could not be saved.'},500)}
}
__name(adminRequestCenterDecision,'adminRequestCenterDecision');


async function adminNotificationBellGet({request,env}){
  try{
    await ensureRequestCenterSchema(env);
    const profileCount=Number((await env.DB.prepare(`SELECT COUNT(*) AS total FROM profile_change_requests WHERE COALESCE(status,'pending')='pending'`).first())?.total||0);
    const fuelCount=Number((await env.DB.prepare(`SELECT COUNT(*) AS total FROM fuel_requests WHERE COALESCE(decision_status,'pending')='pending'`).first())?.total||0);
    const applicationCount=Number((await env.DB.prepare(`SELECT COUNT(*) AS total FROM account_applications WHERE COALESCE(status,'pending')='pending'`).first())?.total||0);
    const profileRows=(await env.DB.prepare(`SELECT 'profile' AS item_type,id,request_number,account_name AS name,account_number AS account,created_at FROM profile_change_requests WHERE COALESCE(status,'pending')='pending' ORDER BY datetime(created_at) DESC,id DESC LIMIT 8`).all())?.results||[];
    const fuelRows=(await env.DB.prepare(`SELECT 'fuel' AS item_type,rowid AS id,request_number,customer_name AS name,customer_account_number AS account,received_at AS created_at FROM fuel_requests WHERE COALESCE(decision_status,'pending')='pending' ORDER BY datetime(received_at) DESC,rowid DESC LIMIT 8`).all())?.results||[];
    const appRows=(await env.DB.prepare(`SELECT 'application' AS item_type,id,application_number AS request_number,COALESCE(NULLIF(business_name,''),full_name) AS name,'' AS account,created_at FROM account_applications WHERE COALESCE(status,'pending')='pending' ORDER BY datetime(created_at) DESC,id DESC LIMIT 8`).all())?.results||[];
    const items=[...profileRows,...fuelRows,...appRows].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,10);
    return notificationJson({success:true,total:profileCount+fuelCount+applicationCount,counts:{profile:profileCount,fuel:fuelCount,applications:applicationCount},items});
  }catch(error){
    console.error('adminNotificationBellGet',error);
    return notificationJson({success:false,error:'Admin notifications could not be loaded.'},500);
  }
}
__name(adminNotificationBellGet,'adminNotificationBellGet');

var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if(url.pathname==="/api/admin/auth/login"){
      if(request.method==="POST")return adminAuthLogin({request,env});
      return methodNotAllowed();
    }
    if(url.pathname==="/api/admin/auth/me"){
      if(request.method==="GET")return adminAuthMe({request,env});
      return methodNotAllowed();
    }
    if(url.pathname==="/api/admin/auth/logout"){
      if(request.method==="POST")return adminAuthLogout({request,env});
      return methodNotAllowed();
    }
    if(url.pathname==="/api/customer/profile-change-requests"){
      if(request.method==="GET"||request.method==="POST")return customerProfileChangeRequests({request,env});
      return methodNotAllowed();
    }
    if(url.pathname.startsWith("/api/admin/")){
      const authorization=await adminAuthorizeRequest(request,env,url.pathname);
      if(authorization.response)return authorization.response;
      request=authorization.request;
      ctx.waitUntil(recordGeneralAdminActivity(env,request));
    }
    if(url.pathname==="/api/admin/users"){
      if(request.method==="GET"||request.method==="POST")return adminUsersApi({request,env});
      return methodNotAllowed();
    }
    if(url.pathname==="/api/admin/audit"){
      if(request.method==="GET")return adminAuditGet({request,env});
      return methodNotAllowed();
    }
    if(url.pathname==="/api/admin/request-center"){
      if(request.method==="GET")return adminRequestCenterGet({request,env});
      if(request.method==="POST")return adminRequestCenterDecision({request,env});
      return methodNotAllowed();
    }
    if(url.pathname==="/api/admin/notification-bell"){
      if(request.method==="GET")return adminNotificationBellGet({request,env});
      return methodNotAllowed();
    }
    if(url.pathname==="/api/admin/customer-activity"){
      if(request.method==="GET")return adminCustomerActivityGet({request,env});
      return methodNotAllowed();
    }
    if(/^\/api\/admin\/customer-activity\/documents\/\d+\/file$/.test(url.pathname)){
      if(request.method==="GET")return adminCustomerDocumentFileGet({request,env});
      return methodNotAllowed();
    }
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
    if (url.pathname === "/api/account-applications") {
      if (request.method === "POST") return accountApplicationPost({ request, env });
      return methodNotAllowed();
    }
    if (url.pathname === "/api/admin/account-applications") {
      if (request.method === "GET") return adminAccountApplicationsGet({ request, env });
      if (request.method === "POST") return adminAccountApplicationUpdate({ request, env });
      return methodNotAllowed();
    }
    if (/^\/api\/admin\/account-applications\/\d+$/.test(url.pathname)) {
      if (request.method === "DELETE") return adminAccountApplicationDelete({ request, env });
      return methodNotAllowed();
    }
    if (/^\/api\/admin\/account-applications\/\d+\/(tax|identity)$/.test(url.pathname)) {
      if (request.method === "GET") return adminAccountApplicationFileGet({ request, env });
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
    if (url.pathname === "/api/admin/import-control/cancel") {
      if (request.method === "POST") {
        return adminImportCancelPost({request,env});
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

    if (url.pathname === "/api/admin/communication-log/resend") {
      if (request.method === "POST") return adminCommunicationLogResend({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/twilio/message-status") {
      if (request.method === "POST") return twilioMessageStatusPost({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/twilio/incoming-message") {
      if (request.method === "POST") return twilioIncomingMessagePost({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/statements/generate") {
      if (request.method === "POST") return adminGenerateStatementsPost({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/statement-scheduling") {
      if (request.method === "GET" || request.method === "POST") return adminStatementScheduling({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/statement-scheduling/preview") {
      if (request.method === "GET") return adminStatementSchedulingPreview({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/statement-scheduling/run") {
      if (request.method === "POST") return adminStatementSchedulingRun({ request, env, ctx });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/statement-scheduling/test-all") {
      if (request.method === "POST") return adminStatementSchedulingTestAll({ request, env, ctx });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/statement-scheduling/combined-pdf") {
      if (request.method === "GET") return adminStatementSchedulingCombinedPdf({ request, env, ctx });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/statement-scheduling/pdf-cleanup") {
      if (request.method === "GET" || request.method === "POST") return adminStatementSchedulingPdfCleanup({ request, env });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/statement-scheduling/continue") {
      if (request.method === "POST") return adminStatementSchedulingContinue({ request, env, ctx });
      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/customer-statement-cycle") {
      if (request.method === "POST") return adminCustomerStatementCycle({ request, env });
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

    if (url.pathname === "/api/admin/twilio/balance") {
      if (request.method === "GET") return adminTwilioBalanceGet({ request, env });
      return methodNotAllowed();
    }
    if (url.pathname === "/api/admin/twilio/status") {
      if (request.method === "GET") return adminTwilioStatusGet({ request, env });
      return methodNotAllowed();
    }
    if (url.pathname === "/api/admin/twilio/phone-tools") {
      if (request.method === "GET") return adminTwilioPhoneToolsGet({ request, env });
      return methodNotAllowed();
    }
    if (url.pathname === "/api/admin/twilio/phone-tools/results") {
      if (request.method === "GET") return adminTwilioPhoneResultsGet({ request, env });
      return methodNotAllowed();
    }
    if (url.pathname === "/api/admin/twilio/phone-tools/settings") {
      if (request.method === "POST") return adminTwilioPhoneSettingsPost({ request, env });
      return methodNotAllowed();
    }
    if (url.pathname === "/api/admin/twilio/phone-tools/apply-area-code") {
      if (request.method === "POST") return adminTwilioApplyAreaCodePost({ request, env });
      return methodNotAllowed();
    }
    if (url.pathname === "/api/admin/twilio/phone-tools/lookup-batch") {
      if (request.method === "POST") return adminTwilioLookupBatchPost({ request, env });
      return methodNotAllowed();
    }
    if (url.pathname === "/api/admin/twilio/phone-tools/verify-sms") {
      if (request.method === "POST") return adminTwilioVerifySmsPost({ request, env });
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

    if (url.pathname.startsWith("/s/")) {
      if (request.method === "GET") return portalShortStatementLinkGet({ request, env });
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
    if (url.pathname === "/api/customer/accounts") {
      if (request.method === "GET") return customerAccountsGet({request,env});
      return methodNotAllowed();
    }
    if (url.pathname === "/api/customer/account-switch") {
      if (request.method === "POST") return customerAccountSwitchPost({request,env});
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
    if (url.pathname === "/api/customer/change-password") {
      if (request.method === "POST") return customerChangePassword({ request, env });
      return methodNotAllowed();
    }
    if (url.pathname === "/api/customer/change-shared-email-password") {
      if (request.method === "POST") return customerChangeSharedEmailPassword({ request, env });
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
    ctx.waitUntil(processDueStatementSchedules(env));
  }

};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
