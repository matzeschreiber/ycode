import { NextRequest } from 'next/server';
import { createBooking, listBookings } from '@/lib/repositories/bookingRepository';
import {
  generateBookingEmailHtml,
  generateBookingEmailText,
  sendBookingConfirmationEmail,
  sendResendEmail,
} from '@/lib/services/resendService';
import { noCache } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get('form_id') || undefined;
    const status = searchParams.get('status') as 'booked' | 'canceled' | undefined;

    const bookings = await listBookings(formId, status);
    return noCache({ data: bookings });
  } catch (error) {
    console.error('Error listing bookings:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to list bookings' },
      500
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.form_id || !body.start_at || !body.end_at) {
      return noCache(
        { error: 'Missing required fields: form_id, start_at, end_at' },
        400
      );
    }

    const booking = await createBooking({
      form_id: body.form_id,
      start_at: body.start_at,
      end_at: body.end_at,
      payload: body.payload || {},
      metadata: body.metadata || {},
      customer_name: body.customer_name || null,
      customer_email: body.customer_email || null,
      customer_phone: body.customer_phone || null,
    }, body.preview ? false : true);

    const emailNotification = body.email;
    const recipient = emailNotification?.to || process.env.RESEND_TO_EMAIL || process.env.RESEND_TO;
    const hasExplicitNotification = Boolean(emailNotification?.enabled && emailNotification?.to);
    const hasFallbackNotification = Boolean(!emailNotification?.to && (process.env.RESEND_TO_EMAIL || process.env.RESEND_TO));

    if (!body.preview && recipient && (hasExplicitNotification || hasFallbackNotification)) {
      const replyTo = typeof body.customer_email === 'string' && body.customer_email.trim()
        ? body.customer_email.trim()
        : undefined;
      const subject = emailNotification?.subject || `New booking received: ${body.form_id}`;

      await sendResendEmail({
        to: recipient,
        subject,
        text: generateBookingEmailText({
          formId: body.form_id,
          booking: {
            id: booking.id,
            start_at: booking.start_at,
            end_at: booking.end_at,
            customer_name: booking.customer_name,
            customer_email: booking.customer_email,
            customer_phone: booking.customer_phone,
            payload: body.payload || {},
            metadata: body.metadata || {},
          },
          pageUrl: typeof body.metadata?.page_url === 'string' ? body.metadata.page_url : undefined,
        }),
        html: generateBookingEmailHtml({
          formId: body.form_id,
          booking: {
            id: booking.id,
            start_at: booking.start_at,
            end_at: booking.end_at,
            customer_name: booking.customer_name,
            customer_email: booking.customer_email,
            customer_phone: booking.customer_phone,
            payload: body.payload || {},
            metadata: body.metadata || {},
          },
          pageUrl: typeof body.metadata?.page_url === 'string' ? body.metadata.page_url : undefined,
        }),
        replyTo,
      });
    }

    if (!body.preview && typeof booking.customer_email === 'string' && booking.customer_email.trim()) {
      const pageUrl = typeof body.metadata?.page_url === 'string' ? body.metadata.page_url : undefined;
      await sendBookingConfirmationEmail(booking.customer_email.trim(), {
        formId: body.form_id,
        booking: {
          id: booking.id,
          start_at: booking.start_at,
          end_at: booking.end_at,
          customer_name: booking.customer_name,
          customer_email: booking.customer_email,
          customer_phone: booking.customer_phone,
          payload: body.payload || {},
          metadata: body.metadata || {},
        },
        pageUrl,
        message: body.email?.confirmation_message || undefined,
      });
    }

    return noCache({ data: booking }, 201);
  } catch (error) {
    console.error('Error creating booking:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to create booking' },
      500
    );
  }
}
