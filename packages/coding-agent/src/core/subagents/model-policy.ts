import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";

export type BuiltInSubagentRole = "scout" | "planner" | "reviewer" | "worker";

export interface ResolvedSubagentModel {
	model: Model<Api>;
	thinkingLevel: ThinkingLevel;
}

function familyKey(model: Model<Api>): string {
	const source = `${model.provider}/${model.id}`.toLowerCase();
	return source
		.replace(/\b(mini|nano|small|haiku|flash|lite|fast|turbo|preview|latest)\b/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.split(/\s+/)
		.slice(0, 3)
		.join(" ");
}

function totalCost(model: Model<Api>): number {
	return model.cost.input + model.cost.output + model.cost.cacheRead + model.cost.cacheWrite;
}

function keywordRank(role: BuiltInSubagentRole, model: Model<Api>): number {
	const haystack = `${model.id} ${model.name}`.toLowerCase();
	if (role === "scout") {
		if (/\b(nano|mini|small|haiku|flash|lite|fast)\b/.test(haystack)) return 0;
		if (/\b(sonnet|medium|pro|gpt-5|gpt-4\.1|opus|o4)\b/.test(haystack)) return 2;
		return 1;
	}
	if (role === "planner" || role === "reviewer") {
		if (/\b(sonnet|medium|pro|gpt-5|gpt-4\.1|o4-mini|o3|reasoning)\b/.test(haystack)) return 0;
		if (/\b(nano|mini|small|haiku|flash|lite|fast)\b/.test(haystack)) return 2;
		return 1;
	}
	return 0;
}

function sameFamily(a: Model<Api>, b: Model<Api>): boolean {
	return familyKey(a) === familyKey(b);
}

function compareCandidates(
	role: BuiltInSubagentRole,
	current: Model<Api>,
	left: Model<Api>,
	right: Model<Api>,
): number {
	if (role === "scout") {
		const leftKeyword = keywordRank(role, left);
		const rightKeyword = keywordRank(role, right);
		if (leftKeyword !== rightKeyword) return leftKeyword - rightKeyword;

		const leftReasoningPenalty = Number(left.reasoning);
		const rightReasoningPenalty = Number(right.reasoning);
		if (leftReasoningPenalty !== rightReasoningPenalty) return leftReasoningPenalty - rightReasoningPenalty;

		const leftCost = totalCost(left);
		const rightCost = totalCost(right);
		if (leftCost !== rightCost) return leftCost - rightCost;
	}

	const leftSameFamily = sameFamily(current, left) ? 0 : 1;
	const rightSameFamily = sameFamily(current, right) ? 0 : 1;
	if (leftSameFamily !== rightSameFamily) return leftSameFamily - rightSameFamily;

	const leftKeyword = keywordRank(role, left);
	const rightKeyword = keywordRank(role, right);
	if (leftKeyword !== rightKeyword) return leftKeyword - rightKeyword;

	const leftReasoningPenalty = role === "scout" ? Number(left.reasoning) : Number(!left.reasoning);
	const rightReasoningPenalty = role === "scout" ? Number(right.reasoning) : Number(!right.reasoning);
	if (leftReasoningPenalty !== rightReasoningPenalty) return leftReasoningPenalty - rightReasoningPenalty;

	const leftCost = totalCost(left);
	const rightCost = totalCost(right);
	if (leftCost !== rightCost) {
		return role === "scout" ? leftCost - rightCost : rightCost - leftCost;
	}

	return `${left.provider}/${left.id}`.localeCompare(`${right.provider}/${right.id}`);
}

export function resolveSubagentModel(
	role: BuiltInSubagentRole,
	currentModel: Model<Api>,
	currentThinkingLevel: ThinkingLevel,
	models: Model<Api>[],
): ResolvedSubagentModel {
	if (role === "worker") {
		return { model: currentModel, thinkingLevel: currentThinkingLevel };
	}

	const providerModels = models.filter(
		(model) => model.provider === currentModel.provider && model.input.includes("text"),
	);
	if (providerModels.length === 0) {
		return {
			model: currentModel,
			thinkingLevel: role === "scout" ? "off" : currentThinkingLevel,
		};
	}

	const candidates = [...providerModels].sort((left, right) => compareCandidates(role, currentModel, left, right));
	const model = candidates[0] ?? currentModel;

	if (role === "scout") {
		return {
			model,
			thinkingLevel: model.reasoning ? "minimal" : "off",
		};
	}

	return {
		model,
		thinkingLevel: model.reasoning ? "medium" : "off",
	};
}
