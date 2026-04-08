import { NextResponse } from 'next/server';
import { CONTROL_SESSION_COOKIE } from '@/lib/control-auth';

export function GET(request: Request) {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete(CONTROL_SESSION_COOKIE);
  return response;
}