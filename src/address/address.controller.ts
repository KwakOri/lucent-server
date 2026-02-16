import { Controller, Get, Query } from '@nestjs/common';
import { successResponse } from '../common/api-response';
import { AddressService } from './address.service';

@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get('search')
  async search(
    @Query('query') query: string,
    @Query('page') rawPage?: string,
    @Query('size') rawSize?: string,
  ) {
    const page = this.parseOrDefault(rawPage, 1);
    const size = this.parseOrDefault(rawSize, 10);

    const result = await this.addressService.search(query, page, size);
    return successResponse(result);
  }

  private parseOrDefault(raw: string | undefined, fallback: number): number {
    if (!raw) {
      return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }
}
