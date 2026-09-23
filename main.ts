/* XU View Mode — 打开模式记忆：按笔记元数据定义打开时用阅读或编辑模式，全局默认可设，性能无感. */
/* TypeScript 源码参考（与 main.js 逻辑一致，供二次开发使用） */
import {
  App,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
} from "obsidian";

/** view 已确定为 MarkdownView 的标签页（带类型收窄） */
type MdLeaf = WorkspaceLeaf & { view: MarkdownView };
const isMdLeaf = (l: WorkspaceLeaf): l is MdLeaf => l.view instanceof MarkdownView;

const REPO_URL = "https://github.com/xcloud-ai/xu-view-mode";
const FM_KEY = "open-mode"; // 本插件专用键：只读不写，不碰用户数据
/** 兼容老牌插件 Force note view mode 的键名，方便其用户零改动迁移 */
const LEGACY_UI_KEY = "obsidianUIMode";

type TargetMode = "preview" | "source";

interface PluginSettings {
  language: string;
  defaultMode: string; // follow | reading | edit
}

interface I18NDict {
  [key: string]: string;
}

const I18N: Record<string, I18NDict> = {
  zh: {
    setting_title: "XU View Mode（打开模式记忆）",
    setting_header_desc: "在笔记 frontmatter 写 open-mode: reading / edit，打开时自动切换对应模式；未写的笔记按下方全局默认。仅首次打开生效，手动切换不被打回.",
    setting_language: "界面语言",
    setting_language_desc: "切换中文 / English",
    setting_default_mode: "默认打开模式",
    setting_default_mode_desc: "笔记未设置 open-mode 元数据时的打开模式",
    option_follow: "跟随 Obsidian 原生设置",
    option_reading: "阅读模式",
    option_edit: "编辑模式",
    setting_fm_title: "frontmatter 用法（按笔记设置）",
    setting_fm_desc: "在笔记最顶部写上例三行，这篇笔记打开就进编辑模式；把 edit 改成 reading 则打开进阅读模式。等价写法：edit 也可写 editing / source / live，reading 也可写 read / preview，大小写均可。优先级：笔记设置 > 全局默认.",
    setting_docs: "使用文档",
    setting_docs_desc: "在 GitHub 查看完整使用说明",
    btn_github: "GitHub",
  },
  en: {
    setting_title: "XU View Mode",
    setting_header_desc: "Add open-mode: reading / edit to frontmatter to control how a note opens; notes without it fall back to the global default below. Applies on first open only; manual switching is never overridden.",
    setting_language: "Language",
    setting_language_desc: "Switch Chinese / English",
    setting_default_mode: "Default open mode",
    setting_default_mode_desc: "Used when a note has no open-mode frontmatter",
    option_follow: "Follow Obsidian default",
    option_reading: "Reading view",
    option_edit: "Editing view",
    setting_fm_title: "frontmatter usage (per note)",
    setting_fm_desc: "Add the three lines above to the top of a note to open it in editing view; change edit to reading for reading view. Aliases: edit = editing / source / live; reading = read / preview (case-insensitive). Priority: note setting > global default.",
    setting_docs: "Documentation",
    setting_docs_desc: "View the full usage guide on GitHub",
    btn_github: "GitHub",
  },
};

const DEFAULT_SETTINGS: PluginSettings = {
  language: "zh",
  // 出厂默认：未写 open-mode 的笔记一律用阅读模式打开
  defaultMode: "reading",
};

export default class XuViewMode extends Plugin {
  settings!: PluginSettings;
  /** 「标签页 × 文件」组合只应用一次；标签页关闭自动回收 */
  private _applied = new WeakMap<WorkspaceLeaf, Set<string>>();
  /** 文件路径 → 元数据等待 Promise（多标签页共享同一个等待，避免重复挂事件） */
  private _metaWaits = new Map<string, Promise<void>>();

  t(key: string): string {
    const dict = I18N[this.settings?.language] || I18N.zh;
    return dict[key] || key;
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    // 事件注册延后到布局就绪（官方 load-time 性能规范：启动期零开销）
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.workspace.on("active-leaf-change", () => {
          const f = this.app.workspace.getActiveFile();
          if (f) this.handleFileOpen(f);
        })
      );
      // 布局就绪后 file-open 不再为已打开文件触发，对当前活动文件补一次
      const active = this.app.workspace.getActiveFile();
      if (active) this.handleFileOpen(active);
    });

    this.addSettingTab(new XuViewModeSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * 元数据是否已完成解析。
   * 注意：getFileCache 返回 null 表示「尚未解析」，不能等同于「没有 frontmatter」，
   * 否则会把 open-mode 误判为未设置（edit 时灵时不灵的根因）。
   */
  private isMetadataReady(file: TFile): boolean {
    return this.app.metadataCache.getFileCache(file) != null;
  }

  /**
   * 等待文件元数据解析完成：由 metadataCache 的 changed / resolved 事件唤醒，
   * 超时兜底（极端情况下缓存事件丢失也不永久挂起）。
   * 同一文件的多个标签页共享同一个等待 Promise。
   */
  private whenMetadataReady(file: TFile, timeoutMs = 3000): Promise<void> {
    if (this.app.metadataCache.getFileCache(file)) return Promise.resolve();
    const existing = this._metaWaits.get(file.path);
    if (existing) return existing;

    const p = new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.app.metadataCache.offref(changedRef);
        this.app.metadataCache.offref(resolvedRef);
        resolve();
      };
      const changedRef = this.app.metadataCache.on("changed", (f) => {
        if (f.path === file.path) finish();
      });
      this.registerEvent(changedRef);
      const resolvedRef = this.app.metadataCache.on("resolved", finish);
      this.registerEvent(resolvedRef);
      const timer = setTimeout(finish, timeoutMs);
    }).finally(() => this._metaWaits.delete(file.path));

    this._metaWaits.set(file.path, p);
    return p;
  }

  /** 把 frontmatter 原始值归一化为视图模式；无法识别返回 null */
  private normalizeMode(raw: unknown): TargetMode | null {
    const v = String(raw ?? "").trim().toLowerCase();
    if (!v) return null;
    if (v === "reading" || v === "read" || v === "preview") return "preview";
    if (v === "edit" || v === "editing" || v === "source" || v === "live") return "source";
    return null;
  }

  /**
   * 解析目标视图模式，优先级：
   *   open-mode > obsidianUIMode（老牌插件兼容）> 全局默认
   * 返回 'preview' | 'source'；follow（不干预）返回 null。
   */
  getTargetMode(file: TFile): TargetMode | null {
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

  /** 取出/建立标签页的「已应用文件」集合 */
  private appliedSet(leaf: WorkspaceLeaf): Set<string> {
    let set = this._applied.get(leaf);
    if (!set) {
      set = new Set<string>();
      this._applied.set(leaf, set);
    }
    return set;
  }

  /**
   * 文件被打开/激活时应用模式。
   * 关键：不使用 workspace.activeLeaf —— 它可能指向大纲面板等任意持有焦点的
   * 侧栏视图（这正是 edit 标签时灵时不灵的根因）。改为枚举所有正在显示
   * 该文件的 markdown 标签页，逐个处理。
   */
  async handleFileOpen(file: TFile): Promise<void> {
    if (!file) return;

    // 所有正在显示该文件的 markdown 标签页，且本组合尚未应用过
    let leaves: MdLeaf[] = this.app.workspace
      .getLeavesOfType("markdown")
      .filter(isMdLeaf)
      .filter((l) => l.view.file?.path === file.path && !this._applied.get(l)?.has(file.path));
    if (leaves.length === 0) return;

    // 元数据尚未解析：等待，绝不在此刻提前套用全局默认
    // （否则默认阅读会先切换并登记，随后解析出的 open-mode: edit 被永久跳过）
    if (!this.isMetadataReady(file)) await this.whenMetadataReady(file);

    // 等待期间标签页可能已关闭：复验后逐个处理
    leaves = leaves.filter((l) => l.view && isMdLeaf(l));
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view.file?.path !== file.path) continue;
      const applied = this.appliedSet(leaf);
      if (applied.has(file.path)) continue; // 等待期间别处已处理

      const target = this.getTargetMode(file);
      if (!target) {
        // 真正的 follow（已确认无 open-mode 且全局为跟随）：登记避免重复计算
        applied.add(file.path);
        continue;
      }

      // 幂等：已是目标模式则只登记不切换（零视觉抖动）
      if (view.getMode() === target) {
        applied.add(file.path);
        continue;
      }

      // 读当前完整视图状态再改，保留其余字段（如 eState 滚动位置）；
      // edit 统一落到 live preview 形态（source=false）
      const viewState = leaf.getViewState();
      viewState.state = {
        ...(viewState.state as Record<string, unknown>),
        mode: target,
        source: false,
      };
      await leaf.setViewState(viewState);
      applied.add(file.path);
    }
  }
}

class XuViewModeSettingTab extends PluginSettingTab {
  plugin: XuViewMode;

  constructor(app: App, plugin: XuViewMode) {
    super(app, plugin);
    this.plugin = plugin;
  }

  t(key: string): string {
    return this.plugin.t(key);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // 标准头：英文名（中文名）标题 + 1-3 行插件描述
    new Setting(containerEl).setName(this.t("setting_title")).setHeading();
    containerEl.createDiv({ cls: "xu-view-mode-hint", text: this.t("setting_header_desc") });

    // 语言切换器必须放最顶部
    new Setting(containerEl)
      .setName(this.t("setting_language"))
      .setDesc(this.t("setting_language_desc"))
      .addDropdown((dd) =>
        dd.addOption("zh", "中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.language)
          .onChange(async (v: string) => {
            this.plugin.settings.language = v;
            await this.plugin.saveSettings();
            this.display();
          }));

    containerEl.createEl("hr");

    // frontmatter 用法展示（可选值一目了然）
    const fm = containerEl.createDiv({ cls: "xu-view-mode-fm" });
    fm.createDiv({ cls: "xu-view-mode-fm-title", text: this.t("setting_fm_title") });
    fm.createEl("pre", { cls: "xu-view-mode-fm-code", text: "---\nopen-mode: edit\n---" });
    fm.createDiv({ cls: "xu-view-mode-fm-desc", text: this.t("setting_fm_desc") });

    // 默认打开模式（frontmatter 未设置时的回退值）
    new Setting(containerEl)
      .setName(this.t("setting_default_mode"))
      .setDesc(this.t("setting_default_mode_desc"))
      .addDropdown((dd) =>
        dd.addOption("follow", this.t("option_follow"))
          .addOption("reading", this.t("option_reading"))
          .addOption("edit", this.t("option_edit"))
          .setValue(this.plugin.settings.defaultMode)
          .onChange(async (v: string) => {
            this.plugin.settings.defaultMode = v;
            await this.plugin.saveSettings();
          }));

    // 底部：GitHub 使用文档（所有插件统一入口）
    containerEl.createEl("hr", { cls: "xu-view-mode-divider" });
    new Setting(containerEl)
      .setName(this.t("setting_docs"))
      .setDesc(this.t("setting_docs_desc"))
      .addButton((btn) =>
        btn.setButtonText(this.t("btn_github")).onClick(() => {
          window.open(REPO_URL, "_blank");
        }));
  }
}
