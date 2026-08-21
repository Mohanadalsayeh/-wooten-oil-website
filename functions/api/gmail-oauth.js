const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

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

function requiredEnv(env, name) {
  const value = String(env?.[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function constantTimeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function signState(payload, secret) {
  const enc = new TextEncoder();
  const payloadPart = bytesToBase64Url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadPart));
  return `${payloadPart}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

async function verifyState(state, secret) {
  const [payloadPart, sigPart] = String(state || "").split(".");
  if (!payloadPart || !sigPart) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["verify"]
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

function callbackUrl(request) {
  return `${new URL(request.url).origin}/api/gmail/oauth/callback`;
}

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

async function fetchGoogleEmail(accessToken) {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) return "";
  const d = await r.json();
  return String(d?.emailAddress || "");
}

export async function gmailOAuthStart({ request, env }) {
  try {
    const url = new URL(request.url);
    const suppliedKey = url.searchParams.get("key") || "";
    const setupKey = requiredEnv(env, "GMAIL_SETUP_KEY");

    if (!constantTimeEqual(suppliedKey, setupKey)) {
      return json({ success: false, error: "Unauthorized Gmail setup request." }, 401);
    }

    const clientId = requiredEnv(env, "GOOGLE_GMAIL_CLIENT_ID");
    const stateSecret = requiredEnv(env, "GMAIL_OAUTH_STATE_SECRET");
    const state = await signState(
      { purpose: "wooten-gmail-oauth", exp: Date.now() + 10 * 60 * 1000 },
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
    return json({ success: false, error: String(error?.message || error) }, 500);
  }
}

export async function gmailOAuthCallback({ request, env }) {
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

    const expiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString();
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
      new Date().toISOString()
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

export async function gmailOAuthStatus({ request, env }) {
  try {
    const url = new URL(request.url);
    const suppliedKey = url.searchParams.get("key") || "";
    const setupKey = requiredEnv(env, "GMAIL_SETUP_KEY");

    if (!constantTimeEqual(suppliedKey, setupKey)) {
      return json({ success: false, error: "Unauthorized." }, 401);
    }

    await ensureTable(env);
    const row = await env.DB.prepare(`
      SELECT google_email, scope, expires_at, updated_at,
             CASE WHEN refresh_token IS NOT NULL AND refresh_token <> '' THEN 1 ELSE 0 END AS has_refresh_token
      FROM gmail_oauth_tokens
      WHERE id = 1
    `).first();

    return json({
      success: true,
      connected: !!row?.has_refresh_token,
      email: row?.google_email || "",
      scope: row?.scope || "",
      access_token_expires_at: row?.expires_at || null,
      updated_at: row?.updated_at || null
    });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, 500);
  }
}
