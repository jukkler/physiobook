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
| Deployment | VPS mit systemd + Nginx + Let's Encrypt, Node.js 24 LTS |

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
  nginx.example.conf    Nginx-Konfiguration
deploy/
  systemd/              Units: App, Hintergrundaufgaben (Timer), taegliches Backup (Timer)
  backup/               physiobook-backup-snapshot: gepruefte SQLite-Kopie (WAL-safe)
```

---

## Deployment auf einem Server

> Schritt-fuer-Schritt-Anleitung fuer ein frisches Ubuntu-System (z.B. Hetzner Cloud VPS). Jeder Schritt ist einzeln ausfuehrbar -- einfach die Befehle kopieren und im Terminal einfuegen.

**Aufbau auf dem Server**

| Was | Wo |
|-----|----|
| Dienst-Benutzer | `physiobook-svc` (Systembenutzer, kein Login) |
| Code und Build | `/opt/physiobook` |
| Datenbank | `/var/lib/physiobook/db/physiobook.sqlite` (das einzige Verzeichnis, in das die App schreiben darf) |
| Konfiguration | `/opt/physiobook/.env` |
| Dienste | `physiobook.service` (die App), `physiobook-cron.timer` (Hintergrundaufgaben), `physiobook-backup.timer` (taegliche Kopie) |
| Lokale Backups | `/var/backups/physiobook/` |

Die Unit-Dateien und das Backup-Skript liegen im Repository unter `deploy/`.

### Voraussetzungen

- Ein Server mit **Ubuntu 24.04** (z.B. Hetzner Cloud ab CX22)
- Eine **Domain** (z.B. `kalender.therapiezentrum-ziesemer.de`), die per DNS (A-Record) auf die IP-Adresse des Servers zeigt
- **SSH-Zugang** zum Server (z.B. ueber das eingebaute Terminal auf Windows/Mac/Linux)
- Optional: Ein **SMTP-Konto** fuer den E-Mail-Versand (z.B. von deinem Webhoster, Mailgun oder Postmark)

### Schritt 1 -- Server-Software installieren

Verbinde dich per SSH mit deinem Server und fuehre folgende Befehle aus:

```bash
# System auf den neuesten Stand bringen
sudo apt update && sudo apt upgrade -y

# Grundlegende Werkzeuge installieren
sudo apt install -y curl git sqlite3 ufw nginx certbot python3-certbot-nginx
```

**Node.js 24 LTS** (die Laufzeitumgebung fuer die App) installieren:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # sollte v24.x anzeigen
```

### Schritt 2 -- Firewall einrichten

Die Firewall sorgt dafuer, dass nur die noetigsten Ports offen sind (SSH + Web):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Bei der Frage `Proceed with operation (y|n)?` mit **y** bestaetigen.

### Schritt 3 -- Dienst-Benutzer und Verzeichnisse anlegen

Die App laeuft unter einem eigenen Systembenutzer ohne Login, nicht als `root` und nicht als dein eigener Benutzer:

```bash
sudo adduser --system --group --home /var/lib/physiobook --shell /usr/sbin/nologin physiobook-svc
sudo chmod 750 /var/lib/physiobook
sudo install -d -m 700 -o physiobook-svc -g physiobook-svc /var/lib/physiobook/db
sudo install -d -m 750 -o physiobook-svc -g physiobook-svc /opt/physiobook
sudo install -d -m 700 -o physiobook-svc -g physiobook-svc /var/backups/physiobook
```

> Weil der Benutzer kein Login hat, fuehrst du Befehle in seinem Namen mit `sudo -u physiobook-svc -H ...` aus (siehe unten). `sudo su - physiobook-svc` funktioniert absichtlich nicht.

### Schritt 4 -- Code herunterladen und Abhaengigkeiten installieren

```bash
sudo -u physiobook-svc -H git clone https://github.com/jukkler/physiobook.git /opt/physiobook
sudo -u physiobook-svc -H bash -c 'cd /opt/physiobook && npm ci'
```

### Schritt 5 -- Konfiguration (.env-Datei)

Die App wird ueber eine Konfigurationsdatei namens `.env` gesteuert. Erstelle sie aus der Vorlage. Sie darf nur fuer den Dienst-Benutzer lesbar sein:

```bash
sudo install -m 600 -o physiobook-svc -g physiobook-svc /opt/physiobook/.env.example /opt/physiobook/.env
sudo nano /opt/physiobook/.env
```

> **nano** ist ein einfacher Texteditor im Terminal. Aenderungen speichern: `Strg+O`, dann `Enter`. Editor beenden: `Strg+X`.

Ersetze die Platzhalter mit deinen echten Werten. Werte **ohne Anfuehrungszeichen** eintragen, die Datei wird von systemd eingelesen. Hier ein Beispiel mit Erklaerungen:

```env
# --- Datenbank ---
DATABASE_PATH=/var/lib/physiobook/db/physiobook.sqlite

# --- Server ---
# Die App lauscht nur lokal, Nginx leitet von aussen weiter
HOSTNAME=127.0.0.1

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
SMTP_FROM=Therapiezentrum Ziesemer <info@therapiezentrum-ziesemer.de>

# --- Domain ---
# Die Domain, unter der die App erreichbar sein wird.
# Wichtig fuer die Sicherheit: Nur Anfragen von dieser Domain werden akzeptiert.
ALLOWED_ORIGIN=https://kalender.therapiezentrum-ziesemer.de

# --- Widget-Einbettung ---
# Das Patienten-Widget wird per iFrame auf der Hauptwebsite eingebettet.
# WIDGET_ORIGIN ist die einzige Domain, die das Widget einbetten darf (CSP frame-ancestors)
# und deren API-Aufrufe aus dem iFrame erlaubt sind (CORS). Ohne "www." -- leite www
# auf der Hauptwebsite auf die Adresse ohne www um.
WIDGET_ORIGIN=https://therapiezentrum-ziesemer.de

# --- Proxy ---
# Immer auf "true" setzen, wenn die App hinter Nginx laeuft (was bei diesem Setup der Fall ist).
TRUST_PROXY=true
```

### Schritt 6 -- Datenbank einrichten

Die Hilfsskripte lesen `DATABASE_PATH` aus der Umgebung, deshalb wird die `.env` vorher geladen:

```bash
sudo -u physiobook-svc -H bash -c 'cd /opt/physiobook && set -a && . ./.env && set +a && npx tsx src/lib/db/migrate.ts && npx tsx scripts/seed.ts'
```

**Wichtig:** Aendere sofort das Standard-Passwort (`admin`):

```bash
sudo -u physiobook-svc -H bash -c 'cd /opt/physiobook && set -a && . ./.env && set +a && npx tsx scripts/reset-password.ts "DeinSicheresPasswort123!"'
```

### Schritt 7 -- App bauen

```bash
sudo -u physiobook-svc -H bash -c 'cd /opt/physiobook && npm run build && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public'
```

> Das Kopieren von `static` und `public` ist bei Next.js im Standalone-Modus noetig.

### Schritt 8 -- App als systemd-Dienst starten

systemd haelt die App dauerhaft am Laufen, startet sie nach Abstuerzen neu und nach einem Server-Neustart automatisch wieder. Die Unit ist gehaertet: Der Code ist fuer die App schreibgeschuetzt, beschreibbar ist nur das Datenbank-Verzeichnis.

```bash
sudo install -m 644 /opt/physiobook/deploy/systemd/physiobook.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now physiobook

# Pruefen (sollte "active" anzeigen)
systemctl is-active physiobook
curl -s http://127.0.0.1:3000/api/health
```

### Schritt 9 -- Nginx einrichten

Nginx nimmt Anfragen aus dem Internet entgegen und leitet sie an die App weiter:

```bash
# Konfigurationsdatei kopieren
sudo cp /opt/physiobook/scripts/nginx.example.conf /etc/nginx/sites-available/physiobook

# Domain anpassen -- ersetze "praxis.example.com" durch deine echte Domain:
sudo nano /etc/nginx/sites-available/physiobook
```

```bash
# Konfiguration aktivieren
sudo ln -s /etc/nginx/sites-available/physiobook /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Pruefen und neu laden
sudo nginx -t && sudo systemctl reload nginx
```

> Die Content-Security-Policy setzt die App selbst (siehe `src/middleware.ts`). Bitte in Nginx **keine** zweite CSP hinzufuegen: Der Browser wendet beide an, und das Widget liesse sich nicht mehr einbetten.

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

### Schritt 11 -- Hintergrundaufgaben und Backup

PhysioBook braucht einen regelmaessigen Hintergrund-Aufruf, damit folgende Dinge automatisch passieren:

- **E-Mail-Erinnerungen** an Patienten (24 Stunden vor dem Termin)
- **E-Mails verschicken** (die App sammelt E-Mails und verschickt sie gebuendelt)
- **Abgelaufene Terminanfragen** automatisch als verfallen markieren
- **Alte Daten loeschen** (DSGVO-Cleanup nach Aufbewahrungsfrist)
- **PDF-Archiv per E-Mail** versenden (wenn in der Verwaltung konfiguriert)

Das uebernimmt ein systemd-Timer, der alle 5 Minuten `/api/cron` aufruft. Das `CRON_SECRET` liest er aus der `.env`, es steht also nirgends sonst im Klartext:

```bash
sudo install -m 644 /opt/physiobook/deploy/systemd/physiobook-cron.service /opt/physiobook/deploy/systemd/physiobook-cron.timer /etc/systemd/system/
```

Fuer die **taegliche Datenbank-Kopie** (02:00 Uhr) gibt es ein Skript, das die Kopie ueber die SQLite-Backup-API erstellt (sicher waehrend die App laeuft), sie mit `integrity_check` prueft und die letzten 30 Kopien behaelt:

```bash
sudo install -m 755 /opt/physiobook/deploy/backup/physiobook-backup-snapshot /usr/local/sbin/
sudo install -m 644 /opt/physiobook/deploy/systemd/physiobook-backup.service /opt/physiobook/deploy/systemd/physiobook-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now physiobook-cron.timer physiobook-backup.timer

# Pruefen: beide Timer mit naechstem Lauf
systemctl list-timers 'physiobook-*'
```

> Diese Kopien liegen auf demselben Server. Fuer eine echte Datensicherung gehoert zusaetzlich eine **verschluesselte Kopie ausser Haus** dazu, z.B. mit borgmatic auf eine Storage Box. Das Skript laesst sich dafuer direkt als `before_backup`-Hook verwenden.

### Schritt 12 -- Fertig! Alles pruefen

Teste, ob die App laeuft:

```bash
curl https://kalender.therapiezentrum-ziesemer.de/api/health
```

Erwartete Antwort: `{"status":"ok","timestamp":"...","dbOk":true}`

Oeffne jetzt `https://kalender.therapiezentrum-ziesemer.de` im Browser und melde dich mit deinem Passwort an.

**Optional:** Richte ein kostenloses Monitoring ein (z.B. [UptimeRobot](https://uptimerobot.com) oder healthchecks.io), das dich per E-Mail benachrichtigt, falls die App nicht erreichbar ist.

---

## Wartung

Befehle im Namen des Dienst-Benutzers laufen immer ueber `sudo -u physiobook-svc -H bash -c '...'`. Wo ein Hilfsskript die Datenbank braucht, wird vorher die `.env` geladen (`set -a && . ./.env && set +a`).

### App aktualisieren

Am besten ausserhalb der Praxis-Zeiten. Vorher eine Kopie der Datenbank ziehen:

```bash
sudo systemctl start physiobook-backup.service

sudo -u physiobook-svc -H bash -c 'set -e; cd /opt/physiobook
  git pull --ff-only
  npm ci
  set -a; . ./.env; set +a
  npx tsx src/lib/db/migrate.ts
  npm run build
  cp -r .next/static .next/standalone/.next/static
  cp -r public .next/standalone/public'

sudo systemctl restart physiobook
```

> Nach einem **Node.js-Major-Update** (z.B. 24 -> 26) die App sofort neu bauen (`npm ci` + Build): `better-sqlite3` wird fuer die jeweilige Node-Version kompiliert.

### Passwort zuruecksetzen

```bash
sudo -u physiobook-svc -H bash -c 'cd /opt/physiobook && set -a && . ./.env && set +a && npx tsx scripts/reset-password.ts "NeuesPasswort123!"'
```

Alle bestehenden Sitzungen werden automatisch abgemeldet.

### Backup

Jede Nacht um 2 Uhr entsteht eine gepruefte Kopie in `/var/backups/physiobook/` (`physiobook_<Datum>.sqlite`, dazu `latest.sqlite`). Die letzten 30 werden aufbewahrt.

**Manuelles Backup erstellen:**

```bash
sudo systemctl start physiobook-backup.service
sudo ls -l /var/backups/physiobook/
```

**Backup wiederherstellen:**

```bash
# App und Hintergrundaufgaben stoppen
sudo systemctl stop physiobook-cron.timer physiobook

# Aktuelle (kaputte) Dateien beiseitelegen, nicht loeschen
sudo sh -c 'd=/root/defekt-$(date +%F-%H%M); mkdir -p $d && mv /var/lib/physiobook/db/physiobook.sqlite* $d/'

# Kopie einsetzen (Dateinamen anpassen!) und pruefen
sudo install -m 600 -o physiobook-svc -g physiobook-svc /var/backups/physiobook/physiobook_20260301_020000.sqlite /var/lib/physiobook/db/physiobook.sqlite
sudo -u physiobook-svc sqlite3 /var/lib/physiobook/db/physiobook.sqlite "PRAGMA integrity_check;"

# App wieder starten
sudo systemctl start physiobook physiobook-cron.timer
```

### Logs pruefen

Falls etwas nicht funktioniert, helfen die Logs bei der Fehlersuche:

```bash
# Live-Logs der App anzeigen (mit Strg+C beenden)
sudo journalctl -u physiobook -f

# Letzte 100 Zeilen
sudo journalctl -u physiobook -n 100 --no-pager

# Hintergrundaufgaben und Backup
sudo journalctl -u physiobook-cron -u physiobook-backup -n 50 --no-pager
```

Nginx-Logs:

```bash
sudo tail -100 /var/log/nginx/access.log
sudo tail -100 /var/log/nginx/error.log
```

### E-Mails kommen nicht an?

Pruefe den Status der E-Mail-Warteschlange:

```bash
sudo -u physiobook-svc sqlite3 /var/lib/physiobook/db/physiobook.sqlite "SELECT to_address, subject, status, attempts FROM email_outbox ORDER BY created_at DESC LIMIT 10;"
```

| Status | Bedeutung |
|--------|-----------|
| `PENDING` | Wartet auf den naechsten Cron-Lauf (alle 5 Minuten) |
| `SENT` | Erfolgreich versendet |
| `FAILED` (attempts >= 3) | Dauerhaft fehlgeschlagen -- SMTP-Konfiguration pruefen |

**Haeufige Ursachen:**
- SMTP-Zugangsdaten falsch -- pruefe die Einstellungen in der Verwaltungsoberflaeche oder der `.env`-Datei
- Hintergrundaufgaben laufen nicht -- pruefe mit `systemctl list-timers physiobook-cron.timer` und `journalctl -u physiobook-cron`
- Firewall blockiert ausgehende Verbindungen auf Port 587

### systemd Kurzreferenz

| Befehl | Was passiert? |
|--------|--------------|
| `systemctl status physiobook` | Zeigt an, ob die App laeuft |
| `sudo systemctl restart physiobook` | App neustarten |
| `sudo systemctl stop physiobook` | App stoppen |
| `sudo journalctl -u physiobook -f` | Live-Logs anzeigen |
| `systemctl list-timers 'physiobook-*'` | Wann laufen Hintergrundaufgaben und Backup das naechste Mal? |

---


## Environment-Variablen

Alle Einstellungen in der `.env`-Datei auf einen Blick:

| Variable | Beschreibung | Beispiel |
|----------|-------------|---------|
| `DATABASE_PATH` | Pfad zur Datenbank-Datei | `/var/lib/physiobook/db/physiobook.sqlite` |
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
# 1. PhysioBook deployen (siehe "App aktualisieren")
sudo -u physiobook-svc -H bash -c 'set -e; cd /opt/physiobook; git pull --ff-only; npm ci; npm run build
  cp -r .next/static .next/standalone/.next/static; cp -r public .next/standalone/public'
sudo systemctl restart physiobook

# 2. Website deployen
cd /opt/website_therapie
git pull && npm ci && npm run build
```
