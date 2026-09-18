# XU View Mode

> [!NOTE] 中文说明
> **打开模式记忆** — 按笔记元数据定义打开时用阅读或编辑模式，全局默认可设，性能无感

在笔记 frontmatter 写 `open-mode`，打开时自动切换阅读或编辑模式；未写的笔记按全局默认。仅首次打开生效，手动切换不被打回。

> English description below for review purposes. / 以下为英文说明，用于过审。

Set `open-mode` in frontmatter to control how each note opens (reading or editing); notes without it fall back to a global default. Applies on first open only, and manual switching is never overridden.

## Installation / 安装

1. Open Obsidian Settings -> Community Plugins
2. Search "XU View Mode" and install, then enable
3. 打开 Obsidian 设置 -> 第三方插件, 搜索 "XU View Mode" 安装并启用

Manual install / 手动安装:
1. Download `main.js`, `manifest.json`, `styles.css` from the latest release
2. Put them into `<vault>/.obsidian/plugins/xu-view-mode/`

## Usage / 使用方法

### 什么是 frontmatter？

就是笔记**最顶部**两条 `---` 之间的那块区域。没有的话，在笔记第一行上方手写两条 `---` 即可。

### 第一步：给笔记加上 open-mode

```yaml
---
title: 我的笔记
open-mode: reading
---
```

保存后，重新打开这个笔记 → 自动进入**阅读模式**。想打开就是编辑状态，把值换成 `edit` 即可。

### 可选值（只需记两个）

| 值 | 打开效果 | 适合场景 |
|---|---|---|
| `reading` | 阅读模式 | 文档、成品笔记、只看不改 |
| `edit` | 编辑模式 | 日记、草稿、打开就写 |

### 兼容写法（不用记，知道有就行）

其他插件的常见写法在这里同样有效，写错也不怕：

| 你写的 | 等同于 |
|---|---|
| `read` / `preview` | `reading` |
| `editing` / `source` / `live` | `edit` |

推荐统一用 `reading` / `edit`，最短最直观。

### 第二步（可选）：设置全局默认

设置 → 第三方插件 → XU View Mode → 默认打开模式：

- **跟随 Obsidian 原生设置**（默认）：不干预没有 `open-mode` 的笔记，行为和没装插件一样
- **阅读模式**：所有没写 `open-mode` 的笔记都用阅读模式打开
- **编辑模式**：所有没写 `open-mode` 的笔记都用编辑模式打开

单个笔记的 `open-mode` 永远优先于全局默认。

### 行为说明（为什么叫"不打扰"）

- **只在第一次生效**：标签页第一次打开某笔记时应用一次；之后你手动点右上角的「阅读/编辑」切换按钮，插件**不会**自动改回
- 同一标签页切走再切回同一笔记 → 不重复强制（尊重你刚才的手动切换）
- 新标签页（或重启后）再打开同一笔记 → 重新应用
- **只读不写**：插件只读 frontmatter，永不修改你的笔记内容

### Usage (English)

Add `open-mode: reading | edit` to a note's frontmatter to control how it opens.

| Value | Opens in |
|---|---|
| `reading` | Reading view |
| `edit` | Editing view (live preview) |

Aliases also accepted: `read` / `preview` (reading), `editing` / `source` / `live` (editing).

Global default (Settings -> XU View Mode): Follow Obsidian default / Reading / Editing. Per-note frontmatter always wins. Applies on first open only; manual switching is never overridden.

## Features / 功能

- **frontmatter 强制模式**：`open-mode` 定义单篇笔记打开用阅读或编辑模式
- **全局默认**：未设置的笔记按全局默认（阅读/编辑/跟随原生）打开
- **不打扰**：仅首次打开生效，手动切换不被打回（同一标签页不重复强制）
- **性能无感**：事件注册延后到布局就绪，metadataCache O(1) 读取，模式相同则零操作
- **多端支持**：桌面与移动端可用，不修改任何笔记数据

## 技术说明

- frontmatter 键 `open-mode` 只读不写；不修改用户数据
- `edit` 切换到 live preview 形态；`reading` 切换到阅读视图
- 优先级：frontmatter > 全局默认 > Obsidian 原生设置

## Credits / 致谢

- 功能定位参考了 [Current View](https://github.com/luceast/obsidian-current-view) 与 [Default View Mode](https://github.com/sunzyyu/obsidian-default-view)（仅借鉴思路，未复制代码）

## License / 许可证

MIT License - Copyright (c) 2026 旭说
