# Request Popup & Mailbox Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent toast notifications, mailbox icon with dropdown, and detail modal for incoming appointment requests in the admin dashboard.

**Architecture:** A new API endpoint returns pending requests. A single `RequestNotifier` client component inside `DashboardClient` handles polling, toasts, mailbox dropdown, and detail modal. It receives an `onAction` callback to trigger calendar refresh via `refreshKey`.

**Tech Stack:** Next.js App Router, React (useState/useEffect/useRef/useCallback), Tailwind CSS, existing `Modal` component, existing `withApiAuth` wrapper, `formatBerlinDate`/`formatBerlinTime` from `@/lib/time`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/api/requests/pending/route.ts` | CREATE | API: return all REQUESTED appointments |
| `src/components/RequestNotifier.tsx` | CREATE | Polling + toasts + mailbox icon/dropdown + detail modal |
| `src/components/DashboardClient.tsx` | MODIFY | Import and render `<RequestNotifier onAction={...} />` |

---

## Task 1: API Endpoint

**Files:**
- Create: `src/app/api/requests/pending/route.ts`

- [ ] **Step 1: Create the pending requests API route**

```typescript
// src/app/api/requests/pending/route.ts
import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";

export const GET = withApiAuth(async () => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, patient_name, contact_email, contact_phone,
              start_time, end_time, duration_minutes, created_at
       FROM appointments
       WHERE status = 'REQUESTED'
       ORDER BY created_at DESC`
    )
    .all() as Array<{
    id: string;
    patient_name: string;
    contact_email: string | null;
    contact_phone: string | null;
    start_time: number;
    end_time: number;
    duration_minutes: number;
    created_at: number;
  }>;

  const requests = rows.map((r) => ({
    id: r.id,
    patientName: r.patient_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    startTime: r.start_time,
    endTime: r.end_time,
    durationMinutes: r.duration_minutes,
    createdAt: r.created_at,
  }));

  return Response.json({ requests });
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/requests/pending/route.ts
git commit -m "feat: add GET /api/requests/pending endpoint"
```

---

## Task 2: RequestNotifier Component

**Files:**
- Create: `src/components/RequestNotifier.tsx`

- [ ] **Step 1: Create the RequestNotifier component**

This is a single `"use client"` component with all notification logic. Key parts:

**Type:**
```typescript
interface PendingRequest {
  id: string;
  patientName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  createdAt: number;
}

interface RequestNotifierProps {
  onAction: () => void;
}
```

**State:**
- `pendingRequests: PendingRequest[]`
- `knownIdsRef: useRef<Set<string>>` (ref, not state — avoids re-renders)
- `isFirstPoll: useRef<boolean>` (tracks first-load suppression)
- `toasts: PendingRequest[]`
- `showDropdown: boolean`
- `selectedRequest: PendingRequest | null`
- `actionLoading: boolean`
- `actionError: string`

**Polling logic (useEffect):**
- `fetchPending()` calls `/api/requests/pending`
- On 401: `window.location.href = "/login"`
- On success: update `pendingRequests`; if `isFirstPoll`, populate `knownIdsRef` silently; otherwise diff against `knownIdsRef` and add new ones to `toasts`
- Set `isFirstPoll = false` after first call
- `setInterval(fetchPending, 120_000)` for 2-minute polling
- `document.addEventListener("visibilitychange", ...)`: clear interval when hidden, restart + immediate poll when visible
- Cleanup: clear interval, remove listener

**Toast rendering (fixed top-right, z-[45]):**
- `toasts.slice(0, 3)` rendered as amber cards
- Each shows patient name + `formatBerlinDate(startTime)` + `formatBerlinTime(startTime)`
- Click body → `setSelectedRequest(req)`
- X button → remove from `toasts` only (not from `pendingRequests`)

**Mailbox icon (portaled into `#header-toggle-portal` or inline):**
- Envelope SVG, relative positioned
- Red badge (absolute top-right) with `pendingRequests.length` when > 0
- Click toggles `showDropdown`
- `aria-label={pendingRequests.length > 0 ? \`${pendingRequests.length} offene Anfragen\` : "Keine offenen Anfragen"}`

**Dropdown (absolute, below icon, z-[45]):**
- `useRef` for dropdown element + `useEffect` with `mousedown` listener for outside-click close
- `keydown` listener for Escape close
- Scrollable list (`max-h-64 overflow-y-auto`)
- Each item: patient name + date/time, click → `setSelectedRequest(req)` + close dropdown
- Empty state: "Keine offenen Anfragen" text

**Detail Modal:**
- Rendered when `selectedRequest !== null`
- Uses `<Modal title="Terminanfrage" onClose={...} maxWidth="md">`
- Content: patient name (bold), email, phone, date+time, duration
- Two buttons: "Bestätigen" (green) and "Ablehnen" (red)
- `actionLoading` disables both buttons during API call
- `actionError` shown as red text above buttons
- `handleConfirm`: POST `/api/requests/${id}/confirm`
- `handleReject`: POST `/api/requests/${id}/reject`
- On 200 or 409: remove from `pendingRequests`, `toasts`, `knownIdsRef`; close modal; call `onAction()`
- On other error: set `actionError`

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/RequestNotifier.tsx
git commit -m "feat: add RequestNotifier component with toasts, mailbox, and detail modal"
```

---

## Task 3: Integrate into DashboardClient

**Files:**
- Modify: `src/components/DashboardClient.tsx`

- [ ] **Step 1: Import RequestNotifier and render it**

Add import at top:
```typescript
import RequestNotifier from "./RequestNotifier";
```

Add `<RequestNotifier onAction={() => setRefreshKey((k) => k + 1)} />` right before the closing `</div>` of the root element (after the bulk delete modal, before the portal). This keeps it at the end of the component alongside other modals.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardClient.tsx
git commit -m "feat: integrate RequestNotifier into DashboardClient"
```

---

## Task 4: Manual Verification

- [ ] **Step 1: Start dev server and verify**

Run: `npm run dev`

Verify:
1. Dashboard loads without errors
2. Mailbox icon visible in action bar area
3. If pending requests exist: badge shows count, dropdown lists them
4. Click on request in dropdown → detail modal opens with correct info
5. Confirm/reject works, calendar refreshes, badge updates
6. No console errors

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds without errors.

- [ ] **Step 3: Final commit if any fixes needed**
