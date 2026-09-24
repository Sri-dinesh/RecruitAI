import React from 'react';
import { 
  Award, 
  Scale, 
  HelpCircle, 
  Mail, 
  ShieldAlert,
  Globe,
  LucideIcon 
} from 'lucide-react';

export interface PresetPrompt {
  title: string;
  description: string;
  prompt: string;
  shortLabel?: string;
}

export interface PresetCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  badgeColor: string;
  description: string;
  prompts: PresetPrompt[];
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  {
    id: 'screening',
    label: 'Screen & Rank',
    icon: Award,
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Instant candidate stack ranking, fit breakdown, and talent filtering.',
    prompts: [
      {
        title: 'Rank Candidate Pool',
        shortLabel: 'Rank Pool',
        description: 'Stack-rank all candidates against the calibrated rubric with top differentiators.',
        prompt: 'Rank all candidates in our pool by match score. Detail the top 3 with their key technical competencies and why they stand out.'
      },
      {
        title: 'High-Fit Filter (>80%)',
        shortLabel: 'High-Fit (>80%)',
        description: 'Isolate strong matches that exceed role criteria.',
        prompt: 'Which candidates score above 80%? Summarize their primary differentiators and readiness for immediate interview loops.'
      },
      {
        title: 'Seniority Check (5+ Years)',
        shortLabel: '5+ Years Exp',
        description: 'Verify leadership and years of production experience.',
        prompt: 'Filter candidates with 5 or more years of experience. List their primary architecture experience and past technical roles.'
      },
      {
        title: 'Zero Skill Gaps',
        shortLabel: 'Zero Gaps',
        description: 'Find candidates with 100% core stack overlap.',
        prompt: 'Identify any candidates in our talent pool who have zero critical competency gaps for this requisition.'
      }
    ]
  },
  {
    id: 'comparison',
    label: 'Compare & Tradeoffs',
    icon: Scale,
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description: 'Head-to-head candidate analysis, architecture tradeoffs, and fit arbitration.',
    prompts: [
      {
        title: 'Top 2 Head-to-Head',
        shortLabel: 'Compare Top 2',
        description: 'Side-by-side comparative analysis across technical depth, system architecture, and seniority tradeoffs.',
        prompt: 'Compare our top 2 ranked candidates side-by-side. Highlight their technical fit, architecture depth, experience, and leadership tradeoffs.'
      },
      {
        title: 'Architecture Tradeoff',
        shortLabel: 'Arch Tradeoffs',
        description: 'Evaluate system design and scalability prowess.',
        prompt: 'Who among our candidates has stronger hands-on system architecture, microservices, and cloud infrastructure experience?'
      },
      {
        title: 'Seniority vs. Tooling Fit',
        shortLabel: 'Seniority Fit',
        description: 'Analyze potential over/under-indexing on tools.',
        prompt: 'Evaluate the tradeoff between our most experienced candidate and our most technically aligned stack specialist.'
      }
    ]
  },
  {
    id: 'interviews',
    label: 'Interview Questions',
    icon: HelpCircle,
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    description: 'Role-calibrated technical screening loops, system design, and behavioral rubrics.',
    prompts: [
      {
        title: 'Technical Screening Loop',
        shortLabel: 'Interview Loop',
        description: 'Calibrated technical screening questions with expected benchmark answers and scoring rubrics.',
        prompt: 'Generate a 5-question technical screening loop tailored to this exact job specification. Include the expected benchmark answers and what signals to look for.'
      },
      {
        title: 'Targeted Gap Testing',
        shortLabel: 'Test Gaps',
        description: 'Questions targeting identified candidate weaknesses.',
        prompt: 'Review the identified skill gaps across our top candidates and generate 3 targeted probing questions to test their capability to adapt.'
      },
      {
        title: 'Behavioral & Culture Rubric',
        shortLabel: 'Behavioral',
        description: 'Assess team velocity, ownership, and communication.',
        prompt: 'Generate 3 behavioral interview questions evaluating cross-functional collaboration, conflict resolution, and engineering ownership.'
      },
      {
        title: 'System Design Challenge',
        shortLabel: 'System Design',
        description: 'Senior architectural design prompt for this stack.',
        prompt: 'Formulate a 45-minute system design interview problem that tests candidate proficiency in scalable distributed systems and databases relevant to this position.'
      }
    ]
  },
  {
    id: 'outreach',
    label: 'Outreach & Messaging',
    icon: Mail,
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    description: 'Personalized invitations, status updates, and candidate nurture templates.',
    prompts: [
      {
        title: 'Invite Top Candidate',
        shortLabel: 'Outreach',
        description: 'High-conversion interview email templates personalized with verified candidate skills and achievements.',
        prompt: 'Draft a warm, high-converting interview invitation email for our highest-scoring candidate. Mention their specific matched technical skills and explain why our team is excited to speak.'
      },
      {
        title: 'Warm Nurture Update',
        shortLabel: 'Nurture Update',
        description: 'Gentle status update keeping runner-ups engaged.',
        prompt: 'Draft a polite status update email for runner-up candidates keeping them engaged for future team openings while highlighting their strong qualifications.'
      },
      {
        title: 'Interview Confirmation',
        shortLabel: 'Confirmation',
        description: 'Structured email with loop details and video link.',
        prompt: 'Draft an interview confirmation email with agenda details, interviewer expectations, and a placeholder for video meeting link.'
      }
    ]
  },
  {
    id: 'risks',
    label: 'Gaps & Hiring Risks',
    icon: ShieldAlert,
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    description: 'Stack omissions, ramp-up time analysis, and criteria mismatch detection.',
    prompts: [
      {
        title: 'Pool Skill Gap Analysis',
        shortLabel: 'Gaps',
        description: 'Analyze recurring competency deficits across candidate records.',
        prompt: 'Analyze the biggest recurring skill gaps across our entire candidate pool for this position. What critical skills are candidates missing most often?'
      },
      {
        title: 'Ramp-up & Onboarding Time',
        shortLabel: 'Ramp-up Time',
        description: 'Estimate candidate time to full engineering productivity.',
        prompt: 'Which candidate has the lowest technical gap and will require the shortest ramp-up time to become fully productive in our tech stack?'
      },
      {
        title: 'Candidate Red Flags',
        shortLabel: 'Red Flags',
        description: 'Highlight seniority deficits and mismatch concerns.',
        prompt: 'Scan our candidate records and highlight any notable red flags, severe experience deficits, or criteria mismatches for this requisition.'
      }
    ]
  },
  {
    id: 'market',
    label: 'Market & Salaries',
    icon: Globe,
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    description: 'Tavily-powered live market compensation benchmarks and requisition search.',
    prompts: [
      {
        title: 'Market Salary Benchmark',
        shortLabel: 'Salary Benchmark',
        description: 'Real-time compensation range analysis for this role and market.',
        prompt: 'Search the web using Tavily for current market salary benchmarks for this job title and location. Provide typical base pay, equity norms, and total compensation percentiles.'
      },
      {
        title: 'Live Requisition Discovery',
        shortLabel: 'Live Postings',
        description: 'Search active job listings to calibrate competitive requirements.',
        prompt: 'Search live web job postings for similar roles at top tech companies. What emerging skills and certifications are industry peers currently prioritizing?'
      },
      {
        title: 'Competitor Requirements',
        shortLabel: 'Competitor Intel',
        description: 'Benchmark requisition specifications against hiring competitors.',
        prompt: 'Benchmark our required tech stack against current industry hiring standards for this seniority level. Are our expectations calibrated to attract top tier talent?'
      }
    ]
  }
];

/**
 * Dynamically computed total count of all workflow presets.
 */
export const TOTAL_PRESETS_COUNT = PRESET_CATEGORIES.reduce(
  (acc, cat) => acc + cat.prompts.length, 
  0
);

/**
 * Dynamically derived 4 hero welcome action cards directly from PRESET_CATEGORIES,
 * eliminating 4-way prompt copy duplication.
 */
export interface HeroActionCard {
  category: PresetCategory;
  primaryPrompt: PresetPrompt;
}

export const HERO_ACTION_CARDS: HeroActionCard[] = PRESET_CATEGORIES.slice(0, 4).map(category => ({
  category,
  primaryPrompt: category.prompts[0]
}));

/**
 * Dynamically derived quick-action chips for the input dock,
 * eliminating hardcoded duplicate prompt strings.
 */
export interface QuickActionChip {
  label: string;
  prompt: string;
  icon: LucideIcon;
  badgeColor: string;
}

export const QUICK_ACTION_CHIPS: QuickActionChip[] = PRESET_CATEGORIES.map(cat => ({
  label: cat.prompts[0].shortLabel || cat.label,
  prompt: cat.prompts[0].prompt,
  icon: cat.icon,
  badgeColor: cat.badgeColor
}));
