import { protectedRoutes } from '@common/utils/protected-routes';
import { NextRequest, NextResponse } from 'next/server';
import { i18nRouter } from 'next-i18n-router';

import i18nConfig from './app/i18nConfig';

export function proxy(req: NextRequest) {
  const {
    nextUrl: { pathname, origin },
  } = req;

  if (protectedRoutes.includes(pathname)) {
    const sessionCookie = req.cookies.get('connect.sid')?.value;

    if (!sessionCookie) {
      const absoluteUrl = new URL(`${process.env.NEXT_PUBLIC_BASEPATH}/login?path=${pathname}`, origin);
      return NextResponse.redirect(absoluteUrl.toString());
    }
  }

  req.headers.set('x-path', pathname);
  const response = i18nRouter(req, i18nConfig);
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return response;
}

export const config = {
  matcher: '/((?!napi|api|static|.*\\..*|_next).*)',
};
