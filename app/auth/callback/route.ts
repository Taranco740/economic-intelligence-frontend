import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";
  const response = NextResponse.redirect(new URL(safeNext, requestUrl.origin));

  if (!code) {
    return NextResponse.redirect(new URL("/auth?error=missing_code", requestUrl.origin));
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers.get("cookie")
            ? request.headers
                .get("cookie")!
                .split("; ")
                .map((cookie) => {
                  const index = cookie.indexOf("=");
                  return {
                    name: cookie.slice(0, index),
                    value: decodeURIComponent(cookie.slice(index + 1)),
                  };
                })
            : [];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/auth?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
    );
  }

  return response;
}
