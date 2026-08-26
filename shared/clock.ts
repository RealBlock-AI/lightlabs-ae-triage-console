/**
 * The clocks an interaction is read against.
 *
 * Two different promises live on an interaction and they are not the same
 * number. slaMinutes is the resolution target (15 / 30 / 60 by lane). The clock
 * the AE actually watches is the acknowledgement promise, and it is short - so
 * it is shown in minutes and seconds and turns the escalate colour under a
 * minute.
 *
 * This lives in shared/ because the queue computes it on the server at fetch
 * time while the packet ticks it in the browser, and the two must never
 * disagree about the same item.
 */

export const ACK_PROMISE_SECONDS = 120;

/** Past this much overdue, a countdown stops being information. */
const MISSED_AFTER_SECONDS = 60 * 60;

export function ageMinutes(receivedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - receivedAt.getTime()) / 60_000));
}

export function ageLabel(receivedAt: Date, now: Date): string {
  const minutes = ageMinutes(receivedAt, now);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

export function ackClock(receivedAt: Date, now: Date, promiseSeconds = ACK_PROMISE_SECONDS) {
  const elapsed = Math.floor((now.getTime() - receivedAt.getTime()) / 1000);
  const remaining = promiseSeconds - elapsed;
  // A four-digit negative countdown on a day-old row is noise, not urgency, and
  // it drags the column wide enough to unbalance the table.
  if (-remaining > MISSED_AFTER_SECONDS) return { label: "missed", urgent: true };
  const shown = Math.abs(remaining);
  const label = `${remaining < 0 ? "-" : ""}${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, "0")}`;
  // Under a minute left, or already past. Both want the AE's eye.
  return { label, urgent: remaining < 60 };
}
