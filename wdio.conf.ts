import * as path from 'path';

/**
 * WebdriverIO configuration for Obsidian E2E testing
 * 
 * This config enables automated testing of the obsidian-feishu plugin
 * by launching Obsidian in a sandboxed environment.
 */

export const config: WebdriverIO.Config = {
  runner: 'local',
  framework: 'mocha',
  
  // Spec file patterns
  specs: ['./tests/e2e/**/*.ts'],
  
  // How many instances of Obsidian should be launched in parallel
  maxInstances: 1,
  
  // Capabilities
  capabilities: [{
    browserName: 'obsidian',
    'wdio:obsidianOptions': {
      // Obsidian app version to download
      browserVersion: 'latest',
      // Plugin folder to load (the current plugin)
      plugins: ['.'],
      // Robert's real vault
      vault: '/Users/robert/obsidian',
    },
  }],
  
  // Services
  services: ['obsidian'],
  
  // Obsidian cache directory
  cacheDir: path.resolve('.obsidian-cache'),
  
  // Connection pool settings for longer tests
  connectionRetryCount: 5,
  connectionRetryTimeout: 30000,
  
  // Reporters
  reporters: ['obsidian'],
  
  // Mocha options - much longer timeout for full sync tests
  mochaOpts: {
    ui: 'bdd',
    timeout: 600000, // 10 minutes for full sync
    retries: 0, // No retries during test
  },
  
  // Log level
  logLevel: 'warn',
};
