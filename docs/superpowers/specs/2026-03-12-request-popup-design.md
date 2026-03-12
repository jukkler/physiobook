# Request Popup & Mailbox Feature

## Problem

Appointment requests submitted via the patient widget are only visible as amber cards in the calendar. The admin has no proactive notification when a new request arrives and must manually scan the calendar to find them.

## Solution

Three interconnected components:

1. **Persistent Toast** — appears when a new request is detected, stays until dismissed or acted on
2. **Mailbox Icon** — in the header, shows badge with count of open requests, opens dropdown list
3. **Request Detail Modal** — shows full request info with confirm/reject buttons

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/components/RequestNotifier.tsx` | Client component: polling, toast display, dropdown, detail modal |
| `src/app/api/requests/pending/route.ts` | API: returns all REQUESTED appointments |

### Modified Files

| File | Change |
|------|--------|
| `src/components/DashboardClient.tsx` | Add `<RequestNotifier />` with `onAction` callback that increments `refreshKey` |

### API: `GET /api/requests/pending`

- Auth-protected (withApiAuth)
- Returns all appointments with `status = 'REQUESTED'`, ordered by `created_at DESC`
- Response: `{ requests: [{ id, patientName, contactEmail, contactPhone, startTime, endTime, durationMinutes, createdAt }] }`

### RequestNotifier Component

Single client component rendered inside `DashboardClient` (not in the server-component header). This avoids the server/client boundary problem — `DashboardClient` owns `refreshKey` and passes an `onAction` callback directly.

**Types:**
- Use `PendingRequest` as the type name (not `Request`, which shadows the Web API global).

**State:**
- `pendingRequests: PendingRequest[]` — current list from API
- `knownIds: Set<string>` — IDs already seen (to detect new arrivals)
- `toasts: PendingRequest[]` — new requests to show as persistent toasts
- `showDropdown: boolean` — mailbox dropdown open/closed
- `selectedRequest: PendingRequest | null` — request shown in detail modal

**Polling:**
- Fetches `/api/requests/pending` every 2 minutes
- On first load: populates `knownIds` without showing toasts (avoids flood on page load)
- On subsequent polls: new IDs (not in `knownIds`) get added to `toasts`
- Pauses when browser tab is hidden (`document.visibilitychange`); polls immediately when tab regains focus
- On fetch error (network, 401, 500): silently continues polling. On 401: redirect to `/login`

**Toast (top-right, persistent):**
- Stacked vertically, max 3 visible, newest on top
- Additional toasts beyond 3 are not shown as toasts but remain accessible via mailbox
- Amber background matching existing request styling (`bg-amber-100 border-amber-300`)
- Shows: patient name, requested time (formatted Berlin timezone)
- Click → opens detail modal
- X button → dismisses toast (does not reject request)
- No auto-dismiss
- Z-index: `z-45` (above main content z-40 zoom controls, below modals z-50)

**Mailbox Icon (rendered via portal into `#header-toggle-portal` or positioned at top of DashboardClient):**
- Envelope SVG icon with red badge showing count when `pendingRequests.length > 0`
- No badge when count is 0; icon still clickable, dropdown shows "Keine offenen Anfragen"
- Click → toggles dropdown panel
- Dropdown closes on outside click or Escape key
- Dropdown: scrollable list of all open requests (name + date/time), max-height with overflow-y-auto
- Click on item → opens detail modal, closes dropdown
- Z-index: `z-45`
- `aria-label` on icon: e.g. "3 offene Anfragen"

**Detail Modal:**
- Uses existing `Modal` component (`maxWidth="md"`)
- Title: "Terminanfrage"
- Content:
  - Patient name (bold)
  - Email + phone
  - Date + time (Berlin timezone, formatted)
  - Duration
- Actions:
  - "Bestätigen" (green button) → `POST /api/requests/[id]/confirm`
  - "Ablehnen" (red button) → `POST /api/requests/[id]/reject`
  - These are same-origin fetch calls; CSRF check passes automatically via browser `Origin` header (requires `ALLOWED_ORIGIN` env var to match production domain)
  - On success (200): remove from `pendingRequests`, `toasts`, `knownIds`; call `onAction()` to refresh calendar
  - On 409 (already confirmed/rejected by another admin/tab): same cleanup — remove from lists, show brief info message
  - On other errors: show inline error message in modal
- Loading state: disable buttons while API call is in-flight

### Calendar Refresh

`RequestNotifier` receives an `onAction` callback prop from `DashboardClient` that increments `refreshKey`, so the calendar re-fetches after confirm/reject.

## Data Flow

```
Patient submits request → DB (status=REQUESTED)
                              ↓
RequestNotifier polls /api/requests/pending every 2min
                              ↓
New request detected → persistent Toast appears
                              ↓
Admin clicks toast OR mailbox item → Detail Modal opens
                              ↓
Admin confirms/rejects → API call → remove from lists → calendar refreshes
```

## Design Decisions

- **Component inside DashboardClient** rather than in the server-component header: avoids the server/client boundary problem for `refreshKey` callback propagation. Mailbox icon can be portaled into the header area or positioned at the top of the client area.
- **Single component** rather than separate Toast/Mailbox/Modal components: these are tightly coupled and share state. Rendering can be split into sub-functions for readability, but state stays in one place.
- **Polling over WebSocket**: simpler, sufficient for 2-minute intervals, no infrastructure changes needed.
- **No auto-dismiss on toasts**: user explicitly requested persistent notifications.
- **First-load suppression**: avoids showing toasts for requests that were already there before the admin opened the dashboard.
- **`knownIds` in component state** (not localStorage): intentional — if admin reloads the page, existing requests won't re-toast (first-load suppression handles it), but truly new ones will.
- **Tab visibility optimization**: no unnecessary polling when admin is on a different tab.

## Verification

1. Submit a request via widget → wait up to 2 minutes → toast appears in dashboard
2. Click toast → detail modal shows correct info
3. Confirm request in modal → toast disappears, badge count decrements, calendar updates
4. Reject request → same behavior
5. Mailbox icon shows correct count, shows "Keine offenen Anfragen" when empty
6. Mailbox dropdown lists all open requests, closes on outside click
7. Page reload → no toasts for existing requests, badge still shows count
8. Multiple requests → toasts stack correctly (max 3 visible)
9. 409 response (already handled) → request removed from UI gracefully
10. Tab hidden → polling pauses; tab visible → immediate poll
