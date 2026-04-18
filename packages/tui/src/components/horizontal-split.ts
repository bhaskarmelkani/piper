import type { Component } from "../tui.js";
import { truncateToWidth } from "../utils.js";

/**
 * Lays out two components side by side.
 *
 * Left panel occupies (width - rightWidth) columns.
 * Right panel occupies rightWidth columns.
 *
 * When right is null, rightWidth is 0, or visibilityFn returns false,
 * the left panel renders at full width with no overhead.
 */
export class HorizontalSplit implements Component {
	constructor(
		private left: Component,
		private right: Component | null,
		private rightWidth: number,
		private visibilityFn?: (width: number) => boolean,
	) {}

	setRight(right: Component | null): void {
		this.right = right;
	}

	setRightWidth(width: number): void {
		this.rightWidth = width;
	}

	invalidate(): void {
		this.left.invalidate?.();
		this.right?.invalidate?.();
	}

	render(width: number): string[] {
		const showRight = this.right !== null && this.rightWidth > 0 && (!this.visibilityFn || this.visibilityFn(width));

		if (!showRight) {
			return this.left.render(width);
		}

		const leftWidth = Math.max(1, width - this.rightWidth);
		const leftLines = this.left.render(leftWidth);
		const rightLines = this.right!.render(this.rightWidth);

		const maxLines = Math.max(leftLines.length, rightLines.length);
		const result: string[] = [];

		for (let i = 0; i < maxLines; i++) {
			const leftLine = leftLines[i] ?? "";
			const rightLine = rightLines[i] ?? "";
			// Pad left line to exactly leftWidth, preserving ANSI codes and CURSOR_MARKER
			const leftPadded = truncateToWidth(leftLine, leftWidth, "", true);
			result.push(leftPadded + rightLine);
		}

		return result;
	}
}
