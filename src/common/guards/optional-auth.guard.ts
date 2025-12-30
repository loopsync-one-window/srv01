import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
    handleRequest(err: any, user: any, info: any) {
        // No error is thrown if no user is found
        if (err || !user) {
            return null;
        }
        return user;
    }
}
