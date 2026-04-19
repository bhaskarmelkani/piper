import type { Component } from "../tui.js";

export type ViewportAnchor = "top" | "bottom";

/**
 * Clips a child component to a fixed number of lines and pads to that height.
 * The scroll offset is interpreted from the top or bottom depending on anchor.
 */
export class Viewport implements Component {
	private height = 0;
	private scrollOffset = 0;
	private anchor: ViewportAnchor;
	private lastContentHeight = 0;
	private lastViewportHeight = 0;
	private lastRenderWidth = 0;

	constructor(
		private child: Component,
		options?: {
			height?: number;
			scrollOffset?: number;
			anchor?: ViewportAnchor;
		},
	) {
		this.height = Math.max(0, options?.height ?? 0);
		this.scrollOffset = Math.max(0, options?.scrollOffset ?? 0);
		this.anchor = options?.anchor ?? "top";
	}

	setChild(child: Component): void {
		this.child = child;
	}

	setHeight(height: number): void {
		this.height = Math.max(0, height);
	}

	getHeight(): number {
		return this.height;
	}

	setScrollOffset(scrollOffset: number): void {
		this.scrollOffset = Math.max(0, scrollOffset);
	}

	getScrollOffset(): number {
		return this.scrollOffset;
	}

	setAnchor(anchor: ViewportAnchor): void {
		this.anchor = anchor;
	}

	getAnchor(): ViewportAnchor {
		return this.anchor;
	}

	getContentHeight(): number {
		return this.lastContentHeight;
	}

	getMaxScrollOffset(): number {
		return Math.max(0, this.lastContentHeight - this.lastViewportHeight);
	}

	invalidate(): void {
		this.child.invalidate?.();
	}

	render(width: number): string[] {
		const viewportHeight = Math.max(0, this.height);
		if (viewportHeight === 0) {
			this.lastContentHeight = 0;
			this.lastViewportHeight = 0;
			this.lastRenderWidth = width;
			return [];
		}

		if (
			(this.lastRenderWidth !== 0 && this.lastRenderWidth !== width) ||
			(this.lastViewportHeight !== 0 && this.lastViewportHeight !== viewportHeight)
		) {
			this.lastContentHeight = 0;
			this.lastViewportHeight = 0;
		}

		const lines = this.child.render(width);
		this.lastRenderWidth = width;
		this.lastContentHeight = lines.length;
		this.lastViewportHeight = viewportHeight;

		const maxScrollOffset = Math.max(0, lines.length - viewportHeight);
		const clampedScrollOffset = Math.min(this.scrollOffset, maxScrollOffset);

		let start = 0;
		if (this.anchor === "bottom") {
			start = Math.max(0, lines.length - viewportHeight - clampedScrollOffset);
		} else {
			start = clampedScrollOffset;
		}

		const sliced = lines.slice(start, start + viewportHeight);
		while (sliced.length < viewportHeight) {
			sliced.push("");
		}
		return sliced;
	}
}
