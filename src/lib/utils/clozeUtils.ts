// src/utils/clozeUtils.ts
export interface ClozeCard {
    content: string;
    clozeNumber: number;
    totalClozes: number;
  }
  
  /**
   * Extract all cloze numbers from a cloze deletion string
   */
  export function extractClozeNumbers(clozeContent: string): number[] {
    const matches = clozeContent.match(/\{\{c(\d+)::/g);
    if (!matches) return [];
    
    const numbers = matches.map(match => {
      const num = match.match(/\{\{c(\d+)::/);
      return num ? parseInt(num[1]) : 0;
    }).filter(num => num > 0);
    
    // Remove duplicates and sort
    return [...new Set(numbers)].sort((a, b) => a - b);
  }
  
  /**
   * Split a multi-cloze card into individual cloze cards
   */
  export function splitClozeCard(clozeContent: string): ClozeCard[] {
    const clozeNumbers = extractClozeNumbers(clozeContent);
    
    if (clozeNumbers.length === 0) {
      return [{
        content: clozeContent,
        clozeNumber: 1,
        totalClozes: 1
      }];
    }
    
    return clozeNumbers.map(clozeNumber => ({
      content: clozeContent,
      clozeNumber,
      totalClozes: clozeNumbers.length
    }));
  }
  
  /**
   * Validate if a string contains valid cloze deletions
   */
  export function isValidClozeContent(content: string): boolean {
    // Must contain at least one cloze deletion
    const hasCloze = /\{\{c\d+::.+?\}\}/.test(content);
    
    if (!hasCloze) return false;
    
    // Check for balanced braces
    const openBraces = (content.match(/\{\{/g) || []).length;
    const closeBraces = (content.match(/\}\}/g) || []).length;
    
    return openBraces === closeBraces;
  }
  
  /**
   * Preview how a cloze will look with only specific cloze number hidden
   */
  export function previewClozeCard(clozeContent: string, hiddenClozeNumber: number): string {
    let processed = clozeContent;
    
    // First, show all other cloze deletions
    processed = processed.replace(
      /\{\{c(\d+)::(.*?)(?:::.*?)?\}\}/g,
      (match, clozeNum, content) => {
        if (parseInt(clozeNum) === hiddenClozeNumber) {
          return match; // Keep this one for later processing
        } else {
          return content; // Show the answer for other clozes
        }
      }
    );
    
    // Then hide the specific cloze being tested
    processed = processed.replace(
      new RegExp(`\\{\\{c${hiddenClozeNumber}::(.*?)(?:::.*?)?\\}\\}`, 'g'),
      '[...]'
    );
    
    return processed;
  }
  
  /**
   * Get the answer for a specific cloze deletion
   */
  export function getClozeAnswer(clozeContent: string, clozeNumber: number): string {
    const regex = new RegExp(`\\{\\{c${clozeNumber}::(.*?)(?:::.*?)?\\}\\}`, 'g');
    const matches = [...clozeContent.matchAll(regex)];
    
    if (matches.length === 0) return '';
    
    // If there are multiple instances of the same cloze number, join them
    return matches.map(match => match[1]).join(', ');
  }
  
  /**
   * Get hint for a specific cloze deletion (if exists)
   */
  export function getClozeHint(clozeContent: string, clozeNumber: number): string | null {
    const regex = new RegExp(`\\{\\{c${clozeNumber}::[^:]+::([^}]+)\\}\\}`, 'g');
    const match = regex.exec(clozeContent);
    
    return match ? match[1] : null;
  }