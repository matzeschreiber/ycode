'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import Icon from '@/components/ui/icon';
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

interface CalendarCell {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
}

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function parseDateString(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map((part) => parseInt(part, 10));
  return {
    year: Number.isFinite(year) ? year : 1970,
    month: Number.isFinite(month) ? month : 1,
    day: Number.isFinite(day) ? day : 1,
  };
}

function formatCalendarDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const { year, month, day } = parseDateString(date);
  return new Intl.DateTimeFormat('de-AT', {
    timeZone: 'UTC',
    ...options,
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function getMonthKey(date: string): string {
  const { year, month } = parseDateString(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function shiftMonth(monthKey: string, delta: number): string {
  const { year, month } = parseDateString(`${monthKey}-01`);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toCalendarDateString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDays(date: string, days: number): string {
  const { year, month, day } = parseDateString(date);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return toCalendarDateString(next);
}

function isDateInWeeklyHours(date: string, settings?: BookingSettings): boolean {
  const weeklyHours = settings?.weekly_hours;
  if (!weeklyHours) return true;

  const dayIndex = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekdayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
  const weekday = weekdayMap[dayIndex];
  const daySettings = weeklyHours[weekday];

  return Boolean(daySettings?.enabled);
}

function getMonthGrid(
  viewMonth: string,
  selectedDate: string,
  todayDate: string,
  minDate: string,
  maxDate: string,
  settings?: BookingSettings
): CalendarCell[] {
  const { year, month } = parseDateString(`${viewMonth}-01`);
  const firstDayUtc = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = firstDayUtc.getUTCDay();
  const leadingDays = (firstWeekday + 6) % 7;
  const cells: CalendarCell[] = [];

  for (let offset = -leadingDays; offset < (42 - leadingDays); offset++) {
    const date = new Date(Date.UTC(year, month - 1, 1 + offset));
    const dateKey = toCalendarDateString(date);
    cells.push({
      date: dateKey,
      day: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() === month - 1,
      isToday: dateKey === todayDate,
      isSelected: dateKey === selectedDate,
      isDisabled: dateKey < minDate || dateKey > maxDate || !isDateInWeeklyHours(dateKey, settings),
    });
  }

  return cells;
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
  const today = useMemo(() => getTodayInTimeZone(timeZone), [timeZone]);
  const minSelectableDate = useMemo(() => {
    const minNoticeDays = Math.max(0, Math.ceil((settings?.min_notice_minutes || 0) / 1440));
    return addDays(today, minNoticeDays);
  }, [settings?.min_notice_minutes, today]);
  const maxSelectableDate = useMemo(() => {
    const bookingWindowDays = Math.max(0, settings?.booking_window_days || 365);
    return addDays(today, bookingWindowDays);
  }, [settings?.booking_window_days, today]);
  const initialDate = minSelectableDate > today ? minSelectableDate : today;
  const [date, setDate] = useState(initialDate);
  const [viewMonth, setViewMonth] = useState(() => getMonthKey(initialDate));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setDate(initialDate);
    setViewMonth(getMonthKey(initialDate));
  }, [timeZone, today, initialDate]);

  useEffect(() => {
    const form = containerRef.current?.closest('form');
    if (!form) return;

    const handleReset = () => {
      setSelectedSlot(null);
      setError(null);
      setReloadToken((value) => value + 1);
      setDate(initialDate);
      setViewMonth(getMonthKey(initialDate));
    };

    form.addEventListener('reset', handleReset);
    return () => form.removeEventListener('reset', handleReset);
  }, [timeZone, today, initialDate]);

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
  const monthLabel = useMemo(
    () => formatCalendarDate(`${viewMonth}-01`, { month: 'long', year: 'numeric' }),
    [viewMonth]
  );
  const calendarDays = useMemo(
    () => getMonthGrid(viewMonth, date, today, minSelectableDate, maxSelectableDate, settings),
    [date, maxSelectableDate, minSelectableDate, settings, today, viewMonth]
  );

  const helperText = useMemo(() => {
    if (error) return error;
    if (loading) return 'Verfügbare Termine werden geladen ...';
    if (slots.length === 0) return 'Für diesen Tag sind aktuell keine freien Termine verfügbar.';
    return '';
  }, [error, loading, slots.length]);
  const hasError = Boolean(error);
  const selectedDateLabel = useMemo(
    () => formatCalendarDate(date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
    [date]
  );

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-2.5"
    >
      <div className="flex flex-col gap-1">
        <Label
          variant="muted"
          className="uppercase text-[14px]"
        >
          Termin wählen
        </Label>
        <Popover
          open={calendarOpen}
          onOpenChange={(open) => {
            setCalendarOpen(open);
            if (open) {
              setViewMonth(getMonthKey(date));
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full h-[51px] justify-between rounded-[6px] border border-solid border-[#737373]/[0.15] bg-[#d4d4d4]/10 px-[16px] text-left text-[14px] leading-[24px] tracking-[0px] text-[color:var(--0233fdb1-5ec4-4903-9251-1318fc85d18b)] font-[Inter] shadow-none transition-colors hover:bg-[#d4d4d4]/15 hover:border-[#737373]/20 focus-visible:bg-[#d4d4d4]/15 focus-visible:border-[#737373]/20"
              aria-label="Datum wählen"
            >
              <span className="truncate text-[14px] leading-[24px]">{selectedDateLabel}</span>
              <Icon name="calendar" className="size-4 shrink-0 opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="w-[calc(100vw-1rem)] max-w-[24rem] border border-solid border-[#737373]/[0.15] bg-[#fafafa] p-0 shadow-xl sm:w-[24rem]"
          >
            <div className="flex items-center justify-between border-b border-solid border-[#737373]/[0.12] px-3 py-3">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="rounded-[6px] text-muted-foreground hover:bg-[#d4d4d4]/20 hover:text-foreground"
                onClick={() => setViewMonth((current) => shiftMonth(current, -1))}
                aria-label="Vorheriger Monat"
              >
                <Icon name="chevronLeft" className="size-4" />
              </Button>
              <div className="text-[14px] font-medium capitalize tracking-[0.01em]">
                {monthLabel}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="rounded-[6px] text-muted-foreground hover:bg-[#d4d4d4]/20 hover:text-foreground"
                onClick={() => setViewMonth((current) => shiftMonth(current, 1))}
                aria-label="Nächster Monat"
              >
                <Icon name="chevronRight" className="size-4" />
              </Button>
            </div>
            <div className="px-3 pb-3 pt-2">
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="py-1">
                    {label}
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {calendarDays.map((cell) => (
                  <button
                    key={cell.date}
                    type="button"
                    className={cn(
                      'aspect-square rounded-[6px] border border-solid text-[14px] leading-none transition-colors focus:outline-none focus-visible:border-[#737373]/25 focus-visible:bg-[#d4d4d4]/15',
                      cell.isDisabled ? 'cursor-not-allowed border-transparent bg-transparent text-muted-foreground/30 hover:bg-transparent' : 'border-transparent',
                      cell.inCurrentMonth ? 'text-[color:var(--0233fdb1-5ec4-4903-9251-1318fc85d18b)]' : 'text-muted-foreground/50',
                      cell.isSelected && !cell.isDisabled && 'border-[#02121a] bg-[#02121a] text-white shadow-lg ring-2 ring-[#02121a]/10 scale-[1.04]',
                      !cell.isSelected && !cell.isDisabled && 'bg-[#d4d4d4]/10 hover:bg-[#d4d4d4]/15 hover:border-[#737373]/20',
                      cell.isToday && !cell.isSelected && 'ring-1 ring-inset ring-[#737373]/20'
                    )}
                    onClick={() => {
                      if (cell.isDisabled) return;
                      setDate(cell.date);
                      setSelectedSlot(null);
                      setCalendarOpen(false);
                      setViewMonth(getMonthKey(cell.date));
                    }}
                    disabled={cell.isDisabled}
                    aria-label={formatCalendarDate(cell.date, {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                    aria-pressed={cell.isSelected}
                  >
                    {cell.day}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 border-t border-solid border-[#737373]/[0.12] pt-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start rounded-[6px] px-2 text-[14px] text-muted-foreground hover:bg-[#d4d4d4]/15 hover:text-foreground"
                  onClick={() => {
                    setDate(today);
                    setSelectedSlot(null);
                    setViewMonth(getMonthKey(today));
                    setCalendarOpen(false);
                  }}
                >
                  Heute
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-1">
        {helperText ? (
          <div
            className={cn(
              'text-xs leading-5',
              hasError ? 'text-red-600' : 'text-muted-foreground'
            )}
          >
            {hasError ? `Error: ${helperText}` : helperText}
          </div>
        ) : null}
        {slots.length > 0 ? (
          <Label variant="muted">Verfügbare Termine</Label>
        ) : null}
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner />
            Slots laden
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((slot) => {
              const active = selectedSlot?.start_at === slot.start_at;
              return (
                <Button
                  key={slot.start_at}
                  type="button"
                  variant="outline"
                  className={cn(
                    'w-[100%] justify-center rounded-[6px] border border-solid px-[16px] py-[16px] text-[14px] leading-[24px] tracking-[0px] font-[Inter] shadow-none transition-all',
                    active
                      ? 'border-[#02121a] bg-[#02121a] text-white shadow-lg ring-2 ring-[#02121a]/10 scale-[1.01]'
                      : 'border-[#737373]/[0.15] bg-[#d4d4d4]/10 text-[color:var(--0233fdb1-5ec4-4903-9251-1318fc85d18b)] hover:bg-[#d4d4d4]/15 hover:border-[#737373]/20 focus-visible:bg-[#d4d4d4]/15 focus-visible:border-[#737373]/20'
                  )}
                  aria-pressed={active}
                  onClick={() => setSelectedSlot(slot)}
                >
                  <span className="truncate">{slot.label}</span>
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
