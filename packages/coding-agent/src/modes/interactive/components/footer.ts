import { type Component, truncateToWidth } from "@mariozechner/pi-tui";
import type { AgentSession } from "../../../core/agent-session.js";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.js";
import { theme } from "../theme/theme.js";

/**
 * Sanitize text for display in a single-line status.
 * Removes newlines, tabs, carriage returns, and other control characters.
 */
function sanitizeStatusText(text: string): string {
	// Replace newlines, tabs, carriage returns with space, then collapse multiple spaces
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

/**
 * Footer component that only renders extension-owned status text.
 * Session metadata now lives in the right sidebar to avoid duplication.
 */
export class FooterComponent implements Component {
	constructor(
		_session: AgentSession,
		private footerData: ReadonlyFooterDataProvider,
	) {}

	setSession(_session: AgentSession): void {}

	setAutoCompactEnabled(_enabled: boolean): void {}

	/**
	 * No-op: git branch caching now handled by provider.
	 * Kept for compatibility with existing call sites in interactive-mode.
	 */
	invalidate(): void {
		// No-op: git branch is cached/invalidated by provider
	}

	/**
	 * Clean up resources.
	 * Git watcher cleanup now handled by provider.
	 */
	dispose(): void {
		// Git watcher cleanup handled by provider
	}

	render(width: number): string[] {
		return this.renderFooter(width);
	}

	private renderFooter(width: number): string[] {
		// Extension statuses
		const extensionStatuses = this.footerData.getExtensionStatuses();
		if (extensionStatuses.size === 0) {
			return [];
		}

		const sorted = Array.from(extensionStatuses.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([, text]) => sanitizeStatusText(text))
			.filter(Boolean);
		if (sorted.length === 0) {
			return [];
		}

		const muted = (text: string) => theme.fg("muted", text);
		return [truncateToWidth(muted(sorted.join(" · ")), width, muted("..."))];
	}
}
