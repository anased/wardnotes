# Smart Flashcard Generation Implementation Plan

## Overview

A two-stage AI-powered flashcard generation system that:
1. **Stage 1 (Analysis)**: Analyzes medical note content to extract structured information (sections, key terms, relationships, clinical pearls)
2. **Stage 2 (Generation)**: Uses the analysis to generate targeted, prioritized flashcards

## Architecture

```
User Note → [Stage 1: Analysis] → ContentAnalysis → [Stage 2: Generation] → Flashcards
                   ↓                                        ↓
            analyzeNoteContent()                  generateTargetedCards()
```

---

## Type Definitions

```typescript
// ============ TYPES ============

interface ContentAnalysis {
  sections: Array<{
    title: string;
    content: string;
    type: 'definition' | 'mechanism' | 'clinical_pearl' | 'differential' | 'treatment' | 'diagnostic' | 'epidemiology' | 'pathophysiology' | 'other';
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

interface GeneratedCard {
  front?: string;
  back?: string;
  cloze?: string;
  type: 'definition' | 'mechanism' | 'clinical_pearl' | 'differential' | 'treatment' | 'diagnostic';
  importance: 'high' | 'medium' | 'low';
  sourceContext?: string;
}

type CardType = 'cloze' | 'front_back';
```

---

## Stage 1: Content Analysis

### System Prompt

```typescript
const ANALYSIS_SYSTEM_PROMPT = `You are a medical education expert analyzing clinical notes for flashcard generation. Your task is to deeply analyze the content and extract structured information that will be used to create high-quality flashcards.

Analyze the note and return a JSON object with the following structure:

{
  "sections": [
    {
      "title": "Section or topic name",
      "content": "Brief summary of what this section covers",
      "type": "definition|mechanism|clinical_pearl|differential|treatment|diagnostic|epidemiology|pathophysiology|other",
      "importance": "high|medium|low"
    }
  ],
  "keyTerms": [
    {
      "term": "Medical term or concept",
      "definition": "Definition if provided or inferrable",
      "context": "How it's used in this note"
    }
  ],
  "relationships": [
    {
      "from": "Entity A",
      "to": "Entity B", 
      "type": "causes|treats|diagnoses|distinguishes|indicates|contraindicates"
    }
  ],
  "clinicalPearls": [
    {
      "pearl": "The clinical insight or teaching point",
      "context": "When/where this applies",
      "importance": "high|medium|low"
    }
  ],
  "suggestedCardCount": {
    "definitions": <number>,
    "mechanisms": <number>,
    "clinicalPearls": <number>,
    "differentials": <number>,
    "treatments": <number>,
    "diagnostics": <number>
  }
}

Prioritization guidelines:
- HIGH importance: Patient safety, common conditions, board-tested facts (USMLE, RITE, shelf exams), classic presentations, first-line treatments
- MEDIUM importance: Mechanisms of disease, less common but testable content, diagnostic criteria, secondary treatments
- LOW importance: Rare conditions, excessive detail, historical context, controversial/evolving recommendations

For suggestedCardCount, recommend how many cards of each type would be appropriate based on the content density and importance. Be selective — not every fact needs a card.`;
```

### Function Implementation

```typescript
async function analyzeNoteContent(
  content: string,
  title: string
): Promise<ContentAnalysis> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: ANALYSIS_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: `Title: ${title}\n\nContent:\n${content}`
      }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  
  // Validate and provide defaults
  return {
    sections: result.sections || [],
    keyTerms: result.keyTerms || [],
    relationships: result.relationships || [],
    clinicalPearls: result.clinicalPearls || [],
    suggestedCardCount: result.suggestedCardCount || {
      definitions: 0,
      mechanisms: 0,
      clinicalPearls: 0,
      differentials: 0,
      treatments: 0,
      diagnostics: 0
    }
  };
}
```

---

## Stage 2: Card Generation

### Helper Function: Build Analysis Context

```typescript
function buildAnalysisContext(analysis: ContentAnalysis): string {
  let context = '';
  
  if (analysis.sections.length > 0) {
    context += `\n**Content Sections:**\n`;
    analysis.sections.forEach(s => {
      context += `- ${s.title} (${s.type}, ${s.importance} importance): ${s.content}\n`;
    });
  }
  
  if (analysis.keyTerms.length > 0) {
    context += `\n**Key Terms to Define:**\n`;
    analysis.keyTerms.forEach(t => {
      context += `- ${t.term}${t.definition ? `: ${t.definition}` : ''}\n`;
    });
  }
  
  if (analysis.relationships.length > 0) {
    context += `\n**Important Relationships:**\n`;
    analysis.relationships.forEach(r => {
      context += `- ${r.from} ${r.type} ${r.to}\n`;
    });
  }
  
  if (analysis.clinicalPearls.length > 0) {
    context += `\n**Clinical Pearls:**\n`;
    analysis.clinicalPearls.forEach(p => {
      context += `- [${p.importance}] ${p.pearl} (${p.context})\n`;
    });
  }
  
  if (analysis.suggestedCardCount) {
    const counts = analysis.suggestedCardCount;
    context += `\n**Suggested Card Distribution:**\n`;
    context += `Definitions: ${counts.definitions}, Mechanisms: ${counts.mechanisms}, `;
    context += `Clinical Pearls: ${counts.clinicalPearls}, Differentials: ${counts.differentials}, `;
    context += `Treatments: ${counts.treatments}, Diagnostics: ${counts.diagnostics}\n`;
  }
  
  return context;
}
```

### System Prompt Builder

```typescript
function buildCardGenerationSystemPrompt(
  analysisContext: string,
  cardType: CardType,
  maxCards: number
): string {
  const formatInstructions = cardType === 'cloze'
    ? `Generate cloze deletion cards using {{c1::answer}} or {{c1::answer::hint}} format.
For relationships, you may use {{c1::}} and {{c2::}} to test both directions.
Each card should test ONE concept (avoid multiple unrelated clozes in one card).`
    : `Generate question-and-answer cards.
Questions should require active recall, not recognition.
Answers should be complete but concise.`;

  const cardSchema = cardType === 'cloze'
    ? '"cloze": "The cloze deletion text with {{c1::answer}}"'
    : '"front": "Question text",\n      "back": "Answer text"';

  return `You are a medical education expert creating flashcards for medical students and residents.

You have already analyzed this note and identified the following key elements:
${analysisContext}

Now generate flashcards based on this analysis. 

${formatInstructions}

Return a JSON object:
{
  "cards": [
    {
      ${cardSchema},
      "type": "definition|mechanism|clinical_pearl|differential|treatment|diagnostic",
      "importance": "high|medium|low",
      "sourceContext": "Brief note about what part of the content this tests"
    }
  ]
}

Guidelines:
- Prioritize HIGH importance items first
- Create cards that test understanding, not just memorization
- For mechanisms: test the "why" not just the "what"
- For treatments: include relevant context (patient population, contraindications)
- For differentials: focus on distinguishing features
- Avoid trivial or overly specific details
- Aim for approximately ${maxCards} cards, but quality over quantity`;
}
```

### Function Implementation

```typescript
async function generateTargetedCards(
  content: string,
  title: string,
  analysis: ContentAnalysis,
  cardType: CardType,
  maxCards: number
): Promise<GeneratedCard[]> {
  const analysisContext = buildAnalysisContext(analysis);
  const systemPrompt = buildCardGenerationSystemPrompt(analysisContext, cardType, maxCards);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `Title: ${title}\n\nOriginal Content:\n${content}`
      }
    ],
    temperature: 0.4,
    response_format: { type: "json_object" }
  });

  const result = JSON.parse(response.choices[0].message.content || '{"cards": []}');
  return result.cards || [];
}
```

---

## Main Orchestration Function

```typescript
async function generateSmartFlashcards(
  content: string,
  title: string,
  cardType: CardType,
  maxCards: number
): Promise<GeneratedCard[]> {
  
  // Stage 1: AI-powered content analysis
  const analysis = await analyzeNoteContent(content, title);
  
  // Stage 2: Generate cards based on analysis
  // Request slightly more cards than needed for filtering
  const cards = await generateTargetedCards(
    content,
    title,
    analysis,
    cardType,
    Math.ceil(maxCards * 1.3)
  );
  
  // Stage 3: Sort by importance and limit to requested count
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  
  const sortedCards = cards.sort((a, b) => {
    return priorityOrder[a.importance] - priorityOrder[b.importance];
  });
  
  return sortedCards.slice(0, maxCards);
}
```

---

## Optional: Semantic Deduplication

Add this if you want to remove semantically similar cards:

```typescript
async function deduplicateCards(
  cards: GeneratedCard[],
  similarityThreshold: number = 0.85
): Promise<GeneratedCard[]> {
  // Get card text for embedding
  const cardTexts = cards.map(c => c.cloze || `${c.front} ${c.back}`);
  
  // Get embeddings from OpenAI
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: cardTexts
  });
  
  const embeddings = embeddingResponse.data.map(d => d.embedding);
  
  // Greedy deduplication: keep first (highest priority) card from each cluster
  const kept: number[] = [];
  const removed = new Set<number>();
  
  for (let i = 0; i < cards.length; i++) {
    if (removed.has(i)) continue;
    
    kept.push(i);
    
    // Mark similar cards for removal
    for (let j = i + 1; j < cards.length; j++) {
      if (removed.has(j)) continue;
      
      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
      if (similarity > similarityThreshold) {
        removed.add(j);
      }
    }
  }
  
  return kept.map(i => cards[i]);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

---

## Updated Orchestration with Deduplication

```typescript
async function generateSmartFlashcardsWithDedup(
  content: string,
  title: string,
  cardType: CardType,
  maxCards: number,
  enableDeduplication: boolean = false
): Promise<GeneratedCard[]> {
  
  // Stage 1: AI-powered content analysis
  const analysis = await analyzeNoteContent(content, title);
  
  // Stage 2: Generate cards based on analysis
  const cards = await generateTargetedCards(
    content,
    title,
    analysis,
    cardType,
    Math.ceil(maxCards * 1.5) // Generate more if deduplicating
  );
  
  // Stage 3: Sort by importance
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedCards = cards.sort((a, b) => {
    return priorityOrder[a.importance] - priorityOrder[b.importance];
  });
  
  // Stage 4: Optional deduplication
  const processedCards = enableDeduplication 
    ? await deduplicateCards(sortedCards)
    : sortedCards;
  
  // Stage 5: Limit to requested count
  return processedCards.slice(0, maxCards);
}
```

---

## Complete Single-File Implementation

Here is the complete implementation in a single file for easy integration:

```typescript
import OpenAI from 'openai';

// ============ TYPES ============

interface ContentAnalysis {
  sections: Array<{
    title: string;
    content: string;
    type: 'definition' | 'mechanism' | 'clinical_pearl' | 'differential' | 'treatment' | 'diagnostic' | 'epidemiology' | 'pathophysiology' | 'other';
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

interface GeneratedCard {
  front?: string;
  back?: string;
  cloze?: string;
  type: 'definition' | 'mechanism' | 'clinical_pearl' | 'differential' | 'treatment' | 'diagnostic';
  importance: 'high' | 'medium' | 'low';
  sourceContext?: string;
}

type CardType = 'cloze' | 'front_back';

// ============ PROMPTS ============

const ANALYSIS_SYSTEM_PROMPT = `You are a medical education expert analyzing clinical notes for flashcard generation. Your task is to deeply analyze the content and extract structured information that will be used to create high-quality flashcards.

Analyze the note and return a JSON object with the following structure:

{
  "sections": [
    {
      "title": "Section or topic name",
      "content": "Brief summary of what this section covers",
      "type": "definition|mechanism|clinical_pearl|differential|treatment|diagnostic|epidemiology|pathophysiology|other",
      "importance": "high|medium|low"
    }
  ],
  "keyTerms": [
    {
      "term": "Medical term or concept",
      "definition": "Definition if provided or inferrable",
      "context": "How it's used in this note"
    }
  ],
  "relationships": [
    {
      "from": "Entity A",
      "to": "Entity B", 
      "type": "causes|treats|diagnoses|distinguishes|indicates|contraindicates"
    }
  ],
  "clinicalPearls": [
    {
      "pearl": "The clinical insight or teaching point",
      "context": "When/where this applies",
      "importance": "high|medium|low"
    }
  ],
  "suggestedCardCount": {
    "definitions": <number>,
    "mechanisms": <number>,
    "clinicalPearls": <number>,
    "differentials": <number>,
    "treatments": <number>,
    "diagnostics": <number>
  }
}

Prioritization guidelines:
- HIGH importance: Patient safety, common conditions, board-tested facts (USMLE, RITE, shelf exams), classic presentations, first-line treatments
- MEDIUM importance: Mechanisms of disease, less common but testable content, diagnostic criteria, secondary treatments
- LOW importance: Rare conditions, excessive detail, historical context, controversial/evolving recommendations

For suggestedCardCount, recommend how many cards of each type would be appropriate based on the content density and importance. Be selective — not every fact needs a card.`;

// ============ HELPER FUNCTIONS ============

function buildAnalysisContext(analysis: ContentAnalysis): string {
  let context = '';
  
  if (analysis.sections.length > 0) {
    context += `\n**Content Sections:**\n`;
    analysis.sections.forEach(s => {
      context += `- ${s.title} (${s.type}, ${s.importance} importance): ${s.content}\n`;
    });
  }
  
  if (analysis.keyTerms.length > 0) {
    context += `\n**Key Terms to Define:**\n`;
    analysis.keyTerms.forEach(t => {
      context += `- ${t.term}${t.definition ? `: ${t.definition}` : ''}\n`;
    });
  }
  
  if (analysis.relationships.length > 0) {
    context += `\n**Important Relationships:**\n`;
    analysis.relationships.forEach(r => {
      context += `- ${r.from} ${r.type} ${r.to}\n`;
    });
  }
  
  if (analysis.clinicalPearls.length > 0) {
    context += `\n**Clinical Pearls:**\n`;
    analysis.clinicalPearls.forEach(p => {
      context += `- [${p.importance}] ${p.pearl} (${p.context})\n`;
    });
  }
  
  if (analysis.suggestedCardCount) {
    const counts = analysis.suggestedCardCount;
    context += `\n**Suggested Card Distribution:**\n`;
    context += `Definitions: ${counts.definitions}, Mechanisms: ${counts.mechanisms}, `;
    context += `Clinical Pearls: ${counts.clinicalPearls}, Differentials: ${counts.differentials}, `;
    context += `Treatments: ${counts.treatments}, Diagnostics: ${counts.diagnostics}\n`;
  }
  
  return context;
}

function buildCardGenerationSystemPrompt(
  analysisContext: string,
  cardType: CardType,
  maxCards: number
): string {
  const formatInstructions = cardType === 'cloze'
    ? `Generate cloze deletion cards using {{c1::answer}} or {{c1::answer::hint}} format.
For relationships, you may use {{c1::}} and {{c2::}} to test both directions.
Each card should test ONE concept (avoid multiple unrelated clozes in one card).`
    : `Generate question-and-answer cards.
Questions should require active recall, not recognition.
Answers should be complete but concise.`;

  const cardSchema = cardType === 'cloze'
    ? '"cloze": "The cloze deletion text with {{c1::answer}}"'
    : '"front": "Question text",\n      "back": "Answer text"';

  return `You are a medical education expert creating flashcards for medical students and residents.

You have already analyzed this note and identified the following key elements:
${analysisContext}

Now generate flashcards based on this analysis. 

${formatInstructions}

Return a JSON object:
{
  "cards": [
    {
      ${cardSchema},
      "type": "definition|mechanism|clinical_pearl|differential|treatment|diagnostic",
      "importance": "high|medium|low",
      "sourceContext": "Brief note about what part of the content this tests"
    }
  ]
}

Guidelines:
- Prioritize HIGH importance items first
- Create cards that test understanding, not just memorization
- For mechanisms: test the "why" not just the "what"
- For treatments: include relevant context (patient population, contraindications)
- For differentials: focus on distinguishing features
- Avoid trivial or overly specific details
- Aim for approximately ${maxCards} cards, but quality over quantity`;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============ MAIN FUNCTIONS ============

export async function analyzeNoteContent(
  openai: OpenAI,
  content: string,
  title: string
): Promise<ContentAnalysis> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: ANALYSIS_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: `Title: ${title}\n\nContent:\n${content}`
      }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  
  return {
    sections: result.sections || [],
    keyTerms: result.keyTerms || [],
    relationships: result.relationships || [],
    clinicalPearls: result.clinicalPearls || [],
    suggestedCardCount: result.suggestedCardCount || {
      definitions: 0,
      mechanisms: 0,
      clinicalPearls: 0,
      differentials: 0,
      treatments: 0,
      diagnostics: 0
    }
  };
}

export async function generateTargetedCards(
  openai: OpenAI,
  content: string,
  title: string,
  analysis: ContentAnalysis,
  cardType: CardType,
  maxCards: number
): Promise<GeneratedCard[]> {
  const analysisContext = buildAnalysisContext(analysis);
  const systemPrompt = buildCardGenerationSystemPrompt(analysisContext, cardType, maxCards);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `Title: ${title}\n\nOriginal Content:\n${content}`
      }
    ],
    temperature: 0.4,
    response_format: { type: "json_object" }
  });

  const result = JSON.parse(response.choices[0].message.content || '{"cards": []}');
  return result.cards || [];
}

export async function deduplicateCards(
  openai: OpenAI,
  cards: GeneratedCard[],
  similarityThreshold: number = 0.85
): Promise<GeneratedCard[]> {
  if (cards.length <= 1) return cards;
  
  const cardTexts = cards.map(c => c.cloze || `${c.front} ${c.back}`);
  
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: cardTexts
  });
  
  const embeddings = embeddingResponse.data.map(d => d.embedding);
  
  const kept: number[] = [];
  const removed = new Set<number>();
  
  for (let i = 0; i < cards.length; i++) {
    if (removed.has(i)) continue;
    
    kept.push(i);
    
    for (let j = i + 1; j < cards.length; j++) {
      if (removed.has(j)) continue;
      
      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
      if (similarity > similarityThreshold) {
        removed.add(j);
      }
    }
  }
  
  return kept.map(i => cards[i]);
}

export async function generateSmartFlashcards(
  openai: OpenAI,
  content: string,
  title: string,
  cardType: CardType,
  maxCards: number,
  enableDeduplication: boolean = false
): Promise<GeneratedCard[]> {
  
  // Stage 1: AI-powered content analysis
  const analysis = await analyzeNoteContent(openai, content, title);
  
  // Stage 2: Generate cards based on analysis
  const overfetchMultiplier = enableDeduplication ? 1.5 : 1.3;
  const cards = await generateTargetedCards(
    openai,
    content,
    title,
    analysis,
    cardType,
    Math.ceil(maxCards * overfetchMultiplier)
  );
  
  // Stage 3: Sort by importance
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedCards = cards.sort((a, b) => {
    return priorityOrder[a.importance] - priorityOrder[b.importance];
  });
  
  // Stage 4: Optional deduplication
  const processedCards = enableDeduplication 
    ? await deduplicateCards(openai, sortedCards)
    : sortedCards;
  
  // Stage 5: Limit to requested count
  return processedCards.slice(0, maxCards);
}
```
