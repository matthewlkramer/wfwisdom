export const env = {
  get nodeEnv() { return process.env.NODE_ENV ?? "development"; },
  get isProd() { return (process.env.NODE_ENV ?? "development") === "production"; },
  get port() { return Number(process.env.PORT ?? 8080); },
  /** Public base URL. Explicit APP_BASE_URL wins; on Replit it is derived from the deployment or dev domain. */
  get appBaseUrl() {
    const explicit = process.env.APP_BASE_URL?.trim();
    if (explicit) return explicit.replace(/\/$/, "");
    if (process.env.REPLIT_DEPLOYMENT && process.env.REPLIT_DOMAINS) return `https://${process.env.REPLIT_DOMAINS.split(",")[0]!.trim()}`;
    if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    return "http://localhost:5173";
  },
  get sessionSecret() { const s = process.env.SESSION_SECRET; if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (32+ chars)"); return s; },
  get googleClientId() { return process.env.GOOGLE_CLIENT_ID ?? ""; },
  get googleClientSecret() { return process.env.GOOGLE_CLIENT_SECRET ?? ""; },
  get openaiKey() { return process.env.OPENAI_API_KEY ?? ""; },
  get bloomfireKey() { return process.env.BLOOMFIRE_API_KEY ?? ""; },
  get bloomfireEmail() { return process.env.BLOOMFIRE_LOGIN_EMAIL ?? ""; },
  get bloomfireBase() { return (process.env.BLOOMFIRE_BASE_URL ?? "https://connected.wildflowerschools.org").replace(/\/$/, ""); },
  get resendKey() { return process.env.RESEND_API_KEY ?? ""; },
  get mailFrom() { return process.env.MAIL_FROM ?? "Wildflower Wisdom <wisdom@wildflowerschools.org>"; },
  get googleServiceAccountJson() { return process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? ""; },
  /** Domain user the service account acts as (domain-wide delegation). Empty = act as the service account itself. */
  get googleImpersonateEmail() { return process.env.GOOGLE_IMPERSONATE_EMAIL?.trim() ?? ""; },
  /** The "Wildflower Wisdom" shared drive that holds native content. */
  get googleSharedDriveId() { return process.env.GOOGLE_SHARED_DRIVE_ID?.trim() ?? ""; },
};
