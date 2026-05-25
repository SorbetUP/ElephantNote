// NOTE: This module is imported at runtime (e.g. via `pluginManagerStore.ts`).
// Keep it free of heavy imports and cross-package type dependencies, otherwise the
// plugin system can become a large, fragile dependency graph.

export type BlinkoCopyToClipboard = (text: string, options?: any) => boolean;

export type PluginMode = "create" | "edit" | "comment";

export type EditorFooterSlot = {
  name: string;
  content: (mode?: PluginMode) => HTMLElement;
  order?: number;
  isHidden?: boolean;
  className?: string;
  showCondition?: (mode: PluginMode) => boolean;
  hideCondition?: (mode: PluginMode) => boolean;
  style?: any;
  maxWidth?: number;
  onClick?: () => void;
  onHover?: () => void;
  onLeave?: () => void;
  data?: any;
};

export type CardFooterSlot = {
  name: string;
  content: (note?: any) => HTMLElement;
  order?: number;
  isHidden?: boolean;
  className?: string;
  showCondition?: (note: any) => boolean;
  hideCondition?: (note: any) => boolean;
  style?: any;
  maxWidth?: number;
  onClick?: () => void;
  onHover?: () => void;
  onLeave?: () => void;
  data?: any;
};

export type ToolbarIcon = {
  name: string;
  icon: string;
  tooltip: string;
  content?: (mode?: PluginMode) => HTMLElement;
  placement?: "top" | "bottom" | "left" | "right";
  maxWidth?: number;
  onClick?: () => void;
};

export type RightClickMenu = {
  name: string;
  label: string;
  icon?: string;
  onClick: (note: any) => void;
  disabled?: boolean;
};

export type DialogOptions = {
  title: string;
  size:
    | "sm"
    | "md"
    | "lg"
    | "xl"
    | "2xl"
    | "3xl"
    | "4xl"
    | "5xl"
    | "full"
    | "xs";
  content: () => HTMLElement;
};

export interface PluginApi {
  closeToolBarContent(name: string): void;
  addToolBarIcon(options: ToolbarIcon): void;
  addRightClickMenu(options: RightClickMenu): void;
  showDialog(options: DialogOptions): void;
  closeDialog(): void;
  addAiWritePrompt(name: string, prompt: string, icon?: string): void;
  addCardFooterSlot(options: CardFooterSlot): void;
  addEditorFooterSlot(options: EditorFooterSlot): void;
}

declare global {
  interface Window {
    Blinko: {
      // These are runtime objects; the shape is intentionally loose to keep
      // declaration generation lightweight for plugin authors.
      api: unknown;
      eventBus: unknown;
      i18n: unknown;
      version: string;
      copyToClipboard: BlinkoCopyToClipboard;
      toast: unknown;
      store: Record<string, unknown>;
      globalRefresh: () => void;
    } & PluginApi;
    System?: unknown;
  }
}

export interface I18nString {
  default: string;
  zh?: string;
  'zh-tw'?: string;
  en?: string;
  vi?: string;
  tr?: string;
  ka?: string;
  de?: string;
  es?: string;
  fr?: string;
  pt?: string;
  pl?: string;
  ru?: string;
  ko?: string;
  ja?: string;
  [key: string]: string | undefined;
}

/**
 * Abstract base class for all plugins in the application.
 * Provides common properties and methods that all plugins should implement.
 */
export abstract class BasePlugin {
  /** Plugin name (unique identifier) */
  name?: string;
  /** Author of the plugin */
  author?: string;
  /** URL for plugin documentation or repository */
  url?: string;
  /** Current version of the plugin */
  version?: string;
  /** Minimum required app version for compatibility */
  minAppVersion?: string;
  /** Display name for the plugin (supports i18n) */
  displayName?: I18nString;
  /** Short description of the plugin (supports i18n) */
  description?: I18nString;
  /** Detailed readme content (supports i18n) */
  readme?: I18nString;
  /** Icon URL or icon identifier for the plugin */
  icon?: string;
  /** Flag indicating if the plugin has a settings panel */
  withSettingPanel?: boolean;
  /** Function to render the settings panel UI */
  renderSettingPanel?: () => HTMLElement;

  /**
   * Constructs a new BasePlugin instance
   * @param args - Partial object containing plugin configuration
   */
  constructor(args: Partial<BasePlugin>) {
    Object.assign(this, args);
  }

  /**
   * Initialization method called when the plugin is loaded
   * Must be implemented by derived classes
   */
  abstract init(): void;

  /**
   * Cleanup method called when the plugin is unloaded
   * Must be implemented by derived classes
   */
  abstract destroy(): void;
}
