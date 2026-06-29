import type { ImportRow } from "@/types";
import { normalizeCompanyNameForDedupe, normalizeCountry } from "@/services/companyNormalizeService";

export interface ImportDedupStats {
  totalRows: number;
  parsedRows: number;
  companyCount: number;
  dedupedCompanyCount: number;
  missingCompanyNameCount: number;
}

export interface ImportDedupResult {
  rows: ImportRow[];
  stats: ImportDedupStats;
}

export function dedupeImportRows(rows: ImportRow[]): ImportDedupResult {
  const seenByCompanyAndCountry = new Set<string>();
  const countriesByCompany = new Map<string, Set<string>>();
  let companyCount = 0;
  let dedupedCompanyCount = 0;
  let missingCompanyNameCount = 0;

  const nextRows = rows.map((row) => {
    const companyName = row.companyName?.trim() ?? "";
    if (!companyName) {
      missingCompanyNameCount += 1;
      return {
        ...row,
        status: "missing_company" as const
      };
    }

    companyCount += 1;
    const dedupeName = normalizeCompanyNameForDedupe(companyName);
    const country = normalizeCountry(row.country).toUpperCase();
    const countryKey = country || "__NO_COUNTRY__";
    const scopedKey = `${dedupeName}|${countryKey}`;
    const countries = countriesByCompany.get(dedupeName) ?? new Set<string>();

    if (seenByCompanyAndCountry.has(scopedKey)) {
      return {
        ...row,
        status: "duplicate" as const
      };
    }

    seenByCompanyAndCountry.add(scopedKey);
    dedupedCompanyCount += 1;

    const hasDifferentCountry =
      country.length > 0 &&
      Array.from(countries).some((existingCountry) => existingCountry && existingCountry !== country);
    countries.add(country);
    countriesByCompany.set(dedupeName, countries);

    return {
      ...row,
      status: hasDifferentCountry ? ("needs_review" as const) : ("ready" as const)
    };
  });

  return {
    rows: nextRows,
    stats: {
      totalRows: rows.length,
      parsedRows: rows.length,
      companyCount,
      dedupedCompanyCount,
      missingCompanyNameCount
    }
  };
}
