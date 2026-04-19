import type { Component } from "@mariozechner/pi-tui";

/**
 * Bottom dock host for piper. Keeps the composer/footer mounted at the bottom and
 * clips transient content above them when the dock reaches its maximum height.
 */
export class ShellDockComponent implements Component {
	private hideEditor = false;

	constructor(
		private actionHints: Component,
		private transient: Component,
		private editor: Component,
		private belowEditor: Component,
		private footer: Component,
		private getMaxHeight: () => number,
	) {}

	setHideEditor(hide: boolean): void {
		this.hideEditor = hide;
	}

	setActionHints(actionHints: Component): void {
		this.actionHints = actionHints;
	}

	setTransient(transient: Component): void {
		this.transient = transient;
	}

	setEditor(editor: Component): void {
		this.editor = editor;
	}

	setBelowEditor(belowEditor: Component): void {
		this.belowEditor = belowEditor;
	}

	setFooter(footer: Component): void {
		this.footer = footer;
	}

	invalidate(): void {
		this.actionHints.invalidate?.();
		this.transient.invalidate?.();
		this.editor.invalidate?.();
		this.belowEditor.invalidate?.();
		this.footer.invalidate?.();
	}

	render(width: number): string[] {
		const maxHeight = Math.max(1, this.getMaxHeight());
		const hintLines = this.actionHints.render(width);
		const transientLines = this.transient.render(width);
		const footerLines = this.footer.render(width);

		if (this.hideEditor) {
			// Stack mode: transient fills all space above hints + footer, editor hidden
			const fixedLines = [...hintLines, ...footerLines];
			if (fixedLines.length >= maxHeight) {
				return fixedLines.slice(Math.max(0, fixedLines.length - maxHeight));
			}
			const availableForTransient = Math.max(0, maxHeight - fixedLines.length);
			const clippedTransient = transientLines.slice(0, availableForTransient);
			return [...hintLines, ...clippedTransient, ...footerLines];
		}

		const editorLines = this.editor.render(width);
		const belowEditorLines = this.belowEditor.render(width);
		const fixedLines = [...hintLines, ...editorLines, ...belowEditorLines, ...footerLines];
		if (fixedLines.length >= maxHeight) {
			return fixedLines.slice(Math.max(0, fixedLines.length - maxHeight));
		}

		const availableForTransient = Math.max(0, maxHeight - fixedLines.length);
		const clippedTransient = transientLines.slice(0, availableForTransient);
		return [...hintLines, ...clippedTransient, ...editorLines, ...belowEditorLines, ...footerLines];
	}
}
