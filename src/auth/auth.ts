import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { User } from '../requests/schemas';
import { Role } from '../workflow/workflow';

export interface AuthUser {
  sub: string;
  username: string;
  role: Role;
}

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const Public = () => SetMetadata('public', true);
export const CurrentUser = createParamDecorator((_d, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user as AuthUser);

// RBAC di backend: semua endpoint wajib token; @Roles membatasi per role.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector, @InjectModel(User.name) private users: Model<User>) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    if (this.reflector.get<boolean>('public', ctx.getHandler())) return true;
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException();
    try {
      req.user = await this.jwt.verifyAsync<AuthUser>(token);
    } catch {
      throw new UnauthorizedException();
    }
    // Role dan status aktif diambil dari DB, bukan token: perubahan oleh admin berlaku seketika.
    const u = await this.users.findById(req.user.sub).select('role active').lean().catch(() => null);
    if (!u || u.active === false) throw new UnauthorizedException();
    req.user.role = u.role;
    const roles = this.reflector.get<Role[]>('roles', ctx.getHandler());
    if (roles && !roles.includes(req.user.role)) throw new ForbiddenException('Role tidak berwenang');
    return true;
  }
}
