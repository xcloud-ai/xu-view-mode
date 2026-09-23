/* XU View Mode — 打开模式记忆：按笔记元数据定义打开时用阅读或编辑模式，全局默认可设，性能无感. */
'use strict';

/* obsidian API 必须显式 require（Obsidian 不注入全局；smoke 桩环境会实抓此类错误） */
const { Plugin, Setting, PluginSettingTab } = require('obsidian');

const REPO_URL = 'https://github.com/xcloud-ai/xu-view-mode';
const FM_KEY = 'open-mode'; // 本插件专用键：只读不写，不碰用户数据
// 兼容老牌插件 Force note view mode 的键名，方便其用户零改动迁移
const LEGACY_UI_KEY = 'obsidianUIMode';

const I18N = {
  zh: {
    setting_title: 'XU View Mode（打开模式记忆）',
    setting_header_desc: '在笔记 frontmatter 写 open-mode: reading / edit，打开时自动切换对应模式；未写的笔记按下方全局默认。每次打开都按 frontmatter 生效，查看期间手动切换不被打回.',
    setting_language: '界面语言',
    setting_language_desc: '切换中文 / English',
    setting_default_mode: '默认打开模式',
    setting_default_mode_desc: '笔记未设置 open-mode 元数据时的打开模式',
    option_follow: '跟随 Obsidian 原生设置',
    option_reading: '阅读模式',
    option_edit: '编辑模式',
    setting_fm_title: 'frontmatter 用法（按笔记设置）',
    setting_fm_desc: '在笔记最顶部写上例三行，这篇笔记打开就进编辑模式；把 edit 改成 reading 则打开进阅读模式。等价写法：edit 也可写 editing / source / live，reading 也可写 read / preview，大小写均可。优先级：笔记设置 > 全局默认.',
    setting_docs: '使用文档',
    setting_docs_desc: '在 GitHub 查看完整使用说明',
    btn_github: 'GitHub',
  },
  en: {
    setting_title: 'XU View Mode',
    setting_header_desc: 'Add open-mode: reading / edit to frontmatter to control how a note opens; notes without it fall back to the global default below. The mode is applied every time the note opens; manual switching is kept during the current view.',
    setting_language: 'Language',
    setting_language_desc: 'Switch Chinese / English',
    setting_default_mode: 'Default open mode',
    setting_default_mode_desc: 'Used when a note has no open-mode frontmatter',
    option_follow: 'Follow Obsidian default',
    option_reading: 'Reading view',
    option_edit: 'Editing view',
    setting_fm_title: 'frontmatter usage (per note)',
    setting_fm_desc: 'Add the three lines above to the top of a note to open it in editing view; change edit to reading for reading view. Aliases: edit = editing / source / live; reading = read / preview (case-insensitive). Priority: note setting > global default.',
    setting_docs: 'Documentation',
    setting_docs_desc: 'View the full usage guide on GitHub',
    btn_github: 'GitHub',
  },
};

const DEFAULT_SETTINGS = {
  language: 'zh',
  // 出厂默认：未写 open-mode 的笔记一律用阅读模式打开
  defaultMode: 'reading', // follow | reading | edit
};

class XuViewMode extends Plugin {
  t(key) {
    const dict = I18N[this.settings?.language] || I18N.zh;
    return dict[key] || key;
  }

  async onload() {
    await this.loadSettings();

    // 记录每个标签页「当前已应用的文件路径」（单值 WeakMap，标签页关闭自动回收）：
    // 同文件重复事件跳过，保护手动切换；导航到别的文件后记录被覆盖，
    // 再次打开同一文件会重新应用 frontmatter
    this._current = new WeakMap();
    // 文件路径 → 元数据等待 Promise（多标签页共享同一个等待）
    this._metaWaits = new Map();

    // 事件注册延后到布局就绪（官方 load-time 性能规范：启动期零开销）
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.workspace.on('active-leaf-change', () => this.handleFileOpen(this.app.workspace.getActiveFile()))
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

  /**
   * 元数据是否已完成解析。
   * getFileCache 返回 null 表示「尚未解析」，不能等同于「没有 frontmatter」，
   * 否则会把 open-mode 误判为未设置（edit 时灵时不灵的根因）。
   */
  isMetadataReady(file) {
    return this.app.metadataCache.getFileCache(file) != null;
  }

  /**
   * 等待文件元数据解析完成：由 metadataCache 的 changed / resolved 事件唤醒，
   * 超时兜底（极端情况下缓存事件丢失也不永久挂起）。
   * 同一文件的多个标签页共享同一个等待 Promise。
   */
  whenMetadataReady(file, timeoutMs = 3000) {
    if (this.app.metadataCache.getFileCache(file)) return Promise.resolve();
    const existing = this._metaWaits.get(file.path);
    if (existing) return existing;

    let p = new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.app.metadataCache.offref(changedRef);
        this.app.metadataCache.offref(resolvedRef);
        resolve();
      };
      const changedRef = this.app.metadataCache.on('changed', (f) => {
        if (f.path === file.path) finish();
      });
      this.registerEvent(changedRef);
      const resolvedRef = this.app.metadataCache.on('resolved', finish);
      this.registerEvent(resolvedRef);
      const timer = setTimeout(finish, timeoutMs);
    }).finally(() => this._metaWaits.delete(file.path));

    this._metaWaits.set(file.path, p);
    return p;
  }

  /** 把 frontmatter 原始值归一化为视图模式；无法识别返回 null */
  normalizeMode(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (!v) return null;
    if (v === 'reading' || v === 'read' || v === 'preview') return 'preview';
    if (v === 'edit' || v === 'editing' || v === 'source' || v === 'live') return 'source';
    return null;
  }

  /**
   * 解析目标视图模式，优先级：
   *   open-mode > obsidianUIMode（老牌插件兼容）> 全局默认
   * 返回 'preview' | 'source'；follow（不干预）返回 null。
   */
  getTargetMode(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm) {
      // 1) 本插件键
      const own = this.normalizeMode(fm[FM_KEY]);
      if (own) return own;
      // 2) 老牌 Force note view mode 键：其取值 preview / source / live
      if (fm[LEGACY_UI_KEY] != null) {
        const legacy = this.normalizeMode(fm[LEGACY_UI_KEY]);
        if (legacy) return legacy;
      }
    }
    // 3) 全局默认
    return this.normalizeMode(this.settings.defaultMode);
  }

  /**
   * 文件被打开/激活时应用模式。
   * 关键：不使用 workspace.activeLeaf —— 它可能指向大纲面板等任意持有焦点的
   * 侧栏视图（这正是 edit 标签时灵时不灵的根因）。改为枚举所有正在显示
   * 该文件的 markdown 标签页，逐个处理。
   */
  async handleFileOpen(file) {
    if (!file) return;

    // 所有正在显示该文件、且当前记录不是该文件的 markdown 标签页。
    // 记录相同 = 焦点变化等重复事件：跳过，保护用户刚才的手动切换。
    let leaves = this.app.workspace
      .getLeavesOfType('markdown')
      .filter((l) => l.view.file?.path === file.path && this._current.get(l) !== file.path);
    if (leaves.length === 0) return;

    // 元数据尚未解析：等待，绝不在此刻提前套用全局默认
    // （否则默认阅读会先切换并登记，随后解析出的 open-mode: edit 被跳过）
    if (!this.isMetadataReady(file)) await this.whenMetadataReady(file);

    // 等待期间标签页可能已关闭：复验后逐个处理
    leaves = leaves.filter((l) => l.view && l.view.getViewType() === 'markdown');
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view.file?.path !== file.path) continue;
      if (this._current.get(leaf) === file.path) continue; // 等待期间别处已处理

      const target = this.getTargetMode(file);
      if (!target) {
        // 真正的 follow（已确认无 open-mode 且全局为跟随）：登记避免重复计算
        this._current.set(leaf, file.path);
        continue;
      }

      // 幂等：已是目标模式则只登记不切换（零视觉抖动）
      if (view.getMode() === target) {
        this._current.set(leaf, file.path);
        continue;
      }

      // 读当前完整视图状态再改，保留其余字段（如 eState 滚动位置）；
      // edit 统一落到 live preview 形态（source=false）
      const viewState = leaf.getViewState();
      viewState.state = {
        ...(viewState.state || {}),
        mode: target,
        source: false,
      };
      await leaf.setViewState(viewState);
      this._current.set(leaf, file.path);
    }
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
    fm.createEl('pre', { cls: 'xu-view-mode-fm-code', text: '---\nopen-mode: edit\n---' });
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
