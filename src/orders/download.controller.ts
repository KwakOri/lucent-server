import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthSessionService } from '../auth/auth-session.service';
import { OrdersService } from './orders.service';

@Controller('download')
export class DownloadController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get(':productId')
  async redirectDownload(
    @Headers('authorization') authorization: string | undefined,
    @Param('productId') productId: string,
    @Res() response: Response,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const url = await this.ordersService.getLegacyDownloadRedirect(
      productId,
      user.id,
    );
    return response.redirect(url);
  }
}
