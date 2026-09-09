# ==========================================
# DOCKERFILE: Comerxia App (Full-Stack)
# Multi-stage production build
# ==========================================

# Etapa 1: Construcción (Build)
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias del sistema requeridas
RUN apk add --no-cache python3 make g++

# Copiar manifiestos de paquetes
COPY package.json ./

# Instalar todas las dependencias
RUN npm install

# Copiar todo el código fuente
COPY . .

# Compilar frontend (Vite) y backend (esbuild -> dist/server.cjs)
RUN npm run build

# Etapa 2: Imagen Final de Producción (Ligera)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copiar dependencias de producción y compilados
COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/index.html ./index.html

# Crear carpeta para datos persistentes
RUN mkdir -p /app/data

EXPOSE 3000

# Iniciar servidor compilado
CMD ["node", "dist/server.cjs"]
