import type { Candidate } from '../schemas/candidate.js';
import type { JobDescription } from '../schemas/jd.js';
import { escapeRegExp, formatFixed0, pythonRound, pythonTitle } from './parsing-utils.js';

/**
 * Port of `backend/app/services/matching_service.py`.
 *
 * Five-pillar scoring (35/25/15/15/10), synonym-aware skill matching, composite
 * requirement splitting, and red-flag detection. Deterministic throughout; no
 * LLM calls.
 */

export const SYNONYM_MAP: Readonly<Record<string, string>> = {
  k8s: 'kubernetes',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  postgres: 'postgresql',
  postgresql: 'postgresql',
  node: 'node.js',
  nodejs: 'node.js',
  'node.js': 'node.js',
  golang: 'go',
  reactjs: 'react',
  'react.js': 'react',
  react: 'react',
  vuejs: 'vue',
  'vue.js': 'vue',
  nextjs: 'next.js',
  'next.js': 'next.js',
  aws: 'amazon web services',
  'amazon web services': 'amazon web services',
  gcp: 'google cloud platform',
  'google cloud platform': 'google cloud platform',
  azure: 'microsoft azure',
  'ci/cd': 'continuous integration',
  cicd: 'continuous integration',
  ml: 'machine learning',
  ai: 'artificial intelligence',
  rest: 'rest api',
  restful: 'rest api',
  'rest api': 'rest api',
  mongo: 'mongodb',
  mongodb: 'mongodb',
  gql: 'graphql',
  graphql: 'graphql',
  tf: 'terraform',
  terraform: 'terraform',
  tailwind: 'tailwind css',
  tailwindcss: 'tailwind css',
  fastapi: 'fastapi',
  spring: 'spring boot',
  springboot: 'spring boot',
  docker: 'docker',
  git: 'git',
  sql: 'sql',
};

const SKILL_PREFIX_PATTERN = new RegExp(
  '^(?:\\d+\\+?\\s*(?:years?|yrs?)(?:\\s+of)?(?:\\s+experience)?(?:\\s+(?:with|in))?' +
    '|strong\\s+proficiency\\s+in|proficiency\\s+in|hands-on\\s+(?:with|experience\\s+in)' +
    '|experience\\s+with|knowledge\\s+of|familiarity\\s+with|proven\\s+track\\s+record\\s+in' +
    '|deep\\s+understanding\\s+of|ability\\s+to\\s+use)\\s*',
  'gi',
);

const COMPOSITE_SPLIT = /[/,;]|(?:\s+and\s+)|\s+or\s+|\s+&\s+/i;

const ARCH_KEYWORDS = [
  'architecture',
  'scalable',
  'scalability',
  'distributed',
  'microservices',
  'system design',
  'cloud',
  'security',
  'infrastructure',
  'rest',
  'api',
  'database',
  'postgresql',
  'sql',
  'pipeline',
  'docker',
  'kubernetes',
  'optimization',
  'performance',
  'caching',
  'redis',
] as const;

const LEAD_KEYWORDS = [
  'lead',
  'led',
  'managed',
  'mentor',
  'mentored',
  'collaborated',
  'spearheaded',
  'team',
  'cross-functional',
  'agile',
  'scrum',
  'stakeholder',
  'delivered',
  'initiative',
  'ownership',
  'guided',
] as const;

/** Remove experience prefixes and punctuation from a requirement. */
export function cleanSkillString(skill: string): string {
  return skill
    .trim()
    .replace(SKILL_PREFIX_PATTERN, '')
    .trim()
    .replace(/[()[\].,:;]/g, ' ')
    .trim();
}

/** Normalise a skill token for synonym-aware matching. */
export function normalizeSkill(skill: string): string {
  const cleaned = skill
    .toLowerCase()
    .trim()
    .replace(/[()[\].,:;]/g, ' ')
    .split(/\s+/)
    .filter((part) => part !== '')
    .join(' ');
  return SYNONYM_MAP[cleaned] ?? cleaned;
}

/** Split "React, Next.js, and TypeScript" / "Python or Go" into tokens. */
export function splitCompositeSkills(skillText: string): string[] {
  const cleaned = cleanSkillString(skillText);
  const tokens = cleaned.split(COMPOSITE_SPLIT);
  const results: string[] = [];

  for (const token of tokens) {
    const sub = token.trim();
    if (sub && sub.length > 1 && !['with', 'in', 'and', 'or', 'etc'].includes(sub.toLowerCase())) {
      results.push(sub);
    }
  }

  return results.length > 0 ? results : cleaned ? [cleaned] : [];
}

function isSingleSkillMatched(
  token: string,
  candidateSkillsNormalized: ReadonlySet<string>,
  textLower: string,
): boolean {
  const normalized = normalizeSkill(token);
  if (!normalized) {
    return false;
  }

  if (candidateSkillsNormalized.has(normalized)) {
    return true;
  }

  const synonym = SYNONYM_MAP[normalized];
  if (synonym && candidateSkillsNormalized.has(synonym)) {
    return true;
  }

  const searchTerms = [normalized];
  if (synonym && !searchTerms.includes(synonym)) {
    searchTerms.push(synonym);
  }
  for (const [key, value] of Object.entries(SYNONYM_MAP)) {
    if (value === normalized && !searchTerms.includes(key)) {
      searchTerms.push(key);
    }
  }

  for (const term of searchTerms) {
    if (term.length < 2) {
      continue;
    }
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`);
    if (pattern.test(textLower)) {
      return true;
    }
  }

  return false;
}

/**
 * Identify matched competencies and missing gaps.
 *
 * OR alternatives satisfy the requirement when any branch matches; conjunctions
 * (commas, "and", "&") are evaluated branch by branch.
 */
export function matchSkillsAgainstText(
  requiredSkills: readonly string[],
  candidateSkills: readonly string[] | null | undefined,
  rawText: string | null | undefined,
): { matched: string[]; gaps: string[] } {
  const candidateSkillsNormalized = new Set<string>();
  for (const skill of candidateSkills ?? []) {
    candidateSkillsNormalized.add(normalizeSkill(skill));
    for (const sub of splitCompositeSkills(skill)) {
      candidateSkillsNormalized.add(normalizeSkill(sub));
    }
  }

  const textLower = (rawText ?? '').toLowerCase();
  const matched: string[] = [];
  const gaps: string[] = [];

  for (const requirement of requiredSkills) {
    const requirementClean = cleanSkillString(requirement);
    if (!requirementClean) {
      continue;
    }

    const isOrCondition = /\b(?:or)\b|\//i.test(requirementClean);
    let subSkills = splitCompositeSkills(requirementClean);
    if (subSkills.length === 0) {
      subSkills = [requirementClean];
    }

    if (isOrCondition) {
      let foundAny = false;
      for (const token of subSkills) {
        if (isSingleSkillMatched(token, candidateSkillsNormalized, textLower)) {
          foundAny = true;
          const label = pythonTitle(token.trim());
          if (!matched.includes(label)) {
            matched.push(label);
          }
          break;
        }
      }
      if (!foundAny) {
        const gapLabel = pythonTitle((subSkills[0] ?? '').trim());
        if (!gaps.includes(gapLabel)) {
          gaps.push(gapLabel);
        }
      }
    } else {
      for (const token of subSkills) {
        const label = pythonTitle(token.trim());
        if (isSingleSkillMatched(token, candidateSkillsNormalized, textLower)) {
          if (!matched.includes(label)) {
            matched.push(label);
          }
        } else if (!gaps.includes(label) && !matched.includes(label)) {
          gaps.push(label);
        }
      }
    }
  }

  return { matched, gaps };
}

export interface ScoreBreakdown {
  readonly technical_score: number;
  readonly experience_score: number;
  readonly architecture_score: number;
  readonly leadership_score: number;
  readonly education_score: number;
  readonly total_score: number;
}

/** Five-pillar score: 35 / 25 / 15 / 15 / 10. */
export function calculate5PillarScore(
  candidate: Candidate,
  jd: JobDescription,
  matchedSkills: readonly string[],
  _gaps: readonly string[] = [],
): { totalScore: number; breakdown: ScoreBreakdown } {
  const requiredSkills = jd.required_skills ?? [];
  const totalRequired = Math.max(requiredSkills.length, 1);

  // 1. Technical fit (35 max) with up to 5 bonus points for preferred skills.
  const techRatio = Math.min(matchedSkills.length / totalRequired, 1.0);
  let techScore = techRatio * 35.0;

  const preferredSkills = jd.preferred_skills ?? [];
  if (preferredSkills.length > 0) {
    const { matched: preferredMatched } = matchSkillsAgainstText(
      preferredSkills,
      candidate.skills ?? [],
      candidate.raw_text ?? '',
    );
    const bonus = (preferredMatched.length / Math.max(preferredSkills.length, 1)) * 5.0;
    techScore = Math.min(techScore + bonus, 35.0);
  }

  // 2. Experience alignment (25 max).
  const targetExperience = Math.max(Number(jd.experience_years ?? 0), 1.0);
  const candidateExperience = Number(candidate.experience_years ?? 0);
  let experienceScore: number;
  if (candidateExperience >= targetExperience) {
    experienceScore = 25.0;
  } else {
    const floor = matchedSkills.length > 0 ? 7.0 : 0.0;
    experienceScore = Math.max((candidateExperience / targetExperience) * 25.0, floor);
  }

  const textLower = (candidate.raw_text ?? '').toLowerCase();

  // 3. Architecture & problem solving (15 max).
  const architectureCount = ARCH_KEYWORDS.filter((keyword) => textLower.includes(keyword)).length;
  const architectureBase = matchedSkills.length > 0 ? 8.0 : 0.0;
  const architectureScore = Math.min(architectureBase + architectureCount * 1.5, 15.0);

  // 4. Leadership & collaboration (15 max).
  const leadershipCount = LEAD_KEYWORDS.filter((keyword) => textLower.includes(keyword)).length;
  const leadershipBase = matchedSkills.length > 0 ? 8.0 : 0.0;
  const leadershipScore = Math.min(leadershipBase + leadershipCount * 1.5, 15.0);

  // 5. Education & credentials (10 max).
  const hasDegree = Boolean(candidate.education && candidate.education.length > 0);
  const hasCertifications = Boolean(
    candidate.certifications && candidate.certifications.length > 0,
  );
  let educationScore = matchedSkills.length > 0 ? 5.0 : 0.0;
  if (hasDegree) {
    educationScore += 3.0;
  }
  if (hasCertifications) {
    educationScore += 2.0;
  }
  educationScore = Math.min(educationScore, 10.0);

  const rawTotal =
    techScore + experienceScore + architectureScore + leadershipScore + educationScore;
  const floor = matchedSkills.length > 0 ? 30.0 : 0.0;
  const totalScore = pythonRound(Math.max(Math.min(rawTotal, 97.0), floor), 1);

  return {
    totalScore,
    breakdown: {
      technical_score: pythonRound(techScore, 1),
      experience_score: pythonRound(experienceScore, 1),
      architecture_score: pythonRound(architectureScore, 1),
      leadership_score: pythonRound(leadershipScore, 1),
      education_score: pythonRound(educationScore, 1),
      total_score: totalScore,
    },
  };
}

/** Potential hiring red flags / criteria mismatches. */
export function detectRedFlags(
  candidate: Candidate,
  jd: JobDescription,
  matched: readonly string[],
): string[] {
  const flags: string[] = [];
  const targetExperience = Number(jd.experience_years ?? 0);
  const candidateExperience = Number(candidate.experience_years ?? 0);

  if (targetExperience >= 3.0 && candidateExperience < targetExperience * 0.5) {
    flags.push(
      `Experience (${formatFixed0(candidateExperience)} yrs) is below requirement ` +
        `(${formatFixed0(targetExperience)} yrs)`,
    );
  }

  if (matched.length === 0 && (jd.required_skills ?? []).length >= 2) {
    flags.push('Low overlap with core technical requirements');
  }

  return flags;
}

/**
 * Evaluate a candidate against a JD, mutating the candidate with its score,
 * matched skills, gaps and red flags (Python does the same).
 */
export function evaluateCandidateAgainstJd(candidate: Candidate, jd: JobDescription): Candidate {
  const { matched, gaps } = matchSkillsAgainstText(
    jd.required_skills ?? [],
    candidate.skills ?? [],
    candidate.raw_text ?? '',
  );
  const { totalScore } = calculate5PillarScore(candidate, jd, matched, gaps);
  const redFlags = detectRedFlags(candidate, jd, matched);

  candidate.matched_skills = matched;
  candidate.gaps = gaps;
  candidate.match_score = totalScore;
  candidate.red_flags = redFlags;

  if (!candidate.headline || candidate.headline === 'Unknown Candidate') {
    if (matched.length >= 2) {
      candidate.headline = `${matched[0]} / ${matched[1]} Specialist`;
    } else if ((candidate.skills ?? []).length >= 2) {
      candidate.headline = `${candidate.skills[0]} / ${candidate.skills[1]} Specialist`;
    } else {
      candidate.headline = `${jd.role} Candidate`;
    }
  }

  candidate.summary =
    matched.length > 0
      ? `Strong match with verified background in ${matched.slice(0, 3).join(', ')}.`
      : `Candidate evaluated for ${jd.role} requisition.`;

  return candidate;
}

/** Batch evaluation, sorted by descending match score. */
export function evaluateCandidatesBatch(
  candidates: readonly Candidate[],
  jd: JobDescription,
): Candidate[] {
  const evaluated = candidates.map((candidate) => evaluateCandidateAgainstJd(candidate, jd));
  evaluated.sort((left, right) => (right.match_score ?? 0) - (left.match_score ?? 0));
  return evaluated;
}
