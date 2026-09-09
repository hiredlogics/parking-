import type {
  GenerationContext,
  GeneratorOutput,
} from "@/lib/questions/generated";

export interface QuestionProviderResult {
  output: GeneratorOutput | null;
  providerId: string;
  model: string | null;
  promptVersion: string | null;
  /** Set when the provider could not produce usable output. */
  error?: string;
}

export interface QuestionProvider {
  readonly id: string;
  /** False for the bank-backed provider, which cannot phrase per case. */
  readonly bespoke: boolean;
  generate(context: GenerationContext): Promise<QuestionProviderResult>;
}
