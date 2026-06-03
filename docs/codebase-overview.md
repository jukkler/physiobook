# PhysioBook Codebase Overview

Stand: 2026-06-03

Dieses Dokument ist als schneller Einstieg fuer zukuenftige Arbeiten gedacht. Es beschreibt die Architektur, wichtige Dateien, Datenfluesse und typische Stellen, an denen man bei Aenderungen besonders genau hinschauen sollte.

## Zweck der App

PhysioBook ist ein digitales Terminbuch fuer eine Physiotherapiepraxis. Die App verwaltet Termine, Blocker, Patientenstammdaten, oeffentliche Terminanfragen, E-Mail-Benachrichtigungen und PDF-Archive.

Wichtiges fachliches Prinzip: Die App speichert organisatorische Kontaktdaten, aber keine medizinischen Gesundheitsdaten.

## Tech Stack

- Next.js 16 mit App Router und TypeScript
- React 19
- SQLite via `better-sqlite3`
- Drizzle ORM fuer Schema/typisierte Queries an einigen Stellen
- JWT-Auth mit `jose`
- Passwort-Hashing mit `bcryptjs`
- E-Mail via `nodemailer`
- PDF-Erzeugung via `pdfkit`
- Tests mit Vitest
- Deployment via PM2/Nginx auf Ubuntu

## Wichtige Befehle

```bash
npm run dev
npm run build
npm run start
npm test
npm run db:migrate
npm run db:seed
npm run reset-password -- <passwort>
```

Bei Build-Problemen kann `next/font` Netzwerkzugriff zu Google Fonts benoetigen. Ein TypeScript-Check ohne Build ist:

```bash
npx tsc --noEmit
```

## Projektstruktur

```text
src/
  app/
    dashboard/          Admin-Kalender
    patienten/          Patientenverwaltung
    verwaltung/         Einstellungen und Admin-Werkzeuge
    email-einstellungen/ E-Mail-Textvorlagen und Signatur
    widget/             Oeffentliches Buchungs-Widget
    login/              Login-Seite
    api/                REST-artige API-Routen
  components/
    calendar/           Tages-, Wochen-, Monatsansicht
    dashboard/          Dialoge/Suche/Bulk-Aktionen im Kalender
    forms/              Termin- und Blockerformulare
    ui/                 Kleine wiederverwendbare UI-Bausteine
    verwaltung/         Einstellungs-Panels
  lib/
    db/                 SQLite/Drizzle Schema und DB-Singleton
    cron/               Cron-Tasks
    *.ts                Business-Logik: Auth, Zeit, Overlap, Mail, Archiv usw.
drizzle/                SQL-Migrationen
scripts/                Seed, Passwort-Reset, Backup, Nginx-Beispiel
docs/                   Projektplaene und Dokumentation
```

## Zentrale Seiten

- `src/app/page.tsx`: Einstiegsroute, leitet typischerweise weiter.
- `src/app/dashboard/page.tsx`: Geschuetzte Kalenderseite.
- `src/components/DashboardClient.tsx`: Haupt-Client-State fuer Kalenderansicht, Dialoge, Suche, Zoom und Refresh.
- `src/app/patienten/page.tsx` und `src/components/PatientenClient.tsx`: Patientenverwaltung.
- `src/app/verwaltung/page.tsx` und `src/components/VerwaltungClient.tsx`: Praxisinformationen, Archiv, Import, Reminder-Aktivierung und Admin-Werkzeuge.
- `src/app/email-einstellungen/page.tsx` und `src/components/EmailSettingsClient.tsx`: SMTP-Versand, E-Mail-Vorlagen fuer Terminfenster, Erinnerungen, Archivversand und globale Signatur.
- `src/app/widget/page.tsx`: Oeffentliches iFrame-faehiges Buchungs-Widget.
- `src/app/login/page.tsx`: Admin-Login.

## Auth und Zugriffsschutz

Auth sitzt hauptsaechlich in:

- `src/lib/auth.ts`
- `src/middleware.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/logout/route.ts`

Die Middleware prueft fuer geschuetzte Routen JWT-Signatur und Ablauf. Server-Komponenten und API-Routen verwenden `verifySessionFromCookies()` oder `withApiAuth()`, um zusaetzlich gegen die DB und `tokenVersion` zu pruefen.

Oeffentliche Routen sind unter anderem:

- `/login`
- `/widget`
- `/api/auth/login`
- `/api/slots`
- `/api/requests`
- `/api/health`
- `/api/cron`
- `/api/contact`

Mutierende geschuetzte API-Routen verwenden in der Regel zusaetzlich `checkCsrf()`.

## Datenbank

DB-Verbindung:

- `src/lib/db/index.ts`

Schema:

- `src/lib/db/schema.ts`

Migrationen:

- `drizzle/*.sql`

Wichtige Tabellen:

- `appointments`: Termine und Terminanfragen.
- `appointment_series`: explizite Regeln fuer Serientermine.
- `patients`: Patientenstammdaten mit Name, E-Mail und Telefon.
- `blockers`: Gesperrte Zeitraeume.
- `admin_users`: Admin-Nutzer, Login-Hash und UI-Praeferenzen.
- `settings`: Key/Value-Konfiguration.
- `email_outbox`: Asynchrone Mail-Warteschlange.
- `login_attempts`: Rate-Limiting fuer Loginversuche.

`appointments` speichert Zeiten als Epoch Milliseconds in UTC. Anzeige und Eingabe werden ueber `Europe/Berlin` gemappt.

## Patientenkontakte und Terminverknuepfung

Seit der Patient-Contact-Sync-Umstellung liegen Kontaktinformationen nicht mehr direkt auf `appointments`, sondern in `patients`.

Aktueller Grundsatz:

- `appointments.patient_id` verweist logisch auf `patients.id`.
- `appointments.patient_name` bleibt denormalisiert fuer schnelle Anzeige und Legacy-Migrationen.
- API-Antworten joinen `patients.email` und `patients.phone` als `contactEmail` / `contactPhone` zurueck.

Wichtige Dateien:

- `src/lib/patients.ts`
- `src/app/api/appointments/route.ts`
- `src/app/api/appointments/[id]/route.ts`
- `src/app/api/requests/route.ts`
- `src/app/api/requests/pending/route.ts`
- `src/app/api/requests/[id]/confirm/route.ts`
- `src/app/api/requests/[id]/reject/route.ts`
- `src/lib/reminders.ts`
- `src/lib/archive.ts`

Bei Aenderungen in diesem Bereich besonders pruefen:

- Wird `patient_id` gesetzt?
- Wird `patient_name` mit dem verknuepften Patienten synchron gehalten?
- Werden Kontaktfelder nur in `patients` geaendert?
- Gibt es Orphans, also Termine mit `patient_id`, aber ohne passenden Patienten?

Nuetzliche lokale Checks:

```bash
node -e "const Database=require('better-sqlite3'); const db=new Database('physiobook.sqlite',{readonly:true}); console.log(db.prepare('SELECT COUNT(*) missing FROM appointments WHERE patient_id IS NULL').get()); console.log(db.prepare('SELECT COUNT(*) orphan FROM appointments a LEFT JOIN patients p ON p.id=a.patient_id WHERE a.patient_id IS NOT NULL AND p.id IS NULL').get()); console.log(db.prepare('SELECT COUNT(*) mismatch FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.patient_name != p.name COLLATE NOCASE').get());"
```

## Termin-Flow

Termine werden ueber diese Routen verwaltet:

- `GET /api/appointments?from=<epochMs>&to=<epochMs>`
- `POST /api/appointments`
- `GET /api/appointments/[id]`
- `PATCH /api/appointments/[id]?scope=single|future|series`
- `DELETE /api/appointments/[id]?scope=single|future|series`
- `POST /api/appointments/[id]/email` mit JSON `{ subject, message }`
- `DELETE /api/appointments/bulk`

Wichtige Logik:

- `src/lib/overlap.ts`: Kollisionen zwischen Terminen und Blockern.
- `src/lib/series-rules.ts`: Pure Helfer fuer Serientermin-Regeln und konkrete Vorkommen.
- `src/lib/appointment-series.ts`: DB-Service fuer Erstellen, Bearbeiten, Splitten und Loeschen von Serienterminen.
- `src/lib/validation.ts`: Dauer, E-Mail usw.
- `src/lib/notes-filter.ts`: Filter fuer Notizen.
- `src/lib/series-detect.ts`: Explizite Admin-Migration fuer alte ungruppierte Terminmuster.
- `src/lib/time.ts`: Berlin-Zeit-Konvertierung.

Serientermine haben zwei Ebenen:

- `appointment_series` speichert Patient, erstes Vorkommen, Dauer, Intervall, Anzahl, letztes Vorkommen und Status.
- `appointments` bleibt die materialisierte Kalenderquelle. Jedes Vorkommen traegt optional `series_id`, `series_occurrence_index`, `series_original_start_time` und `series_exception_type`.
- Normale Einzeltermine loesen keine automatische Serienerkennung mehr aus. Neue Serien entstehen nur ueber `POST /api/appointments` mit `series`.
- Bearbeiten und Loeschen von Serien laufen ueber explizite Scopes: `single` betrifft nur ein Vorkommen, `future` splittet die Serie ab diesem Vorkommen, `series` betrifft alle Vorkommen.
- Zeitkonflikte bei Serien werden strukturiert als `conflictDetails` zurueckgegeben, damit die UI mehrere kollidierende Vorkommen anzeigen kann.

Kollisionen verwenden halb-offene Intervalle:

```text
[start, end)
```

Overlap-Bedingung:

```text
newStart < existingEnd AND newEnd > existingStart
```

## Oeffentliches Widget und Anfragen

Das Widget lebt in:

- `src/app/widget/page.tsx`

Der oeffentliche Request-Endpoint ist:

- `src/app/api/requests/route.ts`

Flow:

1. Widget laedt verfuegbare Tage und Slots ueber `/api/slots` und `/api/slots/availability`.
2. Patient waehlt Slot und sendet Name, E-Mail, Telefon, Dauer und Einwilligung.
3. Backend prueft Rate Limit, Validierung, Zukunft, Slot-Kollisionen.
4. Es wird ein Appointment mit Status `REQUESTED` angelegt.
5. Optional wird eine Admin-Mail in `email_outbox` gelegt.
6. Admin bestaetigt oder lehnt ueber Request-Notifier.

Wichtige Routen:

- `src/app/api/requests/pending/route.ts`
- `src/app/api/requests/[id]/confirm/route.ts`
- `src/app/api/requests/[id]/reject/route.ts`

## Slots und Arbeitszeiten

Freie Slots werden ueber Settings und Blocker/Termine berechnet.

Wichtige Dateien:

- `src/app/api/slots/route.ts`
- `src/app/api/slots/availability/route.ts`
- `src/app/api/slots/next-free/route.ts`
- `src/lib/settings.ts`
- `src/lib/time.ts`

Settings mit Defaults:

- `morningStart`
- `morningEnd`
- `afternoonStart`
- `afternoonEnd`
- `slotDuration`
- `requestTimeoutHours`
- `retentionDaysExpired`
- `retentionDaysPast`

## E-Mail, Reminder und Cron

Cron-Endpoint:

- `src/app/api/cron/route.ts`

Cron fuehrt nacheinander aus:

- Reminder in Outbox legen: `src/lib/reminders.ts`
- Mail-Queue verarbeiten: `src/lib/email.ts`
- Abgelaufene Requests markieren: `src/lib/cron/expire.ts`
- Retention-Cleanup: `src/lib/cron/cleanup.ts`
- Auto-Archiv: `src/lib/cron/auto-archive.ts`

Der Cron-Endpoint ist oeffentlich erreichbar, aber ueber `Authorization: Bearer <CRON_SECRET>` geschuetzt.

Manuell aus dem Kalender versendete Termin-E-Mails nutzen direkten SMTP-Versand ueber `src/lib/appointment-email.ts`. Das Terminformular oeffnet dafuer einen Composer mit editierbarem Betreff und Nachrichtentext; das Backend validiert die Inhalte und escaped den Text vor dem HTML-Versand. Dadurch kann das Terminformular sofort Erfolg oder SMTP-/Validierungsfehler anzeigen.

E-Mail-Texte werden ueber `src/lib/email-templates.ts` gerendert. Die editierbaren Vorlagen liegen in der `settings`-Tabelle:

- `appointmentEmailSubjectTemplate` / `appointmentEmailBodyTemplate`
- `reminderEmailSubjectTemplate` / `reminderEmailBodyTemplate`
- `archiveEmailSubjectTemplate` / `archiveEmailBodyTemplate`
- `emailSignature`

Praxisinformationen werden ebenfalls in `settings` gespeichert:

- `practiceName`
- `practiceAddress`
- `practicePhone`

Unterstuetzte Platzhalter sind unter anderem `@Name`, `@Datum`, `@Uhrzeit`, `@Dauer`, `@ArchivTyp`, `@ArchivTitel`, `@ArchivDatum`, `@Praxisname`, `@Praxisadresse` und `@Praxistelefon`.

## PDF-Archiv und Import

PDF-Archiv:

- `src/lib/archive.ts`
- `src/app/api/archive/route.ts`
- `src/components/verwaltung/ArchiveDownloadPanel.tsx`
- `src/components/verwaltung/AutoArchivePanel.tsx`

PDF-Import:

- `src/app/api/appointments/import/route.ts`
- `src/components/verwaltung/PdfImportPanel.tsx`

Der Import parst Archiv-PDF-Text heuristisch. Bei Aenderungen hier immer mit echten Export-Beispielen testen, weil PDF-Text-Reihenfolge fragil sein kann.

## Patientenverwaltung

Wichtige Routen:

- `GET /api/patients`
- `POST /api/patients`
- `PATCH /api/patients/[id]`
- `DELETE /api/patients/[id]`
- `GET /api/patients/duplicates`
- `POST /api/patients/merge`
- `POST /api/patients/import`

Wichtige Dateien:

- `src/components/PatientenClient.tsx`
- `src/components/PatientenMergeDialog.tsx`
- `src/lib/patients.ts`

Beim Bearbeiten oder Mergen von Patienten muss immer geprueft werden, dass zugehoerige Termine konsistent bleiben.

## Tests

Unit-Tests liegen unter:

```text
src/__tests__/unit/
```

Aktuell abgedeckte Kernbereiche:

- HTML escaping
- Validation
- Notes-Filter
- Time utilities
- Overlap-Logik
- Series-Regeln und Appointment-Series-Service

Vor groesseren Aenderungen mindestens ausfuehren:

```bash
npx tsc --noEmit
npm test
```

Bei UI- oder Next-spezifischen Aenderungen zusaetzlich:

```bash
npm run build
```

## Typische Stolperstellen

### 1. Raw SQL und CamelCase

Viele API-Routen nutzen raw SQL und mappen danach manuell von `snake_case` auf `camelCase`. Beispiel:

```text
patient_name -> patientName
contact_email -> contactEmail
```

Wenn neue Felder ergaenzt werden, beide Seiten pruefen.

### 2. Drizzle und Raw SQL gemischt

Das Projekt nutzt Drizzle nicht ueberall. Manche Routen verwenden `getOrmDb()`, viele verwenden `getDb()` und prepared statements. Bei Refactors nicht automatisch alles auf eine Variante umstellen.

### 3. Zeitlogik und DST

Zeiten immer ueber `src/lib/time.ts` behandeln. Nicht direkt lokale Date-Strings mit `new Date()` interpretieren, wenn Berlin-Zeit gemeint ist.

### 4. Denormalisierte Patientennamen

`appointments.patient_name` ist bewusst redundant. Es muss aber mit `patients.name` synchron bleiben, wenn `patient_id` gesetzt ist.

### 5. Oeffentliche Endpoints

`/api/requests`, `/api/slots`, `/api/contact` und `/widget` sind bewusst oeffentlich. Aenderungen dort brauchen besondere Aufmerksamkeit fuer Rate Limits, CORS, Validierung und Datenschutz.

### 6. Produktionsdatenbank

Vor produktiven Migrationen oder Reparaturscripts immer Backup erstellen. SQLite plus WAL erfordert saubere Backups, idealerweise ueber das vorhandene Backup-Script oder SQLite-Backup-Mechanismus statt einfachem Kopieren im laufenden Betrieb.

## Lokale Datenqualitaetschecks

Schema der Appointment-Tabelle:

```bash
node -e "const Database=require('better-sqlite3'); const db=new Database('physiobook.sqlite',{readonly:true}); console.log(db.prepare('PRAGMA table_info(appointments)').all().map(c=>c.name).join(','));"
```

Patient-Link-Integritaet:

```bash
node -e "const Database=require('better-sqlite3'); const db=new Database('physiobook.sqlite',{readonly:true}); console.log(db.prepare('SELECT COUNT(*) AS missing FROM appointments WHERE patient_id IS NULL').get()); console.log(db.prepare('SELECT COUNT(*) AS orphan FROM appointments a LEFT JOIN patients p ON p.id=a.patient_id WHERE a.patient_id IS NOT NULL AND p.id IS NULL').get()); console.log(db.prepare('SELECT COUNT(*) AS mismatch FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.patient_name != p.name COLLATE NOCASE').get());"
```

Termine nach Status:

```bash
node -e "const Database=require('better-sqlite3'); const db=new Database('physiobook.sqlite',{readonly:true}); console.log(db.prepare('SELECT status, COUNT(*) count FROM appointments GROUP BY status ORDER BY status').all());"
```

## Empfohlene Arbeitsweise

1. Relevante Route/Komponente und `src/lib`-Helfer lesen.
2. Datenmodell-Auswirkungen pruefen.
3. Bei mutierenden API-Aenderungen CSRF/Auth/Validation mitdenken.
4. Erst kleine gezielte Tests oder Typecheck laufen lassen.
5. Bei DB-Aenderungen Migration, Schema und bestehende raw SQL Queries gemeinsam aktualisieren.
6. Vor Deployments Build lokal pruefen und Produktions-DB sichern.
