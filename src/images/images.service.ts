import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import { Tables, TablesInsert } from '../types/database';
import { deleteFileFromR2, uploadFileToR2 } from './r2.util';

type Image = Tables<'images'>;
type ImageType =
  | 'project_cover'
  | 'artist_profile'
  | 'product_main'
  | 'product_gallery';

interface UploadImageInput {
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  imageType: ImageType;
  altText?: string;
  uploadedBy: string;
}

@Injectable()
export class ImagesService {
  async uploadImage(input: UploadImageInput): Promise<Image> {
    this.validateImageFile(input.file);

    const r2Key = this.generateR2Key(input.file.originalname, input.imageType);
    const publicUrl = await uploadFileToR2({
      key: r2Key,
      body: input.file.buffer,
      contentType: input.file.mimetype,
    });

    const supabase = getSupabaseClient();
    const insertData: TablesInsert<'images'> = {
      r2_key: r2Key,
      r2_bucket: process.env.R2_BUCKET_NAME || 'default',
      public_url: publicUrl,
      file_name: input.file.originalname,
      file_size: input.file.size,
      mime_type: input.file.mimetype,
      width: null,
      height: null,
      image_type: input.imageType,
      alt_text: input.altText || '',
      uploaded_by: input.uploadedBy,
      is_active: true,
    };

    const { data, error } = await supabase
      .from('images')
      .insert(insertData)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        '이미지 저장에 실패했습니다',
        500,
        'IMAGE_SAVE_FAILED',
      );
    }

    return data;
  }

  async getImages(options: {
    page?: number;
    limit?: number;
    imageType?: string;
    isActive?: boolean;
  }): Promise<{ images: Image[]; total: number }> {
    const supabase = getSupabaseClient();
    const { page = 1, limit = 20, imageType, isActive } = options;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase.from('images').select('*', { count: 'exact' });
    if (imageType) {
      query = query.eq('image_type', imageType);
    }
    if (isActive !== undefined) {
      query = query.eq('is_active', isActive);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new ApiException(
        '이미지 조회에 실패했습니다',
        500,
        'IMAGE_FETCH_FAILED',
      );
    }

    return {
      images: (data || []) as Image[],
      total: count || 0,
    };
  }

  async getImageById(id: string): Promise<Image> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        '이미지를 찾을 수 없습니다',
        404,
        'IMAGE_NOT_FOUND',
      );
    }

    return data;
  }

  async softDeleteImage(id: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('images')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw new ApiException(
        '이미지 삭제에 실패했습니다',
        500,
        'IMAGE_DELETE_FAILED',
      );
    }
  }

  async hardDeleteImage(id: string): Promise<void> {
    const supabase = getSupabaseClient();
    const image = await this.getImageById(id);

    try {
      await deleteFileFromR2(image.r2_key);
    } catch {
      // R2 삭제 실패 시에도 DB 삭제를 진행한다.
    }

    const { error } = await supabase.from('images').delete().eq('id', id);
    if (error) {
      throw new ApiException(
        '이미지 삭제에 실패했습니다',
        500,
        'IMAGE_DELETE_FAILED',
      );
    }
  }

  private validateImageFile(file: {
    originalname: string;
    mimetype: string;
    size: number;
  }): void {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new ApiException(
        '허용되지 않은 파일 형식입니다. (jpeg, png, webp만 허용)',
        400,
        'INVALID_FILE_TYPE',
      );
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new ApiException(
        '파일 크기는 5MB를 초과할 수 없습니다',
        400,
        'FILE_TOO_LARGE',
      );
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase() || '';
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
      throw new ApiException(
        '허용되지 않은 파일 확장자입니다',
        400,
        'INVALID_FILE_EXTENSION',
      );
    }
  }

  private generateR2Key(
    originalFilename: string,
    imageType: ImageType,
  ): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const uuid = randomUUID();
    const sanitized = originalFilename
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '-');

    return `images/${imageType}/${year}/${month}/${uuid}-${sanitized}`;
  }
}
