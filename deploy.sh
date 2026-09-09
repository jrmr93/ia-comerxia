#!/bin/bash
# =================================================================
# COMERXIA - SCRIPT DE DESPLIEGUE AUTOMÁTICO EN SERVIDOR LOCAL
# =================================================================

set -e

echo "🚀 Iniciando proceso de despliegue de Comerxia en Servidor Local..."

# 1. Verificar si existe .env
if [ ! -f .env ]; then
  echo "📄 Creando archivo .env desde .env.example..."
  if [ -f .env.example ]; then
    cp .env.example .env
  else
    cat <<EOT >> .env
PORT=3000
NODE_ENV=production
SQL_HOST=127.0.0.1
SQL_PORT=5432
SQL_USER=postgres
SQL_PASSWORD=comerxia_secret_pass
SQL_DB_NAME=comerxia_db
SQL_SSL=false
DATABASE_URL=postgresql://postgres:comerxia_secret_pass@127.0.0.1:5432/comerxia_db
JWT_SECRET=comerxia_local_key_$(date +%s)
EOT
  fi
  echo "✅ Archivo .env configurado."
fi

# 2. Elegir modo de despliegue
echo ""
echo "Selecciona cómo deseas desplegar:"
echo "1) 🐳 Con Docker Compose (Levanta PostgreSQL + Servidor Node automáticamente)"
echo "2) 💻 En Node.js local con PostgreSQL del sistema"
echo "3) 📦 Modo local integrado (Sin PostgreSQL externo)"
read -p "Opción [1-3] (por defecto 1): " OPTION
OPTION=${OPTION:-1}

if [ "$OPTION" == "1" ]; then
  echo "🐳 Iniciando contenedores Docker..."
  if ! command -v docker &> /dev/null; then
    echo "❌ Docker no está instalado en este servidor. Por favor instálalo o usa la opción 2."
    exit 1
  fi
  docker compose down --remove-orphans || true
  docker compose up --build -d
  echo "✅ ¡Despliegue completado con éxito!"
  echo "🌐 Abre tu navegador en: http://localhost:3000"
  echo "📊 Para ver registros: docker compose logs -f"

elif [ "$OPTION" == "2" ]; then
  echo "📦 Instalando dependencias de Node.js..."
  npm install
  echo "🔨 Compilando frontend y servidor de producción..."
  npm run build
  echo "🚀 Iniciando servidor..."
  if command -v pm2 &> /dev/null; then
    pm2 restart comerxia || pm2 start dist/server.cjs --name "comerxia"
    echo "✅ Aplicación corriendo en segundo plano con PM2."
  else
    echo "Iniciando con Node.js..."
    npm start
  fi

elif [ "$OPTION" == "3" ]; then
  echo "📦 Modo Local Autónomo..."
  npm install
  npm run build
  npm start
fi
