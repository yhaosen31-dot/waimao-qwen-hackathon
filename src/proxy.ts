import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const publicPathPrefixes = ["/login", "/auth/login", "/auth/logout", "/unauthorized"];

export async function proxy(request: NextRequest) {
  if (!authProxyEnabled() || isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  const cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }> = [];

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(nextCookies) {
        cookiesToSet.splice(0, cookiesToSet.length, ...nextCookies);
        nextCookies.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthenticatedResponse(request, cookiesToSet);
  }

  const { data: member, error: memberError } = await supabase
    .from("organization_members")
    .select("role")
    .limit(1)
    .maybeSingle();

  if (memberError || !member) {
    return unauthorizedResponse(request, cookiesToSet);
  }

  requestHeaders.set("x-waimao-user-id", user.id);
  if (user.email) requestHeaders.set("x-waimao-user-email", user.email);
  requestHeaders.set("x-waimao-user-role", String(member.role ?? "member"));

  return withCookies(
    NextResponse.next({
      request: {
        headers: requestHeaders
      }
    }),
    cookiesToSet
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)"
  ]
};

function authProxyEnabled() {
  return process.env.APP_AUTH_ENABLED === "true";
}

function isPublicPath(pathname: string) {
  return publicPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function unauthenticatedResponse(
  request: NextRequest,
  cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>
) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return withCookies(
      NextResponse.json({ error: "Authentication required." }, { status: 401 }),
      cookiesToSet
    );
  }

  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", next);
  return withCookies(NextResponse.redirect(url), cookiesToSet);
}

function unauthorizedResponse(
  request: NextRequest,
  cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>
) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return withCookies(
      NextResponse.json({ error: "Organization membership required." }, { status: 403 }),
      cookiesToSet
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/unauthorized";
  url.search = "";
  return withCookies(NextResponse.redirect(url), cookiesToSet);
}

function withCookies(
  response: NextResponse,
  cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>
) {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}
