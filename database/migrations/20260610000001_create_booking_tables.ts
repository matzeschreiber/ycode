import type { Knex } from 'knex';

/**
 * Migration: booking calendars, blocks, and bookings
 *
 * The form layer keeps the booking configuration in `settings.form.booking`.
 * These tables store the normalized calendar row, blocked time spans, and
 * booked reservations so the public booking widget can reserve slots
 * atomically and admin users can cancel or add bookings later.
 */

export async function up(knex: Knex): Promise<void> {
  const hasCalendars = await knex.schema.hasTable('booking_calendars');
  if (!hasCalendars) {
    await knex.schema.createTable('booking_calendars', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.text('form_id').notNullable().unique();
      table.uuid('page_id').nullable().index();
      table.jsonb('settings').notNullable().defaultTo('{}');
      table.timestamps(true, true);
      table.timestamp('deleted_at', { useTz: true }).nullable();
    });
  }

  const hasBlocks = await knex.schema.hasTable('booking_blocks');
  if (!hasBlocks) {
    await knex.schema.createTable('booking_blocks', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('calendar_id').notNullable().references('id').inTable('booking_calendars').onDelete('CASCADE');
      table.timestamp('start_at', { useTz: true }).notNullable();
      table.timestamp('end_at', { useTz: true }).notNullable();
      table.boolean('all_day').notNullable().defaultTo(false);
      table.text('title').nullable();
      table.text('kind').notNullable().defaultTo('custom');
      table.jsonb('metadata').notNullable().defaultTo('{}');
      table.timestamps(true, true);
      table.timestamp('deleted_at', { useTz: true }).nullable();
      table.index(['calendar_id', 'start_at', 'end_at']);
    });
  }

  const hasBookings = await knex.schema.hasTable('bookings');
  if (!hasBookings) {
    await knex.schema.createTable('bookings', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('calendar_id').notNullable().references('id').inTable('booking_calendars').onDelete('CASCADE');
      table.text('form_id').notNullable().index();
      table.timestamp('start_at', { useTz: true }).notNullable().index();
      table.timestamp('end_at', { useTz: true }).notNullable();
      table.text('status').notNullable().defaultTo('booked').index();
      table.text('customer_name').nullable();
      table.text('customer_email').nullable();
      table.text('customer_phone').nullable();
      table.jsonb('payload').notNullable().defaultTo('{}');
      table.jsonb('metadata').notNullable().defaultTo('{}');
      table.text('cancellation_reason').nullable();
      table.timestamp('canceled_at', { useTz: true }).nullable();
      table.text('canceled_by').nullable();
      table.timestamps(true, true);
      table.timestamp('deleted_at', { useTz: true }).nullable();
      table.index(['calendar_id', 'status']);
      table.index(['calendar_id', 'start_at', 'end_at']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasBookings = await knex.schema.hasTable('bookings');
  if (hasBookings) {
    await knex.schema.dropTable('bookings');
  }

  const hasBlocks = await knex.schema.hasTable('booking_blocks');
  if (hasBlocks) {
    await knex.schema.dropTable('booking_blocks');
  }

  const hasCalendars = await knex.schema.hasTable('booking_calendars');
  if (hasCalendars) {
    await knex.schema.dropTable('booking_calendars');
  }
}
