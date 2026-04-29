import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/api/"];
const ADMIN_PATHS = ["/admin"];
const CC_PATHS = ["/cc"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

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

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Let public paths and API routes through without role checks
  if (isPublic(pathname)) {
    return response;
  }

  // Unauthenticated users: redirect to login (except for static files)
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // For CC-specific paths: verify the user has at least one batch assignment
  if (CC_PATHS.some((p) => pathname.startsWith(p))) {
    const { data: assignment } = await supabase
      .from("cc_batch_assignments")
      .select("batch_id")
      .eq("cc_user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!assignment) {
      // Check if they are admin instead
      const adminIds = (process.env.ADMIN_USER_IDS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (adminIds.includes(user.id)) {
        const adminUrl = request.nextUrl.clone();
        adminUrl.pathname = "/admin/dashboard";
        return NextResponse.redirect(adminUrl);
      }

      // Not a CC either — redirect to a holding page
      const noAccessUrl = request.nextUrl.clone();
      noAccessUrl.pathname = "/cc/dashboard";
      // Let the page itself render the "no batches" message
      return response;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
