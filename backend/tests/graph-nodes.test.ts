import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compareNode } from '../src/graph/nodes/compare-node.js';
import { countNode } from '../src/graph/nodes/count-node.js';
import { fetchJdApiNode } from '../src/graph/nodes/fetch-jd-api-node.js';
import { hitlConfirmNode } from '../src/graph/nodes/hitl-confirm-node.js';
import { jdRewriteNode } from '../src/graph/nodes/jd-rewrite-node.js';
import { redflagsNode } from '../src/graph/nodes/redflags-node.js';
import { salaryNode } from '../src/graph/nodes/salary-node.js';
import {
  extractSlotNumber,
  generateSlots,
  pythonLocalIsoformat,
  scheduleNode,
} from '../src/graph/nodes/schedule-node.js';
import { trendNode } from '../src/graph/nodes/trend-node.js';
import { cleanWebQuery, webIntelNode } from '../src/graph/nodes/web-intel-node.js';
import { FIXED_NOW, fakeDeps, history, makeCandidate, makeJd } from './graph-helpers.js';

function assistantMessages(result: {
  conversation_history?: Array<{ role: string; content: string }>;
}): string[] {
  return (result.conversation_history ?? [])
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content);
}

describe('countNode', () => {
  it('reports zero without touching the LLM', () => {
    const result = countNode({ conversation_history: [], resumes: [] });
    assert.match(assistantMessages(result)[0] ?? '', /^0 — no resumes have been loaded yet/);
  });

  it('reports the loaded resume count', () => {
    const result = countNode({
      conversation_history: [],
      resumes: [makeCandidate(), makeCandidate({ candidate_id: 'candidate-2' })],
    });
    assert.equal(
      assistantMessages(result)[0],
      'There are currently 2 candidate resumes loaded in the system.',
    );
  });
});

describe('compareNode', () => {
  it('asks for candidates when nothing is loaded', () => {
    const result = compareNode({ conversation_history: [] });
    assert.match(assistantMessages(result)[0] ?? '', /No candidates available to compare/);
  });

  it('renders a side-by-side table and picks the top score', () => {
    const alice = makeCandidate({
      candidate_id: 'c-alice',
      name: 'Alice Smith',
      match_score: 91,
      matched_skills: ['Python'],
      gaps: ['Go'],
      experience_years: 6,
    });
    const bob = makeCandidate({
      candidate_id: 'c-bob',
      name: 'Bob Jones',
      match_score: 74,
      matched_skills: ['React'],
      gaps: [],
      experience_years: 3,
    });

    const result = compareNode({
      conversation_history: history(['user', 'compare the candidates']),
      resumes: [alice, bob],
      last_shortlist: [alice, bob],
    });

    const content = assistantMessages(result)[0] ?? '';
    assert.match(content, /### 📊 Candidate Comparison Table/);
    assert.match(content, /\| 1 \| \*\*Alice Smith\*\* \| 91\/100 \| Python \| Go \| 6\.0 yrs \|/);
    assert.match(content, /🏆 \*\*Top Candidate\*\*: \*\*Alice Smith\*\*/);
  });
});

describe('hitlConfirmNode', () => {
  const alice = makeCandidate({ candidate_id: 'alice', name: 'Alice Smith' });
  const bob = makeCandidate({ candidate_id: 'bob', name: 'Bob Jones' });

  it('asks the user to screen first when there is no shortlist', () => {
    const result = hitlConfirmNode({ conversation_history: [], last_shortlist: null });
    assert.match(assistantMessages(result)[0] ?? '', /No shortlist has been screened yet/);
  });

  it('opens a finalize_shortlist gate', () => {
    const result = hitlConfirmNode({
      conversation_history: history(['user', 'finalize the shortlist']),
      last_shortlist: [alice, bob],
    });

    assert.deepEqual(result.pending_confirmation, {
      action: 'finalize_shortlist',
      payload: ['alice', 'bob'],
    });
    assert.equal(
      assistantMessages(result)[0],
      "You're about to finalize 2 candidates: Alice Smith, Bob Jones.\nConfirm? (yes/no/edit)",
    );
  });

  it('locks the shortlist on yes', () => {
    const result = hitlConfirmNode({
      conversation_history: history(['user', 'yes']),
      resumes: [alice, bob],
      pending_confirmation: { action: 'finalize_shortlist', payload: ['alice', 'bob'] },
    });

    assert.equal(result.pending_confirmation, null);
    assert.equal(
      assistantMessages(result)[0],
      '[SUCCESS] **Shortlist Finalized**: Locked in 2 candidates: Alice Smith, Bob Jones.',
    );
  });

  it('replaces the active JD on a replace_jd confirmation', () => {
    const payload = {
      role: 'Growth Engineer',
      required_skills: ['TypeScript'],
      experience_years: 3,
      raw_text: '# Growth Engineer',
      tone: 'startup',
    };
    const result = hitlConfirmNode({
      conversation_history: history(['user', 'yes']),
      pending_confirmation: { action: 'replace_jd', payload },
    });

    assert.equal(result.jd_structured?.role, 'Growth Engineer');
    assert.equal(result.pending_confirmation, null);
    assert.match(
      assistantMessages(result)[0] ?? '',
      /Successfully set active JD to \*\*Growth Engineer\*\*/,
    );
  });

  it('discards the pending action on no', () => {
    const result = hitlConfirmNode({
      conversation_history: history(['user', 'no']),
      pending_confirmation: { action: 'finalize_shortlist', payload: ['alice'] },
    });
    assert.equal(result.pending_confirmation, null);
    assert.equal(
      assistantMessages(result)[0],
      "[CANCELLED]: Proposed changes for 'finalize_shortlist' have been discarded.",
    );
  });

  it('applies named exclusions and keeps the gate open', () => {
    const result = hitlConfirmNode({
      conversation_history: history(['user', 'edit: remove Bob']),
      resumes: [alice, bob],
      last_shortlist: [alice, bob],
      pending_confirmation: { action: 'finalize_shortlist', payload: ['alice', 'bob'] },
    });

    assert.deepEqual(
      result.last_shortlist?.map((candidate) => candidate.candidate_id),
      ['alice'],
    );
    assert.deepEqual(result.pending_confirmation, {
      action: 'finalize_shortlist',
      payload: ['alice'],
    });
    assert.equal(
      assistantMessages(result)[0],
      "Updated shortlist. You're about to finalize 1 candidates: Alice Smith.\nConfirm? (yes/no/edit)",
    );
  });

  it('asks for clarification when an edit cannot be parsed', () => {
    const result = hitlConfirmNode({
      conversation_history: history(['user', 'edit things']),
      resumes: [alice],
      pending_confirmation: { action: 'finalize_shortlist', payload: ['alice'] },
    });
    assert.match(assistantMessages(result)[0] ?? '', /Please reply with 'yes' to confirm/);
  });

  it('asks for clarification on an unrecognised reply', () => {
    const result = hitlConfirmNode({
      conversation_history: history(['user', 'maybe later']),
      pending_confirmation: { action: 'finalize_shortlist', payload: ['alice'] },
    });
    assert.match(assistantMessages(result)[0] ?? '', /I didn't quite catch that/);
  });
});

describe('scheduleNode', () => {
  it('generates slots across the next business days with Python-compatible labels', () => {
    const slots = generateSlots(5, FIXED_NOW);
    assert.equal(slots.length, 5);
    assert.deepEqual(
      slots.map((slot) => slot.label),
      [
        'Monday, November 16 2026 at 10:00 AM',
        'Monday, November 16 2026 at 2:00 PM',
        'Monday, November 16 2026 at 4:00 PM',
        'Tuesday, November 17 2026 at 10:00 AM',
        'Tuesday, November 17 2026 at 2:00 PM',
      ],
    );
  });

  it('formats booked_at like Python naive datetime.isoformat()', () => {
    assert.equal(pythonLocalIsoformat(FIXED_NOW), '2026-11-13T09:30:00');
    assert.equal(
      pythonLocalIsoformat(new Date('2026-11-13T09:30:00.250')),
      '2026-11-13T09:30:00.250000',
    );
    assert.equal(extractSlotNumber('option 3'), 3);
    assert.equal(extractSlotNumber('nothing'), null);
  });

  it('opens a schedule gate for the resolved candidate', () => {
    const deps = fakeDeps();
    const result = scheduleNode(
      {
        conversation_history: history(['user', 'schedule an interview for Alice Smith']),
        resumes: [makeCandidate({ candidate_id: 'c-alice', name: 'Alice Smith' })],
        jd_structured: makeJd({ role: 'Platform Engineer' }),
      },
      deps,
    );

    const pending = result.pending_confirmation as Record<string, unknown>;
    assert.equal(pending.action, 'schedule_interview');
    assert.equal(pending.candidate_id, 'c-alice');
    assert.equal(pending.candidate_name, 'Alice Smith');
    assert.equal(pending.mode, 'video');
    assert.equal(pending.duration_minutes, 30);
    assert.equal((pending.slots as unknown[]).length, 5);
    assert.match(
      assistantMessages(result)[0] ?? '',
      /### 📅 Interview Slots for \*\*Alice Smith\*\* — Platform Engineer/,
    );
  });

  it('books the chosen slot and clears the pending gate', () => {
    const pending = {
      action: 'schedule_interview',
      candidate_id: 'c-alice',
      candidate_name: 'Alice Smith',
      role: 'Platform Engineer',
      slots: generateSlots(5, FIXED_NOW),
      mode: 'video',
      duration_minutes: 30,
    };

    const result = scheduleNode(
      {
        conversation_history: history(['user', '2']),
        pending_confirmation: pending,
        scheduled_interviews: [],
      },
      fakeDeps(),
    );

    assert.equal(result.pending_confirmation, null);
    const interview = result.scheduled_interviews?.[0];
    assert.equal(interview?.candidate_id, 'c-alice');
    assert.equal(interview?.slot, 'Monday, November 16 2026 at 2:00 PM');
    assert.equal(interview?.booked_at, '2026-11-13T09:30:00');
    assert.match(assistantMessages(result)[0] ?? '', /### ✅ Interview Scheduled!/);
  });

  it('re-prompts with the slot list for an invalid selection', () => {
    const result = scheduleNode(
      {
        conversation_history: history(['user', '9']),
        pending_confirmation: {
          action: 'schedule_interview',
          candidate_name: 'Alice Smith',
          slots: generateSlots(5, FIXED_NOW),
        },
      },
      fakeDeps(),
    );

    assert.match(assistantMessages(result)[0] ?? '', /Please select a valid slot number \(1-5\)/);
  });
});

describe('jdRewriteNode', () => {
  it('requires a loaded JD', async () => {
    const result = await jdRewriteNode({ conversation_history: [] }, fakeDeps());
    assert.equal(assistantMessages(result)[0], 'I need a JD loaded first before I can rewrite it.');
  });

  it('stores the grounded rewrite in pending_confirmation', async () => {
    const deps = fakeDeps({
      callLlm: async () => ({ text: '# Rewritten JD', provider: 'gemini', latencyMs: 0 }),
    });
    const result = await jdRewriteNode(
      {
        conversation_history: history(['user', 'rewrite this jd for a startup']),
        jd_structured: makeJd(),
      },
      deps,
    );

    const pending = result.pending_confirmation as {
      action: string;
      payload: Record<string, unknown>;
    };
    assert.equal(pending.action, 'replace_jd');
    assert.equal(pending.payload.role, 'Senior Backend Engineer');
    assert.equal(pending.payload.raw_text, '# Rewritten JD');
    assert.equal(pending.payload.tone, 'startup (energetic, growth-focused, collaborative)');
    assert.match(assistantMessages(result)[0] ?? '', /matching a \*\*startup/);
    assert.equal(result.jd_structured, undefined);
  });

  it('reports LLM failures', async () => {
    const deps = fakeDeps({
      callLlm: async () => {
        throw new Error('boom');
      },
    });
    const result = await jdRewriteNode(
      { conversation_history: history(['user', 'rewrite the jd']), jd_structured: makeJd() },
      deps,
    );
    assert.equal(assistantMessages(result)[0], 'Failed to rewrite JD due to LLM error: boom');
  });
});

describe('fetchJdApiNode', () => {
  it('extracts search parameters and loads the offline JD', async () => {
    const deps = fakeDeps({
      callLlm: async () => ({
        text: '{"query": "Frontend Developer", "location": "Remote"}',
        provider: 'gemini',
        latencyMs: 0,
      }),
    });

    const result = await fetchJdApiNode(
      { conversation_history: history(['user', 'fetch the jd for a frontend dev via api']) },
      deps,
    );

    assert.equal(result.jd_structured?.role, 'Frontend Engineer');
    assert.match(
      assistantMessages(result)[0] ?? '',
      /Successfully fetched live Job Description for \*\*Frontend Engineer\*\* via API/,
    );
  });

  it('falls back to a for/of heuristic when extraction fails', async () => {
    const deps = fakeDeps({
      callLlm: async () => {
        throw new Error('no key');
      },
    });

    const result = await fetchJdApiNode(
      { conversation_history: history(['user', 'fetch the jd for python via api']) },
      deps,
    );

    assert.equal(result.jd_structured?.role, 'Backend Python Developer');
  });
});

describe('redflagsNode', () => {
  it('asks for resumes when none are loaded', async () => {
    const result = await redflagsNode({ conversation_history: [], resumes: [] });
    assert.match(assistantMessages(result)[0] ?? '', /No resumes loaded yet/);
  });

  it('renders cached flags and clean candidates', async () => {
    const flagged = makeCandidate({
      candidate_id: 'c-1',
      name: 'Alice Smith',
      red_flags: ['Unexplained 8-month gap'],
    });
    const clean = makeCandidate({ candidate_id: 'c-2', name: 'Bob Jones', red_flags: [] });

    const result = await redflagsNode({
      conversation_history: history(['user', 'check for red flags']),
      resumes: [flagged, clean],
    });

    const content = assistantMessages(result)[0] ?? '';
    assert.match(content, /### 🔍 Resume Red-Flag Detection Report/);
    assert.match(content, /Analyzed \*\*2\*\* candidate\(s\)/);
    assert.match(content, /#### 👤 Alice Smith/);
    assert.match(content, /\*\*Status:\*\* ⚠️ 1 potential issue\(s\) found/);
    assert.match(content, / {2}- ⚠️ Unexplained 8-month gap/);
    assert.match(content, /#### 👤 Bob Jones/);
    assert.match(content, /\*\*Status:\*\* ✅ No red flags detected/);
    assert.deepEqual(result.resumes, [flagged, clean]);
  });
});

describe('salaryNode', () => {
  it('asks for a role when no JD or explicit role is present', async () => {
    const result = await salaryNode(
      { conversation_history: history(['user', 'what should we pay?']) },
      fakeDeps(),
    );
    assert.match(assistantMessages(result)[0] ?? '', /I need a Job Description loaded first/);
  });

  it('uses the offline benchmark from the JD role', async () => {
    const result = await salaryNode(
      {
        conversation_history: history(['user', 'show the salary range in India']),
        jd_structured: makeJd({ role: 'Senior Full Stack Engineer' }),
      },
      fakeDeps(),
    );

    const content = assistantMessages(result)[0] ?? '';
    assert.match(content, /### Salary Benchmark: \*\*Senior Full Stack Engineer\*\* \(India\)/);
    assert.match(content, /OFFLINE DATA/);
    assert.match(content, /1,500,000 - 3,000,000 INR/);
  });
});

describe('trendNode', () => {
  it('requires a JD', async () => {
    const result = await trendNode({ conversation_history: [] }, fakeDeps());
    assert.match(assistantMessages(result)[0] ?? '', /I need a Job Description loaded first/);
  });

  it('compares JD skills against the offline trend list', async () => {
    const result = await trendNode(
      {
        conversation_history: history(['user', 'market skill demand']),
        jd_structured: makeJd({
          role: 'Python Developer',
          required_skills: ['FastAPI', 'COBOL'],
        }),
      },
      fakeDeps(),
    );

    const content = assistantMessages(result)[0] ?? '';
    assert.match(content, /### 📈 Skill Trend Analysis for \*\*Python Developer\*\*/);
    assert.match(content, /- ✅ \*\*FastAPI\*\*/);
    assert.match(content, /- ⚠️ COBOL/);
    assert.match(content, /\*\*Raw Trend Data:\*\*/);
  });
});

describe('webIntelNode', () => {
  it('strips conversational prefixes', () => {
    // Python's prefix regex consumes "search the web" and leaves "for", so the
    // parity expectation is "for Stripe" rather than "Stripe".
    assert.equal(cleanWebQuery('please search the web for Stripe'), 'for Stripe');
    assert.equal(cleanWebQuery('search the web'), 'the web');
  });

  it('renders the offline notice when Tavily is unconfigured', async () => {
    const result = await webIntelNode(
      { conversation_history: history(['user', 'search the web for Stripe growth']) },
      fakeDeps(),
    );

    const content = assistantMessages(result)[0] ?? '';
    assert.match(content, /### 🌐 Web Intelligence Report/);
    assert.match(content, /\*\*\[OFFLINE NOTICE\]\*\*/);
    assert.match(content, /for Stripe growth/);
  });
});
