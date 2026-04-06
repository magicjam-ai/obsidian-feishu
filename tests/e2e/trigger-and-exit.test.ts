/**
 * E2E Test: Trigger and Check Later
 * 
 * 1. Trigger sync command
 * 2. Wait a few seconds for sync to start
 * 3. Exit immediately - sync continues in background
 * 4. We check data.json afterward to see results
 */

import { browser, $ } from '@wdio/globals';
import * as fs from 'fs';

describe('Trigger and Background Sync', () => {
  before(async () => {
    await browser.waitUntil(async () => {
      try {
        const title = await browser.getTitle();
        return title.includes('Obsidian');
      } catch {
        return false;
      }
    }, { timeout: 60000 });
    console.log('✅ Obsidian loaded');
  });

  it('should trigger sync and exit immediately', async () => {
    console.log(`⏱️ Triggering sync at ${new Date().toLocaleTimeString()}`);

    // Trigger full sync
    await browser.keys(['Meta', 'p']);
    await browser.pause(500);
    const promptInput = await $('input[class*="prompt-input"]');
    await promptInput.setValue('Feishu: Sync all configured folders (full)');
    await browser.pause(500);
    await browser.keys(['Enter']);
    console.log('✅ Sync command triggered');

    // Wait 30 seconds for sync to progress
    console.log('Waiting 30 seconds for sync to progress...');
    await browser.pause(30000);

    // Check status one time
    try {
      const statusBar = await $('.status-bar');
      const text = await statusBar.getText();
      console.log(`Status after 30s: ${text.substring(0, 150)}`);
    } catch (e: any) {
      console.log(`Status check failed: ${e.message?.substring(0, 50)}`);
    }

    console.log('✅ Test complete - sync running in background');
    
    // Give sync a moment to finish the current file
    await browser.pause(2000);
  });
});
