import sharp from 'sharp';

export const MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const MAX_ANIMATED_BYTES = 500 * 1024;
export const MAX_STATIC_BYTES = 100 * 1024;

const background = {r: 0, g: 0, b: 0, alpha: 0};

export async function toWhatsAppSticker(input) {
  if (!Buffer.isBuffer(input) || !input.length || input.length > MAX_INPUT_BYTES) {
    throw new Error('Fichier absent ou trop volumineux (maximum 12 Mo).');
  }

  const metadata = await sharp(input, {animated: true, limitInputPixels: 100_000_000}).metadata();
  if (!['webp', 'gif', 'png', 'jpeg', 'avif', 'tiff'].includes(metadata.format)) {
    throw new Error(`Format non pris en charge : ${metadata.format || 'inconnu'}.`);
  }
  const frameHeight = metadata.pageHeight || (metadata.height / (metadata.pages || 1));
  if (!metadata.width || !frameHeight || metadata.width > 4096 || frameHeight > 4096) {
    throw new Error('Dimensions de la source invalides ou trop grandes.');
  }

  const animated = Number(metadata.pages || 1) > 1;
  let pages = animated ? Math.min(metadata.pages, 320) : 1;
  let frameDelays = Array.from({length: pages}, (_, i) => Math.max(20, metadata.delay?.[i] || 100));
  let duration = frameDelays.reduce((sum, delay) => sum + delay, 0);

  // Respecte la limite de 10 secondes : garde le début de l'animation.
  if (animated && duration > 10_000) {
    let elapsed = 0;
    let frames = 0;
    for (const delay of frameDelays) {
      if (elapsed + delay > 10_000 && frames > 0) break;
      elapsed += Math.min(delay, 10_000 - elapsed);
      frames++;
    }
    pages = Math.max(1, frames);
    frameDelays = frameDelays.slice(0, pages);
    duration = Math.min(10_000, frameDelays.reduce((sum, x) => sum + x, 0));
  }
  if (frameDelays.length && duration > 10_000) {
    frameDelays[frameDelays.length - 1] = Math.max(8, frameDelays.at(-1) - (duration - 10_000));
    duration = frameDelays.reduce((sum, x) => sum + x, 0);
  }

  const maxBytes = animated ? MAX_ANIMATED_BYTES : MAX_STATIC_BYTES;
  const qualities = animated ? [80, 60, 45, 30, 20, 12] : [88, 72, 52, 32, 20, 10];
  const baseOptions = {pages, limitInputPixels: 100_000_000};
  // Première passe : l'animation originale, sans sacrifier les images intermédiaires.
  let selected = null;
  for (const quality of qualities) {
    const data = await sharp(input, baseOptions)
      .resize(512, 512, {fit: 'contain', background})
      .webp({quality, alphaQuality: quality, effort: 5, loop: 0, minSize: animated, delay: animated ? frameDelays : undefined})
      .toBuffer();
    if (data.length <= maxBytes) {
      selected = {data, quality, skippedFrames: false};
      break;
    }
  }

  // Deuxième passe : sous-échantillonne les frames pour les stickers animés lourds.
  // sharp sait encoder WebP animé depuis un tampon RAW dont pageHeight représente une frame.
  if (!selected && animated && pages > 1) {
    const {data: raw, info} = await sharp(input, baseOptions)
      .resize(512, 512, {fit: 'contain', background})
      .ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const oneFrameBytes = info.width * info.pageHeight * info.channels;
    if (oneFrameBytes <= 0 || oneFrameBytes * pages !== raw.length) {
      throw new Error('Impossible de sous-échantillonner les images de ce sticker.');
    }
    for (const step of [2, 3, 4, 6, 8, 10]) {
      const chunks = [];
      const delays = [];
      for (let i = 0; i < pages; i += step) {
        chunks.push(raw.subarray(i * oneFrameBytes, (i + 1) * oneFrameBytes));
        delays.push(frameDelays.slice(i, Math.min(i + step, pages)).reduce((a, b) => a + b, 0));
      }
      if (chunks.length < 2) break;
      const sampled = Buffer.concat(chunks);
      for (const quality of [65, 45, 30, 20, 10]) {
        const data = await sharp(sampled, {
          raw: {width: 512, height: 512 * chunks.length, channels: info.channels, pageHeight: 512}
        }).webp({quality, alphaQuality: quality, effort: 5, minSize: true, loop: 0, delay: delays}).toBuffer();
        if (data.length <= maxBytes) {
          selected = {data, quality, skippedFrames: true};
          break;
        }
      }
      if (selected) break;
    }
  }

  if (!selected) {
    throw new Error(`Compression insuffisante pour WhatsApp (${animated ? '500' : '100'} Ko). Essaie un sticker plus court.`);
  }
  const output = await sharp(selected.data, {animated: true}).metadata();
  if (output.width !== 512 || (output.pageHeight || output.height / (output.pages || 1)) !== 512) {
    throw new Error('La sortie n’est pas de 512 × 512 par frame.');
  }
  if (animated && Number(output.pages || 1) < 2) throw new Error('L’animation a été perdue pendant la conversion.');
  return {
    buffer: selected.data,
    animated,
    outputFrames: output.pages || 1,
    inputFrames: metadata.pages || 1,
    durationMs: duration,
    bytes: selected.data.length,
    quality: selected.quality,
    skippedFrames: selected.skippedFrames
  };
}
