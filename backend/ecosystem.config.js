// ecosystem.config.js
// Production PM2 Cluster Configuration for IndGig Backend
// Automatically scales across available CPU cores with zero-downtime reloads

module.exports = {
  apps: [
    {
      name: 'indgig-backend',
      script: 'server.js',
      // In production cluster mode: scales across CPU cores.
      // For local testing on 12-core CPU, 4 instances provide balanced extreme throughput without RAM pressure.
      instances: process.env.PM2_INSTANCES || 4,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      // Zero-downtime graceful shutdown & reload
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      autorestart: true,
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true
    }
  ]
};
