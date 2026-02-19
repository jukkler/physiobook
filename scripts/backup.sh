#!/bin/bash
# PhysioBook Database Backup Script
# Usage: ./scripts/backup.sh
# Recommended: Run nightly via crontab
#   0 2 * * * /path/to/physiobook/scripts/backup.sh

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="${DATABASE_PATH:-$PROJECT_DIR/physiobook.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_COUNT="${BACKUP_RETENTION:-30}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate timestamped filename
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/physiobook_${TIMESTAMP}.sqlite"

# Use SQLite .backup command (safe with WAL mode)
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Compress
gzip "$BACKUP_FILE"
echo "Backup created: ${BACKUP_FILE}.gz"

# Cleanup old backups (keep last N)
cd "$BACKUP_DIR"
ls -t physiobook_*.sqlite.gz 2>/dev/null | tail -n +$((RETENTION_COUNT + 1)) | xargs -r rm -f

echo "Backup complete. Retained last $RETENTION_COUNT backups."
