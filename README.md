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

### 按笔记设置（frontmatter）

在笔记 frontmatter 写：

```yaml
---
open-mode: reading
---
```

可选值：`reading`（阅读模式）/ `edit`（编辑模式）。也接受 `read` / `preview` / `editing` / `source` / `live` 等常见写法。

### 全局默认

设置 -> XU View Mode -> 默认打开模式：阅读模式 / 编辑模式 / 跟随 Obsidian 原生设置。

### Usage (English)

Add `open-mode: reading | edit` to frontmatter. Notes without it use the global default (Settings -> XU View Mode). Accepted aliases: read / preview / editing / source / live.

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
