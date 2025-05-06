// src/lib/utils/content-converter.ts
export interface TipTapNode {
  type?: string;
  text?: string;
  content?: TipTapNode[];
  [key: string]: unknown;
}

export function convertTipTapToPlainText(content: TipTapNode): string {
    let plainText = '';
  
    // Process nodes recursively
    const processNode = (node: TipTapNode) => {
      if (node.text) {
        plainText += node.text;
      } else if (node.content) {
        node.content.forEach(processNode);
        
        // Add appropriate line breaks based on node type
        if (node.type === 'paragraph') {
          plainText += '\n\n';
        } else if (node.type === 'heading') {
          plainText += '\n\n';
        } else if (node.type === 'bulletList' || node.type === 'orderedList') {
          plainText += '\n';
        } else if (node.type === 'listItem') {
          plainText += '- ';
        }
      }
    };
  
    processNode(content);
    return plainText.trim();
  }