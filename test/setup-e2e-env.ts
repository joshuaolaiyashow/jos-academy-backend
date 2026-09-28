// Runs before any test module is imported. The real .env points at the
// production database, so e2e runs must be given an explicit local database.
const testDatabaseUrl = process.env.E2E_DATABASE_URL;

if (
  !testDatabaseUrl ||
  !/@(localhost|127\.0\.0\.1)[:/]/.test(testDatabaseUrl)
) {
  throw new Error(
    'E2E_DATABASE_URL must point at a local database (localhost) — refusing to run against a remote one.',
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.DATABASE_SSL = 'false';
process.env.JWT_SECRET = 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
process.env.RESEND_API_KEY = 're_e2e_placeholder';
process.env.APP_URL = 'http://frontend.test';
// Live notifications fan out in-process; tests must never reach a shared Redis.
delete process.env.REDIS_URL;
process.env.API_BASE_URL = 'http://api.test';
process.env.GOOGLE_CLIENT_ID = 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
delete process.env.LINKEDIN_CLIENT_ID;
delete process.env.LINKEDIN_CLIENT_SECRET;
// Room tokens are signed locally; the unreachable URL makes room cleanup fail fast instead of calling LiveKit Cloud.
process.env.LIVEKIT_URL = 'ws://127.0.0.1:1';
process.env.LIVEKIT_API_KEY = 'e2e-livekit-key';
process.env.LIVEKIT_API_SECRET = 'e2e-livekit-secret-at-least-32-characters';
