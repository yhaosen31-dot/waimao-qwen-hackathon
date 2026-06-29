"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SearchMode, SearchProviderName } from "@/types";

type ProviderPriority = Exclude<SearchProviderName, "mock">;

const defaultTargetCountries = ["美国", "德国", "墨西哥"];
const defaultExcludedCountries = ["中国", "俄罗斯", "伊朗"];
const commonCountries = ["美国", "德国", "墨西哥", "加拿大", "巴西", "秘鲁", "哥伦比亚", "智利", "英国", "澳大利亚"];

export function NewRunForm() {
  const router = useRouter();
  const [productInput, setProductInput] = useState("diaphragm accumulator");
  const [targetCustomerCount, setTargetCustomerCount] = useState(20);
  const [targetCountries, setTargetCountries] = useState(defaultTargetCountries);
  const [excludedCountries, setExcludedCountries] = useState(defaultExcludedCountries);
  const [searchMode, setSearchMode] = useState<SearchMode>("economy");
  const [providerPriority, setProviderPriority] = useState<ProviderPriority>("exa");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/runs/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productInput,
          targetCount: targetCustomerCount,
          targetCountries,
          excludedCountries,
          searchMode,
          providerPriority
        })
      });

      if (!response.ok) throw new Error("启动获客任务失败。");

      const data = (await response.json()) as { runId: string };
      router.push(`/runs/${data.runId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "出现未知错误。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid grid-cols-[112px_1fr] items-center gap-3">
        <Label className="whitespace-nowrap text-sm text-slate-700" htmlFor="productInput">
          产品名称
        </Label>
        <Input
          className="h-10 rounded-lg border-slate-200 bg-white text-sm"
          id="productInput"
          value={productInput}
          onChange={(event) => setProductInput(event.target.value)}
          placeholder="隔膜式蓄能器 / diaphragm accumulator"
        />
      </div>

      <div className="grid grid-cols-[112px_1fr] items-center gap-3">
        <Label className="whitespace-nowrap text-sm text-slate-700" htmlFor="targetCustomerCount">
          目标客户数量
        </Label>
        <Input
          className="h-10 rounded-lg border-slate-200 bg-white text-sm"
          id="targetCustomerCount"
          min={1}
          max={50}
          type="number"
          value={targetCustomerCount}
          onChange={(event) => setTargetCustomerCount(Number(event.target.value))}
        />
      </div>

      <CountryTagInput
        label="目标国家"
        values={targetCountries}
        onChange={setTargetCountries}
        placeholder="输入国家，回车添加"
      />
      <CountryTagInput
        label="排除国家"
        values={excludedCountries}
        onChange={setExcludedCountries}
        placeholder="输入不想搜索的国家"
      />

      <SelectRow
        label="搜索模式"
        value={searchMode}
        onChange={(value) => setSearchMode(value as SearchMode)}
        options={[
          { value: "economy", label: "economy：内测推荐，速度快，只用首选" },
          { value: "fallback", label: "fallback：结果差时切换，较慢" },
          { value: "deep_verify", label: "deep_verify：最多两个源验证" }
        ]}
      />
      <SelectRow
        label="优先搜索源"
        value={providerPriority}
        onChange={(value) => setProviderPriority(value as ProviderPriority)}
        options={[
          { value: "exa", label: "EXA" },
          { value: "tavily", label: "Tavily" },
          { value: "you", label: "YOU" }
        ]}
      />

      <ToggleRow checked label="生成开发信草稿" />
      <DisabledMailRow />

      <Button
        className="h-11 w-full rounded-lg bg-blue-600 text-sm font-semibold shadow-sm shadow-blue-200 hover:bg-blue-700"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        启动获客任务
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

function CountryTagInput({
  label,
  values,
  onChange,
  placeholder
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function addCountries(rawValue = draft) {
    const incoming = rawValue
      .split(/[,，;；\n]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (incoming.length === 0) return;

    const next = Array.from(new Set([...values, ...incoming])).slice(0, 20);
    onChange(next);
    setDraft("");
  }

  function removeCountry(value: string) {
    onChange(values.filter((item) => item !== value));
  }

  return (
    <div className="grid grid-cols-[112px_1fr] items-start gap-3">
      <div className="pt-2 text-sm text-slate-700">{label}</div>
      <div className="space-y-2">
        <div className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {values.map((value) => (
              <span
                className="inline-flex h-6 items-center gap-1 rounded-md bg-blue-50 px-2 text-xs text-blue-700"
                key={value}
              >
                {value}
                <button
                  aria-label={`删除 ${value}`}
                  className="rounded-sm text-blue-400 hover:bg-blue-100 hover:text-blue-700"
                  onClick={() => removeCountry(value)}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              className="h-7 min-w-32 flex-1 border-0 bg-transparent px-1 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              value={draft}
              onBlur={() => addCountries()}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addCountries();
                }
                if (event.key === "Backspace" && !draft && values.length > 0) {
                  removeCountry(values[values.length - 1]);
                }
              }}
              placeholder={values.length === 0 ? placeholder : ""}
            />
          </div>
          <button
            aria-label={`添加${label}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => addCountries()}
            type="button"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {commonCountries
            .filter((country) => !values.includes(country))
            .slice(0, 8)
            .map((country) => (
              <button
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                key={country}
                onClick={() => onChange(Array.from(new Set([...values, country])).slice(0, 20))}
                type="button"
              >
                {country}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-center gap-3">
      <Label className="whitespace-nowrap text-sm text-slate-700">{label}</Label>
      <select
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleRow({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-center gap-3">
      <div className="whitespace-nowrap text-sm text-slate-700">{label}</div>
      <label className="relative inline-flex w-fit cursor-pointer items-center">
        <input className="peer sr-only" defaultChecked={checked} type="checkbox" />
        <span
          className={cn(
            "h-5 w-9 rounded-full bg-slate-200 transition-colors peer-checked:bg-blue-600",
            "after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
          )}
        />
      </label>
    </div>
  );
}

function DisabledMailRow() {
  return (
    <div className="grid grid-cols-[112px_1fr] items-center gap-3">
      <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-slate-700">
        真实发送邮件
        <Info className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <span className="w-fit rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
        已关闭
      </span>
    </div>
  );
}
