/**
 * E2E Test: Full Sync with Speed Measurement
 */

import { browser, $ } from '@wdio/globals';

describe('Full Sync E2E Test', () => {
  let startTime: number;
  
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

  it('should trigger full sync and measure speed', async () => {
    // Open command palette
    await browser.keys(['Meta', 'p']);
    await browser.pause(500);
    
    // Type the full sync command
    const promptInput = await $('input[class*="prompt-input"]');
    await promptInput.setValue('Feishu: Sync all configured folders (full)');
    await browser.pause(1000);
    
    // Record start time
    startTime = Date.now();
    console.log(`⏱️ Full sync started at ${new Date(startTime).toLocaleTimeString()}`);
    
    // Execute command
    await browser.keys(['Enter']);
    console.log('✅ Full sync command triggered');
    
    // Monitor sync progress
    let lastProgress = '';
    let stableCount = 0;
    
    // Wait for sync to progress
    await browser.pause(5000);
    
    for (let i = 0; i < 60; i++) { // Max 60 iterations
      const statusBar = await $('.status-bar');
      const text = await statusBar.getText();
      
      // Extract progress info
      const match = text.match(/(\d+)\/(\d+).*✓(\d+).*✗(\d+)/);
      if (match) {
        const current = parseInt(match[1]);
        const total = parseInt(match[2]);
        const success = parseInt(match[3]);
        const failed = parseInt(match[4]);
        
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const rate = (success / elapsed).toFixed(2);
        
        console.log(`Progress: ${current}/${total} ✓${success} ✗${failed} | ${elapsed}s | Rate: ${rate}/s`);
        
        // Check if sync completed (status shows idle or very high progress)
        if (text.includes('idle') || current >= total - 1) {
          console.log(`✅ Sync completed or nearly completed`);
          break;
        }
        
        // Check if progress is stuck
        if (text === lastProgress) {
          stableCount++;
          if (stableCount > 5) {
            console.log(`⚠️ Progress seems stuck at ${lastProgress}`);
          }
        } else {
          stableCount = 0;
        }
        lastProgress = text;
      }
      
      await browser.pause(2000);
    }
    
    // Final status
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const statusBar = await $('.status-bar');
    const finalText = await statusBar.getText();
    
    console.log(`\n📊 Final Status after ${elapsed}s:`);
    console.log(finalText);
    
    // Calculate average speed
    const finalMatch = finalText.match(/✓(\d+)/);
    if (finalMatch) {
      const totalSuccess = parseInt(finalMatch[1]);
      const avgRate = (totalSuccess / elapsed).toFixed(2);
      console.log(`\n📈 Average sync speed: ${avgRate} files/second`);
      console.log(`📈 Total time: ${elapsed} seconds for ${totalSuccess} files`);
    }
  });
});
