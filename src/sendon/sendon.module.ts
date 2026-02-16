import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { SENDON_GATEWAY } from './sendon.constants';
import { SendonMockGateway } from './gateways/sendon-mock.gateway';
import { SendonSdkGateway } from './gateways/sendon-sdk.gateway';
import { SendonService } from './sendon.service';

@Module({
  providers: [
    SendonMockGateway,
    SendonSdkGateway,
    {
      provide: SENDON_GATEWAY,
      inject: [AppConfigService, SendonMockGateway, SendonSdkGateway],
      useFactory: (
        configService: AppConfigService,
        mockGateway: SendonMockGateway,
        sdkGateway: SendonSdkGateway,
      ) => {
        return configService.sendon.mock ? mockGateway : sdkGateway;
      },
    },
    SendonService,
  ],
  exports: [SendonService],
})
export class SendonModule {}
