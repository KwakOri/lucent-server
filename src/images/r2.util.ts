import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function createR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${getRequiredEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getRequiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

function getBucketName(): string {
  return getRequiredEnv('R2_BUCKET_NAME');
}

function getPublicUrlBase(): string {
  return getRequiredEnv('R2_PUBLIC_URL').replace(/\/$/, '');
}

export function buildR2PublicUrl(key: string): string {
  return `${getPublicUrlBase()}/${key}`;
}

export async function uploadFileToR2(options: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const client = createR2Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: options.key,
    Body: options.body,
    ContentType: options.contentType,
  });

  await client.send(command);
  return buildR2PublicUrl(options.key);
}

export async function createPresignedUploadUrlToR2(options: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{
  uploadUrl: string;
  expiresInSeconds: number;
  expiresAt: string;
}> {
  const client = createR2Client();
  const expiresInSeconds = options.expiresInSeconds ?? 900;
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: options.key,
    ContentType: options.contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  return {
    uploadUrl,
    expiresInSeconds,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  };
}

export async function createMultipartUploadToR2(options: {
  key: string;
  contentType: string;
}): Promise<{
  uploadId: string;
}> {
  const client = createR2Client();
  const command = new CreateMultipartUploadCommand({
    Bucket: getBucketName(),
    Key: options.key,
    ContentType: options.contentType,
  });

  const response = await client.send(command);
  if (!response.UploadId) {
    throw new Error('R2 multipart upload ID를 생성하지 못했습니다');
  }

  return {
    uploadId: response.UploadId,
  };
}

export async function createPresignedMultipartUploadPartUrlToR2(options: {
  key: string;
  uploadId: string;
  partNumber: number;
  expiresInSeconds?: number;
}): Promise<{
  uploadUrl: string;
  expiresInSeconds: number;
  expiresAt: string;
}> {
  const client = createR2Client();
  const expiresInSeconds = options.expiresInSeconds ?? 900;
  const command = new UploadPartCommand({
    Bucket: getBucketName(),
    Key: options.key,
    UploadId: options.uploadId,
    PartNumber: options.partNumber,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  return {
    uploadUrl,
    expiresInSeconds,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  };
}

export async function completeMultipartUploadToR2(options: {
  key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; eTag: string }>;
}): Promise<void> {
  const client = createR2Client();
  const command = new CompleteMultipartUploadCommand({
    Bucket: getBucketName(),
    Key: options.key,
    UploadId: options.uploadId,
    MultipartUpload: {
      Parts: [...options.parts]
        .sort((left, right) => left.partNumber - right.partNumber)
        .map((part) => ({
          ETag: part.eTag,
          PartNumber: part.partNumber,
        })),
    },
  });

  await client.send(command);
}

export async function abortMultipartUploadToR2(options: {
  key: string;
  uploadId: string;
}): Promise<void> {
  const client = createR2Client();
  const command = new AbortMultipartUploadCommand({
    Bucket: getBucketName(),
    Key: options.key,
    UploadId: options.uploadId,
  });

  await client.send(command);
}

export async function getR2ObjectMetadata(key: string): Promise<{
  contentType: string | null;
  contentLength: number | null;
  eTag: string | null;
}> {
  const client = createR2Client();
  const command = new HeadObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });

  const response = await client.send(command);

  return {
    contentType: response.ContentType ?? null,
    contentLength:
      typeof response.ContentLength === 'number' ? response.ContentLength : null,
    eTag: response.ETag ?? null,
  };
}

export async function deleteFileFromR2(key: string): Promise<void> {
  const client = createR2Client();
  const command = new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });

  await client.send(command);
}
