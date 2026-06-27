import { cn, scoreTone } from "@/lib/utils";

export function ScorePill({ score }: { score: number }) {
  const tone = scoreTone(score);

  return (
    <span
      className={cn(
        "inline-flex min-w-14 items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold",
        tone === "strong" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "good" && "border-blue-200 bg-blue-50 text-blue-700",
        tone === "medium" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "low" && "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      {score}
    </span>
  );
}
