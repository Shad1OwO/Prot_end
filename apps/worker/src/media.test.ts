import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:net";
import sharp from "sharp";
import { detectImageType, sanitizeImage } from "./media";

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
const blank = () => sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#369" } });

let png: Buffer;
let jpeg: Buffer;
let webp: Buffer;
let scanner: Server;
let scannerPort: number;
let scans = 0;

beforeAll(async () => {
  png = await blank().png().toBuffer();
  jpeg = await blank().jpeg().toBuffer();
  webp = await blank().webp().toBuffer();
  // Stands in for ClamAV: the zero-length chunk ends the stream, then the verdict is sent.
  scanner = createServer((socket) => {
    socket.on("data", (chunk) => {
      if (chunk.subarray(-4).equals(Buffer.alloc(4))) {
        scans += 1;
        socket.end("stream: OK\0");
      }
    });
  });
  await new Promise<void>((resolve) => scanner.listen(0, "127.0.0.1", resolve));
  scannerPort = (scanner.address() as { port: number }).port;
});

afterAll(() => {
  scanner.close();
});

describe("detectImageType", () => {
  test("recognizes each allowed format", () => {
    expect(detectImageType(png)).toBe("image/png");
    expect(detectImageType(jpeg)).toBe("image/jpeg");
    expect(detectImageType(webp)).toBe("image/webp");
  });

  test("rejects other content and truncated headers", () => {
    expect(detectImageType(svg)).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(png.subarray(0, 4))).toBeNull();
    expect(detectImageType(Buffer.from("RIFF0000WAVE"))).toBeNull();
  });
});

describe("sanitizeImage", () => {
  test("rejects mislabelled content before scanning or parsing it", async () => {
    const before = scans;
    for (const [input, declared] of [[svg, "image/png"], [svg, "image/jpeg"], [svg, "image/webp"], [png, "image/jpeg"], [jpeg, "image/webp"]] as const) {
      await expect(sanitizeImage(input, declared, "127.0.0.1", scannerPort)).rejects.toThrow("does not match its declared type");
    }
    expect(scans).toBe(before);
  });

  test("still rejects types that are not allowed", async () => {
    await expect(sanitizeImage(svg, "image/svg+xml", "127.0.0.1", scannerPort)).rejects.toThrow("Unsupported image type");
  });

  test("processes correctly labelled images", async () => {
    for (const [input, declared] of [[png, "image/png"], [jpeg, "image/jpeg"], [webp, "image/webp"]] as const) {
      const result = await sanitizeImage(input, declared, "127.0.0.1", scannerPort);
      expect(result.contentType).toBe("image/webp");
      expect(result.width).toBe(2400);
      expect(result.height).toBe(800);
    }
  });
});
