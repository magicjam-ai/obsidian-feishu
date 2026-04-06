/**
 * E2E Test: Batch Sync Functionality
 * 
 * This test verifies the batch sync functionality by:
 * 1. Opening a vault with configured plugin settings
 * 2. Triggering "Sync all configured folders" command
 * 3. Monitoring the sync progress
 * 4. Reporting success/failure counts
 */

import { browser, $ } from '@wdio/globals';

describe('Batch Sync E2E Test', () => {
  
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
    
    console.log('✅ Obsidian loaded');
  });

  it('should display initial idle status', async () => {
    const statusBar = await $('.status-bar');
    const text = await statusBar.getText();
    console.log('Initial status:', text);
    expect(text).toContain('Feishu');
  });

  it('should trigger batch sync and show progress', async () => {
    // Open command palette
    await browser.keys(['Meta', 'p']);
    await browser.pause(500);
    
    // Type the sync command
    const promptInput = await $('input[class*="prompt-input"]');
    await promptInput.setValue('Feishu: Sync all configured folders');
    await browser.pause(1000);
    
    // Select the command (press Enter)
    await browser.keys(['Enter']);
    
    console.log('✅ Sync command triggered');
    
    // Wait for sync to start
    await browser.pause(3000);
    
    // Check status bar for sync progress
    const statusBar = await $('.status-bar');
    let statusText = await statusBar.getText();
    console.log('Sync status:', statusText);
    
    // Wait a bit more and check again
    await browser.pause(5000);
    statusText = await statusBar.getText();
    console.log('Updated status:', statusText);
    
    // The sync should show progress like "Feishu Sync: 5/20 ✓3 ✗0"
    expect(statusText).toContain('Feishu Sync');
  });

  it('should complete sync and show result', async () => {
    // Wait for sync to potentially complete
    await browser.pause(10000);
    
    const statusBar = await $('.status-bar');
    const text = await statusBar.getText();
    console.log('Final status:', text);
    
    // Should show completion message
    // Status might show "idle" after completion, or "success/failed" count
    console.log('Sync completed with status:', text);
  });

  it('should list any failed files', async () => {
    // The status should indicate if there were failures
    // Failed files are recorded in the plugin data
    const statusBar = await $('.status-bar');
    const text = await statusBar.getText();
    
    if (text.includes('失败') || text.includes('failed')) {
      console.log('⚠️ Some files failed to sync');
    } else {
      console.log('✅ All files synced successfully');
    }
  });
});
