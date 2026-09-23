module.exports = {
  apps: [
    {
      name: 'mayode-website',
      cwd: '/var/www/mayode-system/website',
      script: 'node_modules/.bin/next',
      args: 'start -p 3004',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
    },
  ],
};
