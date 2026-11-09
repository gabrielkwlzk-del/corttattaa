import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ImageValidationError, PREVIEW_MAX, processImage } from "@/lib/images";
import { makeJpeg } from "./helpers/fixtures";

async function meanAbsDiff(a: Buffer, b: Buffer, w: number, h: number) {
  const [ra, rb] = await Promise.all(
    [a, b].map((x) => sharp(x).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer()),
  );
  let sum = 0;
  for (let i = 0; i < ra.length; i++) sum += Math.abs(ra[i] - rb[i]);
  return sum / ra.length;
}

describe("prévia protegida", () => {
  it("gera prévia reduzida com marca d'água gravada nos pixels", async () => {
    const original = await makeJpeg(3000, 2000);
    const out = await processImage(original);
    expect(out.width).toBe(3000);
    expect(out.height).toBe(2000);
    expect(out.mime).toBe("image/jpeg");

    const meta = await sharp(out.preview).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(PREVIEW_MAX);
    expect(meta.exif).toBeUndefined();

    const thumbMeta = await sharp(out.thumb).metadata();
    expect(Math.max(thumbMeta.width!, thumbMeta.height!)).toBeLessThanOrEqual(720);

    // A prévia precisa diferir de forma perceptível de uma redução "limpa" do original.
    const clean = await sharp(original).resize(meta.width, meta.height).webp({ quality: 80 }).toBuffer();
    const diff = await meanAbsDiff(out.preview, clean, meta.width!, meta.height!);
    expect(diff).toBeGreaterThan(4);
  });

  it("valida o conteúdo real do arquivo", async () => {
    await expect(processImage(Buffer.from("not an image at all"))).rejects.toBeInstanceOf(ImageValidationError);
    const tiny = await makeJpeg(100, 80);
    await expect(processImage(tiny)).rejects.toBeInstanceOf(ImageValidationError);
    const gif = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#fff" } }).gif().toBuffer();
    await expect(processImage(gif)).rejects.toBeInstanceOf(ImageValidationError);
  });
});
