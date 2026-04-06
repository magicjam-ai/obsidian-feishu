/**
 * E2E Test: Background Sync (no continuous monitoring)
 * 
 * Strategy: Trigger sync, wait in chunks, check once at the end
 * This avoids constant Webdriver polling that might cause session timeout
 */

import { browser, $ } from '@wdio/globals';

describe('Background Sync Test', () => {
  const START_TIME = Date.now();
  const CHUNK_WAIT = 60000; // 1 minute between checks
  const MAX_WAIT = 15 * 60 * 1000; // 15 minutes max

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

  it('should complete full sync in background', async () => {
    console.log(`⏱️ Test started at ${new Date().toLocaleTimeString()}`);

    // Trigger full sync
    await browser.keys(['Meta', 'p']);
    await browser.pause(500);
    const promptInput = await $('input[class*="prompt-input"]');
    await promptInput.setValue('Feishu: Sync all configured folders (full)');
    await browser.pause(500);
    await browser.keys(['Enter']);
    console.log('✅ Full sync command triggered - running in background');

    // Wait in chunks, checking occasionally
    let attempts = 0;
    let finalProgress = '';
    
    while (Date.now() - START_TIME < MAX_WAIT) {
      await browser.pause(CHUNK_WAIT);
      attempts++;
      
      try {
        const statusBar = await $('.status-bar');
        const text = await statusBar.getText();
        const elapsed = Math.round((Date.now() - START_TIME) / 1000);
        
        console.log(`[${elapsed}s] Status check #${attempts}: ${text.substring(0, 100)}`);
        finalProgress = text;
        
        // Check if sync appears to be done
        if (text.includes('完成') || text.includes('completed')) {
          console.log('✅ Sync completed!');
          break;
        }
        
        // Check for idle state with success count
        const match = text.match(/✓(\d+)/);
        if (match && parseInt(match[1]) >= 150) {
          console.log(`✅ Likely complete: ${match[1]} files synced`);
          break;
        }
        
      } catch (e: any) {
        console.log(`[${Math.round((Date.now() - START_TIME)/1000)}s] Check #${attempts} failed: ${e.message?.substring(0, 50)}`);
        
        // If session is dead, wait a bit and try again
        if (e.message?.includes('invalid session')) {
          await browser.pause(5000);
          try {
            // Try to reconnect
            const statusBar = await $('.status-bar');
            finalProgress = await statusBar.getText();
            console.log(`Reconnected. Status: ${finalProgress.substring(0, 80)}`);
          } catch {
            console.log('Could not reconnect, sync may have completed in background');
            break;
          }
        }
      }
    }

    const totalTime = Math.round((Date.now() - START_TIME) / 1000);
    console.log(`\n📊 FINAL after ${totalTime}s:`);
    console.log(`Final status: ${finalProgress.substring(0, 150)}`);
    
    // Parse success count from final status
    const match = finalProgress.match(/✓(\d+)/);
    const successCount = match ? parseInt(match[1]) : 0;
    console.log(`Success count: ${successCount}`);
    
    // Success if we synced at least 100 files
    expect(successCount).toBeGreaterThanOrEqual(100);
  });
});
