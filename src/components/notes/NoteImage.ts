import Image from '@tiptap/extension-image';
import { isNoteImageRef, resolveNoteImageSrc } from '@/lib/utils/imageUpload';

/**
 * Image extension that renders images stored in the private note-images bucket.
 * The node keeps its storage:// reference as `src`; only the rendered <img>
 * receives a signed URL, so saved note content never contains expiring links.
 */
const NoteImage = Image.extend({
  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const img = document.createElement('img');
      let currentSrc: string | null = null;

      const render = (attrs: Record<string, unknown>) => {
        Object.entries(attrs).forEach(([key, value]) => {
          if (key === 'src') return;
          if (value === null || value === undefined) img.removeAttribute(key);
          else img.setAttribute(key, String(value));
        });

        const src = attrs.src as string | null;
        if (src === currentSrc) return;
        currentSrc = src;

        if (!src) {
          img.removeAttribute('src');
          return;
        }
        if (!isNoteImageRef(src)) {
          img.src = src;
          return;
        }

        img.removeAttribute('src');
        resolveNoteImageSrc(src)
          .then((url) => {
            // Ignore stale results if the node's src changed meanwhile
            if (currentSrc === src) img.src = url;
          })
          .catch((error) => console.error('Failed to load note image:', error));
      };

      render(HTMLAttributes);

      return {
        dom: img,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false;
          render({ ...this.options.HTMLAttributes, ...updatedNode.attrs });
          return true;
        },
      };
    };
  },
});

export default NoteImage;
