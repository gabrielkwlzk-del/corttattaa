import sharp from "sharp";
import { storage } from "@/lib/storage";
import { finalizeUpload, prepareUploads, processPhoto } from "@/lib/services/photos";

/** Gera uma "fotografia" sintética com gradiente e ruído. */
export async function makeJpeg(width = 2400, height = 1600): Promise<Buffer> {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      raw[i] = (x * 255) / width;
      raw[i + 1] = (y * 255) / height;
      raw[i + 2] = ((x + y) * 97) % 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels } }).jpeg({ quality: 90 }).toBuffer();
}

/** Simula o fluxo completo de upload do painel: preparar -> enviar -> finalizar -> processar. */
export async function uploadPhoto(opts: { title?: string; priceCents?: number; file?: Buffer } = {}) {
  const file = opts.file ?? (await makeJpeg(1200, 800));
  const [prep] = await prepareUploads([{ name: "IMG_0001.jpg", size: file.length, type: "image/jpeg" }]);
  await storage().put("originals", prep.key, file, "image/jpeg");
  const id = await finalizeUpload({
    photoId: prep.photoId,
    key: prep.key,
    exp: prep.exp,
    ticket: prep.ticket,
    filename: "IMG_0001.jpg",
    title: opts.title,
    priceCents: opts.priceCents,
  });
  const status = await processPhoto(id);
  return { id, status, key: prep.key, original: file };
}
