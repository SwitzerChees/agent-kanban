interface PrimeExtensionAPI {
	on(
		event: "tool_call",
		handler: (event: unknown) => { block: true; reason: string } | undefined,
	): void;
}

export const PRIME_REFINEMENT_MAX_TOOL_CALLS = 16;

/**
 * Refinements need repository evidence, but Qwen can otherwise keep opening
 * files until Prime Agent reaches its internal tool-turn/compaction boundary
 * and exits successfully without ever emitting the required final JSON.
 */
export default function refinementToolBudget(pi: PrimeExtensionAPI): void {
	let toolCalls = 0;
	pi.on("tool_call", () => {
		toolCalls += 1;
		if (toolCalls <= PRIME_REFINEMENT_MAX_TOOL_CALLS) return;

		return {
			block: true,
			reason: "Repository inspection budget reached. Stop calling tools and return the required final JSON object now using the evidence already collected.",
		};
	});
}
