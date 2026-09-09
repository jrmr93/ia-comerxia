#!/usr/bin/env bash
# =========================================================================
# COMERXIA - SCRIPT DE RESPALDO TOTAL DEL SISTEMA (POSTGRESQL + MULTIMEDIA)
# Configuración: Usuario postgres / Contraseña postgres / BD comerxia_db
# =========================================================================
set -e

# 1. Cargar variables de entorno de .env si existe
if [ -f ".env" ]; then
  export SQL_HOST=$(grep -E '^SQL_HOST=' .env | cut -d '=' -f2- | tr -d '\r"' || echo "")
  export SQL_PORT=$(grep -E '^SQL_PORT=' .env | cut -d '=' -f2- | tr -d '\r"' || echo "")
  export SQL_USER=$(grep -E '^SQL_USER=' .env | cut -d '=' -f2- | tr -d '\r"' || echo "")
  export SQL_PASSWORD=$(grep -E '^SQL_PASSWORD=' .env | cut -d '=' -f2- | tr -d '\r"' || echo "")
  export SQL_DB_NAME=$(grep -E '^SQL_DB_NAME=' .env | cut -d '=' -f2- | tr -d '\r"' || echo "")
fi

export PGHOST="${PGHOST:-${SQL_HOST:-127.0.0.1}}"
export PGPORT="${PGPORT:-${SQL_PORT:-5432}}"
export PGUSER="${PGUSER:-${SQL_USER:-postgres}}"
export PGPASSWORD="${PGPASSWORD:-${SQL_PASSWORD:-postgres}}"
export PGDATABASE="${PGDATABASE:-${SQL_DB_NAME:-comerxia_db}}"

FECHA=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"

SQL_FILE="$BACKUP_DIR/comerxia_backup_${FECHA}.sql"
TAR_FILE="$BACKUP_DIR/comerxia_respaldo_total_${FECHA}.tar.gz"

echo "================================================================="
echo "📦 COMERXIA: GENERANDO RESPALDO TOTAL DEL SISTEMA"
echo "================================================================="
echo "🔧 Host:       $PGHOST:$PGPORT"
echo "👤 Usuario:    $PGUSER"
echo "🗄️ Base Datos: $PGDATABASE"
echo "-----------------------------------------------------------------"

DUMP_OK=0

# Probar pg_dump con credenciales directas TCP
if command -v pg_dump &> /dev/null; then
  echo "⏳ Ejecutando pg_dump con usuario '$PGUSER'..."
  if PGPASSWORD="$PGPASSWORD" pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -F p -f "$SQL_FILE" 2>/dev/null; then
    DUMP_OK=1
    echo "✅ Volcado de base de datos exitoso: $SQL_FILE"
  elif sudo -u postgres pg_dump "$PGDATABASE" > "$SQL_FILE" 2>/dev/null; then
    DUMP_OK=1
    echo "✅ Volcado con sudo -u postgres exitoso: $SQL_FILE"
  fi
fi

# Si pg_dump no está disponible en PATH o falló, usar exportador de Comerxia
if [ $DUMP_OK -eq 0 ]; then
  echo "⚠️ Generando volcado con el motor exportador de Comerxia..."
  if command -v node &> /dev/null; then
    node -e "
      const fs = require('fs');
      try {
        const { generateCompleteSqlDump } = require('./src/services/system-backup.ts');
        generateCompleteSqlDump(1).then(sql => {
          fs.writeFileSync('$SQL_FILE', sql);
          console.log('✅ Dump SQL generado por Comerxia en: $SQL_FILE');
        }).catch(err => {
          console.error('Error al generar dump:', err.message);
        });
      } catch (e) {
        console.error('Error al invocar generador:', e.message);
      }
    " 2>/dev/null || true
    if [ -f "$SQL_FILE" ] && [ -s "$SQL_FILE" ]; then
      DUMP_OK=1
    fi
  fi
fi

if [ -f "$SQL_FILE" ] && [ -s "$SQL_FILE" ]; then
  # Empaquetar con uploads si existe
  if [ -d "uploads" ] && [ "$(ls -A uploads 2>/dev/null)" ]; then
    echo "📸 Empaquetando fotos y videos de ./uploads..."
    tar -czf "$TAR_FILE" "$SQL_FILE" uploads/ 2>/dev/null || true
    if [ -f "$TAR_FILE" ]; then
      echo "🎉 ¡Respaldo total completado con éxito!"
      echo "📁 Archivo empaquetado (SQL + Fotos): $TAR_FILE"
      echo "📄 Archivo SQL individual:            $SQL_FILE"
    else
      echo "🎉 ¡Respaldo SQL completado con éxito en: $SQL_FILE!"
    fi
  else
    echo "🎉 ¡Respaldo SQL completado con éxito en: $SQL_FILE!"
  fi
else
  echo "❌ Error: No se pudo generar el respaldo de base de datos."
  echo "Verifica que el servicio PostgreSQL esté activo y que la contraseña sea 'postgres'."
  echo "Comando manual directo:"
  echo "  PGPASSWORD='postgres' pg_dump -h 127.0.0.1 -p 5432 -U postgres -d comerxia_db -F p -f $SQL_FILE"
  exit 1
fi
