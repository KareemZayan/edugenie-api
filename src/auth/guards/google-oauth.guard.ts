import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * Drives the Google OAuth flow on both endpoints:
 * - On start (`/auth/google`): forwards the chosen role (`?role=…`) to Google as
 *   the `state` param so the callback knows which role to create.
 * - On the callback: if the user cancels consent or OAuth otherwise fails,
 *   redirects to the login page with an error instead of returning a raw 401.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const role =
      req.query?.role === UserRole.INSTRUCTOR
        ? UserRole.INSTRUCTOR
        : UserRole.STUDENT;
    return { state: role };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const res = context.switchToHttp().getResponse<Response>();
    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      // Google appends `?error=access_denied` when the user cancels, and
      // passport fails the request. Send them back to login cleanly rather than
      // surfacing a 401 JSON page. (The global filter skips already-sent
      // responses, so this redirect is the only thing written.)
      if (!res.headersSent) {
        const studentApp =
          this.config.get<string>('STUDENT_APP_URL') || 'http://localhost:3000';
        res.redirect(`${studentApp}/login?error=google_auth_failed`);
      }
      return false;
    }
  }
}
