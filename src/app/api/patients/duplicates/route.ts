import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function extractSurname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

export const GET = withApiAuth(async () => {
  const db = getDb();
  const patients = db.prepare(
    "SELECT id, name, email, phone FROM patients ORDER BY name COLLATE NOCASE"
  ).all() as { id: string; name: string; email: string | null; phone: string | null }[];

  // Group by similar surnames
  const groups: { id: string; name: string; email: string | null; phone: string | null }[][] = [];
  const used = new Set<string>();

  for (let i = 0; i < patients.length; i++) {
    if (used.has(patients[i].id)) continue;
    const surnameI = extractSurname(patients[i].name);
    const group = [patients[i]];

    for (let j = i + 1; j < patients.length; j++) {
      if (used.has(patients[j].id)) continue;
      const surnameJ = extractSurname(patients[j].name);

      // Exact match or Levenshtein ≤ 2
      if (surnameI === surnameJ || levenshtein(surnameI, surnameJ) <= 2) {
        group.push(patients[j]);
      }
    }

    if (group.length >= 2) {
      for (const p of group) used.add(p.id);
      groups.push(group);
    }
  }

  return Response.json({ groups });
});
