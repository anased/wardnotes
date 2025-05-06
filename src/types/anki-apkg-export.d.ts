import { AnkiExportOptions } from '@/types/content';

declare module 'anki-apkg-export' {
  export default class AnkiExport {
    constructor(deckName: string, options?: AnkiExportOptions);
    addCard(front: string, back: string, options?: Record<string, unknown>): void;
    save(): Promise<Uint8Array>;
  }
}