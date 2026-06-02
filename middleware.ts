import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths that never require authentication
const PUBLIC_PATHS = ["/login", "/signup", "/batch-details/login", "/api/"];
const PUBLIC_FILE = /\.(?:avif|gif|ico|jpg|jpeg|png|svg|webp)$/i;

// Paths under the batch-details portal
const BATCH_DETAILS_PATHS = ["/batch-details"];

// Paths for the new CC dashboard
const CC_PATHS = ["/cc"];

function isPublic(pathname: string) {
  return PUBLIC_FILE.test(pathname) || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth entirely for public paths — no Supabase round-trip needed
  if (isPublic(pathname)) {
    return NextResponse.next({ request });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // If Supabase isn't configured at all, just pass through
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Unauthenticated: redirect to the right login page based on the portal
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    if (BATCH_DETAILS_PATHS.some((p) => pathname.startsWith(p))) {
      loginUrl.pathname = "/batch-details/login";
    } else {
      loginUrl.pathname = "/login";
    }
    return NextResponse.redirect(loginUrl);
  }

  // CC-specific paths: verify the user has at least one batch assignment
  if (CC_PATHS.some((p) => pathname.startsWith(p))) {
    const { data: assignment } = await supabase
      .from("cc_batch_assignments")
      .select("batch_id")
      .eq("cc_user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!assignment) {
      const adminIds = (process.env.ADMIN_USER_IDS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (adminIds.includes(user.id)) {
        const adminUrl = request.nextUrl.clone();
        adminUrl.pathname = "/batch-details/dashboard";
        return NextResponse.redirect(adminUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
