import { Notice, Plugin } from "obsidian";
import { FeishuSyncSettingTab, DEFAULT_SETTINGS, type FeishuSyncSettings } from "./settings";
import { SyncEngine, type SyncMappingData } from "./sync-engine";

interface PluginDataShape {
  settings?: Partial<FeishuSyncSettings>;
  mappings?: Partial<SyncMappingData>;
}

export default class FeishuSyncPlugin extends Plugin {
  settings: FeishuSyncSettings = { ...DEFAULT_SETTINGS };
  mapping: SyncMappingData = { files: {}, folders: {} };
  private statusBarEl!: HTMLElement;
  private syncEngine!: SyncEngine;

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.syncEngine = new SyncEngine(this);

    this.addRibbonIcon("upload-cloud", "Sync current file to Feishu", async () => {
      await this.runSync(() => this.syncEngine.syncCurrentFile());
    });

    this.addCommand({
      id: "sync-current-file",
      name: "Feishu: Sync current file",
      callback: async () => this.runSync(() => this.syncEngine.syncCurrentFile()),
    });

    this.addCommand({
      id: "sync-all-configured-folders",
      name: "Feishu: Sync all configured folders",
      callback: async () => this.runSync(() => this.syncEngine.syncConfiguredFolders()),
    });

    this.addCommand({
      id: "sync-current-folder",
      name: "Feishu: Sync current folder",
      callback: async () => this.runSync(() => this.syncEngine.syncCurrentFolder()),
    });

    this.addSettingTab(new FeishuSyncSettingTab(this.app, this));

    this.statusBarEl = this.addStatusBarItem();
    this.setStatus("Feishu Sync: idle");
  }

  onunload(): void {
    this.setStatus("Feishu Sync: unloaded");
  }

  setStatus(text: string): void {
    if (this.statusBarEl) {
      this.statusBarEl.setText(text);
    }
  }

  async savePluginData(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      mappings: this.mapping,
    });
  }

  private async loadPluginData(): Promise<void> {
    const data = (await this.loadData()) as PluginDataShape | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(data?.settings ?? {}),
    };
    this.mapping = {
      files: { ...(data?.mappings?.files ?? {}) },
      folders: { ...(data?.mappings?.folders ?? {}) },
    };
  }

  private async runSync(task: () => Promise<{ success: number; failed: number }>): Promise<void> {
    try {
      await task();
    } catch (error) {
      console.error("[obsidian-feishu] sync run failed", error);
      this.setStatus("Feishu Sync: failed");
      new Notice(error instanceof Error ? error.message : String(error), 6000);
    }
  }
}
