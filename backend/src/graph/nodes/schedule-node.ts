import type { PendingConfirmation, RecruitState, ScheduledInterview } from '../state.js';
import { resolveCandidateWithMemory } from '../router.js';
import { getGraphDeps, type GraphDeps } from '../deps.js';
import { historyOf } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/schedule_node.py`.
 *
 * Mock calendar scheduler: the first turn proposes five slots over the next
 * business days and stores them in `pending_confirmation`; the next reply that
 * selects a valid slot books the interview and clears the pending gate.
 */

export const BUSINESS_DAY_SLOTS = ['10:00 AM', '2:00 PM', '4:00 PM'] as const;

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface InterviewSlot {
  readonly slot_number: number;
  readonly date: string;
  readonly time: string;
  readonly label: string;
}

interface PendingSchedule extends PendingConfirmation {
  action: 'schedule_interview';
  candidate_id: string | null;
  candidate_name: string;
  role: string;
  slots: InterviewSlot[];
  mode: string;
  duration_minutes: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** Python `%A, %B %d %Y` (no comma before the year). */
function formatDateLabel(date: Date): string {
  return (
    `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ` +
    `${pad(date.getDate())} ${date.getFullYear()}`
  );
}

/** Python naive `datetime.now().isoformat()` (local time, microseconds). */
export function pythonLocalIsoformat(date: Date): string {
  const base =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const micros = date.getMilliseconds() * 1000;
  return micros === 0 ? base : `${base}.${pad(micros, 6)}`;
}

/** Returns the next n business days (Mon-Fri) starting tomorrow. */
export function nextBusinessDays(n: number, now: Date = new Date()): Date[] {
  const days: Date[] = [];
  const current = new Date(now.getTime());
  while (days.length < n) {
    // `setDate` keeps the local wall clock across DST boundaries, matching
    // naive `timedelta(days=1)` arithmetic.
    current.setDate(current.getDate() + 1);
    const weekday = current.getDay();
    if (weekday >= 1 && weekday <= 5) {
      days.push(new Date(current.getTime()));
    }
  }
  return days;
}

/** Generates n slots across the next business days. */
export function generateSlots(n = 5, now: Date = new Date()): InterviewSlot[] {
  const businessDays = nextBusinessDays(5, now);
  const slots: InterviewSlot[] = [];
  let index = 1;

  for (const day of businessDays) {
    for (const time of BUSINESS_DAY_SLOTS) {
      if (index > n) {
        break;
      }
      const date = formatDateLabel(day);
      slots.push({
        slot_number: index,
        date,
        time,
        label: `${date} at ${time}`,
      });
      index += 1;
    }
    if (index > n) {
      break;
    }
  }

  return slots;
}

function extractCandidateInfo(
  query: string,
  state: RecruitState,
): { candidateId: string | null; candidateName: string | null } {
  const resumes = state.resumes?.length ? state.resumes : (state.last_shortlist ?? []);

  // Supervisor-resolved memory wins (covers pronouns and bare follow-ups).
  const activeId = state.active_candidate_id ?? null;
  if (activeId) {
    const active = resumes.find((candidate) => candidate.candidate_id === activeId);
    if (active) {
      return { candidateId: active.candidate_id, candidateName: active.name };
    }
  }

  const resolvedId = resolveCandidateWithMemory(query, state, 'schedule');
  if (resolvedId) {
    const resolved = resumes.find((candidate) => candidate.candidate_id === resolvedId);
    if (resolved) {
      return { candidateId: resolved.candidate_id, candidateName: resolved.name };
    }
    return { candidateId: resolvedId, candidateName: null };
  }

  const match = /\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/.exec(query);
  if (match?.[1]) {
    const name = match[1];
    const named = resumes.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
    if (named) {
      return { candidateId: named.candidate_id, candidateName: named.name };
    }
    return { candidateId: null, candidateName: name };
  }

  return { candidateId: null, candidateName: null };
}

/** Detect a slot selection such as `1`, `slot 2`, `option 3`, `pick 1`. */
export function extractSlotNumber(query: string): number | null {
  const match = /\b(?:slot|option|number|pick|choose|select|go with)?\s*([1-5])\b/.exec(
    query.toLowerCase(),
  );
  return match?.[1] ? Number(match[1]) : null;
}

function scheduleSlotsOf(pending: Record<string, unknown>): InterviewSlot[] {
  const rawSlots = pending.slots;
  return Array.isArray(rawSlots) ? (rawSlots as InterviewSlot[]) : [];
}

export function scheduleNode(
  state: RecruitState,
  deps: GraphDeps = getGraphDeps(),
): Partial<RecruitState> {
  const history = historyOf(state);
  const userMessage = history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';
  const pendingRecord = asRecord(state.pending_confirmation);
  const pending = pendingRecord && Object.keys(pendingRecord).length > 0 ? pendingRecord : null;

  // --- Case 1: a pending schedule confirmation means this is a slot reply ---
  if (pending && pending.action === 'schedule_interview') {
    const slotNumber = extractSlotNumber(userMessage);
    const slots = scheduleSlotsOf(pending);
    const candidateName =
      typeof pending.candidate_name === 'string' && pending.candidate_name.length > 0
        ? pending.candidate_name
        : 'the candidate';

    if (slotNumber && slotNumber >= 1 && slotNumber <= slots.length) {
      const chosen = slots[slotNumber - 1] as InterviewSlot;
      const scheduledInterviews = state.scheduled_interviews ?? [];
      const interview: ScheduledInterview = {
        candidate_id: typeof pending.candidate_id === 'string' ? pending.candidate_id : null,
        candidate_name: candidateName,
        slot: chosen.label,
        booked_at: pythonLocalIsoformat(deps.now()),
        mode: typeof pending.mode === 'string' ? pending.mode : 'video',
        duration_minutes:
          typeof pending.duration_minutes === 'number' ? pending.duration_minutes : 30,
      };

      const confirmationMessage =
        '### ✅ Interview Scheduled!\n\n' +
        `**Candidate:** ${candidateName}\n` +
        `**Date & Time:** ${chosen.label}\n\n` +
        '*A calendar invite and confirmation email would be sent in production.*';

      return {
        pending_confirmation: null,
        scheduled_interviews: [...scheduledInterviews, interview],
        conversation_history: [...history, { role: 'assistant', content: confirmationMessage }],
      };
    }

    const slotList = slots.map((slot) => `${slot.slot_number}. ${slot.label}`).join('\n');
    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content: `Please select a valid slot number (1-${slots.length}):\n\n${slotList}`,
        },
      ],
    };
  }

  // --- Case 2: a new scheduling request generates the slots ---
  const { candidateId, candidateName } = extractCandidateInfo(userMessage, state);
  const jd = state.jd_structured ?? null;
  const role = jd ? jd.role : 'the position';
  const slots = generateSlots(5, deps.now());

  const slotLines = [
    `### 📅 Interview Slots for **${candidateName ?? 'Candidate'}** — ${role}\n`,
    'Please select a time slot by replying with the slot number:\n',
  ];
  for (const slot of slots) {
    slotLines.push(`**${slot.slot_number}.** ${slot.label}`);
  }
  slotLines.push('\n*Reply with a number (1–5) to confirm the booking.*');

  const pendingData: PendingSchedule = {
    action: 'schedule_interview',
    candidate_id: candidateId,
    candidate_name: candidateName ?? 'Candidate',
    role,
    slots,
    mode: 'video',
    duration_minutes: 30,
  };

  return {
    pending_confirmation: pendingData,
    conversation_history: [...history, { role: 'assistant', content: slotLines.join('\n') }],
  };
}
