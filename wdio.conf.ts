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
      // Test vault configuration
      vault: './test-vault',
    },
  }],
  
  // Services
  services: ['obsidian'],
  
  // Obsidian cache directory
  cacheDir: path.resolve('.obsidian-cache'),
  
  // Reporters
  reporters: ['obsidian'],
  
  // Mocha options
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
    retries: 2,
  },
  
  // Log level
  logLevel: 'warn',
};
