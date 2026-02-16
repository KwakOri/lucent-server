import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

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
  return `${getPublicUrlBase()}/${options.key}`;
}

export async function deleteFileFromR2(key: string): Promise<void> {
  const client = createR2Client();
  const command = new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });

  await client.send(command);
}
