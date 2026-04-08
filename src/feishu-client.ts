import { requestUrl } from "obsidian";

const BASE_URL = "https://open.feishu.cn/open-apis";
const WRITE_BATCH_SIZE = 20;

export interface FeishuClientConfig {
  // OAuth mode
  getAccessToken?: () => Promise<string>;
  onTokenRefresh?: (accessToken: string, refreshToken: string, expiresAt: number) => void;

  // Legacy mode
  appId?: string;
  appSecret?: string;

  // Shared
  targetFolderToken: string;
  ownerOpenId?: string;
}

export interface DriveEntry {
  name?: string;
  token?: string;
  type?: string;
}

export class FeishuApiError extends Error {
  constructor(message: string, readonly payload?: unknown) {
    super(message);
    this.name = "FeishuApiError";
  }
}

export class FeishuClient {
  private tenantAccessToken: string | null = null;
  private tokenExpireAt = 0;
  private readonly isOAuthMode: boolean;

  constructor(private readonly config: FeishuClientConfig) {
    this.isOAuthMode = !!config.getAccessToken;
  }

  validateConfig(): void {
    if (!this.config.targetFolderToken) {
      throw new FeishuApiError("Missing Target Folder Token in plugin settings.");
    }
    if (!this.isOAuthMode && (!this.config.appId || !this.config.appSecret)) {
      throw new FeishuApiError("Missing App ID or App Secret. Please log in or configure a custom app.");
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.isOAuthMode && this.config.getAccessToken) {
      return this.config.getAccessToken();
    }
    // Legacy mode: get tenant_access_token
    return this.getTenantAccessToken();
  }

  async getTenantAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tenantAccessToken && now < this.tokenExpireAt - 60_000) {
      return this.tenantAccessToken;
    }

    const data = await this.request<{ tenant_access_token: string; expire: number }>(
      "POST",
      "/auth/v3/tenant_access_token/internal",
      {
        auth: false,
        body: {
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        },
      },
    );

    if (!data.tenant_access_token) {
      throw new FeishuApiError("Failed to obtain tenant_access_token.", data);
    }

    this.tenantAccessToken = data.tenant_access_token;
    this.tokenExpireAt = now + ((data.expire || 7200) * 1000);
    return this.tenantAccessToken;
  }

  async createDocument(title: string, folderToken: string): Promise<string> {
    const data = await this.request<{ document?: { document_id?: string }; document_id?: string }>(
      "POST",
      "/docx/v1/documents",
      { body: { title, folder_token: folderToken } },
    );
    const documentId = data.document?.document_id ?? data.document_id;
    if (!documentId) {
      throw new FeishuApiError("Document creation succeeded but no document_id was returned.", data);
    }
    return documentId;
  }

  async listBlockChildren(documentId: string, blockId: string): Promise<Array<{ block_id?: string }>> {
    const items: Array<{ block_id?: string }> = [];
    let pageToken: string | undefined;
    while (true) {
      const data = await this.request<{ items?: Array<{ block_id?: string }>; has_more?: boolean; page_token?: string }>(
        "GET",
        `/docx/v1/documents/${documentId}/blocks/${blockId}/children`,
        { query: { page_size: 500, page_token: pageToken } },
      );
      items.push(...(data.items ?? []));
      if (!data.has_more || !data.page_token) break;
      pageToken = data.page_token;
    }
    return items;
  }

  async clearDocument(documentId: string): Promise<void> {
    const children = await this.listBlockChildren(documentId, documentId);
    const count = children.length;
    if (count === 0) return;
    await this.request(
      "DELETE",
      `/docx/v1/documents/${documentId}/blocks/${documentId}/children/batch_delete`,
      { body: { start_index: 0, end_index: count } },
    );
  }

  async appendBlocks(documentId: string, parentBlockId: string, children: unknown[]): Promise<string[]> {
    const blockIds: string[] = [];
    for (let index = 0; index < children.length; index += WRITE_BATCH_SIZE) {
      const chunk = children.slice(index, index + WRITE_BATCH_SIZE);
      const data = await this.request<{ children?: Array<{ block_id?: string }>; items?: Array<{ block_id?: string }> }>(
        "POST",
        `/docx/v1/documents/${documentId}/blocks/${parentBlockId}/children`,
        { body: { index: -1, children: chunk } },
      );

      const created = data.children ?? data.items ?? [];
      if (created.length === chunk.length) {
        blockIds.push(...created.map((item) => item.block_id).filter((item): item is string => Boolean(item)));
      } else {
        const latest = await this.listBlockChildren(documentId, parentBlockId);
        blockIds.push(...latest.slice(-chunk.length).map((item) => item.block_id).filter((item): item is string => Boolean(item)));
      }
    }
    return blockIds;
  }

  async uploadImage(fileName: string, bytes: ArrayBuffer, parentType = "docx_image"): Promise<string> {
    const boundary = `----ObsidianFeishu${Date.now().toString(16)}`;
    const encoder = new TextEncoder();
    const mime = guessMimeType(fileName);
    const body = joinUint8Arrays([
      encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file_name"\r\n\r\n${fileName}\r\n`),
      encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="parent_type"\r\n\r\n${parentType}\r\n`),
      encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n${bytes.byteLength}\r\n`),
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`,
      ),
      new Uint8Array(bytes),
      encoder.encode(`\r\n--${boundary}--\r\n`),
    ]);

    const data = await this.request<{ file_token?: string; token?: string }>("POST", "/drive/v1/medias/upload_all", {
      contentType: `multipart/form-data; boundary=${boundary}`,
      rawBody: toArrayBuffer(body),
    });
    const token = data.file_token ?? data.token;
    if (!token) {
      throw new FeishuApiError("Image upload succeeded but no file_token was returned.", data);
    }
    return token;
  }

  async transferOwner(documentId: string): Promise<void> {
    if (!this.config.ownerOpenId) return;
    await this.request(
      "POST",
      `/drive/v1/permissions/${documentId}/members/transfer_owner`,
      {
        query: {
          type: "docx",
          need_notification: "true",
          remove_old_owner: "false",
          stay_put: "false",
        },
        body: {
          member_type: "openid",
          member_id: this.config.ownerOpenId,
        },
      },
    );
  }

  async setPermission(documentId: string): Promise<void> {
    await this.request("PATCH", `/drive/v1/permissions/${documentId}/public`, {
      query: { type: "docx" },
      body: {
        external_access: false,
        link_share_entity: "tenant_editable",
        security_entity: "anyone_can_edit",
        comment_entity: "anyone_can_edit",
        share_entity: "same_tenant",
        invite_external: false,
      },
    });
  }

  async deleteDocument(documentId: string): Promise<void> {
    // Move a docx file to trash. type=docx per Feishu Drive API.
    await this.request("DELETE", `/drive/v1/files/${documentId}`, {
      query: { type: "docx" },
    });
  }

  async createFolder(name: string, parentFolderToken: string): Promise<string> {
    const data = await this.request<{ token?: string }>("POST", "/drive/v1/files/create_folder", {
      body: { name, folder_token: parentFolderToken },
    });
    if (!data.token) {
      throw new FeishuApiError("Folder creation succeeded but no token was returned.", data);
    }
    return data.token;
  }

  async listFolderContents(folderToken: string): Promise<DriveEntry[]> {
    const data = await this.request<{ files?: DriveEntry[] }>("GET", "/drive/v1/files", {
      query: { folder_token: folderToken, page_size: 200 },
    });
    return data.files ?? [];
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      auth?: boolean;
      body?: unknown;
      rawBody?: ArrayBuffer;
      query?: Record<string, string | number | boolean | undefined>;
      contentType?: string;
    } = {},
  ): Promise<T> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.doRequestWithTimeout<T>(method, path, options, 15000);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // On 401 in OAuth mode, force-retry once. The getAccessToken callback
        // is responsible for refreshing the token; simply retrying the request
        // will trigger it via doRequest → getAccessToken on the next pass.
        if (this.isOAuthMode && attempt === 0 && lastError.message.includes('401')) {
          console.warn(`[FeishuClient] ${method} ${path} got 401, refreshing token and retrying once`);
          await this.sleep(200);
          continue;
        }

        // Check if retryable
        if (attempt < maxRetries && this.isRetryable(lastError, attempt)) {
          const delay = Math.min(500 * Math.pow(2, attempt), 4000);
          console.warn(`[FeishuClient] ${method} ${path} failed (attempt ${attempt + 1}), retrying in ${delay}ms: ${lastError.message}`);
          await this.sleep(delay);
          continue;
        }
        
        break;
      }
    }

    throw lastError ?? new Error(`Request failed after ${maxRetries + 1} attempts`);
  }

  private isRetryable(error: Error, attempt: number): boolean {
    const msg = error.message.toLowerCase();
    if (msg.includes('429') || msg.includes('99991664') || msg.includes('rate limit')) return true;
    if (msg.includes('500') || msg.includes('502') || msg.includes('503')) return true;
    if (msg.includes('timeout') || msg.includes('net') || msg.includes('econnrefused')) return true;
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async doRequestWithTimeout<T>(method: string, path: string, options: any, timeoutMs = 15000): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[FeishuClient] ${method} ${path} timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    const requestPromise = this.doRequest<T>(method, path, options);
    return Promise.race([requestPromise, timeoutPromise]) as Promise<T>;
  }

  private async doRequest<T>(
    method: string,
    path: string,
    options: {
      auth?: boolean;
      body?: unknown;
      rawBody?: ArrayBuffer;
      query?: Record<string, string | number | boolean | undefined>;
      contentType?: string;
    },
  ): Promise<T> {
    const headers: Record<string, string> = {};
    const url = new URL(`${BASE_URL}${path}`);

    Object.entries(options.query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });

    if (options.auth !== false) {
      headers.Authorization = `Bearer ${await this.getAccessToken()}`;
    }

    let body: string | ArrayBuffer | undefined;
    if (options.rawBody) {
      if (options.contentType) {
        headers["Content-Type"] = options.contentType;
      }
      body = options.rawBody;
    } else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      body = JSON.stringify(options.body);
    }

    const response = await requestUrl({
      url: url.toString(),
      method,
      headers,
      body,
      throw: false,
    });

    let json: any = {};
    const text = response.text ?? "";
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new FeishuApiError(`Feishu returned non-JSON response for ${method} ${path}.`, text);
      }
    }

    if (response.status >= 400) {
      throw new FeishuApiError(`HTTP ${response.status} on ${method} ${path}.`, json);
    }
    if (json && typeof json === "object" && "code" in json && json.code !== 0) {
      throw new FeishuApiError(`Feishu API error on ${method} ${path}: ${json.msg ?? json.code}`, json);
    }

    return (json?.data ?? json) as T;
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const exact = new Uint8Array(bytes.byteLength);
  exact.set(bytes);
  return exact.buffer as ArrayBuffer;
}

function joinUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function guessMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
