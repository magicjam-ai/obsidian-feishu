import { TFile, type Vault } from "obsidian";

export interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  inline_code?: boolean;
  underline?: boolean;
  link?: { url: string };
}

export interface TextElement {
  text_run: {
    content: string;
    text_element_style: InlineStyle;
  };
}

export interface FeishuBlockInput {
  block_type: number;
  [key: string]: unknown;
}

export interface ParsedImageRef {
  original: string;
  alt?: string;
}

export interface ParsedBlock {
  request: FeishuBlockInput;
  imageRef?: ParsedImageRef;
}

const WIKI_IMAGE_RE = /^!\[\[([^\]]+)\]\]$/;
const STD_IMAGE_ONLY_RE = /^!\[(.*?)\]\(([^)]+)\)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d+)\.\s+(.*)$/;
const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/;
const HR_RE = /^\s*([-*_]\s*){3,}$/;
const TABLE_SEPARATOR_RE = /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?$/;
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/y;

const LANGUAGE_MAP: Record<string, number> = {
  plaintext: 1,
  bash: 7,
  shell: 7,
  sh: 7,
  zsh: 7,
  c: 10,
  cpp: 9,
  "c++": 9,
  csharp: 8,
  "c#": 8,
  css: 12,
  dart: 15,
  dockerfile: 18,
  go: 22,
  golang: 22,
  html: 24,
  http: 26,
  java: 29,
  javascript: 30,
  js: 30,
  json: 28,
  kotlin: 32,
  lua: 36,
  markdown: 39,
  nginx: 40,
  php: 43,
  python: 49,
  py: 49,
  r: 50,
  ruby: 52,
  rust: 53,
  scala: 58,
  sql: 59,
  swift: 60,
  typescript: 62,
  ts: 62,
  xml: 65,
  yaml: 66,
  yml: 66,
  diff: 69,
};

export class MarkdownParser {
  parse(markdown: string): ParsedBlock[] {
    const lines = markdown.split(/\r?\n/);
    const blocks: ParsedBlock[] = [];
    let paragraph: string[] = [];
    let quoteLines: string[] = [];
    let codeLines: string[] = [];
    let codeLanguage = "";
    let tableLines: string[] = [];
    let inCode = false;

    const flushParagraph = () => {
      if (paragraph.length === 0) return;
      const content = paragraph.map((line) => line.trim()).join(" ").trim();
      paragraph = [];
      if (content) blocks.push({ request: makeTextBlock(content) });
    };

    const flushQuote = () => {
      if (quoteLines.length === 0) return;
      const content = quoteLines.join("\n").trim();
      quoteLines = [];
      if (!content) return;
      for (const line of content.split("\n")) {
        const text = line.trim();
        if (text) blocks.push({ request: makeTextBlock(`▎${text}`) });
      }
    };

    const flushCode = () => {
      if (codeLines.length === 0) return;
      blocks.push({ request: makeCodeBlock(codeLines.join("\n"), codeLanguage) });
      codeLines = [];
      codeLanguage = "";
    };

    const flushTable = () => {
      if (tableLines.length === 0) return;
      blocks.push({ request: makeCodeBlock(tableLines.join("\n"), "markdown") });
      tableLines = [];
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      const trimmed = line.trim();

      if (inCode) {
        if (trimmed.startsWith("```")) {
          flushCode();
          inCode = false;
        } else {
          codeLines.push(line);
        }
        continue;
      }

      if (trimmed.startsWith("```")) {
        flushParagraph();
        flushQuote();
        flushTable();
        inCode = true;
        codeLanguage = trimmed.slice(3).trim();
        codeLines = [];
        continue;
      }

      if (this.looksLikeTable(lines, i)) {
        flushParagraph();
        flushQuote();
        while (i < lines.length && this.lineInTable(lines[i])) {
          const tableLine = lines[i];
          if (tableLine !== undefined) {
            tableLines.push(tableLine);
          }
          i += 1;
        }
        i -= 1;
        flushTable();
        continue;
      }

      const wikiImageMatch = trimmed.match(WIKI_IMAGE_RE);
      const stdImageMatch = trimmed.match(STD_IMAGE_ONLY_RE);
      if (wikiImageMatch || stdImageMatch) {
        flushParagraph();
        flushQuote();
        flushTable();
        const original = wikiImageMatch?.[1] ?? stdImageMatch?.[2] ?? "";
        const alt = wikiImageMatch ? undefined : stdImageMatch?.[1] || undefined;
        blocks.push({
          request: makeImageBlock(),
          imageRef: { original, alt },
        });
        continue;
      }

      if (!trimmed) {
        flushParagraph();
        flushQuote();
        flushTable();
        continue;
      }

      if (HR_RE.test(trimmed)) {
        flushParagraph();
        flushQuote();
        flushTable();
        blocks.push({ request: { block_type: 22, divider: {} } });
        continue;
      }

      const heading = line.match(HEADING_RE);
      if (heading) {
        const hashes = heading[1] ?? "###";
        const headingText = heading[2] ?? "";
        flushParagraph();
        flushQuote();
        flushTable();
        blocks.push({ request: makeHeadingBlock(hashes.length, headingText.trim()) });
        continue;
      }

      if (trimmed.startsWith(">")) {
        flushParagraph();
        flushTable();
        quoteLines.push(trimmed.slice(1).trimStart());
        continue;
      }

      const ordered = line.match(ORDERED_RE);
      if (ordered) {
        const orderedText = ordered[3] ?? "";
        flushParagraph();
        flushQuote();
        flushTable();
        blocks.push({ request: makeOrderedListBlock(orderedText.trim()) });
        continue;
      }

      const bullet = line.match(BULLET_RE);
      if (bullet) {
        const bulletText = bullet[2] ?? "";
        flushParagraph();
        flushQuote();
        flushTable();
        blocks.push({ request: makeBulletListBlock(bulletText.trim()) });
        continue;
      }

      paragraph.push(line);
    }

    flushParagraph();
    flushQuote();
    flushTable();
    if (inCode) flushCode();
    return blocks;
  }

  resolveImageFile(vault: Vault, currentFile: TFile, rawRef: string): TFile | null {
    const { ref } = splitImageReference(rawRef);
    const normalizedRef = decodeURIComponent(ref.trim()).replace(/^\.\//, "");
    if (!normalizedRef || /^https?:\/\//.test(normalizedRef)) return null;

    const candidates = new Set<string>();
    if (normalizedRef.startsWith("/")) {
      candidates.add(normalizedRef.slice(1));
    } else {
      const parent = parentPath(currentFile.path);
      if (parent) candidates.add(`${parent}/${normalizedRef}`);
      candidates.add(normalizedRef);
      candidates.add(`附件/${normalizedRef}`);
    }

    for (const candidate of candidates) {
      const file = vault.getAbstractFileByPath(candidate);
      if (file instanceof TFile) {
        return file;
      }
    }

    const basename = normalizedRef.split("/").pop();
    if (!basename) return null;
    for (const file of vault.getFiles()) {
      if (file.name === basename) return file;
    }

    return null;
  }

  private looksLikeTable(lines: string[], index: number): boolean {
    const first = lines[index]?.trim();
    const second = lines[index + 1]?.trim();
    return Boolean(first && second && first.includes("|") && TABLE_SEPARATOR_RE.test(second));
  }

  private lineInTable(line: string | undefined): boolean {
    const text = line?.trim();
    return Boolean(text && text.includes("|"));
  }
}

function splitImageReference(raw: string): { ref: string; alias?: string } {
  const text = raw.trim();
  const pipeIndex = text.indexOf("|");
  if (pipeIndex >= 0) {
    const ref = text.slice(0, pipeIndex).trim();
    const alias = text.slice(pipeIndex + 1).trim();
    return { ref, alias: alias || undefined };
  }
  return { ref: text };
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index) : "";
}

function makeHeadingBlock(level: number, text: string): FeishuBlockInput {
  const levelMap: Record<number, [number, string]> = {
    1: [3, "heading1"],
    2: [4, "heading2"],
    3: [5, "heading3"],
    4: [6, "heading4"],
    5: [7, "heading5"],
    6: [8, "heading6"],
  };
  const [blockType, key] = levelMap[level] ?? [5, "heading3"];
  return { block_type: blockType, [key]: { elements: makeTextElements(text) } };
}

function makeTextBlock(text: string): FeishuBlockInput {
  return { block_type: 2, text: { elements: makeTextElements(text), style: { align: 1 } } };
}

function makeBulletListBlock(text: string): FeishuBlockInput {
  return { block_type: 12, bullet: { elements: makeTextElements(text) } };
}

function makeOrderedListBlock(text: string): FeishuBlockInput {
  return { block_type: 13, ordered: { elements: makeTextElements(text) } };
}

function makeCodeBlock(text: string, language: string): FeishuBlockInput {
  const lang = LANGUAGE_MAP[language.toLowerCase()] ?? 1;
  return {
    block_type: 14,
    code: {
      elements: [
        {
          text_run: {
            content: text,
            text_element_style: { inline_code: true },
          },
        },
      ],
      style: { language: lang },
    },
  };
}

function makeImageBlock(): FeishuBlockInput {
  return { block_type: 27, image: {} };
}

function makeTextElements(text: string): TextElement[] {
  const elements = parseInline(text);
  return elements.length > 0
    ? elements
    : [{ text_run: { content: text || " ", text_element_style: {} } }];
}

function parseInline(text: string, baseStyle: InlineStyle = {}): TextElement[] {
  const result: TextElement[] = [];
  let i = 0;

  const pushChunk = (content: string, style: InlineStyle) => {
    if (!content) return;
    const last = result[result.length - 1];
    const nextStyle = sanitizeStyle(style);
    if (last && JSON.stringify(last.text_run.text_element_style) === JSON.stringify(nextStyle)) {
      last.text_run.content += content;
      return;
    }
    result.push({ text_run: { content, text_element_style: nextStyle } });
  };

  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        result.push(...parseInline(text.slice(i + 2, end), { ...baseStyle, bold: !baseStyle.bold }));
        i = end + 2;
        continue;
      }
    }

    if (text.startsWith("~~", i)) {
      const end = text.indexOf("~~", i + 2);
      if (end !== -1) {
        result.push(...parseInline(text.slice(i + 2, end), { ...baseStyle, strikethrough: !baseStyle.strikethrough }));
        i = end + 2;
        continue;
      }
    }

    if (text.startsWith("`", i)) {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        pushChunk(text.slice(i + 1, end), { ...baseStyle, inline_code: true });
        i = end + 1;
        continue;
      }
    }

    if (text.startsWith("*", i) && !text.startsWith("**", i)) {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        result.push(...parseInline(text.slice(i + 1, end), { ...baseStyle, italic: !baseStyle.italic }));
        i = end + 1;
        continue;
      }
    }

    LINK_RE.lastIndex = i;
    const match = LINK_RE.exec(text);
    if (match && match.index === i) {
      const label = match[1] ?? "";
      const url = match[2] ?? "";
      const linkStyle = /^https?:\/\//.test(url) ? { ...baseStyle, link: { url } } : { ...baseStyle };
      result.push(...parseInline(label, linkStyle));
      i = LINK_RE.lastIndex;
      continue;
    }

    const char = text[i];
    if (char !== undefined) {
      pushChunk(char, baseStyle);
    }
    i += 1;
  }

  return result;
}

function sanitizeStyle(style: InlineStyle): InlineStyle {
  const next: InlineStyle = {
    bold: style.bold ?? false,
    italic: style.italic ?? false,
    strikethrough: style.strikethrough ?? false,
    inline_code: style.inline_code ?? false,
    underline: style.underline ?? false,
  };
  if (style.link?.url && /^https?:\/\//.test(style.link.url)) {
    next.link = { url: style.link.url };
  }
  return next;
}
