#!/bin/bash
# ==========================================================
# Script de Despliegue Directo con Node.js y PostgreSQL
# Ejecutar como usuario: root (root@servidor:~#)
# ==========================================================
set -e

# Verificar ejecución como root
if [ "$EUID" -ne 0 ]; then
  echo "⚠️ Por favor ejecuta este script como usuario root: sudo bash deploy-local.sh"
  exit 1
fi

echo "🚀 Iniciando despliegue de Comerxia en Servidor (Usuario: root)..."

# 1. Verificar archivo de variables de entorno
if [ ! -f .env ]; then
  echo "📄 Creando archivo .env desde .env.example..."
  if [ -f .env.example ]; then
    cp .env.example .env
  else
    cat << 'EOF' > .env
PORT=3000
NODE_ENV=production
APP_URL=http://localhost:3000
JWT_SECRET=comerxia_jwt_secret_local_2026_super_secure_key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/comerxia_db
SQL_HOST=127.0.0.1
SQL_PORT=5432
SQL_USER=postgres
SQL_PASSWORD=postgres
SQL_DB_NAME=comerxia_db
SQL_SSL=false
GEMINI_API_KEY=
TELEGRAM_BOT_TOKEN=
EOF
  fi
  chmod 600 .env
  echo "✅ Archivo .env generado con permisos 600."
fi

# 2. Instalar dependencias de Node.js
echo "📦 Instalando dependencias del proyecto..."
npm install --production=false

# 3. Compilar la aplicación
echo "⚙️ Compilando aplicación para producción..."
npm run build

# 4. Iniciar servidor con PM2 o Node.js directo
if command -v pm2 &> /dev/null; then
  echo "✅ Iniciando / Recargando aplicación con PM2..."
  pm2 restart comerxia || pm2 start dist/server.cjs --name "comerxia"
  pm2 save
else
  echo "✅ ¡Compilación exitosa! Iniciando servidor en puerto 3000..."
  node dist/server.cjs
fi
