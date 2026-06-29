import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured, isSupabasePublicConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const defaultOrganizationLegacyId = "default_org";
const defaultOrganizationName = "Default Organization";

export type AppUserRole = "owner" | "admin" | "member";

export interface AppAuthUser {
  id: string;
  email?: string;
  organizationId?: string;
  role?: AppUserRole;
}

export type EnsureAuthenticatedUserAccessResult =
  | {
      ok: true;
      organizationId: string;
      role: AppUserRole;
      bootstrappedOwner: boolean;
    }
  | {
      ok: false;
      organizationId?: string;
      reason: string;
    };

export function appAuthEnabled() {
  return process.env.APP_AUTH_ENABLED === "true" && isSupabasePublicConfigured();
}

export function appAuthStatus() {
  return {
    enabled: appAuthEnabled(),
    requested: process.env.APP_AUTH_ENABLED === "true",
    publicConfigured: isSupabasePublicConfigured(),
    adminConfigured: isSupabaseAdminConfigured()
  };
}

export async function getCurrentAppUser(): Promise<AppAuthUser | null> {
  if (!isSupabasePublicConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? undefined
  };
}

export async function ensureAuthenticatedUserAccess(input: {
  userId: string;
  email?: string;
}): Promise<EnsureAuthenticatedUserAccessResult> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return {
      ok: false,
      reason: "Supabase admin client is not configured."
    };
  }

  const organization = await ensureDefaultOrganization();
  if (!organization.ok) return organization;

  const profile = await supabase
    .from("profiles")
    .upsert(
      {
        id: input.userId,
        email: input.email,
        display_name: input.email?.split("@")[0]
      },
      { onConflict: "id" }
    );

  if (profile.error) {
    return {
      ok: false,
      organizationId: organization.organizationId,
      reason: profile.error.message
    };
  }

  const { count, error: countError } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization.organizationId);

  if (countError) {
    return {
      ok: false,
      organizationId: organization.organizationId,
      reason: countError.message
    };
  }

  if ((count ?? 0) === 0) {
    const { error: insertError } = await supabase.from("organization_members").insert({
      organization_id: organization.organizationId,
      user_id: input.userId,
      role: "owner"
    });

    if (insertError) {
      return {
        ok: false,
        organizationId: organization.organizationId,
        reason: insertError.message
      };
    }

    return {
      ok: true,
      organizationId: organization.organizationId,
      role: "owner" as const,
      bootstrappedOwner: true
    };
  }

  const { data: member, error: memberError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization.organizationId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (memberError) {
    return {
      ok: false,
      organizationId: organization.organizationId,
      reason: memberError.message
    };
  }

  if (!member) {
    return {
      ok: false,
      organizationId: organization.organizationId,
      reason: "User is not a member of this organization."
    };
  }

  return {
    ok: true,
    organizationId: organization.organizationId,
    role: String(member.role) as AppUserRole,
    bootstrappedOwner: false
  };
}

async function ensureDefaultOrganization(): Promise<
  { ok: true; organizationId: string } | { ok: false; reason: string }
> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return {
      ok: false,
      reason: "Supabase admin client is not configured."
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
      reason: selectError.message
    };
  }

  if (existing?.id) {
    return {
      ok: true,
      organizationId: String(existing.id)
    };
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      legacy_id: defaultOrganizationLegacyId,
      name: defaultOrganizationName
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      reason: error.message
    };
  }

  return {
    ok: true,
    organizationId: String(data.id)
  };
}
