import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import type { ContentAnalysis, GeneratedCard, CardType } from './flashcardGeneration.types';
import { FALLBACK_BETA, assertCompleted, getClaude } from '@/lib/ai/claude';
import { getTaskModel } from '@/lib/ai/models';

// ============ SCHEMAS (enforced via structured outputs) ============

const Importance = z.enum(['high', 'medium', 'low']);
const CardKind = z.enum(['definition', 'mechanism', 'clinical_pearl', 'differential', 'treatment', 'diagnostic']);

const ContentAnalysisSchema = z.object({
  sections: z.array(z.object({
    title: z.string(),
    content: z.string(),
    type: z.enum([
      'definition', 'mechanism', 'clinical_pearl', 'differential', 'treatment',
      'diagnostic', 'epidemiology', 'pathophysiology', 'other',
    ]),
    importance: Importance,
  })),
  keyTerms: z.array(z.object({
    term: z.string(),
    definition: z.string().optional(),
    context: z.string(),
  })),
  relationships: z.array(z.object({
    from: z.string(),
    to: z.string(),
    type: z.enum(['causes', 'treats', 'diagnoses', 'distinguishes', 'indicates', 'contraindicates']),
  })),
  clinicalPearls: z.array(z.object({
    pearl: z.string(),
    context: z.string(),
    importance: Importance,
  })),
  suggestedCardCount: z.object({
    definitions: z.number().int(),
    mechanisms: z.number().int(),
    clinicalPearls: z.number().int(),
    differentials: z.number().int(),
    treatments: z.number().int(),
    diagnostics: z.number().int(),
  }),
});

const ClozeCardsSchema = z.object({
  cards: z.array(z.object({
    cloze: z.string(),
    type: CardKind,
    importance: Importance,
    sourceContext: z.string(),
  })),
});

const FrontBackCardsSchema = z.object({
  cards: z.array(z.object({
    front: z.string(),
    back: z.string(),
    type: CardKind,
    importance: Importance,
    sourceContext: z.string(),
  })),
});

const DuplicatesSchema = z.object({
  duplicate_indices: z.array(z.number().int()).describe(
    'Indices of cards to drop because they test the same fact as an earlier card'
  ),
});

/** Shared request settings for every flashcard-pipeline call. */
function baseParams() {
  return {
    model: getTaskModel('flashcardGeneration').model,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
  } satisfies Partial<Anthropic.Beta.MessageCreateParamsNonStreaming>;
}

/** Usage of every Claude call made during the last pipeline run, for cost logging. */
export type ClaudeResponses = Anthropic.Beta.BetaMessage[];

// ============ PROMPTS ============

const ANALYSIS_SYSTEM_PROMPT = `You are a medical education expert analyzing clinical notes for flashcard generation. Your task is to deeply analyze the content and extract structured information that will be used to create high-quality flashcards.

Analyze the note and return a JSON object with this structure:

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

Now generate flashcards based on this analysis. Do not create two cards that test the same fact.

${formatInstructions}

Return a JSON object with this structure:
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

function cleanNumberingArtifacts(text: string): string {
  return text.replace(/^(Flashcard|Card)\s*\d+[:\.]?\s*/i, '').trim();
}

// ============ MAIN FUNCTIONS ============

export async function analyzeNoteContent(
  content: string,
  title: string,
  responses: ClaudeResponses = []
): Promise<ContentAnalysis> {
  const response = await getClaude().beta.messages.parse({
    ...baseParams(),
    output_config: {
      effort: 'medium',
      format: betaZodOutputFormat(ContentAnalysisSchema),
    },
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `<title>${title}</title>\n\n<note>\n${content}\n</note>` },
    ],
  });
  responses.push(response);
  assertCompleted(response);

  const result = response.parsed_output;
  if (!result) throw new Error('Content analysis returned no parsable output');
  return result;
}

export async function generateTargetedCards(
  content: string,
  title: string,
  analysis: ContentAnalysis,
  cardType: CardType,
  maxCards: number,
  responses: ClaudeResponses = []
): Promise<GeneratedCard[]> {
  const analysisContext = buildAnalysisContext(analysis);
  const systemPrompt = buildCardGenerationSystemPrompt(analysisContext, cardType, maxCards);
  const schema = cardType === 'cloze' ? ClozeCardsSchema : FrontBackCardsSchema;

  const response = await getClaude().beta.messages.parse({
    ...baseParams(),
    output_config: {
      effort: 'medium',
      format: betaZodOutputFormat(schema),
    },
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `<title>${title}</title>\n\n<original_content>\n${content}\n</original_content>`,
      },
    ],
  });
  responses.push(response);
  assertCompleted(response);

  return response.parsed_output?.cards ?? [];
}

/**
 * Remove cards that test the same fact. Claude compares the cards semantically
 * (replaces the previous OpenAI-embeddings + cosine-similarity approach, since the
 * Claude API has no embeddings endpoint). The earliest card in each duplicate group
 * is kept, so callers should pass cards sorted by priority.
 */
export async function deduplicateCards(
  cards: GeneratedCard[],
  responses: ClaudeResponses = []
): Promise<GeneratedCard[]> {
  if (cards.length <= 1) return cards;

  const numbered = cards
    .map((c, i) => `[${i}] ${c.cloze ?? `Q: ${c.front} | A: ${c.back}`}`)
    .join('\n');

  const response = await getClaude().beta.messages.parse({
    ...baseParams(),
    output_config: {
      effort: 'low',
      format: betaZodOutputFormat(DuplicatesSchema),
    },
    system:
      'You review medical flashcards for redundancy. Two cards are duplicates when a student who ' +
      'knows the answer to one would automatically know the answer to the other. Cards on the same ' +
      'topic that test different facts are NOT duplicates. For each group of duplicates, keep the ' +
      'card with the lowest index and list the indices of the others.',
    messages: [{ role: 'user', content: `<cards>\n${numbered}\n</cards>` }],
  });
  responses.push(response);

  // Dedup is an optional refinement: if it fails, keep every card rather than erroring.
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    return cards;
  }
  const drop = new Set(
    (response.parsed_output?.duplicate_indices ?? []).filter((i) => i > 0 && i < cards.length)
  );
  return cards.filter((_, i) => !drop.has(i));
}

export async function generateSmartFlashcards(
  content: string,
  title: string,
  cardType: CardType,
  maxCards: number,
  enableDeduplication: boolean = false,
  responses: ClaudeResponses = []
): Promise<GeneratedCard[]> {

  // Stage 1: AI-powered content analysis
  const analysis = await analyzeNoteContent(content, title, responses);

  // Stage 2: Generate cards based on analysis
  const overfetchMultiplier = enableDeduplication ? 1.5 : 1.3;
  const cards = await generateTargetedCards(
    content,
    title,
    analysis,
    cardType,
    Math.ceil(maxCards * overfetchMultiplier),
    responses
  );

  // Stage 3: Sort by importance
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedCards = cards.sort((a, b) => {
    return priorityOrder[a.importance] - priorityOrder[b.importance];
  });

  // Stage 4: Optional deduplication
  const processedCards = enableDeduplication
    ? await deduplicateCards(sortedCards, responses)
    : sortedCards;

  // Stage 5: Clean numbering artifacts (safety net)
  const cleanedCards = processedCards.map(card => ({
    ...card,
    front: card.front ? cleanNumberingArtifacts(card.front) : undefined,
    back: card.back ? cleanNumberingArtifacts(card.back) : undefined,
    cloze: card.cloze ? cleanNumberingArtifacts(card.cloze) : undefined,
  }));

  // Stage 6: Limit to requested count
  return cleanedCards.slice(0, maxCards);
}
