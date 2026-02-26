# PhysioBook

Minimalistisches Terminbuch fuer Physiotherapiepraxen. Verwaltet Termine, Blocker, Patientenstammdaten und Patientenanfragen ueber ein Web-Interface. Keine Gesundheitsdaten -- nur organisatorische Kontaktdaten (DSGVO-konform).

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

```bash
# 1. Dependencies installieren
npm install

# 2. Environment-Variablen anlegen
cp .env.example .env
#    -> .env oeffnen und JWT_SECRET, LOGIN_SALT, CRON_SECRET auf sichere Werte setzen

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

## Deployment (Hetzner VPS, Ubuntu 22.04/24.04)

> Schritt-fuer-Schritt-Anleitung fuer ein frisches Ubuntu-System.

### 1. Server vorbereiten

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git sqlite3 ufw nginx certbot python3-certbot-nginx

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 (Prozessmanager)
sudo npm install -g pm2
```

### 2. Firewall einrichten

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 3. App-Benutzer anlegen (empfohlen)

```bash
sudo adduser --disabled-password --gecos "" physiobook
sudo su - physiobook
```

### 4. Code deployen

```bash
cd ~
git clone <repo-url> physiobook
cd physiobook
npm ci --omit=dev
npm install --save-dev drizzle-kit tsx
```

### 5. Environment konfigurieren

```bash
cp .env.example .env
nano .env
```

Die wichtigsten Werte (siehe [Environment-Variablen](#environment-variablen) fuer die vollstaendige Liste):

```env
# Sichere Zufallswerte generieren mit:  openssl rand -base64 32
JWT_SECRET=<zufallswert>
LOGIN_SALT=<zufallswert>
CRON_SECRET=<zufallswert>

# SMTP fuer E-Mail-Versand
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=praxis@example.com
SMTP_PASS=<smtp-passwort>
SMTP_FROM="Praxis Muster <praxis@example.com>"

# Domain der App (fuer CSRF-Schutz)
ALLOWED_ORIGIN=https://termine.meine-praxis.de

# Hinter Nginx immer aktivieren
TRUST_PROXY=true
```

### 6. Datenbank einrichten

```bash
npx tsx src/lib/db/migrate.ts
npx tsx scripts/seed.ts

# Sofort das Standard-Passwort aendern:
npx tsx scripts/reset-password.ts "EinSicheresPasswort123!"
```

### 7. Build erstellen

```bash
npm run build

# Statische Dateien in den Standalone-Build kopieren
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
```

### 8. PM2 starten

```bash
mkdir -p logs
pm2 start ecosystem.config.js

# Pruefen
pm2 status
pm2 logs physiobook --lines 20

# Autostart bei Server-Neustart
pm2 startup    # den angezeigten sudo-Befehl ausfuehren
pm2 save
```

### 9. Nginx konfigurieren

```bash
sudo cp scripts/nginx.example.conf /etc/nginx/sites-available/physiobook
sudo nano /etc/nginx/sites-available/physiobook
#    -> server_name auf die eigene Domain setzen

sudo ln -s /etc/nginx/sites-available/physiobook /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 10. SSL-Zertifikat (Let's Encrypt)

```bash
sudo certbot --nginx -d termine.meine-praxis.de
sudo certbot renew --dry-run   # Auto-Renewal testen
```

### 11. Cron-Jobs einrichten

PhysioBook benoetigt einen regelmaessigen Cron-Aufruf. Dieser kuemmert sich um:
- Terminerinnerungen (24h vorher per E-Mail)
- E-Mail-Queue abarbeiten
- Abgelaufene Anfragen markieren
- DSGVO-Cleanup (alte Daten loeschen)
- Auto-Archiv per E-Mail versenden

```bash
crontab -e
```

Folgende Zeilen einfuegen:

```cron
# PhysioBook: alle 5 Minuten
*/5 * * * * curl -sf -X POST -H "Authorization: Bearer DEIN_CRON_SECRET" http://127.0.0.1:3000/api/cron > /dev/null 2>&1

# Datenbank-Backup: taeglich um 02:00
0 2 * * * /home/physiobook/physiobook/scripts/backup.sh >> /home/physiobook/physiobook/logs/backup.log 2>&1
```

> `DEIN_CRON_SECRET` durch den Wert aus der `.env`-Datei ersetzen.

```bash
chmod +x scripts/backup.sh
```

### 12. Fertig -- Health-Check

```bash
curl https://termine.meine-praxis.de/api/health
# {"status":"ok","timestamp":"...","dbOk":true}
```

Optional: UptimeRobot oder Hetzner-Monitoring auf diesen Endpunkt konfigurieren (alle 5 Minuten).

---

## Wartung

### Update deployen

```bash
cd ~/physiobook
git pull
npm ci --omit=dev
npm install --save-dev drizzle-kit tsx
npx tsx src/lib/db/migrate.ts          # neue Migrationen ausfuehren
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
pm2 restart physiobook
```

### Passwort zuruecksetzen

```bash
npx tsx scripts/reset-password.ts "NeuesPasswort123!"
```

Invalidiert automatisch alle bestehenden Sessions.

### Backup

```bash
# Manuell ausfuehren
./scripts/backup.sh

# Backup wiederherstellen
pm2 stop physiobook
gunzip -k backups/physiobook_20260219_020000.sqlite.gz
cp backups/physiobook_20260219_020000.sqlite physiobook.sqlite
pm2 start physiobook
```

Backups liegen in `./backups/` als `.sqlite.gz`-Dateien. Die letzten 30 werden aufbewahrt.

### Logs pruefen

```bash
pm2 logs physiobook                         # Live-Logs
tail -100 logs/pm2-out.log                  # Stdout
tail -100 logs/pm2-error.log                # Stderr
sudo tail -100 /var/log/nginx/access.log    # Nginx
sudo tail -100 /var/log/nginx/error.log     # Nginx Fehler
```

### E-Mails kommen nicht an?

```bash
sqlite3 physiobook.sqlite \
  "SELECT to_address, subject, status, attempts FROM email_outbox ORDER BY created_at DESC LIMIT 10;"
```

| Status | Bedeutung |
|--------|-----------|
| `PENDING` | Wartet auf naechsten Cron-Lauf |
| `SENT` | Erfolgreich versendet |
| `FAILED` (attempts >= 3) | Dauerhaft fehlgeschlagen -- SMTP-Konfiguration pruefen |

### PM2 Kurzreferenz

| Befehl | Beschreibung |
|--------|-------------|
| `pm2 status` | Status aller Apps |
| `pm2 restart physiobook` | Neustart |
| `pm2 stop physiobook` | Stoppen |
| `pm2 logs physiobook` | Live-Logs |
| `pm2 monit` | CPU/RAM-Monitoring |

---

## Environment-Variablen

| Variable | Beschreibung | Beispiel |
|----------|-------------|---------|
| `DATABASE_PATH` | Pfad zur SQLite-Datei | `./physiobook.sqlite` |
| `JWT_SECRET` | Geheimer Schluessel fuer JWT-Signierung | `openssl rand -base64 32` |
| `LOGIN_SALT` | Salt fuer IP-Hashing (Rate-Limiting) | `openssl rand -base64 32` |
| `CRON_SECRET` | Bearer-Token fuer den Cron-Endpunkt | `openssl rand -base64 32` |
| `SMTP_HOST` | SMTP-Server | `smtp.example.com` |
| `SMTP_PORT` | SMTP-Port | `587` |
| `SMTP_USER` | SMTP-Benutzername | `praxis@example.com` |
| `SMTP_PASS` | SMTP-Passwort | -- |
| `SMTP_FROM` | Absender-Adresse | `"Praxis <praxis@example.com>"` |
| `ALLOWED_ORIGIN` | Domain der App (CSRF-Schutz) | `https://termine.meine-praxis.de` |
| `WIDGET_ORIGIN` | Widget-Domain, nur bei Cross-Origin noetig | leer bei Same-Origin |
| `TRUST_PROXY` | `true` wenn hinter Nginx/Reverse-Proxy | `true` |
