/**
 * Email Service
 *
 * Handles sending email notifications for form submissions.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getSettingByKey } from '@/lib/repositories/settingsRepository';
import { escapeHtml } from '@/lib/escape-html';

export interface EmailSettings {
  enabled: boolean;
  mode?: 'ycode' | 'custom';
  provider: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
}

export interface FormSubmissionEmailData {
  formId: string;
  submissionId: string;
  payload: Record<string, unknown>;
  metadata: {
    page_url?: string;
    user_agent?: string;
    referrer?: string;
    submitted_at: string;
  };
  replyTo?: string;
}

export interface SendSmtpEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
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

/**
 * Extract the first valid email address from form payload
 * Used to set Reply-To so recipients can reply directly to form submitters
 */
export function extractReplyToEmail(payload: Record<string, unknown>): string | undefined {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const value of Object.values(payload)) {
    if (typeof value === 'string' && emailRegex.test(value.trim())) {
      return value.trim();
    }
  }

  return undefined;
}

/**
 * Create a nodemailer transporter with the given settings
 */
function createTransporter(settings: EmailSettings): Transporter {
  const port = parseInt(settings.smtpPort, 10);

  return nodemailer.createTransport({
    host: settings.smtpHost,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPassword,
    },
  });
}

function formatFromAddress(settings: EmailSettings): string {
  const email = settings.fromEmail || settings.smtpUser;
  return settings.fromName ? `"${settings.fromName}" <${email}>` : email;
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

/**
 * Test SMTP connection with the given settings
 * @param settings - The SMTP settings to test
 * @returns Promise that resolves to true if connection is successful
 */
export async function testSmtpConnection(settings: EmailSettings): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransporter(settings);
    await transporter.verify();
    return { success: true };
  } catch (error) {
    console.error('SMTP connection test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Generate HTML email body for form submission notification
 */
export function generateEmailHtml(data: FormSubmissionEmailData): string {
  const fields = Object.entries(data.payload)
    .map(
      ([key, value]) =>
        `<tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb; width: 30%;">${escapeHtml(key)}</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;">${escapeHtml(String(value ?? ''))}</td>
        </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <table style="width: 100%; border-collapse: collapse;">
    <tbody>
      ${fields}
    </tbody>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email body for form submission notification
 */
export function generateEmailText(data: FormSubmissionEmailData): string {
  return Object.entries(data.payload)
    .map(([key, value]) => `${key}: ${String(value ?? '')}`)
    .join('\n');
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
          <div style="padding:24px 28px; border-bottom:1px solid #e5e7eb; background:#111827; color:#fff;">
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
    data.message || 'Ihr Termin wurde bestätigt.',
    '',
    `Terminbeginn: ${formatBookingDate(data.booking.start_at)}`,
    `Terminende: ${formatBookingDate(data.booking.end_at)}`,
  ];

  if (data.booking.customer_name) {
    lines.push(`Name: ${data.booking.customer_name}`);
  }

  return lines.join('\n');
}

export function generateBookingCustomerConfirmationHtml(data: BookingCustomerEmailData): string {
  return `
    <!DOCTYPE html>
    <html lang="de">
      <body style="margin:0; padding:24px; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#111827;">
        <div style="max-width: 640px; margin: 0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden;">
          <div style="padding:24px 28px; background:#0f766e; color:#fff;">
            <div style="font-size:14px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.85;">Termin bestätigt</div>
            <h1 style="margin:10px 0 0; font-size:22px; line-height:1.3;">Terminbestätigung</h1>
          </div>
          <div style="padding:24px 28px;">
            <p style="margin:0 0 18px; font-size:16px; line-height:1.6;">${escapeHtml(data.message || 'Ihr Termin wurde bestätigt.')}</p>
            <table style="width:100%; border-collapse:collapse;">
              <tbody>
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Beginn</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(formatBookingDate(data.booking.start_at))}</td>
                </tr>
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Ende</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(formatBookingDate(data.booking.end_at))}</td>
                </tr>
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
    data.message || 'Ihr Termin wurde storniert.',
    '',
    `Terminbeginn: ${formatBookingDate(data.booking.start_at)}`,
    `Terminende: ${formatBookingDate(data.booking.end_at)}`,
  ];

  if (data.cancellationReason) {
    lines.push(`Grund: ${data.cancellationReason}`);
  }

  return lines.join('\n');
}

export function generateBookingCancellationHtml(data: BookingCustomerEmailData): string {
  return `
    <!DOCTYPE html>
    <html lang="de">
      <body style="margin:0; padding:24px; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#111827;">
        <div style="max-width: 640px; margin: 0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden;">
          <div style="padding:24px 28px; background:#991b1b; color:#fff;">
            <div style="font-size:14px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.85;">Termin storniert</div>
            <h1 style="margin:10px 0 0; font-size:22px; line-height:1.3;">Terminabsage</h1>
          </div>
          <div style="padding:24px 28px;">
            <p style="margin:0 0 18px; font-size:16px; line-height:1.6;">${escapeHtml(data.message || 'Ihr Termin wurde storniert.')}</p>
            <table style="width:100%; border-collapse:collapse;">
              <tbody>
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Beginn</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(formatBookingDate(data.booking.start_at))}</td>
                </tr>
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Ende</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(formatBookingDate(data.booking.end_at))}</td>
                </tr>
                ${data.cancellationReason ? `
                <tr>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; width:32%;">Grund</td>
                  <td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(data.cancellationReason)}</td>
                </tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  `.trim();
}

export async function sendSmtpEmail(options: SendSmtpEmailOptions): Promise<boolean> {
  try {
    const settings = await getSettingByKey('email') as EmailSettings | null;

    if (!settings?.enabled) {
      console.error('Email settings disabled');
      return false;
    }

    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
      console.error('Email settings incomplete - missing SMTP configuration');
      return false;
    }

    const transporter = createTransporter(settings);

    await transporter.sendMail({
      from: formatFromAddress(settings),
      to: options.to,
      subject: options.subject,
      replyTo: options.replyTo,
      text: options.text,
      html: options.html,
    });

    return true;
  } catch (error) {
    console.error('Failed to send SMTP email:', error);
    return false;
  }
}

export async function sendBookingNotificationEmail(
  to: string,
  subject: string,
  data: BookingEmailData,
  replyTo?: string
): Promise<boolean> {
  return sendSmtpEmail({
    to,
    subject,
    text: generateBookingEmailText(data),
    html: generateBookingEmailHtml(data),
    replyTo,
  });
}

export async function sendBookingConfirmationEmail(
  to: string,
  data: BookingCustomerEmailData
): Promise<boolean> {
  return sendSmtpEmail({
    to,
    subject: 'Terminbestätigung',
    text: generateBookingCustomerConfirmationText(data),
    html: generateBookingCustomerConfirmationHtml(data),
  });
}

export async function sendBookingCancellationEmail(
  to: string,
  data: BookingCustomerEmailData
): Promise<boolean> {
  return sendSmtpEmail({
    to,
    subject: 'Terminabsage',
    text: generateBookingCancellationText(data),
    html: generateBookingCancellationHtml(data),
  });
}

/**
 * Send form submission email notification
 * This is a "fire and forget" function - it logs errors but doesn't throw
 * to prevent blocking the main form submission flow.
 *
 * @param to - Recipient email address
 * @param subject - Email subject line
 * @param data - Form submission data
 * @returns Promise that resolves to true if email was sent successfully
 */
export async function sendFormSubmissionEmail(
  to: string,
  subject: string,
  data: FormSubmissionEmailData
): Promise<boolean> {
  try {
    // Get email settings from database
    const settings = await getSettingByKey('email') as EmailSettings | null;

    if (!settings?.enabled) {
      return false;
    }

    // Validate required settings
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
      console.error('Email settings incomplete - missing SMTP configuration');
      return false;
    }

    const transporter = createTransporter(settings);

    await transporter.sendMail({
      from: formatFromAddress(settings),
      to,
      subject: subject || `New form submission: ${data.formId}`,
      replyTo: data.replyTo,
      text: generateEmailText(data),
      html: generateEmailHtml(data),
    });

    return true;
  } catch (error) {
    console.error('Failed to send form submission email:', error);
    return false;
  }
}
