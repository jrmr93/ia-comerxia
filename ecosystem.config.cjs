// ecosystem.config.cjs
// Mantener Comerxia activo 24/7 en segundo plano con PM2
module.exports = {
  apps: [
    {
      name: "comerxia",
      script: "dist/server.cjs",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
