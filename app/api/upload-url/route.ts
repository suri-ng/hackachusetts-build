import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { retainUpload } from '@/lib/services';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const FORMAT_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heif: 'image/heif',
};

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Upload a valid image file.' }, { status: 400 });
  }

  const phase = form.get('phase');
  const file = form.get('file');
  if (phase !== 'before' && phase !== 'after') {
    return NextResponse.json({ error: 'Upload phase must be before or after.' }, { status: 400 });
  }
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Photos must be smaller than 10 MB.' }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Use a JPG, PNG, WebP, HEIC, or HEIF image.' },
      { status: 415 },
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(bytes, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    if (
      !metadata.format ||
      !FORMAT_MIME[metadata.format] ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS
    ) {
      return NextResponse.json(
        { error: 'That image format or resolution is not supported.' },
        { status: 415 },
      );
    }

    const retained = await retainUpload(bytes, FORMAT_MIME[metadata.format], phase);
    return NextResponse.json({
      ...retained,
      bytes: bytes.length,
      width: metadata.width,
      height: metadata.height,
    });
  } catch {
    return NextResponse.json(
      { error: 'The image could not be decoded. Try another photo.' },
      { status: 415 },
    );
  }
}
