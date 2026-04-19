import * as Diff from "diff";
import { theme } from "../theme/theme.js";

/**
 * Parse diff line to extract prefix, line number, and content.
 * Format: "+123 content" or "-123 content" or " 123 content" or "     ..."
 */
function parseDiffLine(line: string): { prefix: string; lineNum: string; content: string } | null {
	const match = line.match(/^([+-\s])(\s*\d*)\s(.*)$/);
	if (!match) return null;
	return { prefix: match[1], lineNum: match[2], content: match[3] };
}

/**
 * Replace tabs with spaces for consistent rendering.
 */
function replaceTabs(text: string): string {
	return text.replace(/\t/g, "   ");
}

/**
 * Compute word-level diff and render with inverse on changed parts.
 * Uses diffWords which groups whitespace with adjacent words for cleaner highlighting.
 * Strips leading whitespace from inverse to avoid highlighting indentation.
 */
function renderIntraLineDiff(oldContent: string, newContent: string): { removedLine: string; addedLine: string } {
	const wordDiff = Diff.diffWords(oldContent, newContent);

	let removedLine = "";
	let addedLine = "";
	let isFirstRemoved = true;
	let isFirstAdded = true;

	for (const part of wordDiff) {
		if (part.removed) {
			let value = part.value;
			if (isFirstRemoved) {
				const leadingWhitespace = value.match(/^(\s*)/)?.[1] || "";
				value = value.slice(leadingWhitespace.length);
				removedLine += leadingWhitespace;
				isFirstRemoved = false;
			}
			if (value) {
				removedLine += theme.inverse(value);
			}
		} else if (part.added) {
			let value = part.value;
			if (isFirstAdded) {
				const leadingWhitespace = value.match(/^(\s*)/)?.[1] || "";
				value = value.slice(leadingWhitespace.length);
				addedLine += leadingWhitespace;
				isFirstAdded = false;
			}
			if (value) {
				addedLine += theme.inverse(value);
			}
		} else {
			removedLine += part.value;
			addedLine += part.value;
		}
	}

	return { removedLine, addedLine };
}

export interface RenderDiffOptions {
	/** File path (unused, kept for API compatibility) */
	filePath?: string;
}

export function renderDiff(diffText: string, _options: RenderDiffOptions = {}): string {
	if (!diffText.trim()) {
		return "";
	}

	const lines = diffText.split("\n");
	const result: string[] = [];

	let index = 0;
	while (index < lines.length) {
		const line = lines[index];
		const parsed = parseDiffLine(line);

		if (!parsed) {
			result.push(theme.fg("toolDiffContext", line));
			index++;
			continue;
		}

		if (parsed.prefix === "-") {
			const removedLines: { lineNum: string; content: string }[] = [];
			while (index < lines.length) {
				const current = parseDiffLine(lines[index]);
				if (!current || current.prefix !== "-") break;
				removedLines.push({ lineNum: current.lineNum, content: current.content });
				index++;
			}

			const addedLines: { lineNum: string; content: string }[] = [];
			while (index < lines.length) {
				const current = parseDiffLine(lines[index]);
				if (!current || current.prefix !== "+") break;
				addedLines.push({ lineNum: current.lineNum, content: current.content });
				index++;
			}

			if (removedLines.length === 1 && addedLines.length === 1) {
				const removed = removedLines[0];
				const added = addedLines[0];
				const { removedLine, addedLine } = renderIntraLineDiff(
					replaceTabs(removed.content),
					replaceTabs(added.content),
				);

				result.push(theme.fg("toolDiffRemoved", `-${removed.lineNum} ${removedLine}`));
				result.push(theme.fg("toolDiffAdded", `+${added.lineNum} ${addedLine}`));
				continue;
			}

			for (const removed of removedLines) {
				result.push(theme.fg("toolDiffRemoved", `-${removed.lineNum} ${replaceTabs(removed.content)}`));
			}
			for (const added of addedLines) {
				result.push(theme.fg("toolDiffAdded", `+${added.lineNum} ${replaceTabs(added.content)}`));
			}
			continue;
		}

		if (parsed.prefix === "+") {
			result.push(theme.fg("toolDiffAdded", `+${parsed.lineNum} ${replaceTabs(parsed.content)}`));
			index++;
			continue;
		}

		result.push(theme.fg("toolDiffContext", ` ${parsed.lineNum} ${replaceTabs(parsed.content)}`));
		index++;
	}

	return result.join("\n");
}
