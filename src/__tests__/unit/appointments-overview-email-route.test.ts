import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  sendHtmlEmail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withApiAuth: (handler: (...args: never[]) => unknown) => handler,
}));
vi.mock("@/lib/csrf", () => ({
  checkCsrf: () => ({ ok: true }),
}));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/email", () => ({ sendHtmlEmail: mocks.sendHtmlEmail }));

import { POST } from "@/app/api/patients/[id]/appointments-email/route";

function mockDatabase(
  patient: { name: string; email: string | null } | undefined,
  appointments: Array<{
    start_time: number;
    end_time: number;
    duration_minutes: number;
    status: "CONFIRMED" | "REQUESTED";
  }> = []
) {
  const prepare = vi.fn((sql: string) => {
    if (sql.includes("FROM patients")) {
      return { get: vi.fn(() => patient) };
    }
    return { all: vi.fn(() => appointments) };
  });
  mocks.getDb.mockReturnValue({ prepare });
}

function sendRequest() {
  return POST(
    new Request("http://localhost/api/patients/p-1/appointments-email", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "p-1" }) }
  );
}

describe("POST /api/patients/[id]/appointments-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendHtmlEmail.mockResolvedValue({ ok: true });
  });

  it("rejects patients without a stored email address", async () => {
    mockDatabase({ name: "Max Mustermann", email: null });

    const response = await sendRequest();

    expect(response.status).toBe(400);
    expect(mocks.sendHtmlEmail).not.toHaveBeenCalled();
  });

  it("rejects patients without future appointments", async () => {
    mockDatabase({ name: "Max Mustermann", email: "max@example.de" });

    const response = await sendRequest();

    expect(response.status).toBe(404);
    expect(mocks.sendHtmlEmail).not.toHaveBeenCalled();
  });

  it("sends the overview to the stored email address", async () => {
    const startTime = Date.now() + 24 * 60 * 60_000;
    mockDatabase(
      { name: "Max Mustermann", email: " max@example.de " },
      [
        {
          start_time: startTime,
          end_time: startTime + 30 * 60_000,
          duration_minutes: 30,
          status: "CONFIRMED",
        },
      ]
    );

    const response = await sendRequest();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      email: "max@example.de",
      appointmentCount: 1,
    });
    expect(mocks.sendHtmlEmail).toHaveBeenCalledWith(
      "max@example.de",
      expect.stringContaining("Terminübersicht"),
      expect.stringContaining("Max Mustermann")
    );
  });
});
