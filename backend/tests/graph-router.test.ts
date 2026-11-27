import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  candidateIdsInText,
  llmClassify,
  resolveCandidateReference,
  resolveCandidateWithMemory,
  resolveCandidatesWithMemory,
  routeAndLog,
  ruleBasedClassify,
} from '../src/graph/router.js';
import { resetTelemetryForTests } from '../src/telemetry/logging.js';
import { history, makeCandidate, makeJd, memoryCandidates } from './graph-helpers.js';

beforeEach(() => {
  resetTelemetryForTests();
});

describe('ruleBasedClassify', () => {
  const cases: Array<[string, string]> = [
    ['1', 'load_context'],
    ['two', 'count'],
    ['3', 'screen'],
    ['4', 'rewrite_jd'],
    ['5', 'interview_questions'],
    ['6', 'salary'],
    ['7', 'finalize_shortlist'],
    ['load the jd and resumes', 'load_context'],
    ['how many candidates do we have?', 'count'],
    ['screen candidates', 'screen'],
    ['rank the candidate against the jd', 'screen'],
    ['finalize the shortlist', 'finalize_shortlist'],
    ['compare Alice and Bob', 'compare'],
    ['send mail to Alex', 'email'],
    ['what skills are trending for python', 'query_candidate'],
    ['show me market skill demand', 'trend'],
    ['schedule an interview with Alex', 'schedule'],
    ['check the resume for a red flag', 'redflags'],
    ['fetch the jd from the api', 'fetch_jd_api'],
    ['rewrite this jd for a startup', 'rewrite_jd'],
    ['interview questions for Alice', 'interview_questions'],
    ['what is the salary for this role', 'salary'],
    ['search the web for Stripe', 'web_intel'],
    ['what are the skills of Alex Morgan?', 'query_candidate'],
    ['hi', 'other'],
  ];

  for (const [query, intent] of cases) {
    it(`classifies ${JSON.stringify(query)} as ${intent}`, () => {
      assert.deepEqual(ruleBasedClassify(query), { intent, confidence: 1.0 });
    });
  }

  it('returns null when no rule matches', () => {
    assert.equal(ruleBasedClassify('tell me a joke about giraffes'), null);
  });
});

describe('routeAndLog', () => {
  it('logs a rule hit at confidence 1.0 and resolves the candidate', async () => {
    const state = { resumes: memoryCandidates(), conversation_history: [] };
    const result = await routeAndLog('draft an email for Alex', state);

    assert.equal(result.intent, 'email');
    assert.equal(result.confidence, 1.0);
    assert.equal(result.resolvedCandidate, 'c-alex');
  });

  it('degrades an unclassifiable query to other/0.5 through the LLM fallback', async () => {
    // No GEMINI_API_KEY is configured in the test environment, so the real
    // provider call fails and the router must apply its safe fallback.
    const result = await llmClassify('tell me a joke about giraffes');
    assert.equal(result.intent, 'other');
    assert.equal(result.confidence, 0.5);
    assert.equal(result.provider, 'none');

    const routed = await routeAndLog('tell me a joke about giraffes', {
      resumes: [],
      conversation_history: [],
    });
    assert.equal(routed.intent, 'other');
    assert.equal(routed.confidence, 0.5);
    assert.equal(routed.resolvedCandidate, null);
  });
});

describe('resolveCandidateReference', () => {
  const state = {
    jd_structured: makeJd(),
    resumes: memoryCandidates(),
    conversation_history: [],
    last_shortlist: [
      makeCandidate({ candidate_id: 'c-bob', name: 'Bob Carter' }),
      makeCandidate({ candidate_id: 'c-alex', name: 'Alex Morgan' }),
    ],
  };

  it('matches a full name, a name token, or a shortlist ordinal', () => {
    assert.equal(resolveCandidateReference('what about Alex Morgan?', state), 'c-alex');
    assert.equal(resolveCandidateReference('tell me about carter', state), 'c-bob');
    assert.equal(resolveCandidateReference('the top candidate', state), 'c-bob');
    assert.equal(resolveCandidateReference('the second candidate', state), 'c-alex');
  });

  it('falls back to the only loaded candidate for a short query', () => {
    const single = {
      resumes: [makeCandidate({ candidate_id: 'only-one', name: 'Solo Person' })],
      conversation_history: [],
    };
    assert.equal(resolveCandidateReference('send mail', single), 'only-one');
  });

  it('returns null with no candidates or no match', () => {
    assert.equal(resolveCandidateReference('Alex', { resumes: [] }), null);
    assert.equal(
      resolveCandidateReference('nobody here', {
        resumes: memoryCandidates(),
        conversation_history: [],
      }),
      null,
    );
  });
});

describe('conversational entity memory', () => {
  it('resolves a pronoun to the last discussed candidate', () => {
    const state = {
      resumes: memoryCandidates(),
      conversation_history: history(
        ['user', 'what are the skills of Alex Morgan?'],
        ['assistant', 'Alex knows Python.'],
        ['user', 'send him an invite'],
      ),
    };

    assert.equal(resolveCandidateWithMemory('send him an invite', state, 'email'), 'c-alex');
  });

  it('inherits the focused candidate for a bare entity follow-up', () => {
    const state = {
      resumes: memoryCandidates(),
      conversation_history: history(),
      focused_candidate_id: 'c-bob',
    };

    assert.equal(resolveCandidateWithMemory('send mail', state, 'email'), 'c-bob');
  });

  it('does not let role-level intents inherit memory', () => {
    const state = {
      resumes: memoryCandidates(),
      conversation_history: history(['user', 'Alex Morgan is strong']),
      focused_candidate_id: 'c-alex',
    };

    assert.equal(resolveCandidateWithMemory('salary range', state, 'salary'), null);
  });

  it('lets an explicit name override memory', () => {
    const state = {
      resumes: memoryCandidates(),
      conversation_history: history(['user', 'Alex Morgan is strong']),
      focused_candidate_id: 'c-alex',
    };

    assert.equal(resolveCandidateWithMemory('send mail to Bob', state, 'email'), 'c-bob');
  });

  it('resolves plural references for compare/mail flows', () => {
    const state = {
      resumes: memoryCandidates(),
      conversation_history: history(
        ['user', 'compare Alex Morgan and Bob Carter'],
        ['assistant', '| Alex | Bob |'],
        ['user', 'mail them'],
      ),
    };

    assert.deepEqual(resolveCandidatesWithMemory('mail them', state), ['c-alex', 'c-bob']);
  });

  it('collects explicit mentions in text order, deduplicated', () => {
    assert.deepEqual(candidateIdsInText('Bob and Alex and Bob', memoryCandidates()), [
      'c-alex',
      'c-bob',
    ]);
  });
});
