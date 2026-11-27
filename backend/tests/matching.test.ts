import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { candidateSchema, jobDescriptionSchema } from '../src/schemas/index.js';
import {
  calculate5PillarScore,
  cleanSkillString,
  detectRedFlags,
  evaluateCandidateAgainstJd,
  evaluateCandidatesBatch,
  matchSkillsAgainstText,
  normalizeSkill,
  splitCompositeSkills,
} from '../src/services/matching.js';

function candidate(overrides: Record<string, unknown> = {}) {
  return candidateSchema.parse({ name: 'Test Candidate', ...overrides });
}

function jd(overrides: Record<string, unknown> = {}) {
  return jobDescriptionSchema.parse({ role: 'Software Engineer', ...overrides });
}

describe('cleanSkillString', () => {
  it('removes experience prefixes and punctuation noise', () => {
    assert.equal(cleanSkillString('5+ years of experience in Python'), 'Python');
    assert.equal(cleanSkillString('Strong proficiency in Go'), 'Go');
    assert.equal(cleanSkillString('Proficiency in React'), 'React');
    assert.equal(cleanSkillString('Hands-on experience in Docker'), 'Docker');
    assert.equal(cleanSkillString('Knowledge of Kubernetes'), 'Kubernetes');
    assert.equal(cleanSkillString('  Python, Docker.  '), 'Python  Docker');
  });
});

describe('normalizeSkill', () => {
  it('maps common aliases through the synonym table', () => {
    assert.equal(normalizeSkill('K8s'), 'kubernetes');
    assert.equal(normalizeSkill('Golang'), 'go');
    assert.equal(normalizeSkill('postgres'), 'postgresql');
    assert.equal(normalizeSkill('CICD'), 'continuous integration');
    assert.equal(normalizeSkill('ML'), 'machine learning');
    assert.equal(normalizeSkill('TailwindCSS'), 'tailwind css');
    assert.equal(normalizeSkill('SpringBoot'), 'spring boot');
  });

  it('preserves the Python quirk that dots become spaces before lookup', () => {
    assert.equal(normalizeSkill('Node.js'), 'node js');
    assert.equal(normalizeSkill('React.js'), 'react js');
  });

  it('collapses whitespace and lowercases unknown skills', () => {
    assert.equal(normalizeSkill('  Rust  '), 'rust');
    assert.equal(normalizeSkill('Data   Structures'), 'data structures');
  });
});

describe('splitCompositeSkills', () => {
  it('splits OR, AND and slash alternatives', () => {
    assert.deepEqual(splitCompositeSkills('Python or Go'), ['Python', 'Go']);
    assert.deepEqual(splitCompositeSkills('Python and Go'), ['Python', 'Go']);
    assert.deepEqual(splitCompositeSkills('Python/Go'), ['Python', 'Go']);
    assert.deepEqual(splitCompositeSkills('React, and Vue'), ['React', 'Vue']);
  });

  it('drops filler tokens and returns the cleaned token as a fallback', () => {
    assert.deepEqual(splitCompositeSkills('with and or etc'), ['or etc']);
    assert.deepEqual(splitCompositeSkills('Terraform'), ['Terraform']);
    assert.deepEqual(splitCompositeSkills('   '), []);
  });
});

describe('matchSkillsAgainstText', () => {
  it('satisfies an OR requirement when any branch matches', () => {
    const result = matchSkillsAgainstText(['Python or Go'], ['Python'], '');

    assert.deepEqual(result.matched, ['Python']);
    assert.deepEqual(result.gaps, []);
    assert.equal(result.matched.length, 1);
  });

  it('evaluates each branch of an AND requirement', () => {
    const result = matchSkillsAgainstText(['Python and Go'], ['Python'], '');

    assert.deepEqual(result.matched, ['Python']);
    assert.deepEqual(result.gaps, ['Go']);
  });

  it('matches synonyms from the candidate skill list', () => {
    const result = matchSkillsAgainstText(['k8s', 'postgres'], ['Kubernetes', 'PostgreSQL'], '');

    assert.deepEqual(result.matched, ['K8S', 'Postgres']);
    assert.deepEqual(result.gaps, []);
  });

  it('matches skills mentioned only in the raw resume text', () => {
    const result = matchSkillsAgainstText(
      ['Terraform'],
      [],
      'Built infrastructure with Terraform and AWS.',
    );

    assert.deepEqual(result.matched, ['Terraform']);
    assert.deepEqual(result.gaps, []);
  });

  it('reports a gap when no branch matches', () => {
    const result = matchSkillsAgainstText(['Python or Go'], ['Rust'], 'Rust only');

    assert.deepEqual(result.matched, []);
    assert.deepEqual(result.gaps, ['Python']);
  });

  it('ignores blank requirements', () => {
    assert.deepEqual(matchSkillsAgainstText(['  '], ['Python'], 'Python'), {
      matched: [],
      gaps: [],
    });
  });
});

describe('calculate5PillarScore', () => {
  const richCandidate = candidate({
    skills: ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'AWS'],
    raw_text:
      'Scalable architecture with microservices and Docker. System design ownership. ' +
      'Lead and mentored a cross-functional team using agile delivery. AWS certified.',
    experience_years: 5,
    education: ['B.Sc. Computer Science'],
    certifications: ['AWS Certified Solutions Architect'],
  });

  const targetJd = jd({
    required_skills: ['Python', 'FastAPI', 'PostgreSQL', 'Docker'],
    preferred_skills: ['AWS'],
    experience_years: 4,
  });

  it('caps a perfect match at 97 and reports the pillar breakdown', () => {
    const { totalScore, breakdown } = calculate5PillarScore(richCandidate, targetJd, [
      'Python',
      'FastAPI',
      'PostgreSQL',
      'Docker',
    ]);

    assert.equal(totalScore, 97);
    assert.deepEqual(breakdown, {
      technical_score: 35,
      experience_score: 25,
      architecture_score: 15,
      leadership_score: 15,
      education_score: 10,
      total_score: 97,
    });
  });

  it('applies the 30 point floor when at least one skill matched', () => {
    const { totalScore, breakdown } = calculate5PillarScore(
      candidate({ skills: ['Python'], raw_text: 'Python' }),
      jd({ required_skills: ['Python', 'Go'], experience_years: 4 }),
      ['Python'],
    );

    assert.equal(breakdown.technical_score, 17.5);
    assert.equal(breakdown.experience_score, 7);
    assert.equal(breakdown.architecture_score, 8);
    assert.equal(breakdown.leadership_score, 8);
    assert.equal(breakdown.education_score, 5);
    assert.equal(totalScore, 45.5);
  });

  it('scores zero when nothing matches', () => {
    const { totalScore, breakdown } = calculate5PillarScore(
      candidate({ skills: ['Rust'] }),
      jd({ required_skills: ['Python', 'Go'], experience_years: 3 }),
      [],
    );

    assert.equal(totalScore, 0);
    assert.equal(breakdown.technical_score, 0);
    assert.equal(breakdown.experience_score, 0);
    assert.equal(breakdown.architecture_score, 0);
    assert.equal(breakdown.leadership_score, 0);
    assert.equal(breakdown.education_score, 0);
  });

  it('treats a zero experience requirement as one year', () => {
    const { breakdown } = calculate5PillarScore(
      candidate({ skills: ['Python'], experience_years: 1 }),
      jd({ required_skills: ['Python'], experience_years: 0 }),
      ['Python'],
    );

    assert.equal(breakdown.experience_score, 25);
  });
});

describe('detectRedFlags', () => {
  it('flags insufficient experience', () => {
    assert.deepEqual(
      detectRedFlags(candidate({ experience_years: 1 }), jd({ experience_years: 5 }), ['Python']),
      ['Experience (1 yrs) is below requirement (5 yrs)'],
    );
  });

  it('rounds experience with Python half-even semantics', () => {
    assert.deepEqual(
      detectRedFlags(candidate({ experience_years: 2.5 }), jd({ experience_years: 6 }), ['Python']),
      ['Experience (2 yrs) is below requirement (6 yrs)'],
    );
  });

  it('flags a complete lack of overlap with two or more requirements', () => {
    assert.deepEqual(
      detectRedFlags(
        candidate(),
        jd({ required_skills: ['Python', 'Go'], experience_years: 2 }),
        [],
      ),
      ['Low overlap with core technical requirements'],
    );
  });

  it('does not flag a single-requirement gap', () => {
    assert.deepEqual(
      detectRedFlags(candidate(), jd({ required_skills: ['Python'], experience_years: 2 }), []),
      [],
    );
  });
});

describe('evaluateCandidateAgainstJd', () => {
  it('populates score, skills, gaps, score breakdown inputs and summary', () => {
    const evaluated = evaluateCandidateAgainstJd(
      candidate({
        skills: ['Python', 'FastAPI', 'Docker'],
        raw_text: 'Python FastAPI Docker architecture scalable',
        experience_years: 5,
        headline: null,
      }),
      jd({
        role: 'Backend Engineer',
        required_skills: ['Python', 'FastAPI', 'Docker'],
        experience_years: 4,
      }),
    );

    assert.deepEqual(evaluated.matched_skills, ['Python', 'Fastapi', 'Docker']);
    assert.deepEqual(evaluated.gaps, []);
    assert.equal(evaluated.headline, 'Python / Fastapi Specialist');
    assert.equal(
      evaluated.summary,
      'Strong match with verified background in Python, Fastapi, Docker.',
    );
    assert.equal(evaluated.match_score, 87);
    assert.deepEqual(evaluated.red_flags, []);
  });

  it('uses candidate skills for the headline when fewer than two skills match', () => {
    const evaluated = evaluateCandidateAgainstJd(
      candidate({
        skills: ['Rust', 'WebAssembly'],
        raw_text: 'Rust WebAssembly',
        headline: 'Unknown Candidate',
      }),
      jd({ role: 'Systems Engineer', required_skills: ['Go', 'C++'] }),
    );

    assert.equal(evaluated.headline, 'Rust / WebAssembly Specialist');
    assert.equal(evaluated.summary, 'Candidate evaluated for Systems Engineer requisition.');
    assert.ok(evaluated.red_flags?.includes('Low overlap with core technical requirements'));
  });

  it('falls back to the JD role when the candidate has no skills', () => {
    const evaluated = evaluateCandidateAgainstJd(
      candidate({ headline: null }),
      jd({ role: 'Data Engineer', required_skills: ['Python'] }),
    );

    assert.equal(evaluated.headline, 'Data Engineer Candidate');
  });

  it('preserves an existing headline and summary', () => {
    const evaluated = evaluateCandidateAgainstJd(
      candidate({
        headline: 'Principal Engineer',
        summary: 'Original summary',
        skills: ['Python'],
      }),
      jd({ required_skills: ['Python'] }),
    );

    assert.equal(evaluated.headline, 'Principal Engineer');
    assert.equal(evaluated.summary, 'Strong match with verified background in Python.');
  });
});

describe('evaluateCandidatesBatch', () => {
  it('returns an empty list for an empty pool', () => {
    assert.deepEqual(evaluateCandidatesBatch([], jd()), []);
  });

  it('sorts evaluated candidates by descending match score', () => {
    const targetJd = jd({
      required_skills: ['Python', 'FastAPI', 'Docker'],
      experience_years: 4,
    });

    const strong = candidate({
      name: 'Strong',
      skills: ['Python', 'FastAPI', 'Docker'],
      raw_text: 'Python FastAPI Docker architecture',
      experience_years: 5,
    });
    const weak = candidate({
      name: 'Weak',
      skills: ['Rust'],
      raw_text: 'Rust only',
      experience_years: 1,
    });
    const medium = candidate({
      name: 'Medium',
      skills: ['Python'],
      raw_text: 'Python',
      experience_years: 2,
    });

    const evaluated = evaluateCandidatesBatch([weak, strong, medium], targetJd);

    assert.deepEqual(
      evaluated.map((item) => item.name),
      ['Strong', 'Medium', 'Weak'],
    );
    assert.ok((evaluated[0]?.match_score ?? 0) >= (evaluated[1]?.match_score ?? 0));
    assert.ok((evaluated[1]?.match_score ?? 0) >= (evaluated[2]?.match_score ?? 0));
  });
});
