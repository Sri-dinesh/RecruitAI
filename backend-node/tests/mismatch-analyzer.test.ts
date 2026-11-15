import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeExperienceMismatch,
  detectRedFlags,
  extractCandidateExperience,
  extractExperienceViaRegex,
  suggestJdImprovements,
} from '../src/services/mismatch-analyzer.js';
import { makeCandidate } from './graph-helpers.js';

describe('extractExperienceViaRegex', () => {
  it('recognises the documented experience phrasings', () => {
    const cases: Array<[string, number]> = [
      ['7+ years of experience', 7],
      ['5 years experience building APIs', 5],
      ['3.5 years in backend engineering', 3.5],
      ['8 yrs as a platform engineer', 8],
      ['Senior engineer with 12 years', 12],
    ];

    for (const [text, expected] of cases) {
      assert.equal(extractExperienceViaRegex(text), expected, text);
    }
  });

  it('keeps the maximum plausible value and ignores out-of-range matches', () => {
    assert.equal(
      extractExperienceViaRegex(
        '2 years at Acme, then 6+ years at Globex, and 41 years of experience',
      ),
      6,
    );
    assert.equal(extractExperienceViaRegex('0.4 years of internship experience'), null);
    assert.equal(extractExperienceViaRegex('No dates in this resume.'), null);
  });
});

describe('extractCandidateExperience', () => {
  it('returns the cached value without scanning the text', async () => {
    const candidate = makeCandidate({ raw_text: '7 years of experience', experience_years: 4 });
    assert.equal(await extractCandidateExperience(candidate), 4);
    assert.equal(candidate.experience_years, 4);
  });

  it('fills in and caches a regex-extracted value', async () => {
    const candidate = makeCandidate({ raw_text: 'Backend engineer with 6 years of experience' });
    assert.equal(await extractCandidateExperience(candidate), 6);
    assert.equal(candidate.experience_years, 6);
  });

  it('falls back to 0.0 when neither regex nor the LLM can answer', async () => {
    const candidate = makeCandidate({ raw_text: 'No dates at all.' });
    assert.equal(await extractCandidateExperience(candidate), 0);
    assert.equal(candidate.experience_years, null);
  });
});

describe('analyzeExperienceMismatch', () => {
  it('reports an empty pool without computing statistics', async () => {
    assert.deepEqual(await analyzeExperienceMismatch(5, []), {
      has_mismatch: false,
      message: 'No candidates loaded to analyze experience mismatch.',
    });
  });

  it('flags a pool where most candidates are under the JD target', async () => {
    const result = await analyzeExperienceMismatch(6, [
      makeCandidate({ candidate_id: 'c-1', name: 'Alice', experience_years: 3 }),
      makeCandidate({ candidate_id: 'c-2', name: 'Bob', experience_years: 5 }),
    ]);

    assert.equal(result.has_mismatch, true);
    assert.equal(result.average_experience, 4);
    assert.equal(result.mismatch_percentage, 100);
    assert.match(
      result.message,
      /Average experience of loaded candidates: \*\*4\.0 years\*\* \(Target JD: \*\*6 years\*\*\)\./,
    );
    assert.match(
      result.message,
      /\*\*100%\*\* of the candidates have less than the required 6 years/,
    );
    assert.match(result.message, /lowering the required experience to \*\*3 years\*\*/);
  });

  it('treats a 50% underqualified pool as a mismatch', async () => {
    const result = await analyzeExperienceMismatch(5, [
      makeCandidate({ candidate_id: 'c-1', name: 'Alice', experience_years: 4 }),
      makeCandidate({ candidate_id: 'c-2', name: 'Bob', experience_years: 6 }),
    ]);

    assert.equal(result.has_mismatch, true);
    assert.equal(result.mismatch_percentage, 50);
    assert.match(result.message, /\*\*50%\*\*/);
  });

  it('reports alignment when the pool meets the target', async () => {
    const result = await analyzeExperienceMismatch(5, [
      makeCandidate({ candidate_id: 'c-1', name: 'Alice', experience_years: 6 }),
      makeCandidate({ candidate_id: 'c-2', name: 'Bob', experience_years: 8 }),
    ]);

    assert.equal(result.has_mismatch, false);
    assert.equal(result.average_experience, 7);
    assert.equal(result.mismatch_percentage, 0);
    assert.match(
      result.message,
      /Candidate experience distribution aligns well with the job description requirements\./,
    );
  });

  it('derives experience from resume text when the field is missing', async () => {
    const result = await analyzeExperienceMismatch(5, [
      makeCandidate({ candidate_id: 'c-1', name: 'Alice', raw_text: '9 years of experience' }),
      makeCandidate({ candidate_id: 'c-2', name: 'Bob', raw_text: '2 yrs of experience' }),
    ]);

    assert.equal(result.average_experience, 5.5);
    assert.equal(result.mismatch_percentage, 50);
  });
});

describe('suggestJdImprovements', () => {
  it('returns an empty list when the LLM is unavailable', async () => {
    assert.deepEqual(await suggestJdImprovements('We need a backend engineer.'), []);
  });
});

describe('detectRedFlags', () => {
  it('returns cached flags without another LLM call', async () => {
    const candidate = makeCandidate({ red_flags: ['Unexplained 8-month gap'] });
    assert.deepEqual(await detectRedFlags(candidate), ['Unexplained 8-month gap']);
  });

  it('caches an empty analysis and returns [] when the LLM is unavailable', async () => {
    const candidate = makeCandidate({ raw_text: 'A clean looking resume.' });
    assert.deepEqual(await detectRedFlags(candidate), []);
    assert.equal(candidate.red_flags, null);
  });
});
