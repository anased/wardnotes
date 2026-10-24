import { supabase } from '@/lib/supabase/client';

export const NOTE_IMAGES_BUCKET = 'note-images';

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

/**
 * Uploads an image to Supabase Storage and returns its public URL.
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

    return supabase.storage.from(NOTE_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (error) {
    console.warn('Image upload failed, embedding image inline instead:', error);
    return blobToDataUrl(blob);
  }
}
