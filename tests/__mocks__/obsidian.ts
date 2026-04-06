// Mock for Obsidian API
// Minimal implementation to allow unit testing of plugin code

export class Notice {
  constructor(message: string, timeout?: number) {
    console.log(`[Notice] ${message}`);
  }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

export class TFile {
  path: string;
  name: string;
  basename: string;
  
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || path;
    const dotIndex = this.name.lastIndexOf('.');
    this.basename = dotIndex > 0 ? this.name.slice(0, dotIndex) : this.name;
  }
}

export class TFolder {
  name: string;
  path: string;
  
  constructor(name: string) {
    this.name = name;
    this.path = '/' + name;
  }
}

export interface TAbstractFile {
  path: string;
  name: string;
}

export interface Vault {
  getMarkdownFiles(): TFile[];
  getAbstractFileByPath(path: string): TFile | TFolder | null;
  cachedRead(file: TFile): Promise<string>;
  readBinary(file: TFile): Promise<Uint8Array>;
  create(path: string, content: string): Promise<TFile>;
  createFolder(path: string): Promise<TFolder>;
}

export interface MetadataCache {
  getFileCache(file: TFile): any;
}

export interface FileManager {
  processFrontMatter(file: TFile, fn: (fm: any) => void): Promise<void>;
}

export interface Workspace {
  getActiveFile(): TFile | null;
}

export interface App {
  vault: Vault;
  metadataCache: MetadataCache;
  workspace: Workspace;
  fileManager: FileManager;
}

export interface Plugin {
  app: App;
  settings: any;
  saveData(data: any): Promise<void>;
  loadData(): Promise<any>;
}

export interface PluginSettingTab {
  constructor(app: App, plugin: Plugin): void;
  display(): void;
  addSetting(setting: any): void;
}

export interface Modal {
  open(): void;
  close(): void;
}

export interface Setting {
  constructor(containerEl: HTMLElement): void;
  setName(name: string): Setting;
  setDesc(desc: string | HTMLElement): Setting;
  addText(fn: (text: TextComponent) => void): Setting;
  addDropdown(fn: (dropdown: any) => void): Setting;
  addButton(fn: (button: any) => void): Setting;
  addToggle(fn: (toggle: any) => void): Setting;
}

export interface TextComponent {
  setValue(value: string): TextComponent;
  getValue(): string;
  setPlaceholder(placeholder: string): TextComponent;
  inputEl: HTMLInputElement;
}

export function requestUrl(options: any): Promise<any> {
  return Promise.resolve({
    status: 200,
    text: () => JSON.stringify({ code: 0, data: {} }),
  });
}

// Mock implementations for testing
export class MockVault implements Vault {
  files: Map<string, TFile> = new Map();
  folders: Map<string, TFolder> = new Map();
  
  getMarkdownFiles(): TFile[] {
    return Array.from(this.files.values());
  }
  
  getAbstractFileByPath(path: string): TFile | TFolder | null {
    return this.files.get(path) || this.folders.get(path) || null;
  }
  
  async cachedRead(file: TFile): Promise<string> {
    return this.files.get(file.path)?.name || '';
  }
  
  async readBinary(file: TFile): Promise<Uint8Array> {
    return new Uint8Array(0);
  }
  
  async create(path: string, content: string): Promise<TFile> {
    const file = new TFile(path);
    this.files.set(path, file);
    return file;
  }
  
  async createFolder(path: string): Promise<TFolder> {
    const folder = new TFolder(path);
    this.folders.set(path, folder);
    return folder;
  }
}

export class MockApp implements App {
  vault: Vault = new MockVault();
  metadataCache: MetadataCache = {
    getFileCache: () => ({ frontmatter: {} }),
  };
  workspace: Workspace = {
    getActiveFile: () => null,
  };
  fileManager: FileManager = {
    processFrontMatter: async (file: TFile, fn: (fm: any) => void) => {
      fn({});
    },
  };
}
