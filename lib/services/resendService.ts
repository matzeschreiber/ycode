import { escapeHtml } from '@/lib/escape-html';

const RESEND_API_URL = 'https://api.resend.com/emails';

function getResendApiKey(): string | undefined {
  return process.env.RESEND_KEY || process.env.RESEND_Key;
}

function getResendFromEmail(): string | undefined {
  return process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM;
}

function formatAddress(email: string, name?: string): string {
  return name ? `"${name}" <${email}>` : email;
}

function formatBookingDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('de-AT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export interface SendResendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
}

export interface BookingEmailData {
  formId: string;
  booking: {
    id: string;
    start_at: string;
    end_at: string;
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
  pageUrl?: string;
}

export interface BookingCustomerEmailData extends BookingEmailData {
  message?: string;
  cancellationReason?: string | null;
}

export function generateBookingEmailText(data: BookingEmailData): string {
  const lines = [
    `Booking form: ${data.formId}`,
    `Booking ID: ${data.booking.id}`,
    `Start: ${formatBookingDate(data.booking.start_at)}`,
    `End: ${formatBookingDate(data.booking.end_at)}`,
  ];

  if (data.booking.customer_name) {
    lines.push(`Name: ${data.booking.customer_name}`);
  }

  if (data.booking.customer_email) {
    lines.push(`Email: ${data.booking.customer_email}`);
  }

  if (data.booking.customer_phone) {
    lines.push(`Phone: ${data.booking.customer_phone}`);
  }

  if (data.pageUrl) {
    lines.push(`Page: ${data.pageUrl}`);
  }

  const payloadEntries = Object.entries(data.booking.payload);
  if (payloadEntries.length > 0) {
    lines.push('', 'Submitted fields:');
    for (const [key, value] of payloadEntries) {
      lines.push(`- ${key}: ${String(value ?? '')}`);
    }
  }

  return lines.join('\n');
}

export function generateBookingEmailHtml(data: BookingEmailData): string {
  const payloadRows = Object.entries(data.booking.payload)
    .map(
      ([key, value]) => `<tr>
        <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: 600; width: 32%;">${escapeHtml(key)}</td>
        <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${escapeHtml(String(value ?? ''))}</td>
      </tr>`
    )
    .join('');

  const details = [
    ['Booking form', data.formId],
    ['Booking ID', data.booking.id],
    ['Start', formatBookingDate(data.booking.start_at)],
    ['End', formatBookingDate(data.booking.end_at)],
    ['Name', data.booking.customer_name || ''],
    ['Email', data.booking.customer_email || ''],
    ['Phone', data.booking.customer_phone || ''],
    ['Page', data.pageUrl || ''],
  ]
    .filter(([, value]) => Boolean(value))
    .map(
      ([label, value]) => `<tr>
        <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: 600; width: 32%;">${escapeHtml(label)}</td>
        <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${escapeHtml(String(value))}</td>
      </tr>`
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
      <body style="margin:0; padding:24px; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#111827;">
        <div style="max-width: 680px; margin: 0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden;">
          <div style="padding:24px 28px; border-bottom:1px solid #e5e7eb; background: linear-gradient(135deg, #111827 0%, #374151 100%); color:#fff;">
            <div style="font-size:14px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.8;">New booking received</div>
            <h1 style="margin:10px 0 0; font-size:22px; line-height:1.3;">${escapeHtml(data.formId)}</h1>
          </div>
          <div style="padding:24px 28px;">
            <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
              <tbody>
                ${details}
              </tbody>
            </table>

            ${payloadRows ? `
              <h2 style="margin:0 0 12px; font-size:16px;">Submitted fields</h2>
              <table style="width:100%; border-collapse:collapse;">
                <tbody>
                  ${payloadRows}
                </tbody>
              </table>
            ` : ''}
          </div>
        </div>
      </body>
    </html>
  `.trim();
}

export function generateBookingCustomerConfirmationText(data: BookingCustomerEmailData): string {
  const lines = [
    data.message || 'Your booking has been confirmed.',
    '',
    `Booking form: ${data.formId}`,
    `Booking ID: ${data.booking.id}`,
    `Start: ${formatBookingDate(data.booking.start_at)}`,
    `End: ${formatBookingDate(data.booking.end_at)}`,
  ];

  if (data.booking.customer_name) {
    lines.push(`Name: ${data.booking.customer_name}`);
  }

  if (data.pageUrl) {
    lines.push(`Page: ${data.pageUrl}`);
  }

  return lines.join('\n');
}

export function generateBookingCustomerConfirmationHtml(data: BookingCustomerEmailData): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <body style="margin:0; padding:24px; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#111827;">
        <div style="max-width: 640px; margin: 0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden;">
          <div style="padding:24px 28px; background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%); color:#fff;">
            <div style="font-size:14px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.85;">Booking confirmed</div>
            <h1 style="margin:10px 0 0; font-size:22px; line-height:1.3;">${escapeHtml(data.formId)}</h1>
          </div>
          <div style="padding:24px 28px;">
            <p style="margin:0 0 18px; font-size:16px; line-height:1.6;">${escapeHtml(data.message || 'Your booking has been confirmed.')}</p>
            <table style="width:100%; border-collapse:collapse;">
              <tbody>
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Booking ID</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(data.booking.id)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Start</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(formatBookingDate(data.booking.start_at))}</td>
                </tr>
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">End</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(formatBookingDate(data.booking.end_at))}</td>
                </tr>
                ${data.pageUrl ? `
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Page</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(data.pageUrl)}</td>
                </tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  `.trim();
}

export function generateBookingCancellationText(data: BookingCustomerEmailData): string {
  const lines = [
    data.message || 'Your booking has been canceled.',
    '',
    `Booking form: ${data.formId}`,
    `Booking ID: ${data.booking.id}`,
    `Start: ${formatBookingDate(data.booking.start_at)}`,
    `End: ${formatBookingDate(data.booking.end_at)}`,
  ];

  if (data.cancellationReason) {
    lines.push(`Reason: ${data.cancellationReason}`);
  }

  if (data.pageUrl) {
    lines.push(`Page: ${data.pageUrl}`);
  }

  return lines.join('\n');
}

export function generateBookingCancellationHtml(data: BookingCustomerEmailData): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <body style="margin:0; padding:24px; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#111827;">
        <div style="max-width: 640px; margin: 0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden;">
          <div style="padding:24px 28px; background: linear-gradient(135deg, #7f1d1d 0%, #ef4444 100%); color:#fff;">
            <div style="font-size:14px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.85;">Booking canceled</div>
            <h1 style="margin:10px 0 0; font-size:22px; line-height:1.3;">${escapeHtml(data.formId)}</h1>
          </div>
          <div style="padding:24px 28px;">
            <p style="margin:0 0 18px; font-size:16px; line-height:1.6;">${escapeHtml(data.message || 'Your booking has been canceled.')}</p>
            <table style="width:100%; border-collapse:collapse;">
              <tbody>
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Booking ID</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(data.booking.id)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Start</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(formatBookingDate(data.booking.start_at))}</td>
                </tr>
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">End</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(formatBookingDate(data.booking.end_at))}</td>
                </tr>
                ${data.cancellationReason ? `
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Reason</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(data.cancellationReason)}</td>
                </tr>` : ''}
                ${data.pageUrl ? `
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Page</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(data.pageUrl)}</td>
                </tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  `.trim();
}

export async function sendResendEmail(options: SendResendEmailOptions): Promise<boolean> {
  try {
    const apiKey = getResendApiKey();
    if (!apiKey) {
      console.error('[Resend] Missing RESEND_KEY');
      return false;
    }

    const from = options.from || getResendFromEmail();
    if (!from) {
      console.error('[Resend] Missing from email. Set RESEND_FROM_EMAIL or RESEND_FROM.');
      return false;
    }

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: formatAddress(from),
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: options.replyTo,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[Resend] Failed to send email:', response.status, response.statusText, errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Resend] Error sending email:', error);
    return false;
  }
}

export async function sendBookingConfirmationEmail(
  to: string,
  data: BookingCustomerEmailData
): Promise<boolean> {
  return sendResendEmail({
    to,
    subject: `Booking confirmed: ${data.formId}`,
    text: generateBookingCustomerConfirmationText(data),
    html: generateBookingCustomerConfirmationHtml(data),
  });
}

export async function sendBookingCancellationEmail(
  to: string,
  data: BookingCustomerEmailData
): Promise<boolean> {
  return sendResendEmail({
    to,
    subject: `Booking canceled: ${data.formId}`,
    text: generateBookingCancellationText(data),
    html: generateBookingCancellationHtml(data),
  });
}
