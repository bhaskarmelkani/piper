import type { Api, Model } from "@mariozechner/pi-ai";

export type ModelVisibilityAdapterAuth = {
	ok: boolean;
	apiKey?: string;
};

export interface ModelVisibilityAdapterContext {
	hasConfiguredAuth(model: Model<Api>): boolean;
	getApiKeyAndHeaders(model: Model<Api>): Promise<ModelVisibilityAdapterAuth>;
}

export interface ProviderModelVisibilityState<TMetadata = unknown> {
	visibleModelIds: ReadonlySet<string>;
	metadata?: ReadonlyMap<string, TMetadata>;
}

export interface ProviderModelVisibilityAdapter<TMetadata = unknown> {
	refresh(args: {
		provider: string;
		models: readonly Model<Api>[];
		context: ModelVisibilityAdapterContext;
	}): Promise<ProviderModelVisibilityState<TMetadata> | undefined>;
}
