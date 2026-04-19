import {
	Container,
	type Focusable,
	fuzzyFilter,
	getKeybindings,
	Input,
	Spacer,
	Text,
	TruncatedText,
} from "@mariozechner/pi-tui";
import type { Skill } from "../../../core/skills.js";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

interface SkillItem {
	name: string;
	description: string;
	enabled: boolean;
}

export class SkillSelectorComponent extends Container implements Focusable {
	private allItems: SkillItem[];
	private filteredItems: SkillItem[] = [];
	private selectedIndex = 0;
	private searchInput: Input;
	private listContainer: Container;
	private footerText: Text;
	private detailText: Text;
	private maxVisible = 8;

	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	private onConfirmCallback: (disabledNames: string[]) => void;
	private onCancelCallback: () => void;

	constructor(
		allSkills: Skill[],
		disabledNames: string[],
		onConfirm: (disabledNames: string[]) => void,
		onCancel: () => void,
		initialSearch?: string,
	) {
		super();

		this.onConfirmCallback = onConfirm;
		this.onCancelCallback = onCancel;

		const disabledSet = new Set(disabledNames);
		this.allItems = allSkills.map((s) => ({
			name: s.name,
			description: s.description,
			enabled: !disabledSet.has(s.name),
		}));

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("accent", theme.bold("Skill Selector")), 0, 0));
		this.addChild(
			new Text(theme.fg("muted", "Enter = toggle · Ctrl+A = all on · Ctrl+X = all off · Esc = done"), 0, 0),
		);
		this.addChild(new Spacer(1));

		this.searchInput = new Input();
		if (initialSearch) {
			this.searchInput.setValue(initialSearch);
		}
		this.addChild(this.searchInput);
		this.addChild(new Spacer(1));

		this.listContainer = new Container();
		this.addChild(this.listContainer);

		this.addChild(new Spacer(1));
		this.detailText = new Text("", 0, 0);
		this.addChild(this.detailText);

		this.addChild(new Spacer(1));
		this.footerText = new Text(this.getFooterText(), 0, 0);
		this.addChild(this.footerText);
		this.addChild(new DynamicBorder());

		this.refresh();
	}

	private getFooterText(): string {
		const enabledCount = this.allItems.filter((i) => i.enabled).length;
		const total = this.allItems.length;
		return theme.fg("dim", `  ${enabledCount}/${total} active`);
	}

	private refresh(): void {
		const query = this.searchInput.getValue();
		const items = this.allItems;
		this.filteredItems = query ? fuzzyFilter(items, query, (i) => `${i.name} ${i.description}`) : items;
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredItems.length - 1));
		this.updateList();
		this.footerText.setText(this.getFooterText());
		this.updateDetail();
	}

	private updateDetail(): void {
		const item = this.filteredItems[this.selectedIndex];
		if (item) {
			this.detailText.setText(theme.fg("muted", `  ${item.description}`));
		} else {
			this.detailText.setText("");
		}
	}

	private updateList(): void {
		this.listContainer.clear();

		if (this.filteredItems.length === 0) {
			this.listContainer.addChild(new Text(theme.fg("muted", "  No matching skills"), 0, 0));
			return;
		}

		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), this.filteredItems.length - this.maxVisible),
		);
		const endIndex = Math.min(startIndex + this.maxVisible, this.filteredItems.length);

		for (let i = startIndex; i < endIndex; i++) {
			const item = this.filteredItems[i]!;
			const isSelected = i === this.selectedIndex;
			const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
			const checkbox = item.enabled ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
			const nameText = isSelected ? theme.fg("accent", item.name) : item.name;
			const descSnippet = theme.fg("dim", ` — ${item.description}`);
			this.listContainer.addChild(new TruncatedText(`${prefix}${checkbox} ${nameText}${descSnippet}`, 0, 0));
		}

		if (startIndex > 0 || endIndex < this.filteredItems.length) {
			this.listContainer.addChild(
				new Text(theme.fg("muted", `  (${this.selectedIndex + 1}/${this.filteredItems.length})`), 0, 0),
			);
		}
	}

	private getDisabledNames(): string[] {
		return this.allItems.filter((i) => !i.enabled).map((i) => i.name);
	}

	handleInput(data: string): void {
		const kb = getKeybindings();

		if (kb.matches(data, "tui.select.up")) {
			if (this.filteredItems.length === 0) return;
			this.selectedIndex = this.selectedIndex === 0 ? this.filteredItems.length - 1 : this.selectedIndex - 1;
			this.updateList();
			this.updateDetail();
			return;
		}

		if (kb.matches(data, "tui.select.down")) {
			if (this.filteredItems.length === 0) return;
			this.selectedIndex = this.selectedIndex === this.filteredItems.length - 1 ? 0 : this.selectedIndex + 1;
			this.updateList();
			this.updateDetail();
			return;
		}

		if (kb.matches(data, "tui.select.confirm")) {
			const item = this.filteredItems[this.selectedIndex];
			if (item) {
				const allItem = this.allItems.find((i) => i.name === item.name);
				if (allItem) {
					allItem.enabled = !allItem.enabled;
					this.onConfirmCallback(this.getDisabledNames());
					this.refresh();
				}
			}
			return;
		}

		if (kb.matches(data, "tui.select.cancel")) {
			this.onCancelCallback();
			return;
		}

		if (kb.matches(data, "app.skills.enableAll")) {
			const query = this.searchInput.getValue();
			const targets = query ? this.filteredItems.map((i) => i.name) : null;
			for (const item of this.allItems) {
				if (targets === null || targets.includes(item.name)) {
					item.enabled = true;
				}
			}
			this.onConfirmCallback(this.getDisabledNames());
			this.refresh();
			return;
		}

		if (kb.matches(data, "app.skills.disableAll")) {
			const query = this.searchInput.getValue();
			const targets = query ? this.filteredItems.map((i) => i.name) : null;
			for (const item of this.allItems) {
				if (targets === null || targets.includes(item.name)) {
					item.enabled = false;
				}
			}
			this.onConfirmCallback(this.getDisabledNames());
			this.refresh();
			return;
		}

		this.searchInput.handleInput(data);
		this.refresh();
	}
}
