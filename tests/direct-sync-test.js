#!/usr/bin/env node
/**
 * 直接测试同步引擎的脚本
 * 
 * 不依赖 Webdriver，直接调用同步逻辑
 * 运行: node tests/direct-sync-test.js
 */

// Mock Obsidian APIs before importing plugin code
const mockVault = {
  getAbstractFileByPath: (path) => {
    if (path === 'nonexistent.md') return null;
    return {
      path,
      name: path.split('/').pop(),
      stat: { mtime: Date.now(), ctime: Date.now(), size: 100 },
    };
  },
};

const mockMetadataCache = {
  getFileCache: () => ({ frontmatter: {} }),
};

// Inject globals that the plugin expects
global.app = {
  vault: mockVault,
  metadataCache: mockMetadataCache,
};

// Now require the plugin modules
const path = require('path');

// We'll simulate the sync by checking what would happen
// This is a dry-run test

console.log('=== 直接同步测试 ===\n');

// 读取同步文件夹列表
const fs = require('fs');
const vaultPath = '/Users/robert/obsidian';
const syncFolders = ['others', '2 研究'];

// 找出前 35 个文件
const allFiles = [];
for (const folder of syncFolders) {
  const folderPath = path.join(vaultPath, folder);
  if (fs.existsSync(folderPath)) {
    const files = fs.readdirSync(folderPath, { recursive: true })
      .filter(f => f.endsWith('.md'))
      .map(f => ({
        path: path.join(folder, f),
        name: f,
        stat: fs.statSync(path.join(folderPath, f))
      }));
    allFiles.push(...files);
  }
}

// 按修改时间排序（和 Obsidian 一致）
allFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);

console.log(`总文件数: ${allFiles.length}\n`);
console.log('前 35 个文件:');
allFiles.slice(0, 35).forEach((f, i) => {
  console.log(`  ${i + 1}. ${f.path}`);
});

console.log('\n=== 第 32-33 个文件信息 ===');
const file32 = allFiles[31];
const file33 = allFiles[32];
console.log('第32个:', file32.path, '- 大小:', file32.stat.size, 'bytes');
console.log('第33个:', file33.path, '- 大小:', file33.stat.size, 'bytes');

// 读取这两个文件的内容长度
const content32 = fs.readFileSync(path.join(vaultPath, file32.path), 'utf-8');
const content33 = fs.readFileSync(path.join(vaultPath, file33.path), 'utf-8');
console.log('\n第32个内容长度:', content32.length, 'characters');
console.log('第33个内容长度:', content33.length, 'characters');
