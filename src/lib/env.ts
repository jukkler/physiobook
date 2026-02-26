/**
 * Validate required environment variables at startup.
 * In production, throws if any are missing.
 * In development, logs a warning.
 */
export function validateEnv() {
  const required = ["JWT_SECRET", "LOGIN_SALT", "CRON_SECRET", "ALLOWED_ORIGIN"];
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length === 0) return;

  const msg = `Fehlende Umgebungsvariablen: ${missing.join(", ")}`;

  if (process.env.NODE_ENV === "production") {
    throw new Error(msg);
  } else {
    console.warn(`[env] ${msg} (Dev-Fallbacks werden verwendet)`);
  }
}
