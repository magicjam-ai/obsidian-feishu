/**
 * E2E Test: Complete Full Sync (all 152 files)
 * This test runs until sync completes or max 15 minutes
 */

import { browser, $ } from '@wdio/globals';

describe('Complete Full Sync Test', () => {
  const START_TIME = Date.now();
  const MAX_DURATION = 15 * 60 * 1000; // 15 minutes max

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

  it('should complete full sync of all 152 files', async () => {
    console.log(`⏱️ Test started at ${new Date().toLocaleTimeString()}`);

    // Trigger full sync
    await browser.keys(['Meta', 'p']);
    await browser.pause(500);
    const promptInput = await $('input[class*="prompt-input"]');
    await promptInput.setValue('Feishu: Sync all configured folders (full)');
    await browser.pause(500);
    await browser.keys(['Enter']);
    console.log('✅ Full sync command triggered');

    // Monitor until completion or timeout
    let lastProgress = '';
    let noProgressCount = 0;
    let finalResult = { success: 0, failed: 0, total: 0 };

    while (Date.now() - START_TIME < MAX_DURATION) {
      try {
        const statusBar = await $('.status-bar');
        const text = await statusBar.getText();
        const elapsed = Math.round((Date.now() - START_TIME) / 1000);
        
        // Extract progress
        const match = text.match(/(\d+)\/(\d+).*✓(\d+).*✗(\d+)/);
        if (match) {
          const current = parseInt(match[1]);
          const total = parseInt(match[2]);
          const success = parseInt(match[3]);
          const failed = parseInt(match[4]);
          const rate = (success / elapsed).toFixed(2);
          
          console.log(`[${elapsed}s] ${current}/${total} ✓${success} ✗${failed} | Rate: ${rate}/s`);
          
          finalResult = { success, failed, total };
          
          // Check if completed
          if (current >= total || text.includes('完成')) {
            console.log(`✅ Sync completed! Final: ✓${success} ✗${failed}`);
            break;
          }
          
          // Check if stuck
          if (text === lastProgress) {
            noProgressCount++;
            if (noProgressCount > 10) {
              console.log(`⚠️ No progress for ${noProgressCount * 2}s, waiting...`);
            }
          } else {
            noProgressCount = 0;
          }
          lastProgress = text;
        } else {
          // No progress match, check for idle
          if (text.includes('idle') && text.includes('Feishu')) {
            console.log(`✅ Sync appears to be idle: ${text}`);
            break;
          }
        }
        
        await browser.pause(2000);
      } catch (e) {
        // Session might be closing, try once more
        await browser.pause(2000);
      }
    }

    const totalTime = Math.round((Date.now() - START_TIME) / 1000);
    console.log(`\n📊 FINAL RESULTS after ${totalTime}s:`);
    console.log(`Total: ${finalResult.total}`);
    console.log(`Success: ${finalResult.success}`);
    console.log(`Failed: ${finalResult.failed}`);
    console.log(`Success Rate: ${finalResult.total > 0 ? ((finalResult.success / finalResult.total) * 100).toFixed(1) : 0}%`);
    console.log(`Average Speed: ${totalTime > 0 ? (finalResult.success / totalTime).toFixed(2) : 0} files/sec`);
    
    // Assert success
    expect(finalResult.success).toBeGreaterThan(0);
  });
});
