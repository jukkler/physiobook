import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "pdfkit", "pdf-parse"],
  // Der Default-Pfad "./physiobook.sqlite" in src/lib/db lässt das File-Tracing
  // Datenbank und Backups (Patientendaten) in .next/standalone kopieren.
  outputFileTracingExcludes: {
    "*": ["./*.sqlite*", "./backups/**"],
  },
};

export default nextConfig;
