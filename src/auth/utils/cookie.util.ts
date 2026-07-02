import type { Response, CookieOptions } from 'express';

/** Access-token (JWT) lifetime — keep in sync with JwtModule signOptions. */
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * The refresh cookie is Path-scoped to the auth controller (global prefix
 * `/api` + `@Controller('auth')`), so the browser only ever attaches it to
 * /api/auth/* calls — never to regular API traffic.
 */
export const REFRESH_COOKIE_PATH = '/api/auth';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  };
}

/** Sets the short-lived access JWT and (optionally) the rotating refresh token. */
export function setAuthCookies(
  response: Response,
  tokens: { accessToken: string; refreshToken?: string; refreshTtlMs?: number },
): void {
  response.cookie('jwt', tokens.accessToken, {
    ...baseOptions(),
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_MS,
  });

  if (tokens.refreshToken && tokens.refreshTtlMs) {
    response.cookie('refreshToken', tokens.refreshToken, {
      ...baseOptions(),
      path: REFRESH_COOKIE_PATH,
      maxAge: tokens.refreshTtlMs,
    });
  }
}

/** Clears both auth cookies. Paths must match how they were set or the browser keeps them. */
export function clearAuthCookies(response: Response): void {
  response.clearCookie('jwt', { ...baseOptions(), path: '/' });
  response.clearCookie('refreshToken', {
    ...baseOptions(),
    path: REFRESH_COOKIE_PATH,
  });
}
