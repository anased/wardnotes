// src/types/anki-apkg-export.d.ts
declare module 'anki-apkg-export' {
    export default class AnkiExport {
      constructor(deckName: string, options?: any);
      addCard(front: string, back: string, options?: any): void;
      save(): Promise<Uint8Array>;
    }
  }