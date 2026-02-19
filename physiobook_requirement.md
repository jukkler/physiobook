# 📄 Spec Sheet: "PhysioBook" – Minimalistische Kalender Web App

## 1. Projektübersicht & Philosophie
Entwicklung einer performanten, schlanken Web-App zur Terminverwaltung für eine Physiotherapiepraxis. "No-Bloat" bedeutet hier: Fokus auf das Wesentliche – das digitale Abbild des physischen Terminbuchs, ergänzt um Serienbuchungen, ein Patienten-Widget zur Terminanfrage und automatisierte E-Mail-Benachrichtigungen. Um rechtliche Komplexität (Art. 9 DSGVO - Gesundheitsdaten) zu vermeiden, verarbeitet die App **strikt keine Behandlungsarten oder medizinischen Freitexte**, sondern rein organisatorische Kontaktdaten.

## 2. Benutzerrollen
* **Admin (Therapeut):** Einziger Nutzer der Haupt-App. Hat vollen Zugriff auf den Kalender (Tages-/Wochenansicht), kann Termine eintragen, verschieben, löschen und Anfragen bestätigen/ablehnen.
* **Patient (Gast):** Nutzt das Website-Widget, um freie Zeiten zu sehen und Terminanfragen zu stellen.

---

## 3. Kernfunktionen & Architekturentscheidungen

### A. Das Admin-Dashboard (Das "Buch")
* **Ansichten:** Zweispaltiges Tageslayout (vormittags / nachmittags) als Standard. Zwingende Wochenübersicht für die Ressourcen- und Serienplanung.
* **Konfigurierbarkeit:** Die genauen Raster-Zeiten (z.B. 8-13 Uhr und 13-20 Uhr) lassen sich zentral anpassen.
* **Architektur für Serien (Termine & Blocker):** Wir nutzen *keine* komplexe Recurrence-Rule-Engine (wie iCal/RRULE). 
    * Serientermine (z.B. "6x Dienstags") und wiederkehrende Blocker (z.B. "Tägliche Mittagspause") werden beim Erstellen als **einzelne, physische Datensätze (Instanzen)** in die Datenbank geschrieben.
    * Sie werden über eine gemeinsame `seriesId` bzw. `blockerGroupId` verknüpft. Fällt ein Termin aus, wird nur dieser gelöscht. Sollen alle Folgetermine geändert werden, greift ein Batch-Update auf Basis der ID.

### B. Patienten-Widget (Integration)
* **Ablauf:** Patient wählt einen freien Slot -> Eingabe der Daten -> Anfrage geht an Admin.
* **Strict Data Entry (Kein Freitext):** Um die Erfassung von Gesundheitsdaten technisch auszuschließen, gibt es im Widget absichtlich kein "Bemerkungen"- oder Freitextfeld. Es werden ausschließlich Felder für Name, E-Mail und Telefonnummer angeboten.
* **Konfliktlösung (Locks):** Transaktions-Locks bei zeitgleichen Anfragen. Der erste Request gewinnt, der zweite erhält eine Fehlermeldung ("Gerade vergeben").
* **Timeout-Logik:** Anfragen, die vom Admin nicht innerhalb von z.B. 48 Stunden bestätigt/abgelehnt werden, verfallen automatisch (`EXPIRED`) und geben den Slot wieder frei.

### C. Benachrichtigungssystem
* **E-Mail (Open Source):** Nodemailer in Kombination mit dem SMTP-Server des bestehenden Praxis-Webhosters (z.B. Strato, Ionos). Komplett ohne Drittanbieter/Vendor-Lock-in.
* **SMS (Optional):** Für Terminerinnerungen kann perspektivisch ein simples SMS-Gateway angebunden werden (WhatsApp Business API ist Out-of-Scope für V1 wegen Verifizierungs- und Template-Zwang seitens Meta).

---

## 4. Technisches Konzept, Hosting & Security

| Komponente | Spezifikation |
| :--- | :--- |
| **Framework** | **SvelteKit** oder **Next.js** (als Node.js Applikation). |
| **Datenbank** | **SQLite** (via Prisma oder Drizzle ORM). Schnell, lokal, kein Overhead. |
| **Hosting** | Ein dedizierter VPS (Virtual Private Server) bei z.B. Hetzner (Ubuntu Linux). **Keine** Serverless-Plattformen (wie Vercel), da das flüchtige Dateisystem die SQLite-DB löschen würde. |
| **Authentifizierung** | **Single-User Auth via JWT:** Login mit Nutzername und Passwort (`bcrypt`-gehasht in DB/ENV). Session-Management via **HttpOnly & Secure Cookie**. <br>**Recovery:** Simples CLI-Skript auf dem Server (z.B. `npm run reset-password`) oder fester Reset-Link per Mail an den Admin. |
| **Security at Rest** | Aktivierung der **Full-Disk Encryption (LUKS)** bei der Servereinrichtung. Ausreichender Grundschutz, da keine Gesundheitsdaten gespeichert werden. |
| **Monitoring** | Simpler Endpoint (z.B. `/api/health`). Ein externer Dienst (z.B. UptimeRobot) pingt diesen alle 5 Min. an und sendet eine Mail bei Ausfall. |
| **Offline-Verhalten** | PWA-Konfiguration als **"Last Known State" (Snapshot)**. UI warnt extrem deutlich: *"Du bist offline. Dies ist der Stand von [Uhrzeit]."*, um Doppelbuchungen zu vermeiden. |
| **Backups** | Nächtlicher Cronjob sichert die komprimierte `.sqlite`-Datei auf einen externen Storage oder versendet sie verschlüsselt per E-Mail. |

---

## 5. Datenmodell

* **Appointment (Termin):**
    * `id` (UUID)
    * `patientName` (String)
    * `startTime` (DateTime)
    * `durationMinutes` (Int - meist 15, 30, 45, 60)
    * `status` (Enum: `REQUESTED`, `CONFIRMED`, `CANCELLED`, `EXPIRED`)
    * `seriesId` (UUID, optional) - *Verknüpft generierte Serientermine.*
    * `contactEmail` (String, optional)
    * `contactPhone` (String, optional)
    * `notes` (String, optional) - *Ausschließlich für interne Admin-Kürzel (taucht im Widget nicht auf).*
* **Blocker (Gesperrte Zeiten):**
    * `id` (UUID)
    * `title` (String - z.B. "Mittagspause", "Urlaub")
    * `startTime` (DateTime)
    * `endTime` (DateTime)
    * `blockerGroupId` (UUID, optional) - *Verknüpft Serien-Blocker.*

---

## 6. Datenschutz & Compliance (Reguläre PII)
Da reguläre personenbezogene Daten (Name, Kontakt) erhoben werden, sind folgende Maßnahmen implementiert:
* **Einwilligung (Opt-In):** Das Widget enthält zwingend eine Checkbox (ohne Vorauswahl): *"Ich stimme der Verarbeitung meiner Daten zur Terminvereinbarung zu."* inkl. Link zur Datenschutzerklärung.
* **Retention Policy (Auto-Löschung):** Ein Cronjob bereinigt die Datenbank:
    * Unbeantwortete/abgelehnte Anfragen werden nach X Tagen hart gelöscht.
    * Vergangene Termindaten werden nach Ablauf definierter Fristen anonymisiert/gelöscht.
* **Transportverschlüsselung:** Erzwungenes HTTPS/TLS (via Let's Encrypt / Certbot) für den gesamten Traffic.
* **Auftragsverarbeitung:** Ein AVV (Auftragsverarbeitungsvertrag) mit dem Server-Hoster (z.B. Hetzner) ist abgeschlossen.