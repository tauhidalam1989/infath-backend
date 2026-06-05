module.exports = {
  apps: [
    {
      name: 'screen-backend',
      script: './dist/server.js',
      cwd: '/root/screen-backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: './logs/screen-backend-error.log',
      out_file: './logs/screen-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};

