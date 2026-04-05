import { App, Modal, Setting } from "obsidian";

export interface SyncProgress {
  current: number;
  total: number;
  currentFile: string;
  success: number;
  failed: number;
}

export class SyncProgressModal extends Modal {
  private progressEl: HTMLElement;
  private barEl: HTMLElement;
  private statusEl: HTMLElement;
  private fileEl: HTMLElement;
  private counterEl: HTMLElement;
  private cancelBtn: HTMLButtonElement;
  private onCancel: (() => void) | null = null;
  private resolved = false;

  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("feishu-sync-progress-modal");

    contentEl.createEl("h2", { text: "飞书同步中...", cls: "progress-modal-title" });

    this.progressEl = contentEl.createDiv({ cls: "progress-modal-progress" });
    this.barEl = this.progressEl.createDiv({ cls: "progress-modal-bar" });
    this.barEl.setAttribute("style", "width: 0%");

    this.statusEl = contentEl.createDiv({ cls: "progress-modal-status", text: "准备中..." });
    this.fileEl = contentEl.createDiv({ cls: "progress-modal-file", text: "" });
    this.counterEl = contentEl.createDiv({ cls: "progress-modal-counter", text: "已同步: 0  成功: 0  失败: 0" });

    this.cancelBtn = contentEl.createEl("button", {
      text: "取消",
      cls: "progress-modal-cancel",
    });
    this.cancelBtn.addEventListener("click", () => {
      if (this.onCancel) this.onCancel();
      this.close();
    });
  }

  update(progress: SyncProgress): void {
    if (this.resolved) return;
    const pct = Math.round((progress.current / progress.total) * 100);
    this.barEl.setAttribute("style", `width: ${pct}%`);
    this.statusEl.setText(`${progress.current} / ${progress.total} (${pct}%)`);
    this.fileEl.setText(progress.currentFile);
    this.counterEl.setText(
      `已同步: ${progress.current}  成功: ${progress.success}  失败: ${progress.failed}`
    );
  }

  setCancelHandler(fn: () => void): void {
    this.onCancel = fn;
  }

  showResult(success: number, failed: number): void {
    this.resolved = true;
    const title = this.contentEl.querySelector(".progress-modal-title");
    if (title instanceof HTMLElement) {
      title.setText(failed > 0 ? "同步完成 ⚠️" : "同步完成 ✅");
    }
    this.barEl.setAttribute("style", "width: 100%");
    this.statusEl.setText("完成");
    this.fileEl.setText("");
    this.counterEl.setText(
      `总计: ${success + failed}  成功: ${success}  失败: ${failed}`
    );
    this.cancelBtn.setText("关闭");
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
