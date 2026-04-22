import type { AssistantMessage } from "@mariozechner/pi-ai";
import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@mariozechner/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

type VisibleBlock =
	| { type: "text"; text: string }
	| { type: "thinking"; thinking: string; hasVisibleContentAfter: boolean };

type ContentBlockEntry = { type: "text" | "thinking"; component: Markdown | Text };

/**
 * Component that renders a complete assistant message
 */
export class AssistantMessageComponent extends Container {
	private contentContainer: Container;
	private hideThinkingBlock: boolean;
	private markdownTheme: MarkdownTheme;
	private hiddenThinkingLabel: string;
	private lastMessage?: AssistantMessage;
	private hasToolCalls = false;

	// Tracks visible (text/thinking) block components for in-place updates during streaming.
	// Indexed by position in the filtered visible-blocks list.
	private contentBlockComponents: ContentBlockEntry[] = [];

	constructor(
		message?: AssistantMessage,
		hideThinkingBlock = false,
		markdownTheme: MarkdownTheme = getMarkdownTheme(),
		hiddenThinkingLabel = "Thinking...",
	) {
		super();

		this.hideThinkingBlock = hideThinkingBlock;
		this.markdownTheme = markdownTheme;
		this.hiddenThinkingLabel = hiddenThinkingLabel;

		// Container for text/thinking content
		this.contentContainer = new Container();
		this.addChild(this.contentContainer);

		if (message) {
			this.updateContent(message);
		}
	}

	override invalidate(): void {
		super.invalidate();
		if (this.lastMessage) {
			this.contentBlockComponents = [];
			this.updateContent(this.lastMessage);
		}
	}

	setHideThinkingBlock(hide: boolean): void {
		this.hideThinkingBlock = hide;
		if (this.lastMessage) {
			this.contentBlockComponents = [];
			this.updateContent(this.lastMessage);
		}
	}

	setHiddenThinkingLabel(label: string): void {
		this.hiddenThinkingLabel = label;
		if (this.lastMessage) {
			this.contentBlockComponents = [];
			this.updateContent(this.lastMessage);
		}
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (this.hasToolCalls || lines.length === 0) {
			return lines;
		}

		lines[0] = OSC133_ZONE_START + lines[0];
		lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
		return lines;
	}

	updateContent(message: AssistantMessage): void {
		this.lastMessage = message;
		this.hasToolCalls = message.content.some((c) => c.type === "toolCall");

		const visibleBlocks = this.getVisibleBlocks(message);

		if (!this.tryUpdateInPlace(message, visibleBlocks)) {
			this.fullRebuild(message, visibleBlocks);
		}
	}

	private getVisibleBlocks(message: AssistantMessage): VisibleBlock[] {
		const result: VisibleBlock[] = [];
		for (let i = 0; i < message.content.length; i++) {
			const c = message.content[i];
			if (c.type === "text" && c.text.trim()) {
				result.push({ type: "text", text: c.text.trim() });
			} else if (c.type === "thinking" && c.thinking.trim()) {
				const hasVisibleContentAfter = message.content
					.slice(i + 1)
					.some((d) => (d.type === "text" && d.text.trim()) || (d.type === "thinking" && d.thinking.trim()));
				result.push({ type: "thinking", thinking: c.thinking.trim(), hasVisibleContentAfter });
			}
		}
		return result;
	}

	/**
	 * Fast path: when the block structure is unchanged and message is not in an error/abort
	 * state, update existing Markdown components via setText() rather than destroying and
	 * recreating the full component tree. This avoids per-token object churn during streaming.
	 */
	private tryUpdateInPlace(message: AssistantMessage, visibleBlocks: VisibleBlock[]): boolean {
		if (message.stopReason === "aborted" || message.stopReason === "error") return false;
		if (message.errorMessage) return false;
		if (visibleBlocks.length === 0) return false;
		if (visibleBlocks.length !== this.contentBlockComponents.length) return false;

		for (let i = 0; i < visibleBlocks.length; i++) {
			const block = visibleBlocks[i];
			const cached = this.contentBlockComponents[i];
			if (block.type !== cached.type) return false;
			if (block.type === "text" && !(cached.component instanceof Markdown)) return false;
			if (block.type === "thinking" && !this.hideThinkingBlock && !(cached.component instanceof Markdown))
				return false;
			if (block.type === "thinking" && this.hideThinkingBlock && !(cached.component instanceof Text)) return false;
		}

		for (let i = 0; i < visibleBlocks.length; i++) {
			const block = visibleBlocks[i];
			const cached = this.contentBlockComponents[i];
			if (block.type === "text") {
				(cached.component as Markdown).setText(block.text);
			} else if (block.type === "thinking" && !this.hideThinkingBlock) {
				(cached.component as Markdown).setText(block.thinking);
			}
			// hideThinkingBlock: Text component shows a static label, nothing to update
		}
		return true;
	}

	private fullRebuild(message: AssistantMessage, visibleBlocks: VisibleBlock[]): void {
		this.contentBlockComponents = [];
		this.contentContainer.clear();

		if (visibleBlocks.length > 0) {
			this.contentContainer.addChild(new Spacer(1));
		}

		for (const block of visibleBlocks) {
			if (block.type === "text") {
				const md = new Markdown(block.text, 1, 0, this.markdownTheme);
				this.contentContainer.addChild(md);
				this.contentBlockComponents.push({ type: "text", component: md });
			} else if (block.type === "thinking") {
				if (this.hideThinkingBlock) {
					const label = new Text(theme.italic(theme.fg("thinkingText", this.hiddenThinkingLabel)), 1, 0);
					this.contentContainer.addChild(label);
					this.contentBlockComponents.push({ type: "thinking", component: label });
					if (block.hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				} else {
					const md = new Markdown(block.thinking, 1, 0, this.markdownTheme, {
						color: (text: string) => theme.fg("thinkingText", text),
						italic: true,
					});
					this.contentContainer.addChild(md);
					this.contentBlockComponents.push({ type: "thinking", component: md });
					if (block.hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				}
			}
		}

		// Error/abort state — only when there are no tool calls
		if (!this.hasToolCalls) {
			if (message.stopReason === "aborted") {
				const abortMessage =
					message.errorMessage && message.errorMessage !== "Request was aborted"
						? message.errorMessage
						: "Operation aborted";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), 1, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), 1, 0));
			}
		}
	}
}
