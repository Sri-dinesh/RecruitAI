import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleanFilenameToName,
  extractNameFromText,
  heuristicExtractEducation,
  heuristicExtractExpYears,
  heuristicExtractHeadline,
  heuristicExtractSkills,
  heuristicExtractWorkExperience,
  parseStructuredResume,
} from '../src/services/resume-parser.js';

const RESUME = [
  'Jane Doe',
  'Senior Python Engineer',
  'Email: jane@example.com | Phone: +1 555-123-4567',
  '5 years of experience building services with Python, Docker and Kubernetes.',
  'Bachelor of Science in Computer Science',
  'Software Engineer at Example Corp',
].join('\n');

describe('cleanFilenameToName', () => {
  it('strips resume/cv noise and title-cases the stem', () => {
    assert.equal(cleanFilenameToName('jane_doe_resume.pdf'), 'Jane Doe');
    assert.equal(cleanFilenameToName('/tmp/ALICE-smith-CV.docx'), 'Alice Smith');
    assert.equal(cleanFilenameToName('resume.pdf'), '');
    assert.equal(cleanFilenameToName(''), '');
  });
});

describe('extractNameFromText', () => {
  it('picks a plausible name from the first three lines', () => {
    assert.equal(extractNameFromText(RESUME), 'Jane Doe');
  });

  it('skips lines with digits, contact symbols or role words', () => {
    assert.equal(
      extractNameFromText('Software Engineer\njane@example.com\nJane Doe\nExtra Name Here'),
      'Jane Doe',
    );
  });

  it('returns undefined when no candidate name is present', () => {
    assert.equal(extractNameFromText('Resume\nSummary\nExperience'), undefined);
  });
});

describe('heuristic extractors', () => {
  it('extracts known skills in keyword order', () => {
    assert.deepEqual(heuristicExtractSkills(RESUME), ['Python', 'Docker', 'Kubernetes']);
  });

  it('reads the first years-of-experience mention', () => {
    assert.equal(heuristicExtractExpYears('3+ years of experience'), 3);
    assert.equal(heuristicExtractExpYears('7.5 years building APIs'), 7.5);
    assert.equal(heuristicExtractExpYears('2 - 4 years of experience'), 2);
    assert.equal(heuristicExtractExpYears('no mention here'), 2);
  });

  it('uses the second line as a headline when it looks like a title', () => {
    assert.equal(heuristicExtractHeadline(RESUME), 'Senior Python Engineer');
    assert.equal(heuristicExtractHeadline('Jane Doe\njane@example.com'), undefined);
  });

  it('extracts degrees and universities', () => {
    assert.deepEqual(heuristicExtractEducation(RESUME), [
      'Bachelor of Science in Computer Science',
    ]);
    assert.deepEqual(heuristicExtractEducation('B.Tech in CS\nUniversity of Example'), [
      'B.Tech in CS',
      'University of Example',
    ]);
    // `M.S` is only three characters, so Python's `len(clean) > 3` drops it.
    assert.deepEqual(heuristicExtractEducation('M.S. in CS'), []);
  });

  it('extracts role lines up to four', () => {
    assert.deepEqual(heuristicExtractWorkExperience(RESUME), ['Software Engineer at Example Corp']);
  });
});

describe('parseStructuredResume', () => {
  it('parses a resume deterministically without calling an LLM', async () => {
    const candidate = await parseStructuredResume(RESUME, 'jane_doe_resume.pdf');

    assert.equal(candidate.candidate_id, 'jane_doe');
    assert.equal(candidate.name, 'Jane Doe');
    assert.equal(candidate.headline, 'Senior Python Engineer');
    assert.equal(candidate.email, 'jane@example.com');
    assert.equal(candidate.phone, '+1 555-123-4567');
    assert.equal(candidate.experience_years, 5);
    assert.deepEqual(candidate.skills, ['Python', 'Docker', 'Kubernetes']);
    assert.deepEqual(candidate.work_experience, ['Software Engineer at Example Corp']);
    assert.deepEqual(candidate.education, ['Bachelor of Science in Computer Science']);
    assert.equal(candidate.match_score, null);
    assert.deepEqual(candidate.matched_skills, []);
    assert.deepEqual(candidate.gaps, []);
    assert.deepEqual(candidate.red_flags, []);
    assert.equal(candidate.consent_version, '1.0');
    assert.equal(candidate.source, 'direct_upload');
    assert.match(candidate.summary ?? '', /Python, Docker, Kubernetes/);
  });

  it('falls back to the filename when the text has no name', async () => {
    const candidate = await parseStructuredResume('Resume', 'john_smith_cv.docx');

    assert.equal(candidate.name, 'John Smith');
    assert.equal(candidate.candidate_id, 'john_smith');
  });

  it('uses "Candidate" when neither text nor filename yields a name', async () => {
    const candidate = await parseStructuredResume('');
    assert.equal(candidate.name, 'Candidate');
    assert.equal(candidate.candidate_id, 'candidate');
  });

  it('merges LLM JSON over the deterministic extraction', async () => {
    let capturedPrompt = '';
    let capturedSystem = '';

    const candidate = await parseStructuredResume(RESUME, '', async (prompt, options) => {
      capturedPrompt = prompt;
      capturedSystem = options.systemInstruction;
      assert.equal(options.jsonMode, true);
      return JSON.stringify({
        name: 'Alice Smith',
        headline: 'Staff Platform Engineer',
        email: 'alice@example.com',
        location: 'Berlin, Germany',
        summary: 'Platform specialist.',
        experience_years: '7',
        skills: ['Go', ' Kubernetes '],
        work_experience: ['Staff Engineer at ACME'],
        education: ['M.Sc. Distributed Systems'],
        certifications: ['CKA'],
        languages: ['English', 'German'],
      });
    });

    assert.match(capturedPrompt, /<resume>/);
    assert.match(capturedSystem, /expert HR assistant/);
    assert.equal(candidate.name, 'Alice Smith');
    assert.equal(candidate.candidate_id, 'alice_smith');
    assert.equal(candidate.headline, 'Staff Platform Engineer');
    assert.equal(candidate.email, 'alice@example.com');
    assert.equal(candidate.location, 'Berlin, Germany');
    assert.equal(candidate.summary, 'Platform specialist.');
    assert.equal(candidate.experience_years, 7);
    assert.deepEqual(candidate.skills, ['Go', 'Kubernetes']);
    assert.deepEqual(candidate.certifications, ['CKA']);
    assert.deepEqual(candidate.languages, ['English', 'German']);
  });

  it('accepts a single-element JSON array from the model', async () => {
    const candidate = await parseStructuredResume(RESUME, '', async () =>
      JSON.stringify([{ name: 'Array Name' }]),
    );

    assert.equal(candidate.name, 'Array Name');
  });

  it('keeps heuristic results when the LLM throws or returns invalid JSON', async () => {
    const candidate = await parseStructuredResume(RESUME, '', async () => 'not json');

    assert.equal(candidate.name, 'Jane Doe');
    assert.deepEqual(candidate.skills, ['Python', 'Docker', 'Kubernetes']);
  });

  it('truncates the prompt to 4000 characters', async () => {
    const longText = `Jane Doe\n${'x'.repeat(5000)}`;
    let prompt = '';

    await parseStructuredResume(longText, '', async (text) => {
      prompt = text;
      return '{}';
    });

    const body = prompt.slice(prompt.indexOf('<resume>'), prompt.indexOf('</resume>'));
    assert.ok(body.length <= 4010, `prompt body was ${body.length} characters`);
  });
});
