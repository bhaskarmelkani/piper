import assert from "node:assert";
import { describe, it } from "node:test";
import { Viewport } from "../src/components/viewport.js";

describe("Viewport", () => {
	it("clips transcript content inside a bottom-anchored viewport", () => {
		const viewport = new Viewport(
			{
				render: () => ["1", "2", "3", "4", "5", "6"],
				invalidate: () => {},
			},
			{ height: 3, anchor: "bottom" },
		);

		assert.deepStrictEqual(viewport.render(80), ["4", "5", "6"]);

		viewport.setScrollOffset(2);

		assert.deepStrictEqual(viewport.render(80), ["2", "3", "4"]);
		assert.strictEqual(viewport.getMaxScrollOffset(), 3);
	});

	it("recomputes content height when the render width changes", () => {
		const viewport = new Viewport(
			{
				render: (width: number) => (width < 10 ? ["one", "two", "three"] : ["wide"]),
				invalidate: () => {},
			},
			{ height: 2 },
		);

		assert.deepStrictEqual(viewport.render(8), ["one", "two"]);
		assert.strictEqual(viewport.getContentHeight(), 3);
		assert.strictEqual(viewport.getMaxScrollOffset(), 1);

		assert.deepStrictEqual(viewport.render(20), ["wide", ""]);
		assert.strictEqual(viewport.getContentHeight(), 1);
		assert.strictEqual(viewport.getMaxScrollOffset(), 0);
	});

	it("recomputes content height when the viewport height changes", () => {
		const viewport = new Viewport(
			{
				render: () => ["one", "two", "three", "four"],
				invalidate: () => {},
			},
			{ height: 3 },
		);

		assert.deepStrictEqual(viewport.render(20), ["one", "two", "three"]);
		assert.strictEqual(viewport.getMaxScrollOffset(), 1);

		viewport.setHeight(2);

		assert.deepStrictEqual(viewport.render(20), ["one", "two"]);
		assert.strictEqual(viewport.getContentHeight(), 4);
		assert.strictEqual(viewport.getMaxScrollOffset(), 2);
	});
});
