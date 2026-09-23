/**
 * Centralized site configuration driven by environment variables.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://recruitaiofficial.vercel.app";

export const SITE_NAME = "RecruitAI";
export const SITE_DESCRIPTION =
  "RecruitAI is an autonomous AI recruiting platform that automates resume screening, enforces blind hiring, and scores candidates with objective rubric intelligence — with human-in-the-loop control.";
export const SITE_TAGLINE = "Precision Candidate Intelligence & AI Recruiter";

export const PRIVACY_URL = `${SITE_URL}/privacy`;
export const TERMS_URL = `${SITE_URL}/terms`;
export const SUPPORT_URL = `${SITE_URL}/support`;
export const DATA_DELETION_URL = `${SITE_URL}/data-deletion`;
export const GITHUB_URL = "https://github.com/Sri-dinesh/RecruitAI";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.recruitai.app";

// Keyword clusters for internal mapping (kept here for sitemap + nav consistency)
export const PUBLIC_ROUTES = [
  "/",
  "/features",
  "/features/ai-resume-screening",
  "/features/ai-candidate-screening",
  "/features/blind-hiring",
  "/features/ats-integration",
  "/features/recruitment-automation",
  "/solutions/startups",
  "/solutions/enterprise",
  "/solutions/tech-hiring",
  "/solutions/hr-teams",
  "/guides",
  "/guides/ai-recruiting-guide",
  "/guides/resume-screening-guide",
  "/guides/candidate-screening-guide",
  "/guides/ats-guide",
  "/compare/greenhouse-vs-recruitai",
  "/compare/lever-vs-recruitai",
  "/faq",
  "/download",
  "/pricing",
  "/privacy",
  "/terms",
  "/support",
  "/data-deletion",
] as const;
