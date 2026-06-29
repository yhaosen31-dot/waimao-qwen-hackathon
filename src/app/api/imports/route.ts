import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import {
  createImportJob,
  saveColumnMapping,
  saveImportRows,
  updateImportJob
} from "@/repositories/store";
import { dataStoreStatus } from "@/repositories/storeConfig";
import {
  getDefaultOrganizationStorageId,
  toStorageSafeFileName,
  uploadImportFileToSupabase
} from "@/lib/supabase/storage";
import { dedupeImportRows } from "@/services/companyDedupService";
import {
  detectColumnMapping,
  mapSpreadsheetRows,
  parseSpreadsheetFile
} from "@/services/excelImportService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadsDir = path.join(process.cwd(), "data", "imports");

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import uploaded file.";
    console.error("imports.post.failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePost(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing Excel or CSV file." }, { status: 400 });
  }

  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload .xlsx, .xls, or .csv." },
      { status: 400 }
    );
  }

  const importJobId = `import_job_${nanoid(10)}`;
  const safeFileName = toStorageSafeFileName(file.name);
  const filePath = path.join(uploadsDir, `${importJobId}-${safeFileName}`);
  const buffer = new Uint8Array(await file.arrayBuffer());
  let storedFilePath = filePath;

  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(filePath, buffer);

  if (dataStoreStatus().activeProvider === "supabase") {
    const organization = await getDefaultOrganizationStorageId();

    if (!organization.ok || !organization.organizationId) {
      return NextResponse.json(
        { error: organization.error ?? "Failed to prepare Supabase organization." },
        { status: 500 }
      );
    }

    const upload = await uploadImportFileToSupabase({
      organizationId: organization.organizationId,
      importJobId,
      fileName: safeFileName,
      body: Buffer.from(buffer),
      contentType: file.type || undefined
    });

    if (!upload.ok || !upload.path) {
      return NextResponse.json(
        { error: upload.error ?? "Failed to upload import file to Supabase Storage." },
        { status: 500 }
      );
    }

    storedFilePath = upload.path;
  }

  let importJob = await createImportJob({
    id: importJobId,
    fileName: file.name,
    filePath: storedFilePath,
    status: "uploaded",
    totalRows: 0,
    parsedRows: 0,
    companyCount: 0,
    dedupedCompanyCount: 0,
    missingCompanyNameCount: 0
  });

  try {
    const parsedSpreadsheet = await parseSpreadsheetFile(file.name, buffer);
    const mapping = detectColumnMapping(importJob.id, parsedSpreadsheet.headers);
    const mappedRows = mapSpreadsheetRows(importJob.id, parsedSpreadsheet.rows, mapping);
    const deduped = dedupeImportRows(mappedRows);

    await saveColumnMapping(mapping);
    await saveImportRows(importJob.id, deduped.rows);
    importJob = await updateImportJob(importJob.id, {
      status: "parsed",
      totalRows: parsedSpreadsheet.totalRows,
      parsedRows: deduped.stats.parsedRows,
      companyCount: deduped.stats.companyCount,
      dedupedCompanyCount: deduped.stats.dedupedCompanyCount,
      missingCompanyNameCount: deduped.stats.missingCompanyNameCount,
      errorMessage: undefined
    });

    return NextResponse.json({
      ok: true,
      importJobId: importJob.id,
      stats: {
        totalRows: importJob.totalRows,
        companyCount: importJob.companyCount,
        dedupedCompanyCount: importJob.dedupedCompanyCount,
        missingCompanyNameCount: importJob.missingCompanyNameCount
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse uploaded file.";
    await updateImportJob(importJob.id, {
      status: "failed",
      errorMessage: message
    });

    return NextResponse.json({ error: message, importJobId: importJob.id }, { status: 400 });
  }
}
