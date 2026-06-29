import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  createRun,
  getImportJobResults,
  saveCompanies,
  saveEvidence,
  updateImportJob,
  updateImportRowsStatus,
  updateRun,
  updateRunStep
} from "@/repositories/store";
import { buildRawDataSummary } from "@/services/companyNormalizeService";
import type { SaveCompanyInput, SaveEvidenceInput } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const results = await getImportJobResults(id);

  if (!results) {
    return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  }

  const candidateRows = results.rows.filter((row) =>
    ["ready", "needs_review", "imported"].includes(row.status)
  );

  if (results.companies.length > 0) {
    return NextResponse.json({
      ok: true,
      imported: results.companies.length,
      runId: results.importJob.runId ?? results.companies[0]?.runId,
      message: "This import job has already been confirmed."
    });
  }

  if (candidateRows.length === 0) {
    return NextResponse.json(
      { error: "No deduped company rows are ready to import." },
      { status: 400 }
    );
  }

  const run = await createRun({
    productInput: `Excel import: ${results.importJob.fileName}`,
    normalizedProduct: "excel import",
    targetCustomerCount: candidateRows.length,
    metadata: {
      graph: "ExcelImportGraph",
      mode: "excel_import",
      importJobId: id,
      sourceFileName: results.importJob.fileName,
      externalApiCalls: 0,
      browserAutomation: false
    }
  });

  await Promise.all([
    updateRunStep(run.id, "normalizeInput", {
      status: "completed",
      summary: `Parsed ${results.importJob.totalRows} uploaded rows.`
    }),
    updateRunStep(run.id, "generateKeywords", {
      status: "skipped",
      summary: "Excel import does not generate product keywords in this stage."
    }),
    updateRunStep(run.id, "humanApproveKeywords", {
      status: "skipped",
      summary: "Keyword review is skipped for Excel import."
    }),
    updateRunStep(run.id, "searchCustomersByProduct", {
      status: "skipped",
      summary: "Product search is skipped; uploaded rows are the source."
    }),
    updateRunStep(run.id, "extractCompanyDetails", {
      status: "completed",
      summary: `Saved ${candidateRows.length} deduped companies as imported candidates.`
    })
  ]);

  const companyIdsByRowId = new Map(candidateRows.map((row) => [row.id, `company_${nanoid(10)}`]));
  const evidenceIdsByRowId = new Map(
    candidateRows.map((row) => [row.id, stableEvidenceId(id, row.id)])
  );
  const evidenceInputs = candidateRows.map<SaveEvidenceInput>((row) => ({
    id: evidenceIdsByRowId.get(row.id),
    companyId: companyIdsByRowId.get(row.id),
    provider: "excel_import",
    type: "excel_import",
    source: "uploaded_excel",
    title: `${row.companyName ?? "Imported company"} Excel row`,
    rawText: buildRawDataSummary(row.rawData),
    confidence: 0.8,
    raw: {
      importJobId: id,
      rowIndex: row.rowIndex,
      rawData: row.rawData
    }
  }));
  const companyInputs = candidateRows.map<SaveCompanyInput>((row) => ({
    id: companyIdsByRowId.get(row.id),
    name: row.companyName ?? "",
    normalizedName: row.normalizedCompanyName,
    country: row.country,
    products: row.productDescription ? [row.productDescription] : [],
    productDescription: row.productDescription,
    transactionSummary: row.transactionSummary,
    importerProfile:
      row.transactionSummary || row.productDescription || "Imported candidate from uploaded Excel.",
    sourceKeyword: row.sourceKeyword,
    source: "excel_import",
    importJobId: id,
    status: "imported_candidate",
    enrichmentStatus: "pending",
    websiteStatus: "not_started",
    contactStatus: "not_started",
    contactConfidence: 0,
    buyerFitScore: 0,
    buyerFitReasons: [
      "Imported from uploaded Excel/CSV file.",
      row.status === "needs_review"
        ? "Same normalized company appears under more than one country and needs review."
        : "Deduped by normalized company name and country."
    ],
    evidenceIds: [evidenceIdsByRowId.get(row.id)].filter(Boolean) as string[]
  }));

  const companies = await saveCompanies(run.id, companyInputs);
  await Promise.all([
    saveEvidence(run.id, evidenceInputs),
    updateImportRowsStatus(
      id,
      candidateRows.map((row) => row.id),
      "imported"
    )
  ]);
  await Promise.all([
    updateImportJob(id, {
      status: "imported",
      runId: run.id
    }),
    updateRun(run.id, {
      status: "completed",
      currentStep: "extractCompanyDetails"
    })
  ]);

  return NextResponse.json({
    ok: true,
    imported: companies.length,
    runId: run.id,
    message: "Imported candidates were saved to companies."
  });
}

function stableEvidenceId(importJobId: string, rowId: string) {
  const digest = createHash("sha1").update(`${importJobId}:${rowId}`).digest("hex").slice(0, 16);
  return `evidence_${digest}`;
}
