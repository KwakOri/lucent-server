import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';

const KAKAO_API_URL = 'https://dapi.kakao.com/v2/local/search/address.json';

interface KakaoAddressDocument {
  address: {
    address_name: string;
  };
  road_address: {
    address_name: string;
    zone_no: string;
    building_name: string;
  } | null;
}

interface KakaoAddressResponse {
  documents: KakaoAddressDocument[];
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
}

@Injectable()
export class AddressService {
  async search(query: string, page: number, size: number) {
    if (!query || query.trim().length === 0) {
      throw new ApiException('검색어를 입력해주세요', 400, 'VALIDATION_ERROR');
    }

    const apiKey = process.env.KAKAO_REST_API_KEY;
    if (!apiKey) {
      throw new ApiException(
        '카카오 API 키가 설정되지 않았습니다',
        500,
        'KAKAO_API_KEY_MISSING',
      );
    }

    const kakaoResponse = await fetch(
      `${KAKAO_API_URL}?query=${encodeURIComponent(query)}&page=${page}&size=${size}`,
      {
        headers: {
          Authorization: `KakaoAK ${apiKey}`,
        },
      },
    );

    if (!kakaoResponse.ok) {
      throw new ApiException(
        '주소 검색에 실패했습니다',
        kakaoResponse.status,
        'ADDRESS_SEARCH_FAILED',
      );
    }

    const data = (await kakaoResponse.json()) as KakaoAddressResponse;
    const results = data.documents.map((document) => ({
      roadAddress: document.road_address?.address_name || null,
      jibunAddress: document.address.address_name,
      zonecode: document.road_address?.zone_no || '',
      buildingName: document.road_address?.building_name || undefined,
    }));

    return {
      results,
      meta: data.meta,
    };
  }
}
