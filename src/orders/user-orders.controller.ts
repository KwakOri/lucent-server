import { Controller, Get, Headers } from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { successResponse } from '../common/api-response';
import { OrdersService } from './orders.service';

@Controller('users/me')
export class UserOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get('voicepacks')
  async getMyVoicepacks(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const voicepacks = await this.ordersService.getMyVoicePacks(user.id);

    return successResponse({
      voicepacks,
      total: voicepacks.length,
    });
  }
}
