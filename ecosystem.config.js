// PM2 Ecosystem Configuration for PhysioBook
// Usage: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "physiobook",
      script: ".next/standalone/server.js",
      instances: 1, // SQLite requires single instance
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
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
