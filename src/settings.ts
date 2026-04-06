import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type FeishuSyncPlugin from "./main";

export interface FeishuSyncSettings {
  // Legacy mode
  appId: string;
  appSecret: string;
  ownerOpenId: string;

  // OAuth mode
  authServerUrl: string;

  // Shared settings
  targetFolderToken: string;
  syncFolders: string;
  mirrorFolderStructure: boolean;

  // UI state
  useCustomApp: boolean;
}

export const DEFAULT_SETTINGS: FeishuSyncSettings = {
  appId: "",
  appSecret: "",
  ownerOpenId: "",
  authServerUrl: "https://feishu-auth.robertma.cn",
  targetFolderToken: "",
  syncFolders: "",
  mirrorFolderStructure: true,
  useCustomApp: false,
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

    containerEl.createEl("h2", { text: "飞书同步设置" });

    // --- Auth mode toggle ---
    new Setting(containerEl)
      .setName("高级模式（自定义应用）")
      .setDesc("使用自己的飞书应用 App ID 和 App Secret，适合有自建应用的用户。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useCustomApp).onChange(async (value) => {
          this.plugin.settings.useCustomApp = value;
          await this.plugin.savePluginData();
          this.display();
        }),
      );

    if (this.plugin.settings.useCustomApp) {
      this.displayCustomAppSettings(containerEl);
    } else {
      this.displayOAuthSettings(containerEl);
    }

    // --- Shared settings ---
    containerEl.createEl("h3", { text: "同步设置" });

    new Setting(containerEl)
      .setName("目标文件夹 Token")
      .setDesc("飞书云空间中用于存放同步文档的文件夹 Token。")
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
      .setName("同步文件夹")
      .setDesc("逗号分隔的 Obsidian 文件夹路径，留空则同步整个仓库。")
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
      .setName("镜像文件夹结构")
      .setDesc("在飞书云空间中创建与 Obsidian 对应的子文件夹结构。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mirrorFolderStructure).onChange(async (value) => {
          this.plugin.settings.mirrorFolderStructure = value;
          await this.plugin.savePluginData();
        }),
      );
  }

  private displayOAuthSettings(containerEl: HTMLElement): void {
    const auth = this.plugin.authData;
    const isLoggedIn = !!auth?.accessToken;

    new Setting(containerEl)
      .setName("授权服务器地址")
      .setDesc("OAuth 授权服务的 URL。")
      .addText((text) =>
        text
          .setPlaceholder("https://feishu-auth.robertma.cn")
          .setValue(this.plugin.settings.authServerUrl)
          .onChange(async (value) => {
            this.plugin.settings.authServerUrl = value.trim();
            await this.plugin.savePluginData();
          }),
      );

    // Auth status
    const statusEl = containerEl.createDiv({ cls: "feishu-auth-status" });
    if (isLoggedIn) {
      statusEl.createEl("p", {
        text: `✅ 已登录: ${auth.userName ?? auth.userId ?? "未知用户"}`,
        cls: "feishu-auth-logged-in",
      });
    } else {
      statusEl.createEl("p", {
        text: "❌ 未登录",
        cls: "feishu-auth-logged-out",
      });
    }

    // Login/Logout button
    if (isLoggedIn) {
      new Setting(containerEl)
        .setName("退出登录")
        .setDesc("清除已保存的授权信息。")
        .addButton((btn) =>
          btn.setButtonText("退出登录").onClick(async () => {
            this.plugin.logout();
            await this.plugin.savePluginData();
            this.display();
            new Notice("已退出飞书登录");
          }),
        );
    } else {
      new Setting(containerEl)
        .setName("登录飞书")
        .setDesc("点击后将在浏览器中打开飞书授权页面。")
        .addButton((btn) =>
          btn.setButtonText("登录飞书").setCta().onClick(async () => {
            try {
              await this.plugin.loginWithOAuth();
              this.display();
              new Notice("飞书登录成功！");
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              new Notice(`登录失败: ${msg}`, 8000);
            }
          }),
        );
    }
  }

  private displayCustomAppSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("App ID")
      .setDesc("飞书应用的 App ID。")
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
      .setDesc("飞书应用的 App Secret。")
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
      .setName("Owner Open ID")
      .setDesc("可选，文档创建后转移所有权的用户 Open ID。")
      .addText((text) =>
        text
          .setPlaceholder("ou_xxx")
          .setValue(this.plugin.settings.ownerOpenId)
          .onChange(async (value) => {
            this.plugin.settings.ownerOpenId = value.trim();
            await this.plugin.savePluginData();
          }),
      );
  }
}
