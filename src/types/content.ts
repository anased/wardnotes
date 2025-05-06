export interface TipTapNode {
    type?: string;
    text?: string;
    content?: TipTapNode[];
    [key: string]: unknown;
  }
  
  export interface AnkiExportOptions {
    css?: string;
    template?: {
      front?: string;
      back?: string;
    };
  }