const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

const esc = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function validReference(value) {
  return /^MSG-\d{6}-\d{4}$/.test(String(value || ''));
}

async function sendResend(env, payload, idempotencyKey) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(payload)
  });

  let data = {};
  try {
    data = await response.json();
  } catch {}

  return { response, data };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    return json({
      success: false,
      error: 'Email service is not configured yet.'
    }, 503);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: 'Invalid request data.'
    }, 400);
  }

  const referenceNumber = String(body.referenceNumber || '').trim();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();
  const submittedFrom = String(body.submittedFrom || '').trim();

  if (!validReference(referenceNumber)) {
    return json({
      success: false,
      error: 'Invalid message reference number.'
    }, 400);
  }

  if (!name || !email || !subject || !message) {
    return json({
      success: false,
      error: 'Please complete all required fields.'
    }, 400);
  }

  if (!validEmail(email)) {
    return json({
      success: false,
      error: 'Please enter a valid email address.'
    }, 400);
  }

  if (
    name.length > 150 ||
    subject.length > 140 ||
    message.length > 5000 ||
    phone.length > 60
  ) {
    return json({
      success: false,
      error: 'One or more fields are too long.'
    }, 400);
  }

  const fromAddress =
  'support@wootenoil.com';

  const toAddress =
    env.FUEL_TO_EMAIL || 'support@wootenoil.com';

  const receivedAt = new Date().toISOString();

  const internalPayload = {
    from: fromAddress,
    to: [toAddress],
    reply_to: email,

    subject:
      `Website Message ${referenceNumber} - ${subject}`,

    html: `
      <h2>New Website Message</h2>

      <p><strong>Reference:</strong> ${esc(referenceNumber)}</p>
      <p><strong>Name:</strong> ${esc(name)}</p>
      <p><strong>Email:</strong> ${esc(email)}</p>
      <p><strong>Phone:</strong> ${esc(phone || 'Not provided')}</p>
      <p><strong>Subject:</strong> ${esc(subject)}</p>

      <p><strong>Message:</strong></p>

      <div style="
        white-space:pre-wrap;
        border-left:4px solid #b9342b;
        padding:12px;
        background:#f8f8f8;
      ">
        ${esc(message)}
      </div>

      <p style="margin-top:20px;font-size:12px;color:#666;">
        Received ${esc(receivedAt)}
      </p>
    `,

    text:
      `New Website Message\n\n` +
      `Reference: ${referenceNumber}\n` +
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      `Phone: ${phone || 'Not provided'}\n` +
      `Subject: ${subject}\n\n` +
      `${message}\n\n` +
      `Received: ${receivedAt}`
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
      'Contact internal email network error',
      error
    );

    return json({
      success: false,
      error: 'Your message could not be sent. Please try again.'
    }, 502);
  }

  if (!internal.response.ok) {
    console.error(
      'Contact internal email failed',
      internal.data
    );

    return json({
      success: false,
      error: 'Your message could not be sent. Please try again.'
    }, 502);
  }

  const customerPayload = {
    from: fromAddress,
    to: [email],

    subject:
      `Wooten Oil - We Received Your Message - ${referenceNumber}`,

    html: `
      <h2>We Received Your Message</h2>

      <p>Hello ${esc(name)},</p>

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
          ${esc(referenceNumber)}
        </div>
      </div>

      <p>
        <strong>Subject:</strong>
        ${esc(subject)}
      </p>

      <p>
        Please keep your reference number for your records.
      </p>

      <p>
        Thank you,<br>
        <strong>Wooten Oil Company</strong>
      </p>
    `,

    text:
      `Wooten Oil - We Received Your Message\n\n` +
      `Hello ${name},\n\n` +
      `Thank you for contacting Wooten Oil. ` +
      `We received your message and a member of our team ` +
      `will get back to you as soon as possible.\n\n` +
      `Message Reference: ${referenceNumber}\n` +
      `Subject: ${subject}\n\n` +
      `Please keep your reference number for your records.\n\n` +
      `Wooten Oil Company`
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
      'Contact confirmation network error',
      error
    );

    return json({
      success: false,
      error:
        'Your message was received, but the confirmation email could not be sent.'
    }, 502);
  }

  if (!customer.response.ok) {
    console.error(
      'Contact confirmation failed',
      customer.data
    );

    return json({
      success: false,
      error:
        'Your message was received, but the confirmation email could not be sent.'
    }, 502);
  }

  return json({
    success: true,
    referenceNumber,
    internalEmailId: internal.data.id || null,
    confirmationEmailId: customer.data.id || null
  });
}

export function onRequestGet() {
  return json({
    success: false,
    error: 'Method not allowed.'
  }, 405);
}
