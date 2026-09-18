/* XU View Mode — 打开模式记忆：按笔记元数据定义打开时用阅读或编辑模式，全局默认可设，性能无感. */
'use strict';

/* obsidian API 必须显式 require（Obsidian 不注入全局；smoke 桩环境会实抓此类错误） */
const { Plugin, Setting, PluginSettingTab } = require('obsidian');

const REPO_URL = 'https://github.com/xcloud-ai/xu-view-mode';
const FM_KEY = 'open-mode'; // frontmatter 专用键：只读不写，不碰用户数据

const I18N = {
  zh: {
    setting_title: 'XU View Mode（打开模式记忆）',
    setting_header_desc: '在笔记 frontmatter 写 open-mode: reading / edit，打开时自动切换对应模式；未写的笔记按下方全局默认。仅首次打开生效，手动切换不被打回.',
    setting_language: '界面语言',
    setting_language_desc: '切换中文 / English',
    setting_default_mode: '默认打开模式',
    setting_default_mode_desc: '笔记未设置 open-mode 元数据时的打开模式',
    option_follow: '跟随 Obsidian 原生设置',
    option_reading: '阅读模式',
    option_edit: '编辑模式',
    setting_fm_title: 'frontmatter 用法（按笔记设置）',
    setting_fm_desc: '在笔记 frontmatter 写 open-mode，打开时自动切换。可选值——阅读模式：reading / read / preview；编辑模式：edit / editing / source / live。优先级：frontmatter > 全局默认.',
    setting_docs: '使用文档',
    setting_docs_desc: '在 GitHub 查看完整使用说明',
    btn_github: 'GitHub',
  },
  en: {
    setting_title: 'XU View Mode',
    setting_header_desc: 'Add open-mode: reading / edit to frontmatter to control how a note opens; notes without it fall back to the global default below. Applies on first open only; manual switching is never overridden.',
    setting_language: 'Language',
    setting_language_desc: 'Switch Chinese / English',
    setting_default_mode: 'Default open mode',
    setting_default_mode_desc: 'Used when a note has no open-mode frontmatter',
    option_follow: 'Follow Obsidian default',
    option_reading: 'Reading view',
    option_edit: 'Editing view',
    setting_fm_title: 'frontmatter usage (per note)',
    setting_fm_desc: 'Add open-mode to a note frontmatter. Accepted values - Reading: reading / read / preview; Editing: edit / editing / source / live. Priority: frontmatter > global default.',
    setting_docs: 'Documentation',
    setting_docs_desc: 'View the full usage guide on GitHub',
    btn_github: 'GitHub',
  },
};

const DEFAULT_SETTINGS = {
  language: 'zh',
  defaultMode: 'follow', // follow | reading | edit
};

class XuViewMode extends Plugin {
  t(key) {
    const dict = I18N[this.settings?.language] || I18N.zh;
    return dict[key] || key;
  }

  async onload() {
    await this.loadSettings();

    // 「标签页 × 文件」组合只应用一次（WeakMap，标签页关闭自动回收）：
    // 同一组合再次打开不强制，尊重用户手动切换；新标签页打开则正常应用
    this._applied = new WeakMap();

    // 事件注册延后到布局就绪（官方 load-time 性能规范：启动期零开销）
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.workspace.on('file-open', (file) => this.handleFileOpen(file))
      );
      // 布局就绪后 file-open 不再为已打开文件触发，对当前活动文件补一次
      const active = this.app.workspace.getActiveFile();
      if (active) this.handleFileOpen(active);
    });

    this.addSettingTab(new XuViewModeSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // 解析目标视图模式：frontmatter open-mode 优先，其次全局默认
  // 返回 'preview' | 'source'；follow（不干预）返回 null
  getTargetMode(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const raw = fm ? String(fm[FM_KEY] || '').trim().toLowerCase() : '';
    if (raw === 'reading' || raw === 'read' || raw === 'preview') return 'preview';
    if (raw === 'edit' || raw === 'editing' || raw === 'source' || raw === 'live') return 'source';
    const d = this.settings.defaultMode;
    if (d === 'reading') return 'preview';
    if (d === 'edit') return 'source';
    return null;
  }

  handleFileOpen(file) {
    // 快速路径：活动视图非 markdown（如画板/PDF/搜索）直接返回，微秒级
    const leaf = this.app.workspace.activeLeaf;
    const view = leaf && leaf.view;
    if (!view || view.getViewType() !== 'markdown') return;

    let applied = this._applied.get(leaf);
    if (!applied) {
      applied = new Set();
      this._applied.set(leaf, applied);
    }
    if (applied.has(file.path)) return; // 该组合已应用过，不打扰手动切换

    const target = this.getTargetMode(file);
    if (!target) return; // follow：交给 Obsidian 原生行为

    // 幂等：已是目标模式则只登记不切换（零视觉抖动）
    if (view.getMode() === target) {
      applied.add(file.path);
      return;
    }

    // 切换：edit 统一落到 live preview 形态（state.source=false）
    leaf.setViewState({
      type: 'markdown',
      state: { mode: target, source: false },
      active: true,
    });
    applied.add(file.path);
  }
}

class XuViewModeSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  t(key) { return this.plugin.t(key); }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    // 标准头：英文名（中文名）标题 + 1-3 行插件描述
    // 官方审核规则：设置页标题禁止 createEl('h2')，必须用 setHeading()
    new Setting(containerEl).setName(this.t('setting_title')).setHeading();
    containerEl.createDiv({ cls: 'xu-view-mode-hint', text: this.t('setting_header_desc') });

    // 语言切换器必须放最顶部
    new Setting(containerEl)
      .setName(this.t('setting_language'))
      .setDesc(this.t('setting_language_desc'))
      .addDropdown((dd) =>
        dd.addOption('zh', '中文')
          .addOption('en', 'English')
          .setValue(this.plugin.settings.language)
          .onChange(async (v) => {
            this.plugin.settings.language = v;
            await this.plugin.saveSettings();
            this.display();
          }));

    containerEl.createEl('hr');

    // frontmatter 用法展示（可选值一目了然）
    const fm = containerEl.createDiv({ cls: 'xu-view-mode-fm' });
    fm.createDiv({ cls: 'xu-view-mode-fm-title', text: this.t('setting_fm_title') });
    fm.createEl('code', { text: 'open-mode: reading | edit' });
    fm.createDiv({ cls: 'xu-view-mode-fm-desc', text: this.t('setting_fm_desc') });

    // 默认打开模式（frontmatter 未设置时的回退值）
    new Setting(containerEl)
      .setName(this.t('setting_default_mode'))
      .setDesc(this.t('setting_default_mode_desc'))
      .addDropdown((dd) =>
        dd.addOption('follow', this.t('option_follow'))
          .addOption('reading', this.t('option_reading'))
          .addOption('edit', this.t('option_edit'))
          .setValue(this.plugin.settings.defaultMode)
          .onChange(async (v) => {
            this.plugin.settings.defaultMode = v;
            await this.plugin.saveSettings();
          }));

    // 底部：GitHub 使用文档（所有插件统一入口）
    containerEl.createEl('hr', { cls: 'xu-view-mode-divider' });
    new Setting(containerEl)
      .setName(this.t('setting_docs'))
      .setDesc(this.t('setting_docs_desc'))
      .addButton((btn) =>
        btn.setButtonText(this.t('btn_github')).onClick(() => {
          window.open(REPO_URL, '_blank');
        }));
  }
}

module.exports = XuViewMode;
