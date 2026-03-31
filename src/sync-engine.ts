import { Notice, TFile, normalizePath } from "obsidian";
import type FeishuSyncPlugin from "./main";
import { FeishuClient } from "./feishu-client";
import { MarkdownParser, type ParsedBlock } from "./markdown-parser";

export interface SyncMappingData {
  files: Record<string, string>;
  folders: Record<string, string>;
}

export class SyncEngine {
  private readonly parser = new MarkdownParser();

  constructor(private readonly plugin: FeishuSyncPlugin) {}

  async syncCurrentFile(): Promise<void> {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active markdown file.");
      return;
    }
    await this.syncFiles([file]);
  }

  async syncCurrentFolder(): Promise<void> {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active markdown file.");
      return;
    }
    const prefix = parentPath(file.path);
    const files = this.plugin.app.vault.getMarkdownFiles().filter((item) => parentPath(item.path) === prefix);
    await this.syncFiles(files);
  }

  async syncConfiguredFolders(): Promise<void> {
    const configured = parseSyncFolders(this.plugin.settings.syncFolders);
    const files = this.plugin.app.vault
      .getMarkdownFiles()
      .filter((file) => configured.length === 0 || configured.some((folder) => file.path === folder || file.path.startsWith(`${folder}/`)));
    await this.syncFiles(files);
  }

  async syncFiles(files: TFile[]): Promise<void> {
    const deduped = Array.from(new Map(files.map((file) => [file.path, file])).values());
    if (deduped.length === 0) {
      new Notice("No markdown files matched the sync scope.");
      return;
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
    this.plugin.setStatus(`Feishu Sync: 0/${deduped.length}`);
    new Notice(`Feishu Sync: started (${deduped.length} files)`);

    for (const [index, file] of deduped.entries()) {
      this.plugin.setStatus(`Feishu Sync: ${index + 1}/${deduped.length}`);
      new Notice(`Syncing ${file.path} (${index + 1}/${deduped.length})`, 2000);
      try {
        await this.syncSingleFile(file, client);
        success += 1;
      } catch (error) {
        failed += 1;
        console.error("[obsidian-feishu] sync failed", file.path, error);
        new Notice(`Failed: ${file.path} — ${error instanceof Error ? error.message : String(error)}`, 6000);
      }
    }

    await this.plugin.savePluginData();
    const summary = `Feishu Sync: done (${success} ok, ${failed} failed)`;
    this.plugin.setStatus(summary);
    new Notice(summary, 6000);
  }

  private async syncSingleFile(file: TFile, client: FeishuClient): Promise<void> {
    const markdown = await this.plugin.app.vault.cachedRead(file);
    const parsedBlocks = this.parser.parse(markdown);
    const folderToken = await this.ensureTargetFolder(file, client);

    const existingDocumentId = this.plugin.mapping.files[file.path];
    let documentId = existingDocumentId;
    let created = false;

    if (documentId) {
      try {
        await client.clearDocument(documentId);
      } catch (error) {
        console.warn("[obsidian-feishu] clear existing document failed, recreating", documentId, error);
        documentId = undefined;
      }
    }

    if (!documentId) {
      documentId = await client.createDocument(file.basename, folderToken);
      this.plugin.mapping.files[file.path] = documentId;
      created = true;
      await this.plugin.savePluginData();
    }

    const payload = await this.materializeBlocks(file, parsedBlocks, client);
    await client.appendBlocks(documentId, documentId, payload);

    if (created) {
      try {
        await client.transferOwner(documentId);
      } catch (error) {
        console.warn("[obsidian-feishu] transfer owner failed", documentId, error);
      }
    }

    try {
      await client.setPermission(documentId);
    } catch (error) {
      console.warn("[obsidian-feishu] set permission failed", documentId, error);
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
      await this.plugin.savePluginData();
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

