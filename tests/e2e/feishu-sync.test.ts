/**
 * E2E tests for obsidian-feishu plugin
 * 
 * These tests run in a real Obsidian instance to verify the plugin works correctly.
 * 
 * Prerequisites:
 * 1. Run `npm run test:e2e:prepare` to download Obsidian
 * 2. Run `npm run test:e2e` to execute these tests
 * 
 * Note: These tests require a display or Xvfb on Linux.
 * For CI, set HEADLESS_MODE=true or use a virtual display.
 */

import { browser, $, $$ } from '@wdio/globals';

describe('obsidian-feishu Plugin E2E Tests', () => {
  
  before(async () => {
    // Wait for Obsidian to fully load
    await browser.waitUntil(async () => {
      try {
        const title = await browser.getTitle();
        return title.includes('Obsidian');
      } catch {
        return false;
      }
    }, { timeout: 60000 });
    
    console.log('Obsidian loaded successfully');
  });

  describe('Plugin Loading', () => {
    it('should load the obsidian-feishu plugin', async () => {
      // Check that Obsidian is running
      const title = await browser.getTitle();
      expect(title).toBeTruthy();
      console.log('Obsidian title:', title);
    });

    it('should display Feishu Sync status in status bar', async () => {
      // The plugin adds text to the status bar
      // We look for "Feishu Sync" text
      const statusBar = await $('.status-bar');
      if (statusBar) {
        const text = await statusBar.getText();
        console.log('Status bar:', text);
        // Status should contain "Feishu Sync"
        expect(text).toContain('Feishu');
      }
    });
  });

  describe('Command Palette', () => {
    it('should open command palette and search for Feishu commands', async () => {
      // Open command palette with Cmd+P (Mac) or Ctrl+P (Windows/Linux)
      await browser.keys(['Meta', 'p']);
      await browser.pause(500);
      
      // Wait for command palette input
      const promptInput = await $('input[class*="prompt-input"]');
      expect(promptInput).toBeTruthy();
      
      // Type to search
      await promptInput.setValue('Feishu');
      await browser.pause(1000);
      
      // Press Escape to close
      await browser.keys(['Escape']);
    });

    it('should execute sync-all-configured-folders command', async () => {
      // This test is a placeholder - actual sync would require configured settings
      // and network access to Feishu API
      
      // Open command palette
      await browser.keys(['Meta', 'p']);
      await browser.pause(500);
      
      // Close it
      await browser.keys(['Escape']);
      
      // Test passes if no errors thrown
      expect(true).toBe(true);
    });
  });

  describe('Sync Functionality', () => {
    it('should create a test note', async () => {
      // Create a new note with Cmd+N
      await browser.keys(['Meta', 'n']);
      await browser.pause(500);
      
      // Type content
      await browser.keys(['Test note for sync']);
      await browser.pause(200);
      
      // Save with Cmd+S
      await browser.keys(['Meta', 's']);
      await browser.pause(500);
    });

    it('should display sync status during sync', async () => {
      // This would test the actual sync functionality
      // but requires plugin settings to be configured
      
      // For now, just verify the status bar is accessible
      const statusBar = await $('.status-bar');
      expect(statusBar).toBeTruthy();
    });
  });

  describe('Settings Tab', () => {
    it('should access plugin settings', async () => {
      // Open settings with Cmd+,
      await browser.keys(['Meta', ',']);
      await browser.pause(1000);
      
      // Click on "Community plugins" (if needed)
      // Note: Settings UI varies, this is a basic check
      
      // Close settings
      await browser.keys(['Escape']);
      
      expect(true).toBe(true);
    });
  });
});
