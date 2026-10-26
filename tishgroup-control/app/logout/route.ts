import { NextResponse } from 'next/server';
import { CONTROL_SESSION_COOKIE, invalidateControlSession } from '@/lib/control-auth';

export async function GET(request: Request) {
  await invalidateControlSession();
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete(CONTROL_SESSION_COOKIE);
  return response;
}