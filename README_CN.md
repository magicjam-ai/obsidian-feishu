# obsidian-feishu

一键将 Obsidian 笔记同步到飞书文档。

## 功能特性

- 支持通过 Ribbon 图标同步当前笔记
- 支持同步当前文件夹或多个配置文件夹
- 支持将 Obsidian 文件夹结构镜像到飞书云盘
- 维护本地映射，重复同步时更新已有文档
- 将常见 Markdown 块转换为飞书 Docx Block
- 支持 `![[image.png]]` 和 `![](path)` 图片上传
- 表格以 Markdown 代码块方式保真展示
- 文档创建后可尽力执行转移所有权和权限设置

## 截图

- TODO：设置面板截图
- TODO：同步命令截图
- TODO：飞书文档效果截图

## 安装方法

手动安装：

```bash
cd /Users/robert/Projects/obsidian-feishu
npm install
npm run build
mkdir -p /path/to/your/vault/.obsidian/plugins/obsidian-feishu
cp main.js manifest.json /path/to/your/vault/.obsidian/plugins/obsidian-feishu/
```

然后在 Obsidian 社区插件中启用 **Feishu Sync**。

## 配置说明

打开 **设置 → 社区插件 → Feishu Sync**，填写：

- **App ID**：飞书内部应用的 App ID
- **App Secret**：飞书内部应用的 App Secret
- **Target Folder Token**：同步文档落到的飞书云盘文件夹 token
- **Owner Open ID**：可选，创建文档后转移所有权的目标 open_id
- **Sync Folders**：逗号分隔的 vault 文件夹列表；留空表示整个 vault
- **Mirror Folder Structure**：是否在飞书中保持同样的目录结构

### 如何获取 App ID / App Secret

1. 打开飞书开放平台开发者后台。
2. 创建或选择一个内部应用。
3. 在应用凭据页面复制 **App ID** 和 **App Secret**。
4. 确保应用已开通文档创建、写入、媒体上传、权限管理等相关权限。

### 如何获取 Folder Token

打开飞书云盘中的目标文件夹，从 URL 中复制文件夹 token。

## 使用方法

命令面板提供以下命令：

- `Feishu: Sync current file`
- `Feishu: Sync all configured folders`
- `Feishu: Sync current folder`

插件还会添加一个 `upload-cloud` Ribbon 图标，用于同步当前打开的文件。

## Markdown 支持

按原 Python 脚本逻辑迁移了以下映射：

- `#`、`##`、`###` 标题 → 飞书标题块
- 正文段落 → 文本块
- `- item` → 无序列表块
- `1. item` → 有序列表块
- 围栏代码块 → 飞书代码块，语言使用数字枚举
- `> quote` → 以 `▎` 前缀渲染为普通段落
- `---` → 分割线块
- 表格 → Markdown 代码块
- 仅保留 HTTP/HTTPS 链接，锚点链接会被过滤掉

## 已知限制

- 仅支持桌面版 Obsidian。
- 当前图片块仅处理“单独占一行”的图片语法，这和原脚本行为保持一致。
- 嵌套列表会扁平化为普通列表块。
- 转移所有权和权限设置属于 best-effort，具体是否成功取决于租户权限。
- 已同步文档会先清空再重写，不做细粒度 diff。

## 开发

```bash
npm install
npm run build
```

## License

MIT
