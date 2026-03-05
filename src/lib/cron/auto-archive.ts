// src/lib/cron/auto-archive.ts
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { generateArchivePdf } from "@/lib/archive";
import { sendEmailWithAttachment } from "@/lib/email";

/**
 * Check if auto-archive should run and send it if due.
 * Returns number of emails sent.
 */
export async function runAutoArchive(): Promise<number> {
  const config = getSettings([
    "autoArchiveEnabled",
    "autoArchiveInterval",
    "autoArchiveType",
    "autoArchiveEmail",
    "autoArchiveLastSent",
    "cronJobEmail",
  ]);

  if (config.autoArchiveEnabled !== "true" || !config.autoArchiveEmail) return 0;

  const now = Date.now();
  const interval = config.autoArchiveInterval || "weekly";
  const lastSent = parseInt(config.autoArchiveLastSent || "0", 10);

  const berlinNow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
  }).format(new Date(now));
  const [, , dayOfMonth] = berlinNow.split("-").map(Number);
  const berlinDow = new Date(berlinNow + "T12:00:00Z").getUTCDay();

  let shouldSend = false;
  if (interval === "daily" && now - lastSent > 23 * 3600_000) {
    shouldSend = true;
  } else if (interval === "weekly" && berlinDow === 1 && now - lastSent > 6 * 24 * 3600_000) {
    shouldSend = true;
  } else if (interval === "monthly" && dayOfMonth === 1 && now - lastSent > 27 * 24 * 3600_000) {
    shouldSend = true;
  }

  if (!shouldSend) return 0;

  const archiveType = (config.autoArchiveType as "week" | "month" | "year") || "week";
  const berlinDate = new Date(berlinNow + "T12:00:00Z");
  const yesterday = new Date(berlinDate);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const archiveDate = yesterday.toISOString().split("T")[0];

  const archiveLabels: Record<string, string> = {
    week: "Wochenarchiv",
    month: "Monatsarchiv",
    year: "Jahresarchiv",
  };

  const { buffer, filename, title } = await generateArchivePdf(archiveType, archiveDate);

  const recipients = [config.autoArchiveEmail];
  if (config.cronJobEmail) recipients.push(config.cronJobEmail);

  let sentCount = 0;
  for (const recipient of recipients) {
    const result = await sendEmailWithAttachment(
      recipient,
      title,
      `<p>Im Anhang finden Sie das ${archiveLabels[archiveType]}.</p>`,
      { filename, content: buffer }
    );
    if (result.ok) sentCount++;
    else console.error(`Cron: auto-archive email error (${recipient}):`, result.error);
  }

  if (sentCount > 0) {
    const db = getDb();
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('autoArchiveLastSent', ?)
       ON CONFLICT(key) DO UPDATE SET value = ?`
    ).run(String(now), String(now));
  }

  return sentCount;
}
