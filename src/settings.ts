import { App, PluginSettingTab, Setting } from "obsidian";
import type FeishuSyncPlugin from "./main";

export interface FeishuSyncSettings {
  appId: string;
  appSecret: string;
  targetFolderToken: string;
  ownerOpenId: string;
  syncFolders: string;
  mirrorFolderStructure: boolean;
}

export const DEFAULT_SETTINGS: FeishuSyncSettings = {
  appId: "",
  appSecret: "",
  targetFolderToken: "",
  ownerOpenId: "",
  syncFolders: "",
  mirrorFolderStructure: true,
};

export class FeishuSyncSettingTab extends PluginSettingTab {
  plugin: FeishuSyncPlugin;

  constructor(app: App, plugin: FeishuSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Feishu Sync Settings" });

    new Setting(containerEl)
      .setName("App ID")
      .setDesc("Feishu/Lark app ID.")
      .addText((text) =>
        text
          .setPlaceholder("cli_xxx")
          .setValue(this.plugin.settings.appId)
          .onChange(async (value) => {
            this.plugin.settings.appId = value.trim();
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName("App Secret")
      .setDesc("Feishu/Lark app secret.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("Enter app secret")
          .setValue(this.plugin.settings.appSecret)
          .onChange(async (value) => {
            this.plugin.settings.appSecret = value.trim();
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName("Target Folder Token")
      .setDesc("Root Feishu Drive folder token for synced documents.")
      .addText((text) =>
        text
          .setPlaceholder("folder token")
          .setValue(this.plugin.settings.targetFolderToken)
          .onChange(async (value) => {
            this.plugin.settings.targetFolderToken = value.trim();
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName("Owner Open ID")
      .setDesc("Optional owner open_id for ownership transfer after document creation.")
      .addText((text) =>
        text
          .setPlaceholder("ou_xxx")
          .setValue(this.plugin.settings.ownerOpenId)
          .onChange(async (value) => {
            this.plugin.settings.ownerOpenId = value.trim();
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName("Sync Folders")
      .setDesc("Comma-separated vault folders to sync. Leave empty to sync the whole vault.")
      .addTextArea((text) =>
        text
          .setPlaceholder("research, docs/project-a")
          .setValue(this.plugin.settings.syncFolders)
          .onChange(async (value) => {
            this.plugin.settings.syncFolders = value;
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName("Mirror Folder Structure")
      .setDesc("Create matching subfolders in Feishu Drive.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mirrorFolderStructure).onChange(async (value) => {
          this.plugin.settings.mirrorFolderStructure = value;
          await this.plugin.savePluginData();
        }),
      );
  }
}
