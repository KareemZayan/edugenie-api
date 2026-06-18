import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    anActivate(context: ExecutionContext) {
        console.log('🔥 JWT GUARD HIT'); 
    
        return super.canActivate(context);
      }
}
