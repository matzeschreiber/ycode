import { NextRequest } from 'next/server';
import { getAvailableBookingSlots } from '@/lib/repositories/bookingRepository';
import { noCache } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get('form_id');
    const date = searchParams.get('date');
    const preview = searchParams.get('preview') === 'true';

    if (!formId || !date) {
      return noCache({ error: 'Missing required params: form_id and date' }, 400);
    }

    const result = await getAvailableBookingSlots(formId, date, preview ? false : true);

    return noCache({
      data: {
        form_id: formId,
        date,
        timezone: result.settings.timezone || 'Europe/Vienna',
        duration_minutes: result.settings.duration_minutes || 50,
        slots: result.slots,
      },
    });
  } catch (error) {
    console.error('Error fetching booking availability:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to fetch availability' },
      500
    );
  }
}
