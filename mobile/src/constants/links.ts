/**
 * Centralized links configuration driven by environment variables.
 */
export const SITE_URL =
  process.env.EXPO_PUBLIC_SITE_URL || "https://recruitaiofficial.vercel.app";

export const PRIVACY_URL = `${SITE_URL}/privacy`;
export const TERMS_URL = `${SITE_URL}/terms`;
export const SUPPORT_URL = `${SITE_URL}/support`;
export const DATA_DELETION_URL = `${SITE_URL}/data-deletion`;
export const RECOVERY_REDIRECT_URL = `${SITE_URL}/auth/callback?type=recovery`;
