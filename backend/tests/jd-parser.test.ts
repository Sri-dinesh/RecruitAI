import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleanFilenameToTitle,
  heuristicExtractExperience,
  heuristicExtractPattern,
  heuristicExtractRole,
  heuristicExtractSkills,
  parseStructuredJd,
} from '../src/services/jd-parser.js';

const JD_TEXT = [
  'Job Title: Senior Backend Engineer',
  'Company: ACME Corp',
  'Location: Remote',
  'We need 5+ years of experience building APIs.',
  'Required: Python, FastAPI, PostgreSQL, Docker and AWS.',
].join('\n');

describe('cleanFilenameToTitle', () => {
  it('strips JD noise and title-cases the stem', () => {
    assert.equal(cleanFilenameToTitle('senior_backend_jd.pdf'), 'Senior Backend');
    assert.equal(cleanFilenameToTitle('job-description-copy.docx'), '');
    assert.equal(cleanFilenameToTitle(''), '');
  });
});

describe('JD heuristics', () => {
  it('reads a labelled role before a generic title line', () => {
    assert.equal(heuristicExtractRole(JD_TEXT, ''), 'Senior Backend Engineer');
    // Python's second pattern allows `\s` (including newlines) inside the
    // capture, so the whole remainder is title-cased.
    assert.equal(heuristicExtractRole('Staff Engineer\nbody', ''), 'Staff Engineer\nBody');
    assert.equal(heuristicExtractRole('123', 'senior_backend_jd.pdf'), 'Senior Backend');
  });

  it('falls back to generic skills when nothing is recognised', () => {
    assert.deepEqual(heuristicExtractSkills('no known technology here'), [
      'Software Development',
      'Problem Solving',
    ]);
  });

  it('extracts recognised skills in keyword order', () => {
    assert.deepEqual(heuristicExtractSkills(JD_TEXT), [
      'Python',
      'FastAPI',
      'PostgreSQL',
      'Docker',
      'AWS',
    ]);
  });

  it('reads years of experience and labelled fields', () => {
    assert.equal(heuristicExtractExperience(JD_TEXT), 5);
    assert.equal(heuristicExtractExperience('no numbers'), 2);
    assert.equal(
      heuristicExtractPattern(JD_TEXT, /(?:Company|Organization|Employer):\s*([^\n]+)/i),
      'ACME Corp',
    );
  });
});

describe('parseStructuredJd', () => {
  it('falls back to heuristics when the LLM fails', async () => {
    const jd = await parseStructuredJd(JD_TEXT, '', async () => {
      throw new Error('LLM unavailable');
    });

    assert.equal(jd.role, 'Senior Backend Engineer');
    assert.equal(jd.company_name, 'ACME Corp');
    assert.equal(jd.location, 'Remote');
    assert.equal(jd.experience_years, 5);
    assert.deepEqual(jd.required_skills, ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'AWS']);
    assert.equal(jd.tone, 'professional');
    assert.equal(jd.raw_text, JD_TEXT);
  });

  it('merges LLM JSON aliases and lists', async () => {
    let capturedPrompt = '';
    let capturedSystem = '';

    const jd = await parseStructuredJd('irrelevant body', '', async (prompt, options) => {
      capturedPrompt = prompt;
      capturedSystem = options.systemInstruction;
      assert.equal(options.jsonMode, true);
      return JSON.stringify({
        job_title: 'Principal Platform Engineer',
        company: 'Globex',
        team: 'Infrastructure',
        workplace_type: 'Hybrid',
        job_type: 'Full-time',
        compensation: '$180k - $220k',
        degree: 'B.Sc. Computer Science',
        industry: 'Fintech',
        overview: 'Own the platform.',
        culture: 'startup',
        must_have_skills: ['Go', 'Kubernetes'],
        nice_to_have_skills: ['Terraform'],
        duties: ['Run the platform'],
        requirements: ['7+ years experience'],
        perks: ['Stock options'],
        years_of_experience: '8 years',
      });
    });

    assert.match(capturedPrompt, /<job_description>/);
    assert.match(capturedSystem, /expert HR and recruitment assistant/);
    assert.equal(jd.role, 'Principal Platform Engineer');
    assert.equal(jd.company_name, 'Globex');
    assert.equal(jd.department, 'Infrastructure');
    assert.equal(jd.location, 'Hybrid');
    assert.equal(jd.employment_type, 'Full-time');
    assert.equal(jd.salary_range, '$180k - $220k');
    assert.equal(jd.education_requirements, 'B.Sc. Computer Science');
    assert.equal(jd.industry, 'Fintech');
    assert.equal(jd.summary, 'Own the platform.');
    assert.equal(jd.tone, 'startup');
    assert.deepEqual(jd.required_skills, ['Go', 'Kubernetes']);
    assert.deepEqual(jd.preferred_skills, ['Terraform']);
    assert.deepEqual(jd.responsibilities, ['Run the platform']);
    assert.deepEqual(jd.qualifications, ['7+ years experience']);
    assert.deepEqual(jd.benefits, ['Stock options']);
    assert.equal(jd.experience_years, 8);
  });

  it('accepts a single-element JSON array from the model', async () => {
    const jd = await parseStructuredJd('body', '', async () =>
      JSON.stringify([{ role: 'Array Role' }]),
    );

    assert.equal(jd.role, 'Array Role');
  });

  it('returns the Python defaults for empty text', async () => {
    const jd = await parseStructuredJd('   ', 'platform_engineer_jd.pdf');

    assert.equal(jd.role, 'Platform Engineer');
    assert.deepEqual(jd.required_skills, ['General Software Engineering']);
    assert.equal(jd.experience_years, 2);
    assert.equal(jd.raw_text, 'Empty JD text provided.');
  });

  it('uses "Software Engineer" when the empty-text filename has no role', async () => {
    const jd = await parseStructuredJd('\u0000');
    assert.equal(jd.role, 'Software Engineer');
  });
});
