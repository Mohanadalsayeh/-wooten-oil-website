const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
});

const esc = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function validRequestNumber(value) {
  return /^WO-\d{6}-\d{4}$/.test(String(value || ''));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid request data.' }, 400);
  }

  const requestNumber = String(body.requestNumber || '').trim();
  const customerName = String(body.customerName || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim();
  const deliveryAddress = String(body.deliveryAddress || '').trim();
  const fuelType = String(body.fuelType || '').trim();
  const gallons = String(body.gallons || '').trim();
  const deliveryDate = String(body.deliveryDate || '').trim();
  const notes = String(body.notes || '').trim();
  const submittedFrom = String(body.submittedFrom || '').trim();

  if (!validRequestNumber(requestNumber)) {
    return json({ success: false, error: 'Invalid request number.' }, 400);
  }

  if (!customerName || !phone || !deliveryAddress || !fuelType || !gallons) {
    return json({ success: false, error: 'Please complete all required fields.' }, 400);
  }

  if (!/^\d+(?:\.\d+)?$/.test(gallons) || Number(gallons) <= 0 || Number(gallons) > 1000000) {
    return json({ success: false, error: 'Estimated gallons is not valid.' }, 400);
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ success: false, error: 'Customer email is not valid.' }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return json({ success: false, error: 'Email service is not configured yet.' }, 503);
  }

  const receivedAt = new Date().toISOString();

  if (env.DB) {
    try {
      await env.DB.prepare(`
        INSERT INTO fuel_requests
        (request_number, customer_name, phone, email, delivery_address, fuel_type,
         gallons, delivery_date, notes, submitted_from, received_at, email_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        requestNumber, customerName, phone, email, deliveryAddress, fuelType,
        gallons, deliveryDate, notes, submittedFrom, receivedAt, 'pending'
      ).run();
    } catch (error) {
      console.error('D1 insert failed', error);
      return json({
        success: false,
        error: 'This request could not be saved. Please try again.'
      }, 500);
    }
  }

  const fromAddress =
    env.FUEL_FROM_EMAIL || 'Wooten Oil Website <orders@wootenoil.com>';

  const toAddress =
    env.FUEL_TO_EMAIL || 'Support@wootenoil.com';

  const subject =
    `Fuel Delivery Request ${requestNumber} - ${customerName}`;

  const rows = [
    ['Request Number', requestNumber],
    ['Customer / Company Name', customerName],
    ['Phone Number', phone],
    ['Customer Email', email || 'Not provided'],
    ['Delivery Address', deliveryAddress],
    ['Fuel Type', fuelType],
    ['Estimated Gallons', gallons],
    ['Preferred Delivery Date', deliveryDate || 'Flexible / Not specified'],
    ['Additional Notes', notes || 'None'],
    ['Received', receivedAt],
  ];

  const htmlRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;vertical-align:top;width:210px">
        ${esc(label)}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top">
        ${esc(value)}
      </td>
    </tr>`).join('');

  const html = `
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
          Submitted from ${esc(submittedFrom || 'wootenoil.com')}
        </div>

      </div>
    </body>
  </html>`;

  const emailPayload = {
    from: fromAddress,
    to: [toAddress],
    subject,
    html,
    text: rows
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n'),
    tags: [{
      name: 'request_number',
      value: requestNumber.replace(/[^A-Za-z0-9_-]/g, '_')
    }],
  };

  if (email) {
    emailPayload.reply_to = email;
  }

  let resendResponse;
  let resendData = {};

  try {
    resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `fuel-request-${requestNumber}`,
      },
      body: JSON.stringify(emailPayload),
    });

    try {
      resendData = await resendResponse.json();
    } catch {}

  } catch (error) {

    console.error('Resend request failed', error);

    if (env.DB) {
      await env.DB
        .prepare(
          'UPDATE fuel_requests SET email_status = ? WHERE request_number = ?'
        )
        .bind('network_error', requestNumber)
        .run()
        .catch(() => {});
    }

    return json({
      success: false,
      error:
        'The order was saved, but the email notification could not be sent. Please call Wooten Oil.'
    }, 502);
  }

  if (!resendResponse.ok) {

    console.error('Resend error', resendData);

    if (env.DB) {
      await env.DB
        .prepare(
          'UPDATE fuel_requests SET email_status = ? WHERE request_number = ?'
        )
        .bind(`failed_${resendResponse.status}`, requestNumber)
        .run()
        .catch(() => {});
    }

    return json({
      success: false,
      error:
        'The order was saved, but the email notification could not be sent. Please call Wooten Oil.'
    }, 502);
  }

  if (env.DB) {
    await env.DB
      .prepare(
        'UPDATE fuel_requests SET email_status = ?, resend_email_id = ? WHERE request_number = ?'
      )
      .bind('sent', resendData.id || '', requestNumber)
      .run()
      .catch(() => {});
  }

  return json({
    success: true,
    requestNumber,
    emailId: resendData.id || null
  });
}

export function onRequestGet() {
  return json({
    success: false,
    error: 'Method not allowed.'
  }, 405);
}
