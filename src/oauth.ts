import { requestUrl } from "obsidian";

export interface AuthData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userName?: string;
  userId?: string;
}

export class OAuthManager {
  private auth: AuthData | null = null;

  constructor(
    private authServerUrl: string,
    private onAuthChange: (auth: AuthData | null) => void,
  ) {}

  getAuth(): AuthData | null {
    return this.auth;
  }

  setAuth(auth: AuthData | null): void {
    this.auth = auth;
    this.onAuthChange(auth);
  }

  isAuthenticated(): boolean {
    return !!this.auth?.accessToken;
  }

  /**
   * Check if token is expired or about to expire (within 5 minutes)
   */
  isTokenExpired(): boolean {
    if (!this.auth) return true;
    return Date.now() > this.auth.expiresAt - 5 * 60 * 1000;
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidToken(): Promise<string> {
    if (!this.auth) throw new Error("Not authenticated. Please log in to Feishu first.");

    if (this.isTokenExpired()) {
      await this.refreshToken();
    }

    return this.auth.accessToken;
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshToken(): Promise<void> {
    if (!this.auth?.refreshToken) {
      throw new Error("No refresh token available. Please log in again.");
    }

    const response = await requestUrl({
      url: `${this.authServerUrl}/oauth/refresh`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: this.auth.refreshToken }),
      throw: false,
    });

    if (response.status !== 200) {
      // Refresh failed, clear auth
      this.setAuth(null);
      throw new Error("Token refresh failed. Please log in again.");
    }

    const data = response.json;
    this.auth = {
      ...this.auth,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.auth.refreshToken,
      expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
    };
    this.onAuthChange(this.auth);
  }

  /**
   * Validate current token by calling user info API
   */
  async validateToken(): Promise<{ valid: boolean; userName?: string; userId?: string }> {
    if (!this.auth?.accessToken) return { valid: false };

    try {
      const response = await requestUrl({
        url: "https://open.feishu.cn/open-apis/authen/v1/user_info",
        method: "GET",
        headers: { Authorization: `Bearer ${this.auth.accessToken}` },
        throw: false,
      });

      if (response.status !== 200) return { valid: false };

      const data = response.json;
      if (data?.code !== 0) return { valid: false };

      const userInfo = data.data;
      this.auth.userName = userInfo?.name;
      this.auth.userId = userInfo?.open_id;
      this.onAuthChange(this.auth);

      return { valid: true, userName: userInfo?.name, userId: userInfo?.open_id };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Start OAuth flow using a local HTTP server
   * Returns a Promise that resolves with auth data on success
   */
  async startOAuthFlow(): Promise<AuthData> {
    const { port, server, tokenPromise } = await this.startLocalServer();

    const redirectUri = encodeURIComponent(`http://localhost:${port}/callback`);
    const authUrl = `${this.authServerUrl}/oauth/authorize?redirect_uri=${redirectUri}`;

    // Open browser
    window.open(authUrl);

    try {
      const authData = await tokenPromise;
      this.setAuth(authData);
      return authData;
    } finally {
      // Close server after a short delay to ensure response is sent
      setTimeout(() => {
        server.close();
      }, 1000);
    }
  }

  /**
   * Start OAuth flow using Obsidian's URI handler (fallback)
   */
  async startOAuthFlowWithUri(plugin: { registerUriHandler: (handler: { handleURI(uri: string): void }) => void }): Promise<AuthData> {
    const redirectUri = encodeURIComponent(`obsidian://feishu-oauth`);
    const authUrl = `${this.authServerUrl}/oauth/authorize?redirect_uri=${redirectUri}`;

    return new Promise<AuthData>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("OAuth flow timed out after 5 minutes"));
      }, 5 * 60 * 1000);

      plugin.registerUriHandler({
        handleURI(uri: string) {
          clearTimeout(timeout);
          try {
            const url = new URL(uri);
            const params = url.searchParams;
            const accessToken = params.get("access_token");
            const refreshToken = params.get("refresh_token");
            const expiresIn = params.get("expires_in");

            if (!accessToken || !refreshToken) {
              reject(new Error("Invalid OAuth callback: missing tokens"));
              return;
            }

            const authData: AuthData = {
              accessToken,
              refreshToken,
              expiresAt: Date.now() + (parseInt(expiresIn ?? "7200", 10)) * 1000,
            };
            resolve(authData);
          } catch (err) {
            reject(err);
          }
        },
      });

      window.open(authUrl);
    });
  }

  private startLocalServer(): Promise<{
    port: number;
    server: { close(): void };
    tokenPromise: Promise<AuthData>;
  }> {
    return new Promise((resolve, reject) => {
      // We need to use Node.js http module via Obsidian's environment
      // Obsidian runs on Electron which has Node.js available
      // But we can't directly import 'http' in a plugin
      // Instead, we'll use the URI handler approach as primary
      reject(new Error("Local server not available in Obsidian. Use URI handler flow instead."));
    });
  }

  /**
   * Logout: clear auth data
   */
  logout(): void {
    this.setAuth(null);
  }
}
