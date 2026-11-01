import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { updateSupabaseSession } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/config';

export async function proxy(request: NextRequest) {
  const response = await updateSupabaseSession(request);
  if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname.startsWith('/api/')) return response;

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: () => {},
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
