# 打开模式记忆

> [!NOTE] 中文说明
> **打开模式记忆**：按笔记元数据定义打开时用阅读或编辑模式，全局默认可设，性能无感。

在笔记 frontmatter 写 `open-mode`，打开时自动切换阅读或编辑模式；未写的笔记按全局默认。每次打开都按 frontmatter 生效，查看期间手动切换不被打回。

> English description below for review purposes. / 以下为英文说明，用于过审。

Set `open-mode` in frontmatter to control how each note opens (reading or editing); notes without it fall back to a global default. The mode is applied every time the note opens, while manual switching is kept during the current view.

## 功能特性

- **frontmatter 强制模式**：`open-mode` 定义单篇笔记打开用阅读或编辑模式
- **全局默认**：未设置的笔记按全局默认打开（默认阅读，可改编辑/跟随原生）
- **兼容老插件**：识别 Force note view mode 的 `obsidianUIMode` 键，旧笔记零改动迁移
- **不打扰**：查看期间手动切换保持不打回；导航、后退或重新打开时按 frontmatter 重新生效
- **性能无感**：事件注册延后到布局就绪，metadataCache O(1) 读取，模式相同则零操作
- **多端支持**：桌面与移动端可用，不修改任何笔记数据

### Features

- **Per-note open mode**: `open-mode` frontmatter forces reading or editing view for that note
- **Global default**: notes without `open-mode` follow the global default (reading by default; editing / follow also available)
- **Legacy-friendly**: recognizes the `obsidianUIMode` key from Force note view mode, so existing notes migrate with zero changes
- **Non-intrusive**: manual switching is kept during the current view; navigating away and reopening reapplies the frontmatter mode
- **Zero-perception performance**: event registration deferred to layout-ready, O(1) metadata reads, no-op when already in target mode
- **Multi-platform**: desktop and mobile, never modifies note data

## 安装

### 方式一：从 Obsidian 社区目录安装（推荐）

1. 打开 Obsidian 设置 → 社区插件
2. 点击「浏览」，搜索 "XU View Mode"
3. 点击「安装」，然后「启用」

### 方式二：手动安装

1. 从 [最新 Release](https://github.com/xcloud-ai/xu-view-mode/releases) 下载 `main.js`、`manifest.json`、`styles.css` 三个文件
2. 在 vault 中创建目录 `.obsidian/plugins/xu-view-mode/`
3. 将三个文件放入该目录
4. 打开 Obsidian 设置 → 社区插件，找到 XU View Mode 并开启

### Installation

**From Obsidian Community Directory:**
1. Open Obsidian Settings → Community Plugins
2. Click "Browse" and search for "XU View Mode"
3. Click "Install", then "Enable"

**Manual Installation:**
1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/xcloud-ai/xu-view-mode/releases)
2. Put them in `<vault>/.obsidian/plugins/xu-view-mode/`
3. Enable in Settings → Community Plugins

## 使用方法

### 什么是 frontmatter？

就是笔记**最顶部**两条 `---` 之间的那块区域。没有的话，在笔记第一行上方手写两条 `---` 即可。

### 第一步：给笔记加上 open-mode

在笔记最顶部写：

```yaml
---
open-mode: edit
---
```

保存后，重新打开这个笔记 → 自动进入**编辑模式**。把 `edit` 改成其他支持的模式，即可改变这篇笔记的打开方式：

### 支持的模式

| 值 | 打开效果 | 适合场景 |
|---|---|---|
| `edit` | 编辑模式 | 日记、草稿、打开就写 |
| `reading` | 阅读模式 | 文档、成品笔记、只看不改 |

### 兼容写法（不用记，知道有就行）

其他插件的常见写法在这里同样有效，大小写均可；写错了等同于没写，按全局默认打开：

| 你写的 | 等同于 |
|---|---|
| `read` / `preview` | `reading` |
| `editing` / `source` / `live` | `edit` |

推荐统一用 `edit` / `reading`，最短最直观。

> [!NOTE] 从 Force note view mode 迁移
> 同时兼容老牌插件 **Force note view mode** 的 `obsidianUIMode` 键（取值 `preview` / `source` / `live`）。原来笔记里写的 `obsidianUIMode` 无需批量修改即可直接生效；若与 `open-mode` 同时存在，以 `open-mode` 为准。

### 第二步（可选）：设置全局默认

设置 → 第三方插件 → XU View Mode → 默认打开模式：

- **阅读模式**（默认）：所有没写 `open-mode` 的笔记都用阅读模式打开
- **编辑模式**：所有没写 `open-mode` 的笔记都用编辑模式打开
- **跟随 Obsidian 原生设置**：不干预没有 `open-mode` 的笔记，行为和没装插件一样

单个笔记的 `open-mode` 永远优先于全局默认。

### 行为说明（怎么算"不打扰"）

- **查看期间不打回**：打开笔记后，你手动点右上角的「阅读/编辑」切换按钮，插件**不会**自动改回
- **重新打开重新生效**：导航到别的笔记、点后退/前进、新标签页或重启后再打开这篇笔记 → 按 frontmatter 重新应用
- **只读不写**：插件只读 frontmatter，永不修改你的笔记内容

### Usage

Add the following to a note's frontmatter to control how it opens:

```yaml
---
open-mode: edit
---
```

| Value | Opens in |
|---|---|
| `edit` | Editing view (live preview) |
| `reading` | Reading view |

Aliases also accepted (case-insensitive): `editing` / `source` / `live` (edit), `read` / `preview` (reading). Invalid values are ignored and fall back to the global default.

> **Migrating from Force note view mode?** The legacy `obsidianUIMode` key (`preview` / `source` / `live`) is also recognized, so your existing notes work without any changes. If both keys are present in a note, `open-mode` takes precedence.

Global default (Settings -> XU View Mode): Follow Obsidian default / Reading / Editing. Per-note frontmatter always wins. The mode is applied each time the note opens; manual switching is kept while staying on the note.

## 设置说明

| 设置项 | 说明 |
|--------|------|
| 界面语言 | 中文 / English 切换 |
| 默认打开模式 | 阅读模式（默认）/ 编辑模式 / 跟随 Obsidian 原生设置，仅对未写 open-mode 的笔记生效 |

## 技术说明

- frontmatter 键 `open-mode` 只读不写；不修改用户数据
- `edit` 切换到 live preview 形态；`reading` 切换到阅读视图
- 优先级：`open-mode` > `obsidianUIMode`（兼容老插件）> 全局默认 > Obsidian 原生设置

## 致谢 / Credits

- 功能定位参考了 [Current View](https://github.com/luceast/obsidian-current-view) 与 [Default View Mode](https://github.com/sunzyyu/obsidian-default-view)（仅借鉴思路，未复制代码）

## 许可证

MIT License - Copyright (c) 2026 旭说
