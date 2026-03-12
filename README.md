# PhysioBook

Digitales Terminbuch fuer Physiotherapiepraxen. Verwaltet Termine, Blocker, Patientenstammdaten und Patientenanfragen ueber ein Web-Interface. Keine Gesundheitsdaten -- nur organisatorische Kontaktdaten (DSGVO-konform).

---

## Was kann PhysioBook?

| Funktion | Beschreibung |
|----------|-------------|
| Kalender | Tages- und Wochenansicht mit Drag & Drop |
| Termine | Einzeltermine und Serientermine (woechentlich), Status: Bestaetigt / Anfrage / Abgesagt |
| Patienten | Stammdaten verwalten (Name, E-Mail, Telefon), Suche, CSV-Import |
| Autocomplete | Beim Anlegen eines Termins werden bekannte Patienten vorgeschlagen und Kontaktdaten automatisch ausgefuellt |
| Patienten-Widget | Oeffentliches Buchungsformular -- Patienten koennen selbst Termine anfragen (ohne Login) |
| E-Mail-Erinnerungen | Automatische Benachrichtigung 24 Stunden vor dem Termin |
| PDF-Archiv | Wochen-, Monats- oder Jahresuebersicht als PDF -- manueller Download oder automatischer E-Mail-Versand |
| Verwaltung | SMTP, Blocker, Zeitslots, Auto-Archiv, Benachrichtigungen -- alles ueber die Weboberflaeche konfigurierbar |

---

## Schnellstart (lokale Entwicklung)

> Diese Schritte sind nur noetig, wenn du die App lokal auf deinem Rechner testen willst. Fuer den produktiven Betrieb auf einem Server siehe [Deployment](#deployment-auf-einem-server).

```bash
# 1. Dependencies installieren
npm install

# 2. Konfigurationsdatei anlegen
cp .env.example .env
#    -> Die Datei .env mit einem Texteditor oeffnen und die Platzhalter ersetzen
#       (Details siehe Abschnitt "Environment-Variablen")

# 3. Datenbank einrichten
npm run db:migrate
npm run db:seed

# 4. Entwicklungsserver starten
npm run dev
```

Anschliessend im Browser [http://localhost:3000](http://localhost:3000) oeffnen.

**Standard-Login:** `admin` / `admin` -- bitte sofort aendern in Production.

### Verfuegbare Scripts

| Befehl | Beschreibung |
|--------|-------------|
| `npm run dev` | Entwicklungsserver starten (Port 3000) |
| `npm run build` | Production-Build erstellen |
| `npm run start` | Production-Server starten |
| `npm test` | Unit-Tests ausfuehren |
| `npm run db:migrate` | Datenbank-Migrationen ausfuehren |
| `npm run db:seed` | Default-Admin und Settings anlegen |
| `npm run reset-password -- <passwort>` | Admin-Passwort zuruecksetzen |

---

## Tech-Stack

| Bereich | Technologie |
|---------|------------|
| Framework | Next.js 16 (App Router, TypeScript, Standalone-Build) |
| Datenbank | SQLite via better-sqlite3 (WAL-Mode) |
| ORM | Drizzle ORM |
| Auth | JWT (jose) + bcryptjs, HttpOnly-Cookie |
| E-Mail | Nodemailer (async via Outbox-Pattern + Cron) |
| PDF | pdfkit |
| Deployment | VPS mit PM2 + Nginx + Let's Encrypt |

---

## Projektstruktur

```
src/
  app/
    dashboard/          Kalender (Tages-/Wochenansicht)
    patienten/          Patientenverwaltung (Stammdaten, CSV-Import)
    verwaltung/         Einstellungen (SMTP, Archiv, Benachrichtigungen, Blocker, Slots)
    widget/             Oeffentliches Buchungs-Widget fuer Patienten
    api/                REST-API (Appointments, Blockers, Patients, Slots, Requests, ...)
    login/              Login-Seite
  components/           React-Komponenten (Calendar, Forms, PatientenClient, ...)
  lib/                  DB, Auth, Overlap-Logik, Rate-Limiting, E-Mail, Reminders, PDF
scripts/
  seed.ts               Default-Admin + Settings anlegen
  reset-password.ts     Admin-Passwort zuruecksetzen
  backup.sh             SQLite-Backup (WAL-safe)
  nginx.example.conf    Nginx-Konfiguration
ecosystem.config.js     PM2-Konfiguration
```

---

## Deployment auf einem Server

> Schritt-fuer-Schritt-Anleitung fuer ein frisches Ubuntu-System (z.B. Hetzner Cloud VPS). Jeder Schritt ist einzeln ausfuehrbar -- einfach die Befehle kopieren und im Terminal einfuegen.

### Voraussetzungen

- Ein Server mit **Ubuntu 22.04 oder 24.04** (z.B. Hetzner Cloud ab CX22)
- Eine **Domain** (z.B. `kalender.therapiezentrum-ziesemer.de`), die per DNS (A-Record) auf die IP-Adresse des Servers zeigt
- **SSH-Zugang** zum Server (z.B. ueber ein Terminal-Programm wie PuTTY oder das eingebaute Terminal auf Mac/Linux)
- Optional: Ein **SMTP-Konto** fuer den E-Mail-Versand (z.B. von deinem Webhoster, Mailgun oder Postmark)

### Schritt 1 -- Server-Software installieren

Verbinde dich per SSH mit deinem Server und fuehre folgende Befehle aus. Diese installieren alle benoetigten Programme:

```bash
# System auf den neuesten Stand bringen
sudo apt update && sudo apt upgrade -y

# Grundlegende Werkzeuge installieren
sudo apt install -y curl git sqlite3 ufw nginx certbot python3-certbot-nginx
```

**Node.js** (die Laufzeitumgebung fuer die App) installieren:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**PM2** installieren -- ein Programm, das die App im Hintergrund laufen laesst und sie automatisch neustartet, falls sie abstuerzt:

```bash
sudo npm install -g pm2
```

### Schritt 2 -- Firewall einrichten

Die Firewall sorgt dafuer, dass nur die noetigsten Ports offen sind (SSH + Web):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Bei der Frage `Proceed with operation (y|n)?` mit **y** bestaetigen.

### Schritt 3 -- Eigenen Benutzer fuer die App anlegen

Aus Sicherheitsgruenden sollte die App nicht als `root` laufen. Erstelle einen eigenen Benutzer:

```bash
sudo adduser --disabled-password --gecos "" physiobook
```

Wechsle zu diesem Benutzer (alle weiteren Befehle werden als `physiobook` ausgefuehrt):

```bash
sudo su - physiobook
```

### Schritt 4 -- Code herunterladen

```bash
cd ~
git clone https://github.com/jukkler/physiobook.git
cd physiobook

# Abhaengigkeiten installieren
npm ci --omit=dev
npm install --save-dev drizzle-kit tsx
```

> `<repo-url>` durch die tatsaechliche Git-URL des Repositories ersetzen.

### Schritt 5 -- Konfiguration (.env-Datei)

Die App wird ueber eine Konfigurationsdatei namens `.env` gesteuert. Erstelle sie aus der Vorlage:

```bash
cp .env.example .env
nano .env
```

> **nano** ist ein einfacher Texteditor im Terminal. Aenderungen speichern: `Strg+O`, dann `Enter`. Editor beenden: `Strg+X`.

Ersetze die Platzhalter mit deinen echten Werten. Hier ein Beispiel mit Erklaerungen:

```env
# --- Datenbank ---
DATABASE_PATH=./physiobook.sqlite

# --- Sicherheit ---
# Fuer jeden der drei folgenden Werte brauchst du einen eigenen langen Zufallstext.
# Erstelle ihn mit diesem Befehl (dreimal ausfuehren, jedes Mal einen anderen Wert eintragen):
#   openssl rand -base64 32
JWT_SECRET=hier-einen-langen-zufallstext-einfuegen
LOGIN_SALT=hier-einen-anderen-zufallstext-einfuegen
CRON_SECRET=und-noch-einen-dritten-zufallstext

# --- E-Mail-Versand (SMTP) ---
# Diese Daten bekommst du von deinem E-Mail-Anbieter (z.B. Webhoster, Mailgun, Postmark).
# Wenn du (noch) keine E-Mails verschicken willst, lass die Werte leer --
# die App funktioniert auch ohne, nur Erinnerungen und Archiv-Versand sind dann deaktiviert.
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=praxis@example.com
SMTP_PASS=dein-smtp-passwort
SMTP_FROM="Therapiezentrum Ziesemer <info@therapiezentrum-ziesemer.de>"

# --- Domain ---
# Die Domain, unter der die App erreichbar sein wird.
# Wichtig fuer die Sicherheit: Nur Anfragen von dieser Domain werden akzeptiert.
ALLOWED_ORIGIN=https://kalender.therapiezentrum-ziesemer.de

# --- Widget-Einbettung ---
# Das Patienten-Widget wird per iFrame auf der Hauptwebsite eingebettet.
# WIDGET_ORIGIN muss auf die Domain gesetzt werden, die das Widget einbettet,
# damit die CORS-Headers fuer die API-Aufrufe aus dem iFrame funktionieren.
WIDGET_ORIGIN=https://therapiezentrum-ziesemer.de

# --- Proxy ---
# Immer auf "true" setzen, wenn die App hinter Nginx laeuft (was bei diesem Setup der Fall ist).
TRUST_PROXY=true
```

### Schritt 6 -- Datenbank einrichten

```bash
# Datenbank-Tabellen erstellen
npx tsx src/lib/db/migrate.ts

# Standard-Admin-Benutzer anlegen
npx tsx scripts/seed.ts
```

**Wichtig:** Aendere sofort das Standard-Passwort (`admin`):

```bash
npx tsx scripts/reset-password.ts "DeinSicheresPasswort123!"
```

### Schritt 7 -- App bauen

```bash
npm run build

# Statische Dateien in den Build-Ordner kopieren (notwendiger Schritt bei Next.js)
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
```

### Schritt 8 -- App mit PM2 starten

PM2 haelt die App dauerhaft am Laufen -- auch nach einem Serverneustart.

```bash
# Log-Verzeichnis anlegen
mkdir -p logs

# App starten
pm2 start ecosystem.config.js

# Pruefen, ob alles laeuft (Status sollte "online" sein)
pm2 status
```

Damit die App nach einem Server-Neustart automatisch wieder startet:

```bash
pm2 startup
```

PM2 zeigt jetzt einen Befehl an, der mit `sudo` beginnt. **Kopiere diesen Befehl und fuehre ihn aus** (dafuer musst du vorher mit `exit` zurueck zum Root-Benutzer wechseln und den Befehl dort ausfuehren, dann wieder `sudo su - physiobook`).

Anschliessend den aktuellen Zustand speichern:

```bash
pm2 save
```

### Schritt 9 -- Nginx einrichten

Nginx ist der Webserver, der Anfragen aus dem Internet entgegennimmt und an die App weiterleitet. Wechsle zurueck zum Root-Benutzer (`exit`) und fuehre aus:

```bash
# Konfigurationsdatei kopieren
sudo cp /home/physiobook/physiobook/scripts/nginx.example.conf /etc/nginx/sites-available/physiobook

# Domain anpassen -- ersetze "kalender.therapiezentrum-ziesemer.de" durch deine echte Domain:
sudo nano /etc/nginx/sites-available/physiobook
```

In der Datei findest du mehrere Stellen mit `kalender.therapiezentrum-ziesemer.de` -- aendere alle auf deine Domain (z.B. `kalender.therapiezentrum-ziesemer.de`).

```bash
# Konfiguration aktivieren
sudo ln -s /etc/nginx/sites-available/physiobook /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Pruefen und neu laden
sudo nginx -t && sudo systemctl reload nginx
```

### Schritt 10 -- SSL-Zertifikat (HTTPS)

Damit die App ueber eine sichere Verbindung (https://) erreichbar ist, brauchst du ein SSL-Zertifikat. Let's Encrypt stellt kostenlose Zertifikate aus:

```bash
sudo certbot --nginx -d kalender.therapiezentrum-ziesemer.de
```

> Ersetze `kalender.therapiezentrum-ziesemer.de` durch deine echte Domain. Certbot fragt nach einer E-Mail-Adresse fuer Benachrichtigungen -- gib dort eine gueltige Adresse ein.

Zertifikate werden automatisch erneuert. Zum Testen:

```bash
sudo certbot renew --dry-run
```

### Schritt 11 -- Automatische Hintergrundaufgaben (Cron-Jobs)

PhysioBook braucht einen regelmaessigen Hintergrund-Aufruf, damit folgende Dinge automatisch passieren:

- **E-Mail-Erinnerungen** an Patienten (24 Stunden vor dem Termin)
- **E-Mails verschicken** (die App sammelt E-Mails und verschickt sie gebuendelt)
- **Abgelaufene Terminanfragen** automatisch als verfallen markieren
- **Alte Daten loeschen** (DSGVO-Cleanup nach Aufbewahrungsfrist)
- **PDF-Archiv per E-Mail** versenden (wenn in der Verwaltung konfiguriert)
- **Datenbank-Backup** (taeglich eine Sicherungskopie erstellen)

**So richtest du die automatischen Aufgaben ein:**

Wechsle zum `physiobook`-Benutzer und oeffne den Cron-Editor:

```bash
sudo su - physiobook
crontab -e
```

> Beim ersten Mal fragt das System nach einem Editor. Waehle **nano** (meist Nummer 1).

Fuege am Ende der Datei folgende zwei Zeilen ein:

```cron
# PhysioBook Hintergrundaufgaben -- laeuft alle 5 Minuten
*/5 * * * * curl -sf -X POST -H "Authorization: Bearer DEIN_CRON_SECRET" http://127.0.0.1:3000/api/cron > /dev/null 2>&1

# Datenbank-Backup -- laeuft taeglich um 02:00 Uhr nachts
0 2 * * * /home/physiobook/physiobook/scripts/backup.sh >> /home/physiobook/physiobook/logs/backup.log 2>&1
```

**Wichtig:** Ersetze `DEIN_CRON_SECRET` durch den Wert, den du in der `.env`-Datei bei `CRON_SECRET=` eingetragen hast. Dieser Wert stellt sicher, dass nur dein Server die Hintergrundaufgaben ausloesen kann.

Speichern (`Strg+O`, `Enter`) und Editor beenden (`Strg+X`).

Abschliessend das Backup-Script ausfuehrbar machen:

```bash
chmod +x ~/physiobook/scripts/backup.sh
```

**Pruefen ob es geklappt hat:** Mit `crontab -l` kannst du dir die eingerichteten Aufgaben anzeigen lassen. Du solltest die beiden Zeilen sehen.

**Ergebnis:** Ab jetzt prueft die App alle 5 Minuten automatisch, ob E-Mails verschickt, Erinnerungen gesendet oder Daten aufgeraeumt werden muessen. Ausserdem wird jede Nacht um 2 Uhr ein Datenbank-Backup erstellt.

### Schritt 12 -- Fertig! Alles pruefen

Teste, ob die App laeuft:

```bash
curl https://kalender.therapiezentrum-ziesemer.de/api/health
```

Erwartete Antwort: `{"status":"ok","timestamp":"...","dbOk":true}`

Oeffne jetzt `https://kalender.therapiezentrum-ziesemer.de` im Browser und melde dich mit deinem Passwort an.

**Optional:** Richte ein kostenloses Monitoring ein (z.B. [UptimeRobot](https://uptimerobot.com)), das alle 5 Minuten den Health-Endpunkt prueft und dich per E-Mail benachrichtigt, falls die App nicht erreichbar ist.

---

## Wartung

### App aktualisieren

Wenn es ein Update gibt, fuehre folgende Befehle auf dem Server aus:

```bash
sudo su - physiobook
cd ~/physiobook

# Neuen Code herunterladen
git pull

# Abhaengigkeiten aktualisieren
npm ci --omit=dev
npm install --save-dev drizzle-kit tsx

# Datenbank-Aenderungen uebernehmen (falls vorhanden)
npx tsx src/lib/db/migrate.ts

# App neu bauen
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true

# App neustarten
pm2 restart physiobook
```

### Passwort zuruecksetzen

```bash
sudo su - physiobook
cd ~/physiobook
npx tsx scripts/reset-password.ts "NeuesPasswort123!"
```

Alle bestehenden Sitzungen werden automatisch abgemeldet.

### Backup

Backups werden automatisch jede Nacht erstellt (siehe Schritt 11). Du findest sie im Ordner `~/physiobook/backups/` als `.sqlite.gz`-Dateien. Die letzten 30 werden aufbewahrt.

**Manuelles Backup erstellen:**

```bash
sudo su - physiobook
cd ~/physiobook
./scripts/backup.sh
```

**Backup wiederherstellen:**

```bash
sudo su - physiobook
cd ~/physiobook

# App stoppen
pm2 stop physiobook

# Backup entpacken und einsetzen (Dateinamen anpassen!)
gunzip -k backups/physiobook_20260301_020000.sqlite.gz
cp backups/physiobook_20260301_020000.sqlite physiobook.sqlite

# App wieder starten
pm2 start physiobook
```

### Logs pruefen

Falls etwas nicht funktioniert, helfen die Logdateien bei der Fehlersuche:

```bash
sudo su - physiobook
cd ~/physiobook

# Live-Logs der App anzeigen (mit Strg+C beenden)
pm2 logs physiobook

# Letzte 100 Zeilen der Log-Dateien anzeigen
tail -100 logs/pm2-out.log
tail -100 logs/pm2-error.log
```

Nginx-Logs (als Root-Benutzer):

```bash
sudo tail -100 /var/log/nginx/access.log
sudo tail -100 /var/log/nginx/error.log
```

### E-Mails kommen nicht an?

Pruefe den Status der E-Mail-Warteschlange:

```bash
sudo su - physiobook
cd ~/physiobook
sqlite3 physiobook.sqlite "SELECT to_address, subject, status, attempts FROM email_outbox ORDER BY created_at DESC LIMIT 10;"
```

| Status | Bedeutung |
|--------|-----------|
| `PENDING` | Wartet auf den naechsten Cron-Lauf (alle 5 Minuten) |
| `SENT` | Erfolgreich versendet |
| `FAILED` (attempts >= 3) | Dauerhaft fehlgeschlagen -- SMTP-Konfiguration pruefen |

**Haeufige Ursachen:**
- SMTP-Zugangsdaten falsch -- pruefe die Einstellungen in der Verwaltungsoberflaeche oder der `.env`-Datei
- Cron-Job laeuft nicht -- pruefe mit `crontab -l`, ob die Aufgaben eingerichtet sind
- Firewall blockiert ausgehende Verbindungen auf Port 587

### PM2 Kurzreferenz

| Befehl | Was passiert? |
|--------|--------------|
| `pm2 status` | Zeigt an, ob die App laeuft |
| `pm2 restart physiobook` | App neustarten |
| `pm2 stop physiobook` | App stoppen |
| `pm2 logs physiobook` | Live-Logs anzeigen |
| `pm2 monit` | CPU- und RAM-Verbrauch anzeigen |

---

## Environment-Variablen

Alle Einstellungen in der `.env`-Datei auf einen Blick:

| Variable | Beschreibung | Beispiel |
|----------|-------------|---------|
| `DATABASE_PATH` | Pfad zur Datenbank-Datei | `./physiobook.sqlite` |
| `JWT_SECRET` | Geheimer Schluessel fuer die Anmeldung (Zufallstext) | `openssl rand -base64 32` |
| `LOGIN_SALT` | Schutz gegen Brute-Force-Angriffe (Zufallstext) | `openssl rand -base64 32` |
| `CRON_SECRET` | Passwort fuer die Hintergrundaufgaben (Zufallstext) | `openssl rand -base64 32` |
| `SMTP_HOST` | Adresse des E-Mail-Servers | `smtp.example.com` |
| `SMTP_PORT` | Port des E-Mail-Servers | `587` |
| `SMTP_USER` | Benutzername fuer den E-Mail-Server | `praxis@example.com` |
| `SMTP_PASS` | Passwort fuer den E-Mail-Server | -- |
| `SMTP_FROM` | Absendername und -adresse fuer E-Mails | `"Praxis <praxis@example.com>"` |
| `ALLOWED_ORIGIN` | Domain, auf der die App laeuft | `https://kalender.therapiezentrum-ziesemer.de` |
| `WIDGET_ORIGIN` | Domain, die das Widget per iFrame einbettet | `https://therapiezentrum-ziesemer.de` |
| `TRUST_PROXY` | Immer `true` wenn hinter Nginx | `true` |

---

## Widget-Integration auf der Hauptwebsite

Das Patienten-Widget (`/widget`) wird per iFrame auf `therapiezentrum-ziesemer.de/termin-anfragen/` eingebettet.

### Funktionsweise

1. **CORS:** Die API-Endpunkte `/api/slots` und `/api/requests` senden CORS-Headers, wenn der Request von `WIDGET_ORIGIN` kommt
2. **postMessage:** Das Widget meldet seine Inhaltshoehe per `window.parent.postMessage()` an die einbettende Seite -- der iFrame passt sich dynamisch an
3. **Events:** Das Widget sendet folgende postMessage-Events an die Parent-Seite:
   - `{ type: "physiobook-widget", event: "resize", height: <px> }` -- bei jeder Groessenaenderung
   - `{ type: "physiobook-widget", event: "step-change", step: "date"|"slot"|"form"|"success" }` -- bei Schrittwechsel
   - `{ type: "physiobook-widget", event: "success" }` -- nach erfolgreicher Terminanfrage

### Deployment-Reihenfolge

Wenn Aenderungen an der Widget-Integration gemacht werden, **immer PhysioBook zuerst deployen**, dann die Website. So sind CORS-Headers und postMessage aktiv, bevor die Website den neuen iFrame laedt.

```bash
# 1. PhysioBook deployen
cd /home/physiobook/physiobook
git pull && npm ci --omit=dev && npm install --save-dev drizzle-kit tsx
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
pm2 restart physiobook

# 2. Website deployen
cd /opt/website_therapie
git pull && npm ci && npm run build
```
