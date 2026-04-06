import { Notice, Plugin } from "obsidian";
import { FeishuSyncSettingTab, DEFAULT_SETTINGS, type FeishuSyncSettings } from "./settings";
import { SyncEngine, type SyncMappingData } from "./sync-engine";
import { OAuthManager, type AuthData } from "./oauth";

interface PluginDataShape {
  settings?: Partial<FeishuSyncSettings>;
  mappings?: Partial<SyncMappingData>;
  auth?: AuthData | null;
}

export default class FeishuSyncPlugin extends Plugin {
  settings: FeishuSyncSettings = { ...DEFAULT_SETTINGS };
  mapping: SyncMappingData = { files: {}, folders: {}, failedFiles: [], fileMtimes: {} };
  authData: AuthData | null = null;
  private oauthManager!: OAuthManager;
  private statusBarEl!: HTMLElement;
  private syncEngine!: SyncEngine;

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.oauthManager = new OAuthManager(
      this.settings.authServerUrl,
      (auth) => { this.authData = auth; },
    );
    if (this.authData) {
      this.oauthManager.setAuth(this.authData);
    }

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
      id: "sync-all-configured-folders-full",
      name: "Feishu: Sync all configured folders (full)",
      callback: async () => this.runSync(() => this.syncEngine.syncConfiguredFoldersFull()),
    });

    this.addCommand({
      id: "sync-current-folder",
      name: "Feishu: Sync current folder",
      callback: async () => this.runSync(() => this.syncEngine.syncCurrentFolder()),
    });

    this.addCommand({
      id: "retry-failed-files",
      name: "Feishu: Retry failed files",
      callback: async () => {
        const failed = this.syncEngine.getFailedFiles();
        if (failed.length === 0) {
          new Notice("没有待重试的失败文件");
          return;
        }
        await this.runSync(() => this.syncEngine.retryFailedFiles());
      },
    });

    this.addCommand({
      id: "feishu-login",
      name: "Feishu: Login",
      callback: async () => {
        try {
          await this.loginWithOAuth();
          new Notice("飞书登录成功！");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          new Notice(`登录失败: ${msg}`, 8000);
        }
      },
    });

    // Register URI handler for OAuth callback (Obsidian API)
    (this as any).registerUriHandler({
      handleURI: async (uri: string) => {
        try {
          const url = new URL(uri);
          if (!url.pathname.includes("feishu-oauth") && !url.pathname.endsWith("callback")) return;

          const params = url.searchParams;
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          const expiresIn = params.get("expires_in");

          if (!accessToken || !refreshToken) {
            new Notice("OAuth 回调缺少必要的 token 信息");
            return;
          }

          this.authData = {
            accessToken,
            refreshToken,
            expiresAt: Date.now() + (parseInt(expiresIn ?? "7200", 10)) * 1000,
          };
          this.oauthManager.setAuth(this.authData);
          await this.savePluginData();
          new Notice("飞书登录成功！");

          // Validate and get user info
          try {
            await this.oauthManager.validateToken();
            this.authData = this.oauthManager.getAuth();
            await this.savePluginData();
          } catch {
            // Non-critical
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          new Notice(`OAuth 回调处理失败: ${msg}`);
        }
      },
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
      auth: this.authData,
    });
  }

  /**
   * Get the OAuth manager (used by SyncEngine to create FeishuClient)
   */
  getOAuthManager(): OAuthManager {
    return this.oauthManager;
  }

  /**
   * Login with OAuth flow using URI handler
   */
  async loginWithOAuth(): Promise<void> {
    // Update auth server URL in case it changed
    this.oauthManager = new OAuthManager(
      this.settings.authServerUrl,
      (auth) => { this.authData = auth; },
    );

    const redirectUri = encodeURIComponent("obsidian://feishu-oauth");
    const authUrl = `${this.settings.authServerUrl}/oauth/authorize?redirect_uri=${redirectUri}`;

    // Open browser for OAuth
    window.open(authUrl);

    // The callback will be handled by registerUriHandler above
    // Wait a bit and check if auth was set (simple polling approach)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("登录超时，请重试"));
      }, 5 * 60 * 1000);

      const check = setInterval(() => {
        if (this.authData?.accessToken) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        }
      }, 500);
    });
  }

  /**
   * Logout
   */
  logout(): void {
    this.authData = null;
    this.oauthManager.setAuth(null);
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
      failedFiles: [...(data?.mappings?.failedFiles ?? [])],
      fileMtimes: { ...(data?.mappings?.fileMtimes ?? {}) },
    };
    this.authData = data?.auth ?? null;
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
