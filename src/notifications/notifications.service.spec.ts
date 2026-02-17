import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '../config/app-config.service';
import { SendonService } from '../sendon/sendon.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  const sendonService = {
    sendAlimtalk: jest.fn(),
  };

  const configService = {
    sendon: {
      defaultSendProfileId: 'PF-KAKAO-DEFAULT',
    },
  };

  beforeEach(async () => {
    sendonService.sendAlimtalk.mockReset();
    sendonService.sendAlimtalk.mockResolvedValue({
      provider: 'sendon',
      status: 'accepted',
      requestId: 'mock-1',
    });

    configService.sendon.defaultSendProfileId = 'PF-KAKAO-DEFAULT';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: SendonService,
          useValue: sendonService,
        },
        {
          provide: AppConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('normalizes recipients and forwards official request schema', async () => {
    await service.sendKakaoAlimtalk({
      templateId: 'WELCOME',
      to: ['010-1234-5678', { phone: '+82 10-7777-8888', variables: { '#{이름}': '홍길동' } }],
      useCredit: true,
    });

    expect(sendonService.sendAlimtalk).toHaveBeenCalledWith({
      sendProfileId: 'PF-KAKAO-DEFAULT',
      templateId: 'WELCOME',
      to: ['01012345678', { phone: '+821077778888', variables: { '#{이름}': '홍길동' } }],
      reservation: undefined,
      useCredit: true,
      fallback: undefined,
    });
  });

  it('uses sendProfileId from request when provided', async () => {
    await service.sendKakaoAlimtalk({
      sendProfileId: 'PF-KAKAO-REQUEST',
      templateId: 'WELCOME',
      to: ['01012345678'],
    });

    expect(sendonService.sendAlimtalk).toHaveBeenCalledWith(
      expect.objectContaining({
        sendProfileId: 'PF-KAKAO-REQUEST',
      }),
    );
  });

  it('throws when sendProfileId is missing in both request and env', async () => {
    configService.sendon.defaultSendProfileId = '';

    await expect(
      service.sendKakaoAlimtalk({
        templateId: 'WELCOME',
        to: ['01012345678'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when recipients are missing', async () => {
    await expect(
      service.sendKakaoAlimtalk({
        templateId: 'WELCOME',
        to: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when recipient phone format is invalid', async () => {
    await expect(
      service.sendKakaoAlimtalk({
        templateId: 'WELCOME',
        to: ['invalid-phone'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
