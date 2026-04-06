import { Notice, TFile, normalizePath } from "obsidian";
// SyncProgress interface (moved from progress-modal.ts)
export interface SyncProgress {
  current: number;
  total: number;
  currentFile: string;
  success: number;
  failed: number;
}

import type FeishuSyncPlugin from "./main";
import { FeishuClient } from "./feishu-client";
import { MarkdownParser, type ParsedBlock } from "./markdown-parser";



export interface SyncMappingData {
  files: Record<string, string>;
  folders: Record<string, string>;
  failedFiles: string[]; // 同步失败的文件路径列表，支持增量重试
  fileMtimes: Record<string, number>; // 记录每个文件同步时的 mtime，用于增量同步
}

export class SyncEngine {
  private readonly parser = new MarkdownParser();

  constructor(private readonly plugin: FeishuSyncPlugin) {}

  async saveDataFile(): Promise<void> {
    await this.plugin.savePluginData();
  }

  async syncCurrentFile(onProgress?: (p: SyncProgress) => void): Promise<{ success: number; failed: number }> {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active markdown file.");
      return { success: 0, failed: 0 };
    }
    return this.syncFiles([file], onProgress);
  }

  async syncCurrentFolder(onProgress?: (p: SyncProgress) => void): Promise<{ success: number; failed: number }> {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active markdown file.");
      return { success: 0, failed: 0 };
    }
    const prefix = parentPath(file.path);
    const files = this.plugin.app.vault.getMarkdownFiles().filter((item) => parentPath(item.path) === prefix);
    return this.syncFiles(files, onProgress);
  }

  async syncConfiguredFolders(onProgress?: (p: SyncProgress) => void, incremental = true): Promise<{ success: number; failed: number }> {
    const configured = parseSyncFolders(this.plugin.settings.syncFolders);
    const files = this.plugin.app.vault
      .getMarkdownFiles()
      .filter((file) => configured.length === 0 || configured.some((folder) => file.path === folder || file.path.startsWith(`${folder}/`)));
    return this.syncFiles(files, onProgress, incremental);
  }

  /**
   * 全量同步：忽略增量逻辑，强制同步所有配置的文件
   */
  async syncConfiguredFoldersFull(onProgress?: (p: SyncProgress) => void): Promise<{ success: number; failed: number }> {
    return this.syncConfiguredFolders(onProgress, false);
  }

  private cancelled = false;
  private syncing = false;

  cancel(): void {
    this.cancelled = true;
  }

  async syncFiles(files: TFile[], onProgress?: (p: SyncProgress) => void, incremental = true): Promise<{ success: number; failed: number }> {
    // 增量同步：只同步有变化的文件
    let toSync: TFile[];
    if (incremental) {
      toSync = [];
      for (const file of files) {
        const lastMtime = this.plugin.mapping.fileMtimes[file.path];
        if (!lastMtime || file.stat.mtime > lastMtime) {
          toSync.push(file);
        }
      }
      const skipped = files.length - toSync.length;
      if (skipped > 0) {
        console.log(`[obsidian-feishu] 增量同步: 跳过 ${skipped} 个未变化的文件`);
      }
    } else {
      toSync = Array.from(new Map(files.map((file) => [file.path, file])).values());
    }

    if (toSync.length === 0) {
      new Notice("没有需要同步的文件（全部未变化）");
      return { success: 0, failed: 0 };
    }

    const client = new FeishuClient({
      appId: this.plugin.settings.appId,
      appSecret: this.plugin.settings.appSecret,
      targetFolderToken: this.plugin.settings.targetFolderToken,
      ownerOpenId: this.plugin.settings.ownerOpenId,
    });
    client.validateConfig();

    let success = 0;
    let failed = 0;
    if (this.syncing) {
      new Notice("同步已在进行中，请稍候...");
      return { success: 0, failed: 0 };
    }
    this.syncing = true;

    // 记录本次失败的文件路径
    const currentFailed: string[] = [];

    try {
      this.cancelled = false;
      this.plugin.setStatus(`Feishu Sync: 0/${toSync.length}`);
      new Notice(`飞书同步开始 (${toSync.length} 个文件${incremental ? '（增量）' : '（全量）'})`);

      for (const [index, file] of toSync.entries()) {
        if (this.cancelled) {
          new Notice(`已取消同步 (${index}/${toSync.length})`, 4000);
          break;
        }
        this.plugin.setStatus(`Feishu Sync: ${index + 1}/${toSync.length} ✓${success} ✗${failed}`);
        onProgress?.({
          current: index,
          total: toSync.length,
          currentFile: file.name,
          success,
          failed,
        });
        try {
          // Wrap in timeout to prevent hanging - if any file takes >30s, skip it
          await this.withTimeout(this.syncSingleFile(file, client), 30000);
          success += 1;
          // 成功后更新 mtime 并从失败列表中移除
          this.plugin.mapping.fileMtimes[file.path] = file.stat.mtime;
          const prevFailedIdx = this.plugin.mapping.failedFiles.indexOf(file.path);
          if (prevFailedIdx > -1) {
            this.plugin.mapping.failedFiles.splice(prevFailedIdx, 1);
          }
        } catch (error) {
          failed += 1;
          currentFailed.push(file.path);
          const msg = error instanceof Error ? error.message : String(error);
          console.error("[obsidian-feishu] sync failed", file.path, msg);
          new Notice(`失败: ${file.name} — ${msg.substring(0, 60)}`, 4000);
        }

        // Delay between files to avoid API rate limiting (150ms is safe for Feishu)
        await new Promise<void>((r) => setTimeout(r, 150));
      }

      // 更新失败文件列表（合并历史和本次新增）
      const allFailed = [...new Set([...this.plugin.mapping.failedFiles.filter(f => !toSync.some(d => d.path === f)), ...currentFailed])];
      this.plugin.mapping.failedFiles = allFailed;
      await this.saveDataFile();

      onProgress?.({
        current: toSync.length,
        total: toSync.length,
        currentFile: "",
        success,
        failed,
      });
      const summary = allFailed.length > 0
        ? `飞书同步完成: ${success} 成功, ${failed} 失败 (共 ${allFailed.length} 个待重试)`
        : `飞书同步完成: ${success} 成功, ${failed} 失败`;
      this.plugin.setStatus(summary);
      new Notice(summary, 6000);
      return { success, failed };
    } finally {
      this.syncing = false;
    }
  }

  /**
   * 重试之前失败的文件
   */
  async retryFailedFiles(): Promise<{ success: number; failed: number }> {
    const failedPaths = this.plugin.mapping.failedFiles;
    if (failedPaths.length === 0) {
      new Notice("没有待重试的失败文件");
      return { success: 0, failed: 0 };
    }

    const files = failedPaths
      .map(path => this.plugin.app.vault.getAbstractFileByPath(path))
      .filter((f): f is TFile => f instanceof TFile);

    new Notice(`开始重试 ${files.length} 个失败文件...`);
    return this.syncFiles(files);
  }

  /**
   * 获取当前失败文件列表
   */
  getFailedFiles(): string[] {
    return this.plugin.mapping.failedFiles;
  }

  /**
   * Timeout wrapper - ensures a promise resolves or rejects within specified milliseconds
   */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`[Timeout] Operation exceeded ${ms}ms`)), ms)
      )
    ]);
  }

  private async syncSingleFile(file: TFile, client: FeishuClient): Promise<void> {
    try {
      const markdown = await this.plugin.app.vault.cachedRead(file);
      const parsedBlocks = this.parser.parse(markdown);
      const folderToken = await this.ensureTargetFolder(file, client);

      const existingDocumentId = this.plugin.mapping.files[file.path];
      let documentId: string | undefined = existingDocumentId;
      let created = false;

      // 如果已有映射文档，尝试清空并更新；清空失败则尝试追加模式
      if (documentId) {
        try {
          await client.clearDocument(documentId);
          created = false;
        } catch (error) {
          // 清空失败，可能是没有写权限或其他问题，标记需要重建
          console.warn("[obsidian-feishu] clear document failed, will recreate:", documentId, error);
          documentId = undefined;
          created = false;
        }
      }

      // 如果没有文档，创建新文档
      if (!documentId) {
        try {
          documentId = await client.createDocument(file.basename, folderToken);
          this.plugin.mapping.files[file.path] = documentId;
          created = true;
          await this.saveDataFile();
        } catch (error) {
          // 创建文档失败，抛出错误而不是静默跳过
          throw new Error(`创建飞书文档失败: ${file.basename} - ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // 写入内容
      try {
        const payload = await this.materializeBlocks(file, parsedBlocks, client);
        await client.appendBlocks(documentId, documentId, payload);
      } catch (error) {
        throw new Error(`写入内容失败: ${file.basename} - ${error instanceof Error ? error.message : String(error)}`);
      }

      // 新建文档才尝试转移 owner（旧文档已有多人权限，无需再转）
      if (created) {
        try {
          await client.transferOwner(documentId);
        } catch (error) {
          // owner 转移失败不影响同步，用户已有编辑权限
          console.warn("[obsidian-feishu] transfer owner failed (non-critical):", documentId, error);
        }
      }

      // 设置文档权限（给用户 full_access）
      try {
        await client.setPermission(documentId);
      } catch (error) {
        // 权限设置失败可能是企业策略限制，不影响使用
        console.warn("[obsidian-feishu] set permission failed (non-critical):", documentId, error);
      }

      // Add feishu link to frontmatter if not already present
      await this.addFeishuLinkToFrontmatter(file, documentId);
    } catch (error) {
      // 统一捕获所有错误并重新抛出，确保错误信息清晰
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[obsidian-feishu] syncSingleFile failed for ${file.path}:`, error);
      throw new Error(msg); // 保持原始错误信息不丢失
    }
  }

  private async addFeishuLinkToFrontmatter(file: TFile, documentId: string): Promise<void> {
    try {
      const content = await this.plugin.app.vault.cachedRead(file);
      // Check if frontmatter already has a feishu link
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch && fmMatch[1] && /^feishu:/m.test(fmMatch[1])) {
        return;
      }
      const url = `https://nio.feishu.cn/docx/${documentId}`;
      await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
        if (!fm.feishu) {
          fm.feishu = url;
        }
      });
    } catch (error) {
      console.warn("[obsidian-feishu] add feishu link to frontmatter failed", file.path, error);
    }
  }

  private async materializeBlocks(file: TFile, blocks: ParsedBlock[], client: FeishuClient): Promise<unknown[]> {
    const result: unknown[] = [];
    for (const block of blocks) {
      if (block.request.block_type === 27 && block.imageRef) {
        const imageFile = this.parser.resolveImageFile(this.plugin.app.vault, file, block.imageRef.original);
        if (!imageFile) {
          result.push({ block_type: 2, text: { elements: [{ text_run: { content: `[Image not found: ${block.imageRef.original}]`, text_element_style: {} } }], style: { align: 1 } } });
          continue;
        }
        const bytes = await this.plugin.app.vault.readBinary(imageFile);
        const token = await client.uploadImage(imageFile.name, bytes);
        const image: Record<string, unknown> = { token, align: 1 };
        if (block.imageRef.alt) {
          image.caption = {
            elements: [{ text_run: { content: block.imageRef.alt, text_element_style: {} } }],
          };
        }
        result.push({ block_type: 27, image });
        continue;
      }
      result.push(block.request);
    }
    return result;
  }

  private async ensureTargetFolder(file: TFile, client: FeishuClient): Promise<string> {
    if (!this.plugin.settings.mirrorFolderStructure) {
      return this.plugin.settings.targetFolderToken;
    }

    const folderPath = parentPath(file.path);
    if (!folderPath) return this.plugin.settings.targetFolderToken;
    if (this.plugin.mapping.folders[folderPath]) return this.plugin.mapping.folders[folderPath];

    const segments = folderPath.split("/").filter(Boolean);
    let currentPath = "";
    let currentToken = this.plugin.settings.targetFolderToken;

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = this.plugin.mapping.folders[currentPath];
      if (existing) {
        currentToken = existing;
        continue;
      }

      const entries = await client.listFolderContents(currentToken);
      const matched = entries.find((entry) => entry.type === "folder" && entry.name === segment && entry.token);
      if (matched?.token) {
        currentToken = matched.token;
      } else {
        currentToken = await client.createFolder(segment, currentToken);
      }
      this.plugin.mapping.folders[currentPath] = currentToken;
      await this.saveDataFile();
    }

    return currentToken;
  }
}

function parseSyncFolders(value: string): string[] {
  return value
    .split(",")
    .map((item) => normalizePath(item.trim()))
    .filter(Boolean);
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index) : "";
}

