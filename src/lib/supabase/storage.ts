import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAdminConfig } from "@/lib/supabase/config";

const defaultOrganizationLegacyId = "default_org";
const defaultOrganizationName = "Default Organization";

export function buildImportStoragePath(input: {
  organizationId: string;
  importJobId: string;
  fileName: string;
}) {
  const safeFileName = toStorageSafeFileName(input.fileName);
  return `organizations/${input.organizationId}/imports/${input.importJobId}/${safeFileName}`;
}

export function toStorageSafeFileName(fileName: string) {
  const extensionMatch = fileName.match(/(\.[a-zA-Z0-9]+)$/);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? "";
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  const safeBaseName = baseName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return `${safeBaseName || "uploaded-file"}${extension}`;
}

export async function uploadImportFileToSupabase(input: {
  organizationId: string;
  importJobId: string;
  fileName: string;
  body: Blob | ArrayBuffer | Buffer;
  contentType?: string;
}) {
  const supabase = createSupabaseAdminClient();
  const config = supabaseAdminConfig();

  if (!supabase) {
    return {
      ok: false,
      path: undefined,
      error: "Supabase admin client is not configured."
    };
  }

  const path = buildImportStoragePath(input);
  const { error } = await supabase.storage.from(config.importsBucket).upload(path, input.body, {
    contentType: input.contentType,
    upsert: true
  });

  return {
    ok: !error,
    path,
    error: error?.message
  };
}

export async function getDefaultOrganizationStorageId() {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      organizationId: undefined,
      error: "Supabase admin client is not configured."
    };
  }

  const { data: existing, error: selectError } = await supabase
    .from("organizations")
    .select("id")
    .eq("legacy_id", defaultOrganizationLegacyId)
    .maybeSingle();

  if (selectError) {
    return {
      ok: false,
      organizationId: undefined,
      error: selectError.message
    };
  }

  if (existing?.id) {
    return {
      ok: true,
      organizationId: String(existing.id),
      error: undefined
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("organizations")
    .insert({
      legacy_id: defaultOrganizationLegacyId,
      name: defaultOrganizationName
    })
    .select("id")
    .single();

  return {
    ok: Boolean(inserted?.id && !insertError),
    organizationId: inserted?.id ? String(inserted.id) : undefined,
    error: insertError?.message
  };
}
