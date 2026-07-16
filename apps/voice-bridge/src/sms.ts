// Booking-confirmation SMS, fire-and-forget. Trial Twilio accounts can only
// message verified numbers, so a send failure is expected in dev and must
// NEVER affect the booking that triggered it — we log and move on.

import twilio from 'twilio';
import { config } from './config.js';
import type { CallSession } from './session.js';

export interface BookingSmsOptions {
  /** E.164 destination (the patient/lead's normalized phone) */
  to: string;
  /** Human date/time already rendered in the tenant's timezone */
  spokenTime: string;
}

/**
 * Send a booking confirmation SMS. Synchronous no-op when Twilio SMS is not
 * configured or the tenant disabled confirmations; otherwise fires in the
 * background and only logs the outcome.
 */
export function sendBookingConfirmationSms(session: CallSession, opts: BookingSmsOptions): void {
  const { tenant } = session;

  // Tenant opt-out: agent_config.booking_policy.sms_confirmations === false
  const policy = tenant.bookingPolicy as Record<string, unknown>;
  if (policy.sms_confirmations === false) return;

  if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioPhoneNumber) {
    console.log(`[call ${session.callId}] sms confirmation skipped (Twilio SMS not configured)`);
    return;
  }
  if (!opts.to) return;

  const booking = tenant.vertical.terminology.booking.toLowerCase();
  const lines = [
    `${tenant.clinic.name}: your ${booking} is confirmed for ${opts.spokenTime}.`,
    tenant.clinic.address ? `Address: ${tenant.clinic.address}` : '',
    tenant.clinic.contact_phone ? `Questions? Call ${tenant.clinic.contact_phone}.` : '',
  ].filter(Boolean);

  const client = twilio(config.twilioAccountSid, config.twilioAuthToken);
  void client.messages
    .create({ from: config.twilioPhoneNumber, to: opts.to, body: lines.join('\n') })
    .then((msg) => {
      console.log(`[call ${session.callId}] sms confirmation sent (${msg.sid}) to ${opts.to}`);
    })
    .catch((err: unknown) => {
      // e.g. Twilio trial: "The number ... is unverified" — booking already succeeded.
      console.error(
        `[call ${session.callId}] sms confirmation failed (booking unaffected):`,
        err instanceof Error ? err.message : err,
      );
    });
}
