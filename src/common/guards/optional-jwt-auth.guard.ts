import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    // Override the default behavior (which throws an UnauthorizedException)
    // Simply return the user if authentication succeeds, otherwise return null
    return user || null;
  }
}
