import { getSupabaseAdmin } from '@/lib/supabase-server';
import { getKnexClient } from '@/lib/knex-client';
import type { BookingSettings, BookingBlockedRange, BookingWeekday, Layer } from '@/types';

export interface BookingCalendarRow {
  id: string;
  form_id: string;
  page_id: string | null;
  settings: BookingSettings;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BookingRow {
  id: string;
  calendar_id: string;
  form_id: string;
  start_at: string;
  end_at: string;
  status: 'booked' | 'canceled';
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  cancellation_reason: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BookingBlockRow {
  id: string;
  calendar_id: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  title: string | null;
  kind: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BookingAvailabilitySlot {
  start_at: string;
  end_at: string;
  label: string;
}

export interface BookingFormDefinition {
  page_id: string;
  form_id: string;
  settings: BookingSettings;
}

const WEEKDAY_ORDER: BookingWeekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const DEFAULT_WEEKLY_HOURS: Record<BookingWeekday, { enabled: boolean; start: string; end: string }> = {
  sunday: { enabled: false, start: '09:00', end: '17:00' },
  monday: { enabled: true, start: '09:00', end: '17:00' },
  tuesday: { enabled: true, start: '09:00', end: '17:00' },
  wednesday: { enabled: true, start: '09:00', end: '17:00' },
  thursday: { enabled: true, start: '09:00', end: '17:00' },
  friday: { enabled: true, start: '09:00', end: '17:00' },
  saturday: { enabled: false, start: '09:00', end: '17:00' },
};

const DEFAULT_BOOKING_SETTINGS: Required<Pick<BookingSettings, 'duration_minutes' | 'slot_interval_minutes' | 'booking_window_days' | 'min_notice_minutes'>> = {
  duration_minutes: 50,
  slot_interval_minutes: 50,
  booking_window_days: 365,
  min_notice_minutes: 0,
};

function normalizeTime(value?: string): string {
  if (!value) return '00:00';
  const [hours = '0', minutes = '0'] = value.split(':');
  const hh = String(Math.max(0, Math.min(23, parseInt(hours, 10) || 0))).padStart(2, '0');
  const mm = String(Math.max(0, Math.min(59, parseInt(minutes, 10) || 0))).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseTimeToMinutes(value?: string): number {
  const [hours = '0', minutes = '0'] = normalizeTime(value).split(':');
  return (parseInt(hours, 10) * 60) + parseInt(minutes, 10);
}

function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60) % 24;
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + (minutes * 60 * 1000));
}

function formatParts(date: Date, timeZone: string): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
  }).formatToParts(date);
}

function getZonedDateParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: BookingWeekday } {
  const parts = formatParts(date, timeZone);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>;
  const weekday = (map.weekday || 'monday').toLowerCase() as BookingWeekday;
  return {
    year: parseInt(map.year || '1970', 10),
    month: parseInt(map.month || '1', 10),
    day: parseInt(map.day || '1', 10),
    hour: parseInt(map.hour || '0', 10),
    minute: parseInt(map.minute || '0', 10),
    second: parseInt(map.second || '0', 10),
    weekday: WEEKDAY_ORDER.includes(weekday) ? weekday : 'monday',
  };
}

function zonedTimeToUtc(dateKey: string, timeKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map((n) => parseInt(n, 10));
  const [hour, minute] = normalizeTime(timeKey).split(':').map((n) => parseInt(n, 10));
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let i = 0; i < 2; i++) {
    const guess = new Date(utcMillis);
    const zoned = getZonedDateParts(guess, timeZone);
    const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = zonedAsUtc - targetAsUtc;
    if (delta === 0) break;
    utcMillis -= delta;
  }

  return new Date(utcMillis);
}

function intervalOverlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}

function normalizeSettings(settings: BookingSettings | null | undefined): BookingSettings {
  const weeklyHours = { ...DEFAULT_WEEKLY_HOURS, ...(settings?.weekly_hours || {}) };

  return {
    timezone: settings?.timezone || 'Europe/Vienna',
    duration_minutes: settings?.duration_minutes || DEFAULT_BOOKING_SETTINGS.duration_minutes,
    buffer_before_minutes: settings?.buffer_before_minutes || 0,
    buffer_after_minutes: settings?.buffer_after_minutes || 0,
    slot_interval_minutes: settings?.slot_interval_minutes || settings?.duration_minutes || DEFAULT_BOOKING_SETTINGS.slot_interval_minutes,
    booking_window_days: settings?.booking_window_days || DEFAULT_BOOKING_SETTINGS.booking_window_days,
    min_notice_minutes: settings?.min_notice_minutes || DEFAULT_BOOKING_SETTINGS.min_notice_minutes,
    lunch_break: settings?.lunch_break,
    weekly_hours: weeklyHours,
    blocked_dates: settings?.blocked_dates || [],
    blocked_ranges: settings?.blocked_ranges || [],
  };
}

function toBookingSettings(value: unknown): BookingSettings {
  if (!value) return normalizeSettings({});
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeSettings(parsed as BookingSettings);
      }
    } catch {
      return normalizeSettings({});
    }
    return normalizeSettings({});
  }
  if (typeof value !== 'object' || Array.isArray(value)) return normalizeSettings({});
  return normalizeSettings(value as BookingSettings);
}

function findFormLayerByBookingId(layers: Layer[], id: string): Layer | null {
  for (const layer of layers) {
    if (layer.id === id || layer.settings?.id === id || layer.attributes?.id === id) {
      return layer;
    }

    if (layer.children) {
      const found = findFormLayerByBookingId(layer.children, id);
      if (found) return found;
    }
  }

  return null;
}

async function fetchLayerRows(isPublished: boolean): Promise<Array<{ page_id: string; layers: unknown }>> {
  const client = await getSupabaseAdmin();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('page_layers')
    .select('page_id, layers')
    .eq('is_published', isPublished)
    .is('deleted_at', null);

  if (error) {
    throw new Error(`Failed to fetch page layers: ${error.message}`);
  }

  return data || [];
}

function findBookingFormInLayers(pageId: string, layers: unknown, formId: string): BookingFormDefinition | null {
  const parsedLayers = typeof layers === 'string'
    ? (() => {
      try {
        const parsed = JSON.parse(layers);
        return Array.isArray(parsed) ? parsed as Layer[] : null;
      } catch {
        return null;
      }
    })()
    : (Array.isArray(layers) ? layers as Layer[] : null);

  if (!parsedLayers) return null;

  const formLayer = findFormLayerByBookingId(parsedLayers, formId);
  if (!formLayer || formLayer.name !== 'form' || formLayer.settings?.form?.form_type !== 'booking') {
    return null;
  }

  return {
    page_id: pageId,
    form_id: formId,
    settings: normalizeSettings(formLayer.settings?.form?.booking),
  };
}

export async function getBookingFormDefinition(formId: string, isPublished?: boolean): Promise<BookingFormDefinition | null> {
  const states = typeof isPublished === 'boolean' ? [isPublished, !isPublished] : [true, false];

  for (const state of states) {
    const rows = await fetchLayerRows(state);
    for (const row of rows) {
      const definition = findBookingFormInLayers(row.page_id, row.layers, formId);
      if (definition) return definition;
    }
  }

  return null;
}

export async function ensureBookingCalendar(definition: BookingFormDefinition): Promise<BookingCalendarRow> {
  const knex = await getKnexClient();
  const now = new Date().toISOString();

  await knex('booking_calendars')
    .insert({
      form_id: definition.form_id,
      page_id: definition.page_id,
      settings: JSON.stringify(definition.settings),
      created_at: now,
      updated_at: now,
    })
    .onConflict('form_id')
    .merge({
      page_id: definition.page_id,
      settings: JSON.stringify(definition.settings),
      updated_at: now,
    });

  const calendar = await knex('booking_calendars')
    .select('*')
    .where({ form_id: definition.form_id })
    .whereNull('deleted_at')
    .first<BookingCalendarRow>();

  if (!calendar) {
    throw new Error('Failed to create booking calendar');
  }

  calendar.settings = toBookingSettings(calendar.settings);

  const blockedRanges = calendar.settings.blocked_ranges || [];
  await knex('booking_blocks')
    .where({ calendar_id: calendar.id })
    .whereRaw(`coalesce(metadata->>'source', '') = 'settings'`)
    .del();

  if (blockedRanges.length > 0) {
    await knex('booking_blocks').insert(
      blockedRanges.map((range) => ({
        calendar_id: calendar.id,
        start_at: range.start_at,
        end_at: range.end_at,
        all_day: !!range.all_day,
        title: range.title || null,
        kind: range.kind || 'custom',
        metadata: JSON.stringify({
          source: 'settings',
        }),
        created_at: now,
        updated_at: now,
      }))
    );
  }
  return calendar;
}

export async function getBookingCalendarByFormId(formId: string): Promise<BookingCalendarRow | null> {
  const knex = await getKnexClient();
  const calendar = await knex('booking_calendars')
    .select('*')
    .where({ form_id: formId })
    .whereNull('deleted_at')
    .first<BookingCalendarRow>();

  if (!calendar) return null;
  calendar.settings = toBookingSettings(calendar.settings);
  return calendar;
}

async function loadCalendarRows(calendarId: string, startAt: Date, endAt: Date, trx?: any) {
  const db = trx || await getKnexClient();

  const [bookings, blocks] = await Promise.all([
    db('bookings')
      .select('*')
      .where({ calendar_id: calendarId })
      .whereNull('deleted_at')
      .whereIn('status', ['booked'])
      .andWhere('start_at', '<', endAt.toISOString())
      .andWhere('end_at', '>', startAt.toISOString()),
    db('booking_blocks')
      .select('*')
      .where({ calendar_id: calendarId })
      .whereNull('deleted_at')
      .andWhere('start_at', '<', endAt.toISOString())
      .andWhere('end_at', '>', startAt.toISOString()),
  ]);

  return { bookings: bookings as BookingRow[], blocks: blocks as BookingBlockRow[] };
}

function getLunchBlock(settings: BookingSettings, dateKey: string, timeZone: string): BookingBlockedRange | null {
  const lunch = settings.lunch_break;
  if (!lunch?.enabled || !lunch.start || !lunch.end) return null;
  const startAt = zonedTimeToUtc(dateKey, lunch.start, timeZone).toISOString();
  const endAt = zonedTimeToUtc(dateKey, lunch.end, timeZone).toISOString();
  return { start_at: startAt, end_at: endAt, kind: 'lunch', title: 'Lunch break' };
}

export async function getAvailableBookingSlots(
  formId: string,
  dateKey: string,
  isPublished?: boolean
): Promise<{ calendar: BookingCalendarRow; slots: BookingAvailabilitySlot[]; settings: BookingSettings }> {
  const definition = await getBookingFormDefinition(formId, isPublished);
  if (!definition) {
    throw new Error('Booking form not found');
  }

  const calendar = await ensureBookingCalendar(definition);
  const settings = calendar.settings;
  const timeZone = settings.timezone || 'Europe/Vienna';
  const startOfDay = zonedTimeToUtc(dateKey, '00:00', timeZone);
  const endOfDay = addMinutes(startOfDay, 24 * 60);

  const { bookings, blocks } = await loadCalendarRows(calendar.id, startOfDay, endOfDay);

  const weekday = getZonedDateParts(startOfDay, timeZone).weekday;
  const workingHours = settings.weekly_hours?.[weekday] || DEFAULT_WEEKLY_HOURS[weekday];
  if (!workingHours?.enabled) {
    return { calendar, slots: [], settings };
  }

  const duration = settings.duration_minutes || DEFAULT_BOOKING_SETTINGS.duration_minutes;
  const slotInterval = settings.slot_interval_minutes || duration;
  const bufferBefore = settings.buffer_before_minutes || 0;
  const bufferAfter = settings.buffer_after_minutes || 0;
  const minNotice = settings.min_notice_minutes || 0;
  const now = new Date();
  const minAllowedStart = addMinutes(now, minNotice);
  const lunchBlock = getLunchBlock(settings, dateKey, timeZone);
  const blockedDates = new Set(settings.blocked_dates || []);

  if (blockedDates.has(dateKey)) {
    return { calendar, slots: [], settings };
  }

  const workStart = parseTimeToMinutes(workingHours.start);
  const workEnd = parseTimeToMinutes(workingHours.end);
  const slots: BookingAvailabilitySlot[] = [];

  for (let cursor = workStart; cursor + duration <= workEnd; cursor += slotInterval) {
    const slotStartLocal = minutesToTime(cursor);
    const slotEndLocal = minutesToTime(cursor + duration);
    const slotStart = zonedTimeToUtc(dateKey, slotStartLocal, timeZone);
    const slotEnd = zonedTimeToUtc(dateKey, slotEndLocal, timeZone);
    const occupiedStart = addMinutes(slotStart, -bufferBefore);
    const occupiedEnd = addMinutes(slotEnd, bufferAfter);

    if (slotStart < minAllowedStart) continue;

    const isBlockedByLunch = lunchBlock
      ? intervalOverlaps(occupiedStart, occupiedEnd, new Date(lunchBlock.start_at), new Date(lunchBlock.end_at))
      : false;
    if (isBlockedByLunch) continue;

    const hasOverlap = bookings.some((booking) => intervalOverlaps(
      occupiedStart,
      occupiedEnd,
      new Date(booking.start_at),
      new Date(booking.end_at),
    )) || blocks.some((block) => intervalOverlaps(
      occupiedStart,
      occupiedEnd,
      new Date(block.start_at),
      new Date(block.end_at),
    ));

    if (hasOverlap) continue;

    slots.push({
      start_at: slotStart.toISOString(),
      end_at: slotEnd.toISOString(),
      label: `${slotStartLocal} - ${slotEndLocal}`,
    });
  }

  return { calendar, slots, settings };
}

export async function listBookings(formId?: string, status?: BookingRow['status']): Promise<BookingRow[]> {
  const knex = await getKnexClient();
  let query = knex('bookings').select('*').whereNull('deleted_at').orderBy('start_at', 'asc');
  if (formId) query = query.where({ form_id: formId });
  if (status) query = query.where({ status });
  const rows = await query;
  return rows as BookingRow[];
}

export async function cancelBooking(id: string, reason?: string, canceledBy?: string): Promise<BookingRow> {
  const knex = await getKnexClient();
  const now = new Date().toISOString();
  const [booking] = await knex('bookings')
    .where({ id })
    .update({
      status: 'canceled',
      canceled_at: now,
      canceled_by: canceledBy || null,
      cancellation_reason: reason || null,
      updated_at: now,
    })
    .returning('*');

  if (!booking) {
    throw new Error('Booking not found');
  }

  return booking as BookingRow;
}

export interface CreateBookingInput {
  form_id: string;
  start_at: string;
  end_at: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
}

export async function createBooking(input: CreateBookingInput, isPublished?: boolean): Promise<BookingRow> {
  const definition = await getBookingFormDefinition(input.form_id, isPublished);
  if (!definition) {
    throw new Error('Booking form not found');
  }

  const calendar = await ensureBookingCalendar(definition);
  const knex = await getKnexClient();
  const now = new Date().toISOString();

  return await knex.transaction(async (trx) => {
    await trx('booking_calendars')
      .where({ id: calendar.id })
      .forUpdate()
      .first();

    const { bookings, blocks } = await loadCalendarRows(calendar.id, new Date(input.start_at), new Date(input.end_at), trx);

    const settings = calendar.settings;
    const duration = settings.duration_minutes || DEFAULT_BOOKING_SETTINGS.duration_minutes;
    const bufferBefore = settings.buffer_before_minutes || 0;
    const bufferAfter = settings.buffer_after_minutes || 0;
    const occupiedStart = addMinutes(new Date(input.start_at), -bufferBefore);
    const occupiedEnd = addMinutes(new Date(input.end_at), bufferAfter);

    const expectedDuration = duration * 60 * 1000;
    if (new Date(input.end_at).getTime() - new Date(input.start_at).getTime() !== expectedDuration) {
      throw new Error('Invalid slot duration');
    }

    const overlap = bookings.some((booking) => intervalOverlaps(
      occupiedStart,
      occupiedEnd,
      new Date(booking.start_at),
      new Date(booking.end_at),
    )) || blocks.some((block) => intervalOverlaps(
      occupiedStart,
      occupiedEnd,
      new Date(block.start_at),
      new Date(block.end_at),
    ));

    if (overlap) {
      throw new Error('Selected slot is no longer available');
    }

    const [booking] = await trx('bookings')
      .insert({
        calendar_id: calendar.id,
        form_id: input.form_id,
        start_at: input.start_at,
        end_at: input.end_at,
        status: 'booked',
        customer_name: input.customer_name || null,
        customer_email: input.customer_email || null,
        customer_phone: input.customer_phone || null,
        payload: JSON.stringify(input.payload || {}),
        metadata: JSON.stringify(input.metadata || {}),
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    if (!booking) {
      throw new Error('Failed to create booking');
    }

    return booking as BookingRow;
  });
}
