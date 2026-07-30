import { createConnection } from "node:net";
import sharp from "sharp";

const allowedTypes: Record<string, true> = { "image/jpeg": true, "image/png": true, "image/webp": true };
export interface SanitizedImage { buffer: Buffer; contentType: "image/webp"; width: number; height: number; }

export async function sanitizeImage(input: Buffer, declaredType: string, clamHost: string, clamPort: number): Promise<SanitizedImage> {
  if (!allowedTypes[declaredType]) throw new Error("Unsupported image type");
  if (input.byteLength > 15 * 1024 * 1024) throw new Error("Image exceeds 15 MiB");
  await scanClamAv(input, clamHost, clamPort);
  const metadata = await sharp(input, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Invalid image payload");
  const buffer = await sharp(input, { failOn: "error" }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  const clean = await sharp(buffer).metadata();
  return { buffer, contentType: "image/webp", width: clean.width as number, height: clean.height as number };
}

async function scanClamAv(input: Buffer, host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    const chunks: Buffer[] = [];
    socket.setTimeout(20_000);
    socket.on("connect", () => { socket.write("zINSTREAM\0"); for (let offset = 0; offset < input.length; offset += 64 * 1024) { const chunk = input.subarray(offset, offset + 64 * 1024); const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length); socket.write(size); socket.write(chunk); } socket.write(Buffer.alloc(4)); });
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on("end", () => { const result = Buffer.concat(chunks).toString("utf8"); if (result.includes("FOUND")) reject(new Error("Malware detected")); else if (!result.includes("OK")) reject(new Error("Malware scan failed")); else resolve(); });
    socket.on("timeout", () => { socket.destroy(); reject(new Error("Malware scan timed out")); });
    socket.on("error", reject);
  });
}
