/**
 * Live per-call model resolution + transport-failure-only fallback.
 *
 * Wraps every real provider call so that:
 *   1. the model actually used is resolved live (DB ai_model_config, if
 *      configured, else the existing env/default chain) — never fixed
 *      at provider-construction time, so an admin edit takes effect on
 *      the next call, not the next deploy;
 *   2. if the primary model exhausts withTransientRetry's budget with a
 *      genuine transport failure (TransportError), and a fallback model
 *      is configured, it is tried exactly once more with the same retry
 *      policy. A content/validation rejection is never a TransportError,
 *      so it can never trigger this path.
 */
import { withTransientRetry, TransportError, type RetryOptions } from "./transport";
import { resolveModel } from "@/lib/ai/modelConfig";
import type { AiOperation } from "./models";

export interface ModelCallResult<T> {
  result: T;
  model: string;
  usedFallback: boolean;
}

export async function callWithModelFallback<T>(
  operation: AiOperation,
  run: (model: string) => Promise<T>,
  retryOptions?: Omit<RetryOptions, "operation">,
): Promise<ModelCallResult<T>> {
  const resolved = await resolveModel(operation);
  try {
    const result = await withTransientRetry(() => run(resolved.model), {
      operation,
      ...retryOptions,
    });
    return { result, model: resolved.model, usedFallback: false };
  } catch (err) {
    if (
      err instanceof TransportError &&
      resolved.fallbackModel &&
      resolved.fallbackModel !== resolved.model
    ) {
      console.warn(
        `[ai/${operation}] primary model "${resolved.model}" failed on a transport error after retry; trying fallback model "${resolved.fallbackModel}" once.`,
      );
      const fallbackModel = resolved.fallbackModel;
      const result = await withTransientRetry(() => run(fallbackModel), {
        operation,
        ...retryOptions,
      });
      return { result, model: fallbackModel, usedFallback: true };
    }
    throw err;
  }
}
