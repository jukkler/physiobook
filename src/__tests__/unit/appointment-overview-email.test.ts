import { describe, expect, it } from "vitest";
import { buildAppointmentOverviewEmail } from "@/lib/appointment-overview-email";

describe("buildAppointmentOverviewEmail", () => {
  it("sorts appointments and formats them in the Berlin timezone", () => {
    const later = Date.UTC(2026, 5, 22, 8, 0);
    const earlier = Date.UTC(2026, 5, 15, 8, 0);
    const result = buildAppointmentOverviewEmail("Max Mustermann", [
      {
        startTime: later,
        endTime: later + 30 * 60_000,
        durationMinutes: 30,
        status: "CONFIRMED",
      },
      {
        startTime: earlier,
        endTime: earlier + 45 * 60_000,
        durationMinutes: 45,
        status: "REQUESTED",
      },
    ]);

    expect(result.html.indexOf("15.06.2026")).toBeLessThan(
      result.html.indexOf("22.06.2026")
    );
    expect(result.html).toContain("10:00");
    expect(result.html).toContain("10:45");
    expect(result.html).toContain("Angefragt");
    expect(result.html).toContain("Best&auml;tigt");
  });

  it("escapes the patient name", () => {
    const startTime = Date.UTC(2026, 5, 15, 8, 0);
    const result = buildAppointmentOverviewEmail("<script>alert('x')</script>", [
      {
        startTime,
        endTime: startTime + 30 * 60_000,
        durationMinutes: 30,
        status: "CONFIRMED",
      },
    ]);

    expect(result.html).not.toContain("<script>alert");
    expect(result.html).toContain("&lt;script&gt;alert('x')&lt;/script&gt;");
  });
});
