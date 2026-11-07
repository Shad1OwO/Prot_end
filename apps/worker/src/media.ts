import { createConnection } from "node:net";
import sharp from "sharp";

const allowedTypes: Record<string, true> = { "image/jpeg": true, "image/png": true, "image/webp": true };
export interface SanitizedImage { buffer: Buffer; contentType: "image/webp"; width: number; height: number; }

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

/** Identifies an image from its leading bytes, so nothing else has to parse the file to find out. */
export function detectImageType(input: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return "image/png";
  if (input.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) return "image/jpeg";
  if (input.length >= 12 && input.toString("latin1", 0, 4) === "RIFF" && input.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function sanitizeImage(input: Buffer, declaredType: string, clamHost: string, clamPort: number): Promise<SanitizedImage> {
  if (!allowedTypes[declaredType]) throw new Error("Unsupported image type");
  if (input.byteLength > 15 * 1024 * 1024) throw new Error("Image exceeds 15 MiB");
  // The declared type comes from the client. Checked before sharp, which would otherwise parse SVG and other formats.
  if (detectImageType(input) !== declaredType) throw new Error("Image content does not match its declared type");
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
