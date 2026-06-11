'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import Icon from '@/components/ui/icon';
import { formatDate } from '@/lib/utils';
import type { BookingRow } from '@/lib/repositories/bookingRepository';

async function fetchBookings(formId?: string): Promise<BookingRow[]> {
  const params = new URLSearchParams();
  if (formId) params.set('form_id', formId);
  const response = await fetch(`/ycode/api/bookings${params.toString() ? `?${params.toString()}` : ''}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.data || [];
}

async function cancelBooking(id: string): Promise<void> {
  const response = await fetch(`/ycode/api/bookings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'canceled' }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
}

async function createBooking(body: Record<string, unknown>): Promise<void> {
  const response = await fetch('/ycode/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
}

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>;
  return {
    year: parseInt(map.year || '1970', 10),
    month: parseInt(map.month || '1', 10),
    day: parseInt(map.day || '1', 10),
    hour: parseInt(map.hour || '0', 10),
    minute: parseInt(map.minute || '0', 10),
    second: parseInt(map.second || '0', 10),
  };
}

function normalizeTime(value: string): string {
  const [hours = '0', minutes = '0'] = value.split(':');
  return `${String(parseInt(hours, 10) || 0).padStart(2, '0')}:${String(parseInt(minutes, 10) || 0).padStart(2, '0')}`;
}

function zonedTimeToUtc(dateKey: string, timeKey: string, timeZone: string): string {
  const [year, month, day] = dateKey.split('-').map((part) => parseInt(part, 10));
  const [hour, minute] = normalizeTime(timeKey).split(':').map((part) => parseInt(part, 10));
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

  return new Date(utcMillis).toISOString();
}

async function fetchBookingTimezone(formId: string, date: string): Promise<string | null> {
  const params = new URLSearchParams({
    form_id: formId,
    date,
    preview: 'true',
  });

  const response = await fetch(`/ycode/api/bookings/availability?${params.toString()}`);
  const data = await response.json();
  if (!response.ok) return null;
  return data?.data?.timezone || null;
}

export default function BookingsPage() {
  const isDev = process.env.NODE_ENV !== 'production';
  const [formId, setFormId] = useState('');
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualFormId, setManualFormId] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('09:00');
  const [manualDuration, setManualDuration] = useState('50');
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualTimezone, setManualTimezone] = useState<string | null>(null);

  const loadBookings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchBookings(formId.trim() || undefined);
      setBookings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => bookings, [bookings]);
  const manualTargetFormId = (manualFormId.trim() || formId.trim());

  useEffect(() => {
    let cancelled = false;
    const loadTimezone = async () => {
      if (!manualTargetFormId) {
        setManualTimezone(null);
        return;
      }

      const date = manualDate || new Date().toISOString().slice(0, 10);
      try {
        const timezone = await fetchBookingTimezone(manualTargetFormId, date);
        if (!cancelled) {
          setManualTimezone(timezone || 'UTC');
        }
      } catch {
        if (!cancelled) {
          setManualTimezone('UTC');
        }
      }
    };

    loadTimezone();
    return () => {
      cancelled = true;
    };
  }, [manualTargetFormId, manualDate]);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelBooking(cancelTarget.id);
      setCancelTarget(null);
      await loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel booking');
    }
  };

  const handleManualCreate = async () => {
    if (!manualTargetFormId || !manualDate || !manualTime) return;
    try {
      const timezone = manualTimezone || 'UTC';
      const startAt = zonedTimeToUtc(manualDate, manualTime, timezone);
      const endAt = new Date(new Date(startAt).getTime() + (Number(manualDuration) || 50) * 60000).toISOString();
      await createBooking({
        form_id: manualTargetFormId,
        start_at: startAt,
        end_at: endAt,
        customer_name: manualName || null,
        customer_email: manualEmail || null,
        customer_phone: manualPhone || null,
        payload: {
          source: 'admin',
        },
        metadata: {
          created_via: 'admin',
        },
      });
      setManualOpen(false);
      await loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking');
    }
  };

  const handleSeedDemoBookings = async () => {
    try {
      setDemoLoading(true);
      setError(null);

      const targetFormId = manualTargetFormId || 'demo-booking-form';
      const timezone = manualTimezone || 'Europe/Vienna';
      const duration = Number(manualDuration) || 50;
      const baseDate = manualDate || new Date().toISOString().slice(0, 10);
      const demoSlots = [
        { date: baseDate, time: '09:00', name: 'Demo Booking 1', email: 'demo1@example.com' },
        { date: baseDate, time: '11:00', name: 'Demo Booking 2', email: 'demo2@example.com' },
        { date: baseDate, time: '14:00', name: 'Demo Booking 3', email: 'demo3@example.com' },
      ];

      for (const slot of demoSlots) {
        const startAt = zonedTimeToUtc(slot.date, slot.time, timezone);
        const endAt = new Date(new Date(startAt).getTime() + duration * 60000).toISOString();
        await createBooking({
          form_id: targetFormId,
          start_at: startAt,
          end_at: endAt,
          customer_name: slot.name,
          customer_email: slot.email,
          customer_phone: null,
          payload: {
            source: 'demo',
          },
          metadata: {
            created_via: 'demo-seed',
          },
        });
      }

      await loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed demo bookings');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Bookings</h1>
          <p className="text-sm text-muted-foreground">Manage booked slots, cancellations, and manual entries.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/ycode/forms">Forms</Link>
          </Button>
          <Button onClick={() => setManualOpen((prev) => !prev)}>
            <Icon name="plus" className="size-4" />
            Manual booking
          </Button>
          {isDev && (
            <Button
              variant="outline" onClick={handleSeedDemoBookings}
              disabled={demoLoading}
            >
              {demoLoading ? 'Seeding...' : 'Add demo bookings'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border border-border/60 bg-background/70 p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">Filter by form ID</label>
            <Input
              value={formId} onChange={(e) => setFormId(e.target.value)}
              placeholder="contact-form"
            />
          </div>
          <Button variant="outline" onClick={loadBookings}>
            Refresh
          </Button>
        </div>
        {isDev && (
          <p className="text-xs text-muted-foreground">
            Demo bookings use the current form ID if one is entered. Otherwise they are seeded under `demo-booking-form` so you can see the admin UI immediately.
          </p>
        )}
      </div>

      {manualOpen && (
        <div className="grid gap-4 rounded-xl border border-border/60 bg-background/70 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              value={manualFormId} onChange={(e) => setManualFormId(e.target.value)}
              placeholder="Form ID"
            />
            <Input
              value={manualDate} onChange={(e) => setManualDate(e.target.value)}
              type="date"
            />
            <Input
              value={manualTime} onChange={(e) => setManualTime(e.target.value)}
              type="time"
            />
            <Input
              value={manualDuration} onChange={(e) => setManualDuration(e.target.value)}
              type="number" min="15"
              step="5" placeholder="Duration (min)"
            />
            <Input
              value={manualName} onChange={(e) => setManualName(e.target.value)}
              placeholder="Customer name"
            />
            <Input
              value={manualEmail} onChange={(e) => setManualEmail(e.target.value)}
              placeholder="Customer email"
            />
            <Input
              value={manualPhone} onChange={(e) => setManualPhone(e.target.value)}
              placeholder="Customer phone"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Timezone: {manualTimezone || 'UTC'}
          </div>
          <div className="flex justify-end">
            <Button onClick={handleManualCreate}>Create booking</Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-background/70">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-red-500">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <Empty>
              <EmptyTitle>No bookings yet</EmptyTitle>
              <EmptyDescription>Bookings created from the website will appear here.</EmptyDescription>
            </Empty>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((booking) => (
              <div key={booking.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={booking.status === 'booked' ? 'default' : 'secondary'}>
                      {booking.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{booking.form_id}</span>
                  </div>
                  <div className="text-sm font-medium">
                    {formatDate(booking.start_at, 'MMM D YYYY, HH:mm')} - {formatDate(booking.end_at, 'HH:mm')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {booking.customer_name || 'No name'}{booking.customer_email ? ` · ${booking.customer_email}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {booking.status === 'booked' && (
                    <Button variant="outline" onClick={() => setCancelTarget(booking)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel booking?"
        description={cancelTarget ? `Cancel the booking on ${formatDate(cancelTarget.start_at, 'MMM D YYYY, HH:mm')}?` : ''}
        confirmLabel="Cancel booking"
        onConfirm={handleCancel}
      />
  </div>
  );
}
