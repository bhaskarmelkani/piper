import {
	CURSOR_MARKER,
	Editor,
	type EditorOptions,
	type EditorTheme,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";
import type { AppKeybinding, KeybindingsManager } from "../../../core/keybindings.js";

export interface CustomEditorOptions extends EditorOptions {
	placeholder?: string;
	placeholderStyle?: (text: string) => string;
}

/**
 * Custom editor that handles app-level keybindings for coding-agent.
 */
export class CustomEditor extends Editor {
	private keybindings: KeybindingsManager;
	private placeholder?: string;
	private placeholderStyle: (text: string) => string;
	public actionHandlers: Map<AppKeybinding, () => void> = new Map();

	// Special handlers that can be dynamically replaced
	public onEscape?: () => void;
	public onCtrlD?: () => void;
	public onPasteImage?: () => void;
	/** Handler for extension-registered shortcuts. Returns true if handled. */
	public onExtensionShortcut?: (data: string) => boolean;

	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, options: CustomEditorOptions = {}) {
		super(tui, theme, options);
		this.keybindings = keybindings;
		this.placeholder = options.placeholder;
		this.placeholderStyle = options.placeholderStyle ?? ((text) => text);
	}

	/**
	 * Register a handler for an app action.
	 */
	onAction(action: AppKeybinding, handler: () => void): void {
		this.actionHandlers.set(action, handler);
	}

	setPlaceholder(placeholder?: string): void {
		if (this.placeholder !== placeholder) {
			this.placeholder = placeholder;
			this.tui.requestRender();
		}
	}

	override render(width: number): string[] {
		const rendered = super.render(width);
		if (!this.placeholder || this.getText().length > 0 || this.isShowingAutocomplete() || rendered.length < 3) {
			return rendered;
		}

		const maxPadding = Math.max(0, Math.floor((width - 1) / 2));
		const paddingX = Math.min(this.getPaddingX(), maxPadding);
		const contentWidth = Math.max(1, width - paddingX * 2);
		const leftPadding = " ".repeat(paddingX);
		const rightPadding = leftPadding;
		const reservedCursorWidth = this.focused ? 1 : 0;
		const placeholderWidth = Math.max(0, contentWidth - reservedCursorWidth);
		const truncatedPlaceholder = truncateToWidth(this.placeholderStyle(this.placeholder), placeholderWidth);
		const trailingSpaces = " ".repeat(Math.max(0, placeholderWidth - visibleWidth(truncatedPlaceholder)));
		const cursorPrefix = this.focused ? `${CURSOR_MARKER}\x1b[7m \x1b[0m` : "";

		rendered[1] = `${leftPadding}${cursorPrefix}${truncatedPlaceholder}${trailingSpaces}${rightPadding}`;
		return rendered;
	}

	handleInput(data: string): void {
		// Check extension-registered shortcuts first
		if (this.onExtensionShortcut?.(data)) {
			return;
		}

		// Check for paste image keybinding
		if (this.keybindings.matches(data, "app.clipboard.pasteImage")) {
			this.onPasteImage?.();
			return;
		}

		// Check app keybindings first

		// Escape/interrupt - only if autocomplete is NOT active
		if (this.keybindings.matches(data, "app.interrupt")) {
			if (!this.isShowingAutocomplete()) {
				// Use dynamic onEscape if set, otherwise registered handler
				const handler = this.onEscape ?? this.actionHandlers.get("app.interrupt");
				if (handler) {
					handler();
					return;
				}
			}
			// Let parent handle escape for autocomplete cancellation
			super.handleInput(data);
			return;
		}

		// Exit (Ctrl+D) - only when editor is empty
		if (this.keybindings.matches(data, "app.exit")) {
			if (this.getText().length === 0) {
				const handler = this.onCtrlD ?? this.actionHandlers.get("app.exit");
				if (handler) handler();
				return;
			}
			// Fall through to editor handling for delete-char-forward when not empty
		}

		// Check all other app actions
		for (const [action, handler] of this.actionHandlers) {
			if (action !== "app.interrupt" && action !== "app.exit" && this.keybindings.matches(data, action)) {
				handler();
				return;
			}
		}

		// Pass to parent for editor handling
		super.handleInput(data);
	}
}
