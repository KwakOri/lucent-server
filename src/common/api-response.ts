export interface ApiSuccessResponse<T> {
  status: 'success';
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  status: 'error';
  message: string;
  errorCode: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiPaginatedResponse<T> {
  status: 'success';
  data: T[];
  pagination: PaginationMeta;
}

export function successResponse<T>(
  data: T,
  message?: string,
): ApiSuccessResponse<T> {
  return {
    status: 'success',
    data,
    ...(message ? { message } : {}),
  };
}

export function paginatedResponse<T>(
  data: T[],
  pagination: { total: number; page: number; limit: number },
): ApiPaginatedResponse<T> {
  return {
    status: 'success',
    data,
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  };
}
