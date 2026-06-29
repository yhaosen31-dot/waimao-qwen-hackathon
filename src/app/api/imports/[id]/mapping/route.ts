import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getImportJob,
  getImportRows,
  saveColumnMapping,
  saveImportRows,
  updateImportJob
} from "@/repositories/store";
import { dedupeImportRows } from "@/services/companyDedupService";
import { mapSpreadsheetRows } from "@/services/excelImportService";
import type { ColumnMapping } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mappingSchema = z.object({
  companyNameColumn: z.string().optional(),
  countryColumn: z.string().optional(),
  productDescriptionColumn: z.string().optional(),
  transactionSummaryColumn: z.string().optional(),
  sourceKeywordColumn: z.string().optional()
});

interface Context {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const importJob = await getImportJob(id);

  if (!importJob) {
    return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  }

  const payload = mappingSchema.parse(await request.json());
  const mapping: ColumnMapping = {
    importJobId: id,
    companyNameColumn: emptyToUndefined(payload.companyNameColumn),
    countryColumn: emptyToUndefined(payload.countryColumn),
    productDescriptionColumn: emptyToUndefined(payload.productDescriptionColumn),
    transactionSummaryColumn: emptyToUndefined(payload.transactionSummaryColumn),
    sourceKeywordColumn: emptyToUndefined(payload.sourceKeywordColumn)
  };
  const currentRows = await getImportRows(id);
  const spreadsheetRows = currentRows.map((row) => ({
    rowIndex: row.rowIndex,
    rawData: row.rawData
  }));
  const mappedRows = mapSpreadsheetRows(id, spreadsheetRows, mapping);
  const deduped = dedupeImportRows(mappedRows);

  await saveColumnMapping(mapping);
  await saveImportRows(id, deduped.rows);
  const nextJob = await updateImportJob(id, {
    status: "mapped",
    parsedRows: deduped.stats.parsedRows,
    companyCount: deduped.stats.companyCount,
    dedupedCompanyCount: deduped.stats.dedupedCompanyCount,
    missingCompanyNameCount: deduped.stats.missingCompanyNameCount,
    errorMessage: undefined
  });

  return NextResponse.json({
    ok: true,
    importJobId: id,
    stats: {
      totalRows: nextJob.totalRows,
      companyCount: nextJob.companyCount,
      dedupedCompanyCount: nextJob.dedupedCompanyCount,
      missingCompanyNameCount: nextJob.missingCompanyNameCount
    }
  });
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
