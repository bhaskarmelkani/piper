import type { Api, Model } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPILOT_MODEL_VISIBILITY_ADAPTER, fetchCopilotModelPolicies } from "../src/utils/copilot-model-policies.js";

const copilotModel: Model<Api> = {
	id: "gpt-4.1",
	name: "GPT 4.1",
	api: "openai-responses",
	provider: "github-copilot",
	baseUrl: "https://copilot.example.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128000,
	maxTokens: 4096,
};

const unknownCopilotModel: Model<Api> = {
	...copilotModel,
	id: "retired-preview-model",
	name: "Retired Preview Model",
};

describe("Copilot model policies", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("parses a successful /models response into Copilot model policies", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					data: [
						{ id: "gpt-4.1", premium_requests_multiplier: 0, is_disabled: false },
						{ id: "claude-sonnet-4.6", premium_requests_multiplier: 1, is_disabled: false },
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);

		const policies = await fetchCopilotModelPolicies("token", "https://copilot.example.test");

		expect(fetchSpy).toHaveBeenCalledWith(
			"https://copilot.example.test/models",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer token",
					Accept: "application/json",
				}),
			}),
		);
		expect(policies).toEqual(
			new Map([
				["gpt-4.1", { multiplier: 0, disabled: false }],
				["claude-sonnet-4.6", { multiplier: 1, disabled: false }],
			]),
		);
	});

	it("builds authoritative visible-model state from a successful Copilot response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					data: [
						{ id: "gpt-4.1", premium_requests_multiplier: 0, is_disabled: false },
						{ id: "gpt-5.2", premium_requests_multiplier: 1, is_disabled: true },
						{ id: "retired-preview-model", is_disabled: false },
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);

		const state = await COPILOT_MODEL_VISIBILITY_ADAPTER.refresh({
			provider: "github-copilot",
			models: [copilotModel],
			context: {
				hasConfiguredAuth: () => true,
				getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "token" }),
			},
		});

		expect(state?.visibleModelIds).toEqual(new Set(["gpt-4.1"]));
		expect(state?.metadata).toEqual(
			new Map([
				["gpt-4.1", { multiplier: 0, disabled: false }],
				["gpt-5.2", { multiplier: 1, disabled: true }],
				["retired-preview-model", { multiplier: undefined, disabled: false }],
			]),
		);
	});

	it("falls back to static known Copilot models when the policy fetch fails", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

		const state = await COPILOT_MODEL_VISIBILITY_ADAPTER.refresh({
			provider: "github-copilot",
			models: [copilotModel, unknownCopilotModel],
			context: {
				hasConfiguredAuth: () => true,
				getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "token" }),
			},
		});

		expect(state?.visibleModelIds).toEqual(new Set(["gpt-4.1"]));
		expect(state?.metadata).toEqual(new Map([["gpt-4.1", { multiplier: 0, disabled: false }]]));
	});
});
