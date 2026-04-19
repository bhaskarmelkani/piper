import type { Component } from "../tui.js";

export interface BottomDockLayoutMeasurement {
	width: number;
	totalHeight: number;
	topHeight: number;
	bottomHeight: number;
}

/**
 * Renders a fixed-height layout with a flexible top region and a docked bottom region.
 * The bottom component is anchored to the terminal bottom and the combined output always
 * fills the configured total height exactly.
 */
export class BottomDockLayout implements Component {
	constructor(
		private top: Component,
		private bottom: Component,
		private getHeight: () => number,
		private onMeasure?: (measurement: BottomDockLayoutMeasurement) => void,
	) {}

	setTop(top: Component): void {
		this.top = top;
	}

	setBottom(bottom: Component): void {
		this.bottom = bottom;
	}

	invalidate(): void {
		this.top.invalidate?.();
		this.bottom.invalidate?.();
	}

	render(width: number): string[] {
		const totalHeight = Math.max(0, this.getHeight());
		if (totalHeight === 0) {
			return [];
		}

		const bottomLines = this.bottom.render(width);
		const bottomHeight = Math.min(bottomLines.length, totalHeight);
		const topHeight = Math.max(0, totalHeight - bottomHeight);

		this.onMeasure?.({
			width,
			totalHeight,
			topHeight,
			bottomHeight,
		});

		const topLines = this.top.render(width).slice(0, topHeight);
		while (topLines.length < topHeight) {
			topLines.push("");
		}

		const dockStart = Math.max(0, bottomLines.length - bottomHeight);
		const dockLines = bottomLines.slice(dockStart);
		return [...topLines, ...dockLines];
	}
}
