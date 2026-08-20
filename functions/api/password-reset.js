const CODE_MINUTES = 15;
const PASSWORD_ITERATIONS = 210000;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

function clean(v) { return String(v ?? "").trim(); }
function normalizeAccount(v) {
  let s = clean(v);
  if (/^\d+(\.0+)?$/.test(s)) s = String(parseInt(s, 10));
  s = s.replace(/\D/g, "");
  return s ? s.padStart(7, "0") : "";
}
function bytesToHex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}
function randomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1000000).padStart(6, "0");
}
async function codeHash(customerId, code) { return sha256(`${customerId}:${clean(code)}`); }
function maskEmail(email) {
  const value = clean(email); const parts = value.split("@");
  if (parts.length !== 2) return "";
  const name = parts[0], domain = parts[1];
  return `${name.slice(0, Math.min(2, name.length)) || "*"}***@${domain}`;
}
function maskPhone(phone) {
  const digits = clean(phone).replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `(***) ***-${digits.slice(-4)}`;
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
async function createPasswordHash(password) {
  const salt = new Uint8Array(16); crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt, iterations:PASSWORD_ITERATIONS}, key, 256);
  return ["pbkdf2", PASSWORD_ITERATIONS, bytesToHex(salt), bytesToHex(new Uint8Array(derived))].join("$");
}

async function findCustomer(env, identifier) {
  const raw = clean(identifier);
  if (!raw) return null;
  if (raw.includes("@")) {
    return env.DB.prepare(`SELECT id,account_number,account_name,email,phone,password_hash,account_status FROM customers WHERE lower(email)=lower(?) LIMIT 1`).bind(raw).first();
  }
  const account = normalizeAccount(raw);
  if (!account) return null;
  return env.DB.prepare(`SELECT id,account_number,account_name,email,phone,password_hash,account_status FROM customers WHERE account_number=? LIMIT 1`).bind(account).first();
}

async function storeResetCode(env, customerId, code) {
  const hash = await codeHash(customerId, code);
  const expires = new Date(Date.now() + CODE_MINUTES * 60 * 1000).toISOString();
  await env.DB.prepare(`UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE customer_id=? AND used_at IS NULL`).bind(customerId).run();
  await env.DB.prepare(`INSERT INTO password_reset_tokens (customer_id,token_hash,expires_at,created_at) VALUES (?,?,?,CURRENT_TIMESTAMP)`).bind(customerId, hash, expires).run();
  return expires;
}

async function sendResetEmail(env, customer, code) {
  if (!env.RESEND_API_KEY) throw new Error("Email service is not configured.");
  const fromAddress = clean(env.FUEL_FROM_EMAIL) || "support@wootenoil.com";
  const response = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers:{"Authorization":`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json","User-Agent":"WootenOilCustomerPortal/1.0"},
    body:JSON.stringify({
      from:`Wooten Oil <${fromAddress}>`,
      to:[customer.email],
      subject:"Wooten Oil Password Reset Code",
      html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033;line-height:1.6"><h2 style="color:#0b2239">Wooten Oil</h2><p>Hello ${escapeHtml(customer.account_name)},</p><p>Use this verification code to reset the password for customer account <strong>${escapeHtml(customer.account_number)}</strong>:</p><div style="font-size:32px;font-weight:800;letter-spacing:7px;background:#f3f6f9;border-radius:12px;padding:18px;text-align:center">${code}</div><p>This code expires in ${CODE_MINUTES} minutes. If you did not request a password reset, you can ignore this email.</p></div>`
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { console.error("Resend password reset error", data); throw new Error("Password reset email could not be sent."); }
}

async function sendResetSms(env, customer, code) {
  const sid = clean(env.TWILIO_ACCOUNT_SID), token = clean(env.TWILIO_AUTH_TOKEN), from = clean(env.TWILIO_FROM_NUMBER);
  if (!sid || !token || !from) throw new Error("SMS service is not configured.");
  let to = clean(customer.phone).replace(/\D/g, "");
  if (to.length === 10) to = `+1${to}`; else if (!to.startsWith("+")) to = `+${to}`;
  const body = new URLSearchParams({To:to, From:from, Body:`Wooten Oil password reset code: ${code}. It expires in ${CODE_MINUTES} minutes.`});
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method:"POST",
    headers:{"Authorization":`Basic ${btoa(`${sid}:${token}`)}`,"Content-Type":"application/x-www-form-urlencoded"},
    body:body.toString()
  });
  if (!response.ok) { console.error("Twilio reset SMS error", await response.text().catch(()=>"")); throw new Error("Password reset text could not be sent."); }
}

export async function customerPasswordResetStart({request, env}) {
  if (!env.DB) return json({success:false,error:"Customer database is not configured."},503);
  let body; try { body = await request.json(); } catch { return json({success:false,error:"Invalid password reset request."},400); }
  const identifier = clean(body?.identifier || body?.user || body?.account_number || body?.email);
  if (!identifier) return json({success:false,error:"Enter the email address or Customer Number on the account."},400);
  const customer = await findCustomer(env, identifier);
  if (!customer) return json({success:false,error:"We could not locate an account with that email or Customer Number."},404);
  if (clean(customer.account_status).toLowerCase() && clean(customer.account_status).toLowerCase() !== "active") return json({success:false,error:"This account is not active. Please contact Wooten Oil."},403);
  if (!clean(customer.password_hash)) return json({success:false,setup_required:true,account_number:customer.account_number,error:"This online account has not been activated yet. Please use First time here? Activate Online Account."},409);

  const recent = await env.DB.prepare(`SELECT id FROM password_reset_tokens WHERE customer_id=? AND used_at IS NULL AND created_at > datetime('now','-60 seconds') LIMIT 1`).bind(customer.id).first();
  if (recent) return json({success:false,wait:true,error:"A reset code was already requested recently. Please wait about one minute before trying again."},429);

  const code = randomCode();
  if (clean(customer.email)) {
    await storeResetCode(env, customer.id, code);
    try { await sendResetEmail(env, customer, code); }
    catch (e) { console.error(e); return json({success:false,error:"We could not send the password reset email. Please contact Wooten Oil."},503); }
    return json({success:true,method:"email",account_number:customer.account_number,destination:maskEmail(customer.email),message:"A 6-digit password reset code was sent to the email address on your account."});
  }

  if (clean(customer.phone)) {
    if (clean(env.TWILIO_ACCOUNT_SID) && clean(env.TWILIO_AUTH_TOKEN) && clean(env.TWILIO_FROM_NUMBER)) {
      await storeResetCode(env, customer.id, code);
      try { await sendResetSms(env, customer, code); }
      catch (e) { console.error(e); return json({success:false,error:"We could not send the password reset text. Please contact Wooten Oil."},503); }
      return json({success:true,method:"sms",account_number:customer.account_number,destination:maskPhone(customer.phone),message:"A 6-digit password reset code was sent by text message to the phone number on your account."});
    }
    return json({success:true,method:"office",account_number:customer.account_number,phone:maskPhone(customer.phone),message:"A phone number is on this account, but text-message password recovery is not enabled yet. Please contact Wooten Oil for password assistance."});
  }

  return json({success:true,method:"office",account_number:customer.account_number,message:"There is no email address or mobile number available for automatic recovery. Please contact Wooten Oil for password assistance."});
}

export async function customerPasswordResetComplete({request, env}) {
  if (!env.DB) return json({success:false,error:"Customer database is not configured."},503);
  let body; try { body = await request.json(); } catch { return json({success:false,error:"Invalid password reset request."},400); }
  const identifier = clean(body?.identifier || body?.account_number || body?.email);
  const code = clean(body?.code);
  const password = String(body?.password ?? "");
  const confirm = String(body?.confirm_password ?? body?.confirmPassword ?? "");
  if (!identifier || !/^\d{6}$/.test(code) || !password) return json({success:false,error:"Enter your Customer Number or email, the 6-digit code, and a new password."},400);
  if (confirm && password !== confirm) return json({success:false,error:"The passwords do not match."},400);
  if (password.length < 10) return json({success:false,error:"Your password must be at least 10 characters."},400);
  if (password.length > 128) return json({success:false,error:"Your password is too long."},400);
  const customer = await findCustomer(env, identifier);
  if (!customer) return json({success:false,error:"The verification code is incorrect or has expired."},400);
  const hash = await codeHash(customer.id, code);
  const now = new Date().toISOString();
  const token = await env.DB.prepare(`SELECT id FROM password_reset_tokens WHERE customer_id=? AND token_hash=? AND used_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1`).bind(customer.id, hash, now).first();
  if (!token) return json({success:false,error:"The verification code is incorrect or has expired."},400);
  const passwordHash = await createPasswordHash(password);
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE customers SET password_hash=?,must_change_password=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(passwordHash, customer.id),
      env.DB.prepare(`UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?`).bind(token.id),
      env.DB.prepare(`DELETE FROM customer_sessions WHERE customer_id=?`).bind(customer.id)
    ]);
  } catch (e) { console.error("Password reset failed", e); return json({success:false,error:"We could not reset the password. Please try again or contact Wooten Oil."},500); }
  return json({success:true,account_number:customer.account_number,message:"Your password has been reset. You can now sign in with your new password."});
}
