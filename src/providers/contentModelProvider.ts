import { minimaxProvider, type MinimaxProvider } from "@/providers/minimaxProvider";
import { qwenProvider } from "@/providers/qwenProvider";

export type ContentModelName = "qwen" | "minimax";

export function contentModelStatus() {
  const selected = selectedContentModelName();
  const provider = selected === "qwen" ? qwenProvider : minimaxProvider;

  return {
    selected,
    provider: provider.name,
    mode: provider.mode,
    configured: provider.isConfigured,
    qwen: {
      mode: qwenProvider.mode,
      configured: qwenProvider.isConfigured
    },
    minimax: {
      mode: minimaxProvider.mode,
      configured: minimaxProvider.isConfigured
    }
  };
}

function selectedContentModelName(): ContentModelName {
  const explicit = process.env.CONTENT_MODEL_PROVIDER?.trim().toLowerCase();
  if (explicit === "qwen" || explicit === "minimax") return explicit;
  if (process.env.QWEN_REAL_MODE === "true") return "qwen";
  return "minimax";
}

export const contentModelProvider: MinimaxProvider =
  selectedContentModelName() === "qwen" ? qwenProvider : minimaxProvider;

