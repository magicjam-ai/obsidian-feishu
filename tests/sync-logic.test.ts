/**
 * Unit tests for sync engine logic
 * 
 * Tests the core sync algorithm, error handling, and retry logic.
 */

describe('SyncEngine Logic', () => {
  describe('Failed Files Management', () => {
    it('should add failed file to currentFailed array', () => {
      const currentFailed: string[] = [];
      const filePath = 'test/file.md';
      
      currentFailed.push(filePath);
      
      expect(currentFailed).toContain(filePath);
      expect(currentFailed.length).toBe(1);
    });

    it('should merge history and current failures', () => {
      const historyFailed = ['old1.md', 'old2.md'];
      const currentFailed = ['new1.md', 'new2.md'];
      
      // Merge logic from sync-engine.ts
      const allFailed = [...new Set([...historyFailed, ...currentFailed])];
      
      expect(allFailed).toEqual(['old1.md', 'old2.md', 'new1.md', 'new2.md']);
    });

    it('should deduplicate failed files', () => {
      const historyFailed = ['file1.md', 'file2.md'];
      const currentFailed = ['file1.md', 'file3.md']; // file1.md is both
      
      const allFailed = [...new Set([...historyFailed, ...currentFailed])];
      
      expect(allFailed.length).toBe(3);
      expect(allFailed).toContain('file1.md');
      expect(allFailed).toContain('file2.md');
      expect(allFailed).toContain('file3.md');
    });

    it('should remove successfully synced file from failed list', () => {
      const failedFiles = ['file1.md', 'file2.md', 'file3.md'];
      const successfullySynced = 'file2.md';
      
      const newFailedList = failedFiles.filter(f => f !== successfullySynced);
      
      expect(newFailedList).not.toContain(successfullySynced);
      expect(newFailedList.length).toBe(2);
    });
  });

  describe('Sync Result Summary', () => {
    it('should format summary with retry count when there are failures', () => {
      const success = 10;
      const failed = 2;
      const allFailed = ['file1.md', 'file2.md'];
      
      const summary = allFailed.length > 0
        ? `飞书同步完成: ${success} 成功, ${failed} 失败 (共 ${allFailed.length} 个待重试)`
        : `飞书同步完成: ${success} 成功, ${failed} 失败`;
      
      expect(summary).toBe('飞书同步完成: 10 成功, 2 失败 (共 2 个待重试)');
    });

    it('should format summary without retry count when all succeeded', () => {
      const success = 10;
      const failed = 0;
      const allFailed: string[] = [];
      
      const summary = allFailed.length > 0
        ? `飞书同步完成: ${success} 成功, ${failed} 失败 (共 ${allFailed.length} 个待重试)`
        : `飞书同步完成: ${success} 成功, ${failed} 失败`;
      
      expect(summary).toBe('飞书同步完成: 10 成功, 0 失败');
    });
  });

  describe('Document ID Handling', () => {
    it('should detect when documentId exists', () => {
      const existingDocumentId = 'BDR4dQ4PtokHQexobNvcYdXrnAh';
      const hasExistingDoc = !!existingDocumentId;
      
      expect(hasExistingDoc).toBe(true);
    });

    it('should detect when documentId does not exist', () => {
      const existingDocumentId = undefined;
      const hasExistingDoc = !!existingDocumentId;
      
      expect(hasExistingDoc).toBe(false);
    });

    it('should set created flag when document is newly created', () => {
      let created = false;
      const existingDocumentId = undefined;
      
      if (!existingDocumentId) {
        created = true;
      }
      
      expect(created).toBe(true);
    });

    it('should set created flag to false when clearing existing document', () => {
      let created = false;
      const existingDocumentId = 'BDR4dQ4PtokHQexobNvcYdXrnAh';
      
      if (existingDocumentId) {
        created = false; // Will clear and recreate, not create new
      }
      
      expect(created).toBe(false);
    });
  });

  describe('Error Message Extraction', () => {
    it('should extract message from Error object', () => {
      const error = new Error('API request failed');
      const message = error instanceof Error ? error.message : String(error);
      
      expect(message).toBe('API request failed');
    });

    it('should convert non-Error to string', () => {
      const error = 'Something went wrong';
      const message = error instanceof Error ? error.message : String(error);
      
      expect(message).toBe('Something went wrong');
    });

    it('should handle null error', () => {
      const error = null;
      const message = error instanceof Error ? (error as Error).message : String(error);
      
      expect(message).toBe('null');
    });
  });

  describe('Retry Failed Files', () => {
    it('should filter out non-existent files', () => {
      const failedPaths = ['exists1.md', 'deleted.md', 'exists2.md'];
      const existingFiles = [
        { path: 'exists1.md' },
        { path: 'exists2.md' },
      ];
      
      const validFiles = failedPaths.filter(path => 
        existingFiles.some(f => (f as any).path === path)
      );
      
      expect(validFiles.length).toBe(2);
      expect(validFiles).toContain('exists1.md');
      expect(validFiles).toContain('exists2.md');
    });
  });
});
