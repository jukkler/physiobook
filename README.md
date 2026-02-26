# PhysioBook

Minimalistisches Terminbuch fuer Physiotherapiepraxen. Verwaltet Termine, Blocker und Patientenanfragen ueber ein Web-Interface. Keine Gesundheitsdaten -- nur organisatorische Kontaktdaten (DSGVO-konform).

## Tech-Stack

- **Framework**: Next.js 16 (App Router, TypeScript, Standalone-Build)
- **Datenbank**: SQLite via better-sqlite3 (WAL-Mode, single instance)
- **ORM**: Drizzle ORM
- **Auth**: JWT (jose) + bcryptjs, HttpOnly-Cookie
- **E-Mail**: Nodemailer (async via Outbox-Pattern + Cron)
- **Deployment**: VPS (PM2 + Nginx + Let's Encrypt)

## Projektstruktur

```
src/
  app/
    dashboard/        # Admin-Dashboard (Tages-/Wochenansicht)
    widget/           # Oeffentliches Patienten-Widget
    api/              # REST-API (Appointments, Blockers, Slots, Requests, ...)
    login/            # Login-Seite
  components/         # React-Komponenten (Calendar, Forms)
  lib/                # DB, Auth, Overlap-Logik, Rate-Limiting, E-Mail
scripts/
  seed.ts             # Default-Admin + Settings anlegen
  reset-password.ts   # Admin-Passwort zuruecksetzen
  backup.sh           # SQLite-Backup (WAL-safe)
  nginx.example.conf  # Nginx-Konfiguration
ecosystem.config.js   # PM2-Konfiguration
```

## Lokale Entwicklung

```bash
# Dependencies installieren
npm install

# Environment-Variablen konfigurieren
cp .env.example .env
# .env editieren (JWT_SECRET, LOGIN_SALT, CRON_SECRET auf sichere Zufallswerte setzen)

# Datenbank initialisieren
npm run db:migrate
npm run db:seed

# Dev-Server starten
npm run dev
```

Login: `admin` / `admin` (nach Seed). Sofort aendern in Production.

### Scripts

| Befehl | Beschreibung |
|--------|--------------|
| `npm run dev` | Entwicklungsserver (Port 3000) |
| `npm run build` | Production-Build |
| `npm run start` | Production-Server starten |
| `npm test` | Unit-Tests ausfuehren |
| `npm run db:migrate` | Datenbank-Migrationen ausfuehren |
| `npm run db:seed` | Default-Admin + Settings anlegen |
| `npm run reset-password -- <passwort>` | Admin-Passwort zuruecksetzen |

---

## Deployment auf Hetzner (Ubuntu 22.04/24.04)

### 1. Server vorbereiten

```bash
# System updaten
sudo apt update && sudo apt upgrade -y

# Grundlegende Pakete
sudo apt install -y curl git sqlite3 ufw

# Node.js 20 LTS installieren
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 global installieren
sudo npm install -g pm2

# Nginx installieren
sudo apt install -y nginx

# Certbot fuer Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Firewall konfigurieren

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

### 3. App-Benutzer anlegen (optional, empfohlen)

```bash
sudo adduser --disabled-password --gecos "" physiobook
sudo su - physiobook
```

### 4. Code deployen

```bash
# Als physiobook-User (oder eigener User)
cd ~
git clone <repo-url> physiobook
cd physiobook

# Dependencies installieren (nur Production)
npm ci --omit=dev

# Zusaetzlich Dev-Dependencies fuer Build + Migration
npm install --save-dev drizzle-kit tsx
```

### 5. Environment konfigurieren

```bash
cp .env.example .env
nano .env
```

Alle Werte setzen -- besonders:

```env
# Sichere Zufallswerte generieren:
#   openssl rand -base64 32
JWT_SECRET=<zufallswert>
LOGIN_SALT=<zufallswert>
CRON_SECRET=<zufallswert>

# SMTP (z.B. Mailgun, Postmark, eigener SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=praxis@example.com
SMTP_PASS=<smtp-passwort>
SMTP_FROM="Praxis Muster <praxis@example.com>"

# Domain (CSRF-Pruefung)
ALLOWED_ORIGIN=https://praxis.example.com

# Hinter Nginx: Client-IP aus X-Forwarded-For lesen
TRUST_PROXY=true
```

### 6. Datenbank initialisieren

```bash
npx tsx src/lib/db/migrate.ts
npx tsx scripts/seed.ts
```

**Sofort das Default-Passwort aendern:**

```bash
npx tsx scripts/reset-password.ts "EinSicheresPasswort123!"
```

### 7. Build erstellen

```bash
npm run build
```

Der Standalone-Build liegt in `.next/standalone/`. Statische Assets muessen kopiert werden:

```bash
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
```

### 8. PM2 einrichten

```bash
# Log-Verzeichnis anlegen
mkdir -p logs

# App starten
pm2 start ecosystem.config.js

# Pruefen ob alles laeuft
pm2 status
pm2 logs physiobook --lines 20

# PM2 bei Systemstart automatisch starten
pm2 startup
# (den angezeigten sudo-Befehl ausfuehren)
pm2 save
```

### 9. Nginx konfigurieren

```bash
# Konfiguration kopieren und anpassen
sudo cp scripts/nginx.example.conf /etc/nginx/sites-available/physiobook
sudo nano /etc/nginx/sites-available/physiobook
# -> server_name auf eigene Domain setzen

# Aktivieren
sudo ln -s /etc/nginx/sites-available/physiobook /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Testen und neu laden
sudo nginx -t
sudo systemctl reload nginx
```

### 10. SSL-Zertifikat (Let's Encrypt)

```bash
# Zertifikat anfordern (interaktiv)
sudo certbot --nginx -d praxis.example.com

# Auto-Renewal testen
sudo certbot renew --dry-run
```

Certbot passt die Nginx-Config automatisch an und richtet einen Renewal-Timer ein.

### 11. Cron-Jobs einrichten

PhysioBook benoetigt einen regelmaessigen Cron-Aufruf fuer:
- E-Mail-Queue abarbeiten
- Abgelaufene Anfragen markieren
- DSGVO-Cleanup (alte Daten loeschen)
- Login-Attempts aufraeumen

```bash
crontab -e
```

Folgende Zeilen hinzufuegen:

```cron
# PhysioBook Cron (alle 5 Minuten)
*/5 * * * * curl -sf -X POST -H "Authorization: Bearer DEIN_CRON_SECRET" http://127.0.0.1:3000/api/cron > /dev/null 2>&1

# Datenbank-Backup (taeglich um 02:00)
0 2 * * * /home/physiobook/physiobook/scripts/backup.sh >> /home/physiobook/physiobook/logs/backup.log 2>&1
```

`DEIN_CRON_SECRET` durch den Wert aus `.env` ersetzen.

Backup-Script ausfuehrbar machen:

```bash
chmod +x scripts/backup.sh
```

### 12. Health-Check / Monitoring

Der Endpunkt `GET /api/health` gibt den App-Status zurueck:

```bash
curl https://praxis.example.com/api/health
# {"status":"ok","timestamp":"...","dbOk":true}
```

Empfohlen: UptimeRobot oder Hetznere eigene Monitoring-Funktion auf diesen Endpunkt konfigurieren (Intervall: 5 Minuten).

---

## Maintenance

### Passwort zuruecksetzen

```bash
cd ~/physiobook
npx tsx scripts/reset-password.ts "NeuesPasswort123!"
```

Invalidiert automatisch alle bestehenden Sessions (tokenVersion wird inkrementiert).

### Update deployen

```bash
cd ~/physiobook

# Code aktualisieren
git pull

# Dependencies aktualisieren
npm ci --omit=dev
npm install --save-dev drizzle-kit tsx

# Migrationen ausfuehren (falls neue vorhanden)
npx tsx src/lib/db/migrate.ts

# Neu bauen
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true

# Neustart
pm2 restart physiobook

# Pruefen
pm2 logs physiobook --lines 20
```

### Datenbank-Backup manuell ausfuehren

```bash
cd ~/physiobook
./scripts/backup.sh
```

Backups liegen in `./backups/` als `.sqlite.gz`-Dateien. Die letzten 30 werden aufbewahrt.

### Backup wiederherstellen

```bash
# App stoppen
pm2 stop physiobook

# Backup entpacken und einspielen
gunzip -k backups/physiobook_20260219_020000.sqlite.gz
cp backups/physiobook_20260219_020000.sqlite physiobook.sqlite

# App starten
pm2 start physiobook
```

### Logs pruefen

```bash
# PM2 App-Logs (live)
pm2 logs physiobook

# PM2 App-Logs (Dateien)
tail -100 logs/pm2-out.log
tail -100 logs/pm2-error.log

# Nginx Access-Log
sudo tail -100 /var/log/nginx/access.log

# Nginx Error-Log
sudo tail -100 /var/log/nginx/error.log
```

### SSL-Zertifikat erneuern

Certbot erneuert automatisch. Manuell pruefen:

```bash
sudo certbot renew --dry-run
```

### Datenbank inspizieren

```bash
cd ~/physiobook
sqlite3 physiobook.sqlite

# Beispiel-Queries:
.tables
SELECT count(*) FROM appointments;
SELECT count(*) FROM appointments WHERE status = 'REQUESTED';
SELECT * FROM settings;
SELECT count(*) FROM email_outbox WHERE status = 'PENDING';
SELECT count(*) FROM email_outbox WHERE status = 'FAILED';
.quit
```

### PM2 Befehle

| Befehl | Beschreibung |
|--------|--------------|
| `pm2 status` | Status aller Apps |
| `pm2 restart physiobook` | App neustarten |
| `pm2 stop physiobook` | App stoppen |
| `pm2 logs physiobook` | Live-Logs |
| `pm2 monit` | Interaktives Monitoring (CPU, RAM) |

### E-Mail-Queue pruefen

Falls E-Mails nicht ankommen:

```bash
sqlite3 physiobook.sqlite "SELECT id, to_address, subject, status, attempts, created_at FROM email_outbox ORDER BY created_at DESC LIMIT 10;"
```

- `PENDING`: Wartet auf naechsten Cron-Lauf
- `SENT`: Erfolgreich versendet
- `FAILED` + `attempts >= 3`: Dauerhaft fehlgeschlagen -- SMTP-Konfiguration pruefen

### Server-Neustart

Nach einem Server-Reboot startet PM2 die App automatisch (wenn `pm2 startup` + `pm2 save` ausgefuehrt wurde). Pruefen:

```bash
pm2 status
curl -sf http://127.0.0.1:3000/api/health
```

---

## Environment-Variablen

| Variable | Beschreibung | Beispiel |
|----------|--------------|---------|
| `DATABASE_PATH` | Pfad zur SQLite-Datei | `./physiobook.sqlite` |
| `JWT_SECRET` | Geheimer Schluessel fuer JWT-Signierung | `openssl rand -base64 32` |
| `LOGIN_SALT` | Salt fuer IP-Hashing (Login-Attempts) | `openssl rand -base64 32` |
| `SMTP_HOST` | SMTP-Server | `smtp.example.com` |
| `SMTP_PORT` | SMTP-Port | `587` |
| `SMTP_USER` | SMTP-Benutzername | `praxis@example.com` |
| `SMTP_PASS` | SMTP-Passwort | |
| `SMTP_FROM` | Absender-Adresse | `"Praxis <praxis@example.com>"` |
| `ALLOWED_ORIGIN` | Erlaubte Origin fuer CSRF-Check | `https://praxis.example.com` |
| `WIDGET_ORIGIN` | Widget-Origin (nur bei Cross-Origin) | leer bei Same-Origin |
| `TRUST_PROXY` | X-Forwarded-For vertrauen | `true` hinter Nginx |
| `CRON_SECRET` | Bearer-Token fuer Cron-Endpunkt | `openssl rand -base64 32` |
