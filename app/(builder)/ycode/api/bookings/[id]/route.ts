import { NextRequest } from 'next/server';
import { cancelBooking } from '@/lib/repositories/bookingRepository';
import { getKnexClient } from '@/lib/knex-client';
import { noCache } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const knex = await getKnexClient();
    const booking = await knex('bookings').select('*').where({ id }).whereNull('deleted_at').first();

    if (!booking) {
      return noCache({ error: 'Booking not found' }, 404);
    }

    return noCache({ data: booking });
  } catch (error) {
    console.error('Error fetching booking:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to fetch booking' },
      500
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    if (body.status === 'canceled' || body.status === 'cancelled') {
      const booking = await cancelBooking(id, body.cancellation_reason, body.canceled_by);
      return noCache({ data: booking });
    }

    return noCache({ error: 'Unsupported booking update' }, 400);
  } catch (error) {
    console.error('Error updating booking:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to update booking' },
      500
    );
  }
}
