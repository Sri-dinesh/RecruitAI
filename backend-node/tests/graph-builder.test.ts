import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GRAPH_NODE_NAMES,
  buildRecruitGraph,
  fallbackNode,
  getRecruitGraph,
  resetRecruitGraphForTests,
  routeToSubagent,
} from '../src/graph/builder.js';
import { END } from '../src/graph/runtime.js';
import type { RecruitState } from '../src/graph/state.js';
import { resetTelemetryForTests } from '../src/telemetry/logging.js';
import { fakeDeps, history, makeCandidate, makeJd, memoryCandidates } from './graph-helpers.js';

function assistantMessages(state: RecruitState): string[] {
  return (state.conversation_history ?? [])
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content);
}

function lastAssistant(state: RecruitState): string {
  const messages = assistantMessages(state);
  return messages[messages.length - 1] ?? '';
}

describe('graph topology', () => {
  it('registers the supervisor, the four specialist groups and END branches', () => {
    const graph = buildRecruitGraph(fakeDeps());

    assert.equal(graph.entry, 'supervisor_agent');
    assert.deepEqual(graph.nodes, [...GRAPH_NODE_NAMES]);
    assert.deepEqual(GRAPH_NODE_NAMES, [
      'supervisor_agent',
      'jd_agent',
      'screening_agent',
      'interview_salary_agent',
      'hitl_confirm',
      'fallback',
    ]);
  });

  it('maps every supported intent to its owning agent', () => {
    const cases: Array<[string | null, string]> = [
      ['load_context', 'jd_agent'],
      ['rewrite_jd', 'jd_agent'],
      ['fetch_jd_api', 'jd_agent'],
      ['screen', 'screening_agent'],
      ['count', 'screening_agent'],
      ['compare', 'screening_agent'],
      ['redflags', 'screening_agent'],
      ['query_candidate', 'screening_agent'],
      ['interview_questions', 'interview_salary_agent'],
      ['salary', 'interview_salary_agent'],
      ['email', 'interview_salary_agent'],
      ['trend', 'interview_salary_agent'],
      ['schedule', 'interview_salary_agent'],
      ['web_intel', 'interview_salary_agent'],
      ['finalize_shortlist', 'hitl_confirm'],
      ['other', 'fallback'],
      ['nonsense', 'fallback'],
      [null, 'fallback'],
    ];

    for (const [intent, agent] of cases) {
      assert.equal(routeToSubagent({ last_intent: intent }), agent, String(intent));
    }
  });

  it('memoises the process-wide graph and resets it for tests', () => {
    resetRecruitGraphForTests();
    const first = getRecruitGraph();
    assert.equal(getRecruitGraph(), first);
    resetRecruitGraphForTests();
    assert.notEqual(getRecruitGraph(), first);
  });

  it('keeps the fallback message intact', () => {
    const result = fallbackNode({ conversation_history: history(['user', 'what?']) });
    assert.equal(result.last_intent, 'other');
    assert.match(
      assistantMessages(result as RecruitState)[0] ?? '',
      /I didn't quite understand your request/,
    );
  });
});

describe('supervisor intent routing', () => {
  it('routes a count question to the screening agent', async () => {
    const graph = buildRecruitGraph(fakeDeps());
    const result = await graph.invoke({
      conversation_history: history(['user', 'how many candidates do we have?']),
      resumes: memoryCandidates(),
    });

    assert.equal(result.last_intent, 'count');
    assert.equal(
      lastAssistant(result),
      'There are currently 2 candidate resumes loaded in the system.',
    );
  });

  it('routes greetings and unclassifiable text to the fallback agent', async () => {
    const graph = buildRecruitGraph(fakeDeps());
    const result = await graph.invoke({
      conversation_history: history(['user', 'hi']),
    });

    assert.equal(result.last_intent, 'other');
    assert.match(lastAssistant(result), /Here are some of the things I can help you with/);
  });

  it('stops after the single routed agent (no second hop)', async () => {
    const graph = buildRecruitGraph(fakeDeps());
    const result = await graph.invoke({
      conversation_history: history(['user', 'how many candidates?']),
      resumes: [makeCandidate()],
    });

    // Exactly one new assistant message was appended by the specialist.
    assert.equal(assistantMessages(result).length, 1);
  });
});

describe('supervisor conversational memory', () => {
  it('resolves a pronoun to the candidate discussed earlier', async () => {
    const graph = buildRecruitGraph(
      fakeDeps({
        callLlm: async () => ({ text: 'Alex knows Python.', provider: 'gemini', latencyMs: 0 }),
      }),
    );
    const resumes = memoryCandidates();

    const first = await graph.invoke({
      conversation_history: history(['user', 'what are the skills of Alex Morgan?']),
      resumes,
      jd_structured: makeJd(),
    });
    assert.equal(first.last_intent, 'query_candidate');
    assert.equal(first.active_candidate_id, 'c-alex');

    const second = await graph.invoke({
      ...first,
      conversation_history: [
        ...(first.conversation_history ?? []),
        { role: 'user', content: 'email him about the role' },
      ],
    });

    assert.equal(second.last_intent, 'email');
    assert.equal(second.active_candidate_id, 'c-alex');
    assert.match(
      lastAssistant(second),
      /### ✉️ Email Draft: \*\*Interview Invite\*\* for \*\*Alex Morgan\*\*/,
    );
  });

  it('continues an explicit "which candidate" follow-up without re-asking', async () => {
    const graph = buildRecruitGraph(
      fakeDeps({
        callLlm: async () => ({ text: 'Grounded question.', provider: 'gemini', latencyMs: 0 }),
      }),
    );

    const state: RecruitState = {
      conversation_history: history(
        ['user', 'interview questions'],
        ['assistant', 'Which candidate would you like to generate interview questions for?'],
        ['user', 'for Alex Morgan'],
      ),
      jd_structured: makeJd({ role: 'Backend Engineer' }),
      resumes: memoryCandidates(),
    };

    const result = await graph.invoke(state);
    assert.equal(result.last_intent, 'interview_questions');
    assert.match(
      lastAssistant(result),
      /### 👤 Interview Prep Questions for \*\*Alex Morgan\*\* \(Backend Engineer\)/,
    );
  });
});

describe('supervisor pending-confirmation handling', () => {
  const alice = makeCandidate({ candidate_id: 'c-alice', name: 'Alice Smith' });
  const bob = makeCandidate({ candidate_id: 'c-bob', name: 'Bob Jones' });

  it('opens a HITL gate and finalizes the shortlist on yes (two turns)', async () => {
    const graph = buildRecruitGraph(fakeDeps());

    const opened = await graph.invoke({
      conversation_history: history(['user', 'finalize the shortlist']),
      resumes: [alice, bob],
      last_shortlist: [alice, bob],
    });

    assert.equal(opened.last_intent, 'finalize_shortlist');
    assert.deepEqual(opened.pending_confirmation, {
      action: 'finalize_shortlist',
      payload: ['c-alice', 'c-bob'],
    });
    assert.match(lastAssistant(opened), /You're about to finalize 2 candidates/);

    const confirmed = await graph.invoke({
      ...opened,
      conversation_history: [
        ...(opened.conversation_history ?? []),
        { role: 'user', content: 'yes' },
      ],
    });

    assert.equal(confirmed.pending_confirmation, null);
    assert.match(
      lastAssistant(confirmed),
      /\[SUCCESS\] \*\*Shortlist Finalized\*\*: Locked in 2 candidates: Alice Smith, Bob Jones\./,
    );
  });

  it('keeps the gate open for an ambiguous reply', async () => {
    const graph = buildRecruitGraph(fakeDeps());
    const pending = { action: 'finalize_shortlist', payload: ['c-alice'] };

    const result = await graph.invoke({
      conversation_history: history(
        ['user', 'finalize the shortlist'],
        [
          'assistant',
          "You're about to finalize 1 candidates: Alice Smith.\nConfirm? (yes/no/edit)",
        ],
        ['user', 'Alice'],
      ),
      resumes: [alice],
      last_shortlist: [alice],
      pending_confirmation: pending,
    });

    assert.equal(result.last_intent, 'finalize_shortlist');
    assert.deepEqual(result.pending_confirmation, pending);
    assert.match(lastAssistant(result), /I didn't quite catch that/);
  });

  it('discards a stale gate when a high-confidence new command arrives', async () => {
    const graph = buildRecruitGraph(fakeDeps());

    const result = await graph.invoke({
      conversation_history: history(['user', 'how many candidates do we have?']),
      resumes: [alice, bob],
      pending_confirmation: { action: 'finalize_shortlist', payload: ['c-alice'] },
    });

    assert.equal(result.pending_confirmation, null);
    assert.equal(result.last_intent, 'count');
    assert.equal(
      lastAssistant(result),
      'There are currently 2 candidate resumes loaded in the system.',
    );
  });

  it('books a schedule slot on a numeric reply (two turns)', async () => {
    const graph = buildRecruitGraph(fakeDeps());

    const opened = await graph.invoke({
      conversation_history: history(['user', 'schedule an interview with Alice Smith']),
      resumes: [alice],
      jd_structured: makeJd({ role: 'Platform Engineer' }),
    });

    const pending = opened.pending_confirmation as Record<string, unknown>;
    assert.equal(opened.last_intent, 'schedule');
    assert.equal(pending.action, 'schedule_interview');
    assert.equal(pending.candidate_id, 'c-alice');
    assert.match(lastAssistant(opened), /### 📅 Interview Slots for \*\*Alice Smith\*\*/);

    const booked = await graph.invoke({
      ...opened,
      conversation_history: [
        ...(opened.conversation_history ?? []),
        { role: 'user', content: '2' },
      ],
    });

    assert.equal(booked.pending_confirmation, null);
    assert.equal(booked.scheduled_interviews?.length, 1);
    assert.equal(booked.scheduled_interviews?.[0]?.slot, 'Monday, November 16 2026 at 2:00 PM');
    assert.equal(booked.scheduled_interviews?.[0]?.booked_at, '2026-11-13T09:30:00');
    assert.match(lastAssistant(booked), /### ✅ Interview Scheduled!/);
  });
});

describe('graph execution', () => {
  it('does not mutate the caller state and always ends', async () => {
    resetTelemetryForTests();
    const graph = buildRecruitGraph(fakeDeps());
    const initial: RecruitState = {
      conversation_history: history(['user', 'how many candidates?']),
      resumes: [makeCandidate(), makeCandidate({ candidate_id: 'candidate-2' })],
    };

    const result = await graph.invoke(initial);

    assert.equal(initial.conversation_history?.length, 1);
    assert.equal(result.conversation_history?.length, 2);
    assert.equal(END, '__end__');
  });
});
