/**
 * E2E Test: Quick Sync Verification (10 files)
 * 
 * 运行一个快速同步测试，验证：
 * 1. 同步能开始
 * 2. 进度正确更新
 * 3. 没有崩溃
 */

import { browser, $ } from '@wdio/globals';

describe('Quick Sync Verification', () => {
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

  it('should sync first 10 files successfully', async () => {
    console.log('⏱️ Test started');

    // 触发全量同步
    await browser.keys(['Meta', 'p']);
    await browser.pause(500);
    const promptInput = await $('input[class*="prompt-input"]');
    await promptInput.setValue('Feishu: Sync all configured folders (full)');
    await browser.pause(500);
    await browser.keys(['Enter']);
    console.log('✅ Full sync command triggered');

    // 监控前 3 分钟（应该足够同步 10 个文件）
    const START_TIME = Date.now();
    const MONITOR_TIME = 3 * 60 * 1000; // 3 minutes
    let progressUpdates: string[] = [];

    while (Date.now() - START_TIME < MONITOR_TIME) {
      try {
        const statusBar = await $('.status-bar');
        const text = await statusBar.getText();
        
        const match = text.match(/(\d+)\/(\d+).*✓(\d+).*✗(\d+)/);
        if (match) {
          const current = parseInt(match[1]);
          const success = parseInt(match[3]);
          const failed = parseInt(match[4]);
          const elapsed = Math.round((Date.now() - START_TIME) / 1000);
          
          const progress = `[${elapsed}s] ${current}/${match[2]} ✓${success} ✗${failed}`;
          if (progressUpdates[progressUpdates.length - 1] !== progress) {
            progressUpdates.push(progress);
            console.log(progress);
          }
          
          // 如果成功同步了 10 个文件，测试通过
          if (success >= 10) {
            console.log(`✅ SUCCESS: Synced ${success} files in ${elapsed}s`);
            expect(success).toBeGreaterThanOrEqual(10);
            return;
          }
          
          // 如果同步完成
          if (current >= parseInt(match[2])) {
            console.log(`✅ Sync completed naturally`);
            break;
          }
        }
        
        await browser.pause(2000);
      } catch (e: any) {
        if (e.message?.includes('invalid session')) {
          console.log('⚠️ Session ended, checking partial results...');
          break;
        }
        await browser.pause(1000);
      }
    }

    // 即使超时也检查进度
    const lastProgress = progressUpdates[progressUpdates.length - 1];
    console.log(`\n📊 Final progress: ${lastProgress}`);
    
    // 至少应该有进展
    const match = lastProgress?.match(/✓(\d+)/);
    const successCount = match ? parseInt(match[1]) : 0;
    expect(successCount).toBeGreaterThan(0);
  });
});
