import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export default auth((req) => {
  const isAuthed = !!req.auth;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/dashboard') && !isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  if ((pathname === '/login' || pathname === '/signup') && isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup'],
};
