const path = require('node:path');

module.exports = {
  apps: ['farmers', 'cooperatives', 'admin'].map((mode, index) => ({
    name: `mayode-web-${mode}`,
    cwd: path.join(__dirname, 'apps', mode),
    script: path.join(__dirname, 'node_modules/next/dist/bin/next'),
    args: `start -p ${3101 + index}`,
    instances: 1,
    exec_mode: 'fork',
    env: { NODE_ENV: 'production', PORT: 3101 + index },
    max_memory_restart: '300M',
  })),
};
