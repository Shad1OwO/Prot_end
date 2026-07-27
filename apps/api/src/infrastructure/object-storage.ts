import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ApiEnvironment } from "@tourism/config";
import type { MediaUploadTicket, ObjectStorageProvider } from "../domain/providers";

export class S3ObjectStorageProvider implements ObjectStorageProvider {
  readonly configured = true;
  readonly #client: S3Client;

  constructor(readonly env: ApiEnvironment) {
    this.#client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  async createUploadTicket(input: { fileName: string; contentType: string; sizeBytes: number; sha256: string }): Promise<MediaUploadTicket> {
    const safeName = input.fileName.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload";
    const objectKey = `incoming/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
    const expiresIn = 5 * 60;
    const headers = { "content-type": input.contentType, "x-amz-meta-sha256": input.sha256, "x-amz-meta-size": String(input.sizeBytes) };
    const uploadUrl = await getSignedUrl(this.#client, new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: objectKey, ContentType: input.contentType, Metadata: { sha256: input.sha256, size: String(input.sizeBytes), scan: "pending" } }), { expiresIn });
    return { objectKey, uploadUrl, expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(), headers };
  }
}
