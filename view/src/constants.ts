import type { ModelGroup, ModelOption, ReasoningLevel } from "./types.ts";

export const AVAILABLE_MODELS: ModelGroup[] = [
  {
    interface: "claude",
    label: "Claude",
    models: [
      { id: "claude-opus-4-6", label: "Opus 4.6", interface: "claude" },
      { id: "claude-sonnet-4-5", label: "Sonnet 4.5", interface: "claude" },
      { id: "claude-haiku-4-5", label: "Haiku 4.5", interface: "claude" },
    ],
  },
  {
    interface: "codex",
    label: "Codex",
    models: [
      { id: "gpt-5.3-codex", label: "GPT-5.3-Codex", interface: "codex" },
      { id: "gpt-5.2-codex", label: "GPT-5.2-Codex", interface: "codex" },
      { id: "gpt-5.1-codex-max", label: "GPT-5.1-Codex-Max", interface: "codex" },
      { id: "gpt-5.2", label: "GPT-5.2", interface: "codex" },
      { id: "gpt-5.1-codex-mini", label: "GPT-5.1-Codex-Mini", interface: "codex" },
    ],
  },
];

export const ALL_MODELS: ModelOption[] = AVAILABLE_MODELS.flatMap((g) => g.models);

export const DEFAULT_CLI = "claude";
export const DEFAULT_MODEL_ID = "claude-opus-4-6";

export const REASONING_LEVELS: { id: ReasoningLevel; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "extra_high", label: "Extra High" },
];

export const DEFAULT_REASONING_LEVEL: ReasoningLevel = "high";

