import { supabase } from '@/lib/supabase/client';

export const NOTE_IMAGES_BUCKET = 'note-images';

// Notes store a reference to the private storage object rather than a URL,
// since signed URLs expire. The reference is resolved to a signed URL at render time.
export const NOTE_IMAGE_REF_PREFIX = `storage://${NOTE_IMAGES_BUCKET}/`;

const SIGNED_URL_TTL_SECONDS = 60 * 60;
// Refresh a bit before expiry so an image never renders with a just-expired URL
const SIGNED_URL_CACHE_MS = (SIGNED_URL_TTL_SECONDS - 5 * 60) * 1000;
const signedUrlCache = new Map<string, { url: Promise<string>; expiresAt: number }>();

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

// Resize large images and re-encode them so pasted screenshots don't bloat notes.
// GIFs and SVGs are returned untouched to preserve animation/vector data.
async function compressImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Keep PNG for images that may rely on transparency (e.g. screenshots of diagrams)
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, JPEG_QUALITY)
  );
  // Only use the re-encoded version if it's actually smaller
  return blob && blob.size < file.size ? blob : file;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function isNoteImageRef(src: string | null | undefined): src is string {
  return !!src && src.startsWith(NOTE_IMAGE_REF_PREFIX);
}

/**
 * Turns a stored image reference into a short-lived signed URL.
 * Plain URLs (external images, inline data URLs) are returned unchanged.
 */
export function resolveNoteImageSrc(src: string): Promise<string> {
  if (!isNoteImageRef(src)) return Promise.resolve(src);

  const cached = signedUrlCache.get(src);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const path = src.slice(NOTE_IMAGE_REF_PREFIX.length);
  const url = supabase.storage
    .from(NOTE_IMAGES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    .then(({ data, error }) => {
      if (error || !data) throw error ?? new Error('Failed to sign image URL');
      return data.signedUrl;
    });

  signedUrlCache.set(src, { url, expiresAt: Date.now() + SIGNED_URL_CACHE_MS });
  // Don't cache failures, so the next render retries
  url.catch(() => signedUrlCache.delete(src));
  return url;
}

/**
 * Uploads an image to private Supabase Storage and returns a storage reference
 * (see NOTE_IMAGE_REF_PREFIX) to save in the note.
 * Falls back to an inline data URL if the upload fails (e.g. bucket not configured).
 */
export async function uploadNoteImage(file: File): Promise<string> {
  const blob = await compressImage(file).catch(() => file);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const ext = (blob.type.split('/')[1] || 'png').replace('svg+xml', 'svg');
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { error } = await supabase.storage
      .from(NOTE_IMAGES_BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
    if (error) throw error;

    return `${NOTE_IMAGE_REF_PREFIX}${path}`;
  } catch (error) {
    console.warn('Image upload failed, embedding image inline instead:', error);
    return blobToDataUrl(blob);
  }
}
