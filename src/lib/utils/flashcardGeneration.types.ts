// Type definitions for smart flashcard generation

export interface ContentAnalysis {
  sections: Array<{
    title: string;
    content: string;
    type: 'definition' | 'mechanism' | 'clinical_pearl' | 'differential' |
          'treatment' | 'diagnostic' | 'epidemiology' | 'pathophysiology' | 'other';
    importance: 'high' | 'medium' | 'low';
  }>;
  keyTerms: Array<{
    term: string;
    definition?: string;
    context: string;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: 'causes' | 'treats' | 'diagnoses' | 'distinguishes' | 'indicates' | 'contraindicates';
  }>;
  clinicalPearls: Array<{
    pearl: string;
    context: string;
    importance: 'high' | 'medium' | 'low';
  }>;
  suggestedCardCount: {
    definitions: number;
    mechanisms: number;
    clinicalPearls: number;
    differentials: number;
    treatments: number;
    diagnostics: number;
  };
}

export interface GeneratedCard {
  front?: string;
  back?: string;
  cloze?: string;
  type: 'definition' | 'mechanism' | 'clinical_pearl' | 'differential' | 'treatment' | 'diagnostic';
  importance: 'high' | 'medium' | 'low';
  sourceContext?: string;
}

export type CardType = 'cloze' | 'front_back';
