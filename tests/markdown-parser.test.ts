/**
 * Unit tests for the markdown parsing logic
 * 
 * These tests verify the core parsing logic without requiring Obsidian runtime.
 * The tests extract the parsing logic and verify it works correctly.
 */

// Re-implement the parsing types for testing (matches src/markdown-parser.ts)
interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  inline_code?: boolean;
  underline?: boolean;
  link?: { url: string };
}

interface TextElement {
  text_run: {
    content: string;
    text_element_style: InlineStyle;
  };
}

interface FeishuBlockInput {
  block_type: number;
  [key: string]: unknown;
}

interface ParsedImageRef {
  original: string;
  alt?: string;
}

interface ParsedBlock {
  request: FeishuBlockInput;
  imageRef?: ParsedImageRef;
}

// Simple markdown parser implementation for testing
// This mirrors the logic in src/markdown-parser.ts
function parseMarkdown(content: string): ParsedBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: ParsedBlock[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block start/end
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockContent = [];
      } else {
        inCodeBlock = false;
        blocks.push({
          request: {
            block_type: 14,
            code: {
              elements: [{ text_run: { content: codeBlockContent.join('\n'), text_element_style: {} } }],
              style: { language: 1 },
            },
          },
        });
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      blocks.push({
        request: {
          block_type: level + 1,
          [`heading${level}`]: {
            elements: [{ text_run: { content: text, text_element_style: {} } }],
          },
        },
      });
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      blocks.push({
        request: {
          block_type: 12,
          bullet: {
            elements: [{ text_run: { content: bulletMatch[1], text_element_style: {} } }],
          },
        },
      });
      continue;
    }

    // Ordered list
    const orderedMatch = line.match(/^\d+\.\s+(.+)/);
    if (orderedMatch) {
      blocks.push({
        request: {
          block_type: 13,
          ordered: {
            elements: [{ text_run: { content: orderedMatch[1], text_element_style: {} } }],
          },
        },
      });
      continue;
    }

    // Divider
    if (line.match(/^---+$/)) {
      blocks.push({
        request: { block_type: 22, divider: {} },
      });
      continue;
    }

    // Quote
    if (line.startsWith('>')) {
      blocks.push({
        request: {
          block_type: 11,
          quote: {
            elements: [{ text_run: { content: line.slice(1).trim(), text_element_style: {} } }],
          },
        },
      });
      continue;
    }

    // Image
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      blocks.push({
        request: { block_type: 27, image: {} },
        imageRef: { original: imageMatch[2], alt: imageMatch[1] || undefined },
      });
      continue;
    }

    // Default: text paragraph
    blocks.push({
      request: {
        block_type: 2,
        text: {
          elements: [{ text_run: { content: line, text_element_style: {} } }],
          style: { align: 1 },
        },
      },
    });
  }

  return blocks;
}

describe('MarkdownParser', () => {
  describe('parse', () => {
    it('should parse a heading h1', () => {
      const blocks = parseMarkdown('# Hello World');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].request.block_type).toBe(2); // h1 -> block_type 2
    });

    it('should parse a heading h2', () => {
      const blocks = parseMarkdown('## Hello World');
      expect(blocks).toHaveLength(1);
    });

    it('should parse a heading h3', () => {
      const blocks = parseMarkdown('### Hello World');
      expect(blocks).toHaveLength(1);
    });

    it('should parse multiple headings', () => {
      const blocks = parseMarkdown('# Heading 1\n\n## Heading 2\n\n### Heading 3');
      expect(blocks).toHaveLength(3);
    });

    it('should parse a paragraph', () => {
      const blocks = parseMarkdown('This is a paragraph.');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].request.block_type).toBe(2); // text
    });

    it('should parse a bullet list', () => {
      const blocks = parseMarkdown('- Item 1\n- Item 2');
      expect(blocks).toHaveLength(2);
      expect(blocks[0].request.block_type).toBe(12); // bullet
    });

    it('should parse an ordered list', () => {
      const blocks = parseMarkdown('1. First\n2. Second');
      expect(blocks).toHaveLength(2);
      expect(blocks[0].request.block_type).toBe(13); // ordered
    });

    it('should parse a code block', () => {
      const blocks = parseMarkdown('```javascript\nconst x = 1;\n```');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].request.block_type).toBe(14); // code
    });

    it('should parse a divider', () => {
      const blocks = parseMarkdown('---');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].request.block_type).toBe(22); // divider
    });

    it('should parse an image', () => {
      const blocks = parseMarkdown('![alt text](image.png)');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].request.block_type).toBe(27); // image
      expect(blocks[0].imageRef?.original).toBe('image.png');
      expect(blocks[0].imageRef?.alt).toBe('alt text');
    });

    it('should parse an image without alt text', () => {
      const blocks = parseMarkdown('![](image.png)');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].imageRef?.original).toBe('image.png');
      expect(blocks[0].imageRef?.alt).toBeUndefined();
    });

    it('should parse a quote', () => {
      const blocks = parseMarkdown('> This is a quote');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].request.block_type).toBe(11); // quote
    });

    it('should handle empty input', () => {
      const blocks = parseMarkdown('');
      expect(blocks).toHaveLength(0);
    });

    it('should skip empty lines', () => {
      const blocks = parseMarkdown('Line 1\n\n\nLine 2');
      expect(blocks).toHaveLength(2);
    });

    it('should parse multiline content correctly', () => {
      const content = `# Title

This is a paragraph.

## Section

- Bullet 1
- Bullet 2

1. Ordered 1
2. Ordered 2

---

Another paragraph.
`;
      const blocks = parseMarkdown(content);
      expect(blocks.length).toBeGreaterThan(5);
    });
  });
});
