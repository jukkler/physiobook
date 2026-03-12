// PM2 Ecosystem Configuration for PhysioBook
// Usage: pm2 start ecosystem.config.js
const fs = require("fs");
const path = require("path");

// Load .env file and pass all variables to the process
// (Next.js standalone does not load .env automatically)
function loadEnv() {
  const envPath = path.resolve(__dirname, ".env");
  const env = { NODE_ENV: "production", PORT: 3000 };
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      env[key] = value;
    }
  } catch {
    // .env not found — use defaults only
  }
  return env;
}

module.exports = {
  apps: [
    {
      name: "physiobook",
      script: ".next/standalone/server.js",
      instances: 1, // SQLite requires single instance
      exec_mode: "fork",
      env: loadEnv(),
      // Restart policy
      max_restarts: 10,
      restart_delay: 5000,
      // Logging
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
