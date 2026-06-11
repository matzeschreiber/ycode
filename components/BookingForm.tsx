'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { BookingSettings } from '@/types';

interface BookingFormProps {
  formId: string;
  settings?: BookingSettings;
  isPreview?: boolean;
}

interface AvailabilitySlot {
  start_at: string;
  end_at: string;
  label: string;
}

function getTodayInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>;
  return `${map.year}-${map.month}-${map.day}`;
}

export default function BookingForm({ formId, settings, isPreview = false }: BookingFormProps) {
  const timeZone = settings?.timezone || 'Europe/Vienna';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [date, setDate] = useState(() => getTodayInTimeZone(timeZone));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const durationMinutes = settings?.duration_minutes || 50;

  useEffect(() => {
    setDate(getTodayInTimeZone(timeZone));
  }, [timeZone]);

  useEffect(() => {
    const form = containerRef.current?.closest('form');
    if (!form) return;

    const handleReset = () => {
      setSelectedSlot(null);
      setError(null);
      setReloadToken((value) => value + 1);
      setDate(getTodayInTimeZone(timeZone));
    };

    form.addEventListener('reset', handleReset);
    return () => form.removeEventListener('reset', handleReset);
  }, [timeZone]);

  useEffect(() => {
    if (!formId || !date) return;

    const controller = new AbortController();
    const loadAvailability = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          form_id: formId,
          date,
        });
        if (isPreview) params.set('preview', 'true');

        const response = await fetch(`/ycode/api/bookings/availability?${params.toString()}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.error || 'Failed to load slots');
        }

        setSlots(result.data?.slots || []);
        setSelectedSlot((current) => {
          if (!current) return null;
          return result.data?.slots?.some((slot: AvailabilitySlot) => slot.start_at === current.start_at) ? current : null;
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load availability');
          setSlots([]);
          setSelectedSlot(null);
        }
      } finally {
        setLoading(false);
      }
    };

    loadAvailability();
    return () => controller.abort();
  }, [date, formId, isPreview, reloadToken]);

  const selectedStartValue = selectedSlot?.start_at ?? '';
  const selectedEndValue = selectedSlot?.end_at ?? '';

  const helperText = useMemo(() => {
    if (error) return error;
    if (loading) return 'Verfügbare Termine werden geladen ...';
    if (slots.length === 0) return 'Für diesen Tag sind aktuell keine freien Termine verfügbar.';
    return `Dauer: ${durationMinutes} Minuten`;
  }, [durationMinutes, error, loading, slots.length]);

  return (
    <div ref={containerRef} className="flex flex-col gap-4 rounded-lg border border-border/60 bg-background/60 p-4">
      <div className="grid gap-2">
        <Label htmlFor={`${formId}-booking-date`}>Termin wählen</Label>
        <Input
          id={`${formId}-booking-date`}
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setSelectedSlot(null);
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-xs text-muted-foreground">{helperText}</div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner />
            Slots laden
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slots.map((slot) => {
              const active = selectedSlot?.start_at === slot.start_at;
              return (
                <Button
                  key={slot.start_at}
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  className={cn('justify-center text-xs', active && 'shadow-sm')}
                  onClick={() => setSelectedSlot(slot)}
                >
                  {slot.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <input
        type="hidden" name="booking_form_id"
        value={formId}
      />
      <input
        type="hidden" name="booking_date"
        value={date}
      />
      <input
        type="hidden" name="booking_start_at"
        value={selectedStartValue}
      />
      <input
        type="hidden" name="booking_end_at"
        value={selectedEndValue}
      />
      <input
        type="hidden" name="booking_timezone"
        value={timeZone}
      />
    </div>
  );
}
