/**
 * Centralized site configuration driven by environment variables.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://recruitaiofficial.vercel.app";

export const SITE_NAME = "RecruitAI";
export const SITE_DESCRIPTION =
  "Autonomous multi-agent talent intelligence platform with verifiable RAG, bias-audited scoring, live web intelligence, and zero data retention.";

export const PRIVACY_URL = `${SITE_URL}/privacy`;
export const TERMS_URL = `${SITE_URL}/terms`;
export const SUPPORT_URL = `${SITE_URL}/support`;
export const DATA_DELETION_URL = `${SITE_URL}/data-deletion`;
export const GITHUB_URL = "https://github.com/Sri-dinesh/RecruitAI";
