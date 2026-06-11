'use client';

/**
 * Form Settings Component
 *
 * Settings panel for form layers with submission handling configuration
 */

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SettingsPanel from './SettingsPanel';
import LinkSettings from './LinkSettings';
import type { Layer, FormSettings as FormSettingsType, LinkSettingsValue, BookingWeekday } from '@/types';

interface FormSettingsProps {
  layer: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

// Simple email validation
const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const WEEKDAYS: BookingWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const WEEKDAY_LABELS: Record<BookingWeekday, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export default function FormSettings({ layer, onLayerUpdate }: FormSettingsProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [emailOpen, setEmailOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(true);
  const [isSmtpEnabled, setIsSmtpEnabled] = useState<boolean | null>(null);
  const [emailToInput, setEmailToInput] = useState('');

  // Check if email is enabled in global settings
  useEffect(() => {
    const checkEmailSettings = async () => {
      try {
        const response = await fetch('/ycode/api/settings/email');
        if (response.ok) {
          const result = await response.json();
          const mode = result.data?.mode;
          const enabled = mode === 'custom' || result.data?.enabled === true;
          setIsSmtpEnabled(enabled);
          if (enabled) {
            setEmailOpen(true);
          }
        } else {
          setIsSmtpEnabled(false);
        }
      } catch {
        setIsSmtpEnabled(false);
      }
    };

    checkEmailSettings();
  }, []);

  // Sync local email input with layer data
  useEffect(() => {
    setEmailToInput(layer?.settings?.form?.email_notification?.to || '');
  }, [layer?.settings?.form?.email_notification?.to]);

  // Get current form settings
  const formSettings: FormSettingsType = layer?.settings?.form || {};
  const successAction = formSettings.success_action || 'message';
  const handleRedirectLinkChange = useCallback(
    (value: LinkSettingsValue | null) => {
      if (!layer) return;

      onLayerUpdate(layer.id, {
        settings: {
          ...layer.settings,
          form: {
            ...layer.settings?.form,
            redirect_url: value ?? undefined,
          },
        },
      });
    },
    [layer, onLayerUpdate]
  );

  const handleSettingChange = useCallback(
    (key: keyof FormSettingsType, value: any) => {
      if (!layer) return;

      onLayerUpdate(layer.id, {
        settings: {
          ...layer.settings,
          form: {
            ...layer.settings?.form,
            [key]: value,
          },
        },
      });
    },
    [layer, onLayerUpdate]
  );

  const handleEmailNotificationChange = useCallback(
    (key: keyof NonNullable<FormSettingsType['email_notification']>, value: any) => {
      if (!layer) return;

      onLayerUpdate(layer.id, {
        settings: {
          ...layer.settings,
          form: {
            ...layer.settings?.form,
            email_notification: {
              ...layer.settings?.form?.email_notification,
              enabled: layer.settings?.form?.email_notification?.enabled ?? false,
              to: layer.settings?.form?.email_notification?.to ?? '',
              [key]: value,
            },
          },
        },
      });
    },
    [layer, onLayerUpdate]
  );

  const isFormLayer = !!layer && layer.name === 'form';
  const isPasswordForm = formSettings.form_type === 'password_protected';

  const emailNotification = formSettings.email_notification || { enabled: false, to: '' };

  const handleEmailToChange = (value: string) => {
    setEmailToInput(value);

    if (isValidEmail(value)) {
      // Valid email: save it and enable notification
      handleEmailNotificationChange('to', value);
      if (!emailNotification.enabled) {
        handleEmailNotificationChange('enabled', true);
      }
    } else if (value === '') {
      // Empty: clear and disable notification
      handleEmailNotificationChange('to', '');
      handleEmailNotificationChange('enabled', false);
    }
    // Invalid non-empty: only update local input, don't save
  };

  const handleEmailToBlur = () => {
    if (emailToInput && !isValidEmail(emailToInput)) {
      // Reset to last valid value on blur
      setEmailToInput(emailNotification.to || '');
    }
  };

  const bookingSettings = formSettings.booking || {};
  const bookingType = formSettings.form_type === 'booking';

  const hasBookingModule = layer?.children?.some((child) => child.name === 'booking_form') ?? false;

  const ensureBookingModule = useCallback(() => {
    if (!layer || layer.name !== 'form' || hasBookingModule) return;

    const bookingModule: Layer = {
      id: `${layer.id}-booking-module`,
      name: 'booking_form',
      customName: 'Termin wählen',
      classes: ['w-full'],
      settings: {
        id: `${layer.settings?.id || layer.id}-booking-module`,
      },
    } as Layer;

    const children = layer.children || [];
    let insertIndex = children.length;
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i].name === 'button') {
        insertIndex = i;
        break;
      }
    }

    const nextChildren = [
      ...children.slice(0, insertIndex),
      bookingModule,
      ...children.slice(insertIndex),
    ];

    onLayerUpdate(layer.id, { children: nextChildren });
  }, [hasBookingModule, layer, onLayerUpdate]);

  useEffect(() => {
    if (bookingType) {
      ensureBookingModule();
    }
  }, [bookingType, ensureBookingModule]);

  const handleBookingSettingChange = useCallback(
    (key: keyof NonNullable<FormSettingsType['booking']>, value: any) => {
      if (!layer) return;

      onLayerUpdate(layer.id, {
        settings: {
          ...layer.settings,
          form: {
            ...layer.settings?.form,
            booking: {
              ...layer.settings?.form?.booking,
              [key]: value,
            },
          },
        },
      });
    },
    [layer, onLayerUpdate]
  );

  const handleWeeklyHourChange = useCallback(
    (day: BookingWeekday, key: 'enabled' | 'start' | 'end', value: any) => {
      const current = formSettings.booking?.weekly_hours || {};
      handleBookingSettingChange('weekly_hours', {
        ...current,
        [day]: {
          ...(current[day] || {}),
          [key]: value,
        },
      });
    },
    [formSettings.booking?.weekly_hours, handleBookingSettingChange]
  );

  // Password-protected forms gate access to locked pages — they are wired to
  // /api/page-auth/verify automatically, so the standard form options
  // (success action, redirect, email notification) don't apply.
  if (!isFormLayer) {
    return null;
  }

  if (isPasswordForm) {
    return (
      <SettingsPanel
        title="Form Settings"
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
      >
        <div className="text-xs text-muted-foreground leading-relaxed">
          This form gates access to password-protected pages. Style it freely;
          the submit handler is wired automatically. On a wrong password, the
          Error alert layer inside the form is shown.
        </div>
      </SettingsPanel>
    );
  }

  const formatBlockedDates = (values?: string[]) => (values || []).join('\n');
  const parseBlockedDates = (value: string) =>
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  const formatBlockedRanges = (ranges?: NonNullable<FormSettingsType['booking']>['blocked_ranges']) =>
    (ranges || []).map((range) => [range.start_at, range.end_at, range.title || '', range.kind || 'custom'].join('|')).join('\n');

  const parseBlockedRanges = (value: string) =>
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [start_at = '', end_at = '', title = '', kind = 'custom'] = line.split('|').map((part) => part.trim());
        if (!start_at || !end_at) return null;
        return {
          start_at,
          end_at,
          title: title || undefined,
          kind: (kind || 'custom') as 'vacation' | 'lunch' | 'holiday' | 'custom',
        };
      })
      .filter(Boolean) as NonNullable<FormSettingsType['booking']>['blocked_ranges'];

  return (
    <>
    <SettingsPanel
      title="Form Settings"
      isOpen={isOpen}
      onToggle={() => setIsOpen(!isOpen)}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3">
          <Label variant="muted">Type</Label>
          <div className="col-span-2 *:w-full">
            <Tabs
              value={bookingType ? 'booking' : 'standard'}
              onValueChange={(value) => handleSettingChange('form_type', value === 'booking' ? 'booking' : 'standard')}
              className="w-full"
            >
              <TabsList className="w-full">
                <TabsTrigger value="standard" className="flex-1 text-xs">Standard</TabsTrigger>
                <TabsTrigger value="booking" className="flex-1 text-xs">Booking</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {bookingType && !hasBookingModule && (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
            The booking slot field is not in the layer tree yet. Add it once here so you can drag it like any other layer.
            <div className="mt-3">
              <button
                type="button"
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                onClick={ensureBookingModule}
              >
                Add Termin wählen field
              </button>
            </div>
          </div>
        )}

        {/* Success Action Toggle */}
        <div className="grid grid-cols-3">
          <Label variant="muted">Success</Label>
          <div className="col-span-2 *:w-full">
            <Tabs
              value={successAction}
              onValueChange={(value) => handleSettingChange('success_action', value)}
              className="w-full"
            >
              <TabsList className="w-full">
                <TabsTrigger value="message" className="flex-1 text-xs">
                  Message
                </TabsTrigger>
                <TabsTrigger value="redirect" className="flex-1 text-xs">
                  Redirect
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Redirect destination - only show when redirect is selected */}
        {successAction === 'redirect' && (
          <LinkSettings
            mode="standalone"
            value={formSettings.redirect_url}
            onChange={handleRedirectLinkChange}
            gridLayout
            typeLabel="Redirect to"
            allowedTypes={['page', 'url']}
            hideBehavior
          />
        )}

      </div>
    </SettingsPanel>

    {bookingType && (
      <SettingsPanel
        title="Booking settings"
        collapsible
        isOpen={bookingOpen}
        onToggle={() => setBookingOpen(!bookingOpen)}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 items-center">
            <Label variant="muted">Timezone</Label>
            <div className="col-span-2">
              <Input
                value={bookingSettings.timezone || 'Europe/Vienna'}
                onChange={(e) => handleBookingSettingChange('timezone', e.target.value)}
                placeholder="Europe/Vienna"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-center">
            <Label variant="muted">Duration</Label>
            <div className="col-span-2">
              <Input
                type="number"
                min="15"
                step="5"
                value={bookingSettings.duration_minutes ?? 50}
                onChange={(e) => handleBookingSettingChange('duration_minutes', Number(e.target.value) || 50)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-center">
            <Label variant="muted">Slot interval</Label>
            <div className="col-span-2">
              <Input
                type="number"
                min="5"
                step="5"
                value={bookingSettings.slot_interval_minutes ?? bookingSettings.duration_minutes ?? 50}
                onChange={(e) => handleBookingSettingChange('slot_interval_minutes', Number(e.target.value) || 50)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-center">
            <Label variant="muted">Buffer before</Label>
            <div className="col-span-2">
              <Input
                type="number"
                min="0"
                step="5"
                value={bookingSettings.buffer_before_minutes ?? 0}
                onChange={(e) => handleBookingSettingChange('buffer_before_minutes', Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-center">
            <Label variant="muted">Buffer after</Label>
            <div className="col-span-2">
              <Input
                type="number"
                min="0"
                step="5"
                value={bookingSettings.buffer_after_minutes ?? 0}
                onChange={(e) => handleBookingSettingChange('buffer_after_minutes', Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-center">
            <Label variant="muted">Window days</Label>
            <div className="col-span-2">
              <Input
                type="number"
                min="1"
                step="1"
                value={bookingSettings.booking_window_days ?? 365}
                onChange={(e) => handleBookingSettingChange('booking_window_days', Number(e.target.value) || 365)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-center">
            <Label variant="muted">Min notice</Label>
            <div className="col-span-2">
              <Input
                type="number"
                min="0"
                step="5"
                value={bookingSettings.min_notice_minutes ?? 0}
                onChange={(e) => handleBookingSettingChange('min_notice_minutes', Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="grid gap-3">
            <Label variant="muted">Lunch break</Label>
            <div className="grid grid-cols-3 gap-3">
              <Input
                type="time"
                value={bookingSettings.lunch_break?.start || '12:00'}
                onChange={(e) => handleBookingSettingChange('lunch_break', {
                  ...(bookingSettings.lunch_break || {}),
                  enabled: true,
                  start: e.target.value,
                  end: bookingSettings.lunch_break?.end || '13:00',
                })}
              />
              <Input
                type="time"
                value={bookingSettings.lunch_break?.end || '13:00'}
                onChange={(e) => handleBookingSettingChange('lunch_break', {
                  ...(bookingSettings.lunch_break || {}),
                  enabled: true,
                  start: bookingSettings.lunch_break?.start || '12:00',
                  end: e.target.value,
                })}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={bookingSettings.lunch_break?.enabled ?? false}
                  onChange={(e) => handleBookingSettingChange('lunch_break', {
                    ...(bookingSettings.lunch_break || {}),
                    enabled: e.target.checked,
                    start: bookingSettings.lunch_break?.start || '12:00',
                    end: bookingSettings.lunch_break?.end || '13:00',
                  })}
                />
                Enabled
              </label>
            </div>
          </div>

          <div className="grid gap-3">
            <Label variant="muted">Working hours</Label>
            <div className="flex flex-col gap-3">
              {WEEKDAYS.map((day) => {
                const current = bookingSettings.weekly_hours?.[day] || { enabled: day !== 'sunday' && day !== 'saturday', start: '09:00', end: '17:00' };
                return (
                  <div key={day} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-2 text-xs text-muted-foreground">{WEEKDAY_LABELS[day]}</div>
                    <label className="col-span-2 flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={current.enabled ?? false}
                        onChange={(e) => handleWeeklyHourChange(day, 'enabled', e.target.checked)}
                      />
                      On
                    </label>
                    <Input
                      className="col-span-4"
                      type="time"
                      value={current.start || '09:00'}
                      onChange={(e) => handleWeeklyHourChange(day, 'start', e.target.value)}
                    />
                    <Input
                      className="col-span-4"
                      type="time"
                      value={current.end || '17:00'}
                      onChange={(e) => handleWeeklyHourChange(day, 'end', e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3">
            <Label variant="muted">Blocked dates</Label>
            <Textarea
              value={formatBlockedDates(bookingSettings.blocked_dates)}
              onChange={(e) => handleBookingSettingChange('blocked_dates', parseBlockedDates(e.target.value))}
              placeholder="2026-12-24&#10;2026-12-25"
              rows={4}
            />
          </div>

          <div className="grid gap-3">
            <Label variant="muted">Blocked ranges</Label>
            <Textarea
              value={formatBlockedRanges(bookingSettings.blocked_ranges)}
              onChange={(e) => handleBookingSettingChange('blocked_ranges', parseBlockedRanges(e.target.value))}
              placeholder="2026-06-10T09:00:00+02:00|2026-06-10T17:00:00+02:00|Vacation|vacation"
              rows={4}
            />
          </div>
        </div>
      </SettingsPanel>
    )}

    <SettingsPanel
      title="Email notification"
      collapsible
      isOpen={emailOpen}
      onToggle={() => setEmailOpen(!emailOpen)}
    >
      {!isSmtpEnabled && isSmtpEnabled !== null && (
        <div className="text-xs text-muted-foreground text-center py-4">
          Configure <Link href="/ycode/settings/email" className="underline hover:text-foreground">Email in Settings</Link> to use email notifications.
        </div>
      )}

      {isSmtpEnabled && (
        <>
          <div className="grid grid-cols-3">
            <Label variant="muted">Send to</Label>
            <div className="col-span-2 *:w-full">
              <Input
                id="email-to"
                type="email"
                value={emailToInput}
                onChange={(e) => handleEmailToChange(e.target.value)}
                onBlur={handleEmailToBlur}
                placeholder="hello@example.com"
              />
            </div>
          </div>

          {emailNotification.enabled && emailNotification.to && (
            <div className="grid grid-cols-3">
              <Label variant="muted">Subject</Label>
              <div className="col-span-2 *:w-full">
                <Input
                  id="email-subject"
                  value={emailNotification.subject || ''}
                  onChange={(e) => handleEmailNotificationChange('subject', e.target.value)}
                  placeholder="New form submission"
                />
              </div>
            </div>
          )}
        </>
      )}
    </SettingsPanel>
  </>
  );
}
