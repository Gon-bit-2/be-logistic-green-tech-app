import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { AuthenticationGuard } from './authentication.guard'
import { RolesGuard } from './roles.guard'
import { ResourceAccessGuard } from './resource-access.guard'

@Injectable()
export class AppAccessGuard implements CanActivate {
  constructor(
    private readonly authenticationGuard: AuthenticationGuard,
    private readonly rolesGuard: RolesGuard,
    private readonly resourceAccessGuard: ResourceAccessGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await this.authenticationGuard.canActivate(context))) {
      return false
    }

    if (!(await this.rolesGuard.canActivate(context))) {
      return false
    }

    return this.resourceAccessGuard.canActivate(context)
  }
}
