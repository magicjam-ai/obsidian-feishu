# obsidian-feishu

Sync Obsidian notes to Feishu/Lark documents with one click.

## Features

- Sync the current note from the ribbon or command palette
- Sync the current folder or multiple configured folders
- Mirror Obsidian folder structure into Feishu Drive folders
- Reuse synced document mappings for idempotent updates
- Convert common Markdown blocks into Feishu Docx blocks
- Upload local images referenced by `![[image.png]]` and `![](path)`
- Preserve Markdown tables as fenced code blocks for fidelity
- Best-effort ownership transfer and permission patching after sync

## Screenshots

- TODO: settings panel screenshot
- TODO: sync command screenshot
- TODO: synced Feishu document screenshot

## Installation

Manual installation:

```bash
cd /Users/robert/Projects/obsidian-feishu
npm install
npm run build
mkdir -p /path/to/your/vault/.obsidian/plugins/obsidian-feishu
cp main.js manifest.json /path/to/your/vault/.obsidian/plugins/obsidian-feishu/
```

Then enable **Feishu Sync** in Obsidian community plugins.

## Configuration

Open **Settings → Community Plugins → Feishu Sync** and fill in:

- **App ID**: your Feishu internal app ID
- **App Secret**: your Feishu internal app secret
- **Target Folder Token**: the Feishu Drive folder token where synced docs should be created
- **Owner Open ID**: optional; ownership transfer target after creating a document
- **Sync Folders**: comma-separated vault folders to include; empty means the whole vault
- **Mirror Folder Structure**: whether to create matching subfolders in Feishu

### How to get App ID / App Secret

1. Open the Feishu/Lark developer console.
2. Create or open an internal app.
3. Copy the app's **App ID** and **App Secret**.
4. Make sure the app has the Docx / Drive permissions required for document creation, writing, media upload, and permissions management.

### How to get the Folder Token

Open the target folder in Feishu Drive and copy the token from the URL.

## Usage

Commands available from the command palette:

- `Feishu: Sync current file`
- `Feishu: Sync all configured folders`
- `Feishu: Sync current folder`

A ribbon icon (`upload-cloud`) is also added for syncing the currently active note.

## Markdown Support

Implemented mappings from the original Python script:

- `#`, `##`, `###` headings → Feishu heading blocks
- Paragraphs → text blocks
- `- item` → bullet list blocks
- `1. item` → ordered list blocks
- Fenced code blocks → Feishu code blocks with numeric language enums
- `> quote` → plain paragraph prefixed with `▎`
- `---` → divider block
- Tables → markdown code blocks
- HTTP/HTTPS links only; anchor links are intentionally dropped

## Known Limitations

- Only desktop Obsidian is supported.
- This plugin currently handles image blocks only when they appear on their own line, matching the original script behavior.
- Nested list structure is flattened into Feishu list blocks.
- Ownership transfer and permission patching are best-effort and may fail depending on tenant permissions.
- Existing docs are cleared and rewritten instead of doing block-level diffs.

## Development

```bash
npm install
npm run build
```

## License

MIT
