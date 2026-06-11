import { NextRequest } from 'next/server';
import { createBooking, listBookings } from '@/lib/repositories/bookingRepository';
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

    return noCache({ data: booking }, 201);
  } catch (error) {
    console.error('Error creating booking:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to create booking' },
      500
    );
  }
}
