// src/app/api/answer-questions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import {
  CLAUDE_MODEL,
  FALLBACK_BETA,
  assertCompleted,
  getClaude,
  summarizeUsage,
  toHttpError,
} from '@/lib/ai/claude';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { checkAndIncrementQuota, logApiUsage, refundQuota } from '@/lib/services/quotaService';

export const maxDuration = 180;

// Validation constants
const MAX_QUESTIONS = 5;
const MAX_CONTEXT_LENGTH = 2000;
const MAX_QUESTION_LENGTH = 500;

const SYSTEM_PROMPT = `You are a medical education assistant helping
residents learn from clinical encounters. You receive a clinical
context and learning questions from that encounter.

## Answer Philosophy

Answer the way an experienced subspecialty fellow would teach during
a case debrief: precise, evidence-aware, and always connecting back
to the specific patient.

## How to Answer Each Question

1. **Direct answer with the actual criteria/framework.** When a
question asks about diagnostic criteria, classification systems, or
clinical guidelines — give the real criteria with their source. Do
not paraphrase or simplify into vague summaries. Include the specific
organization or guideline name (e.g., "MDS Clinical Diagnostic
Criteria, 2015"). If there are sensitivity/specificity data for the
criteria, include them.

2. **Apply it to THIS patient.** After stating the criteria or
framework, explicitly walk through how this patient's presentation
maps (or doesn't map) onto it. Name which criteria are met, which
are absent, and what that means diagnostically. This is the most
important part — residents learn by seeing criteria applied to real
cases, not stated in the abstract.

3. **Actionable clinical specifics.** Include concrete numbers that
a resident would need: diagnostic thresholds, drug doses for
therapeutic trials, test performance characteristics (sensitivity,
specificity, PPV/NPV), timing parameters, or grading scales. If you
are confident in a specific number, state it. If you are uncertain
about a specific value, say "guidelines recommend..." without
fabricating the number.

4. **Name the key differentials or next steps for this specific
presentation.** Don't just answer the question in isolation —
identify what else should be on the differential or what additional
workup is warranted given the full clinical picture. If there are
red flags or atypical features in the presentation, explicitly call
them out and explain what they suggest.

5. **End with a pearl or pitfall.** One high-yield teaching point
prefixed with "**Pearl:**" or "**Pitfall:**"

## Critical Rules

- **Depth over brevity.** Each answer should be 200-400 words.
  A good clinical answer requires enough detail to actually change
  practice. Do not sacrifice important clinical content for the sake
  of conciseness.
- **Never give a simplified version when the real criteria exist.**
  If there are formal diagnostic criteria (MDS criteria, ICHD
  criteria, Wells score, etc.), state them properly with their
  components. Residents need to learn the actual frameworks, not
  approximations.
- **When a scoring system is mentioned, calculate it for this
  patient.** Walk through each component of the score with the
  specific values from the clinical context. Show the math. A
  resident should be able to follow your calculation and reproduce
  it independently. Do not just name the scoring system and state
  the conclusion — the learning is in seeing the calculation applied.
- **When recommending medications, always include the dose and
  frequency.** "Cefepime 2g IV every 8 hours" not just "cefepime."
  "Prednisone 40mg daily for 5 days" not just "systemic steroids."
  Residents are placing orders, not writing essays. If there are
  multiple first-line options, list 2-3 with doses.
- **Explicitly address what NOT to do.** For every management
  question, include at least one common intervention that is often
  done reflexively but is NOT indicated in this specific case, and
  explain why. (Example: "Do not routinely add vancomycin unless
  hemodynamically unstable, suspected line infection, or MRSA
  colonization — this patient has none of these indications.")
  Knowing what to withhold is as important as knowing what to start.
- **Always address atypical features.** If the clinical context
  contains features that don't fit the expected pattern, explicitly
  discuss what those atypical features mean diagnostically. This is
  where the most important learning happens.
- **Connect across questions.** If the answer to Q2 is influenced
  by something discussed in Q1, reference it. Clinical reasoning
  is not siloed.
- **When the exam findings suggest additional pathology beyond what
  was asked about, say so.** If the clinical context contains
  findings that suggest a diagnosis the learner may not have
  considered, proactively flag this. The best teaching moments come
  from noticing what the learner didn't ask about.

## Formatting

Return one answer per question, tagged with its question number.
Write each answer in Markdown:
- **Bold** for key terms, named criteria, and critical values
- Bullet points for lists of 3+ items (criteria components,
  differentials, steps)
- Short paragraphs (2-3 sentences each)
- Do NOT use headers (##) within individual answers
- Do NOT repeat the question text back`;

interface AnswerRequest {
  clinicalContext: string;
  questions: string[];
}

interface QuestionAnswer {
  question: string;
  answer: string;
}

const AnswersSchema = z.object({
  answers: z.array(
    z.object({
      question_number: z.number().int().describe('1-based number of the question being answered'),
      answer: z.string().describe('The Markdown-formatted answer'),
    })
  ),
});

const MISSING_ANSWER = 'Unable to generate answer for this question.';

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  try {
    // 1. Authentication (same pattern as improve-note)
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - no valid Authorization header' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    // Create Supabase client with auth token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabaseWithAuth = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabaseWithAuth.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication error - invalid token' }, { status: 401 });
    }

    // 2. Parse and validate request
    const { clinicalContext, questions }: AnswerRequest = await request.json();

    if (!clinicalContext || typeof clinicalContext !== 'string') {
      return NextResponse.json({ error: 'Clinical context is required' }, { status: 400 });
    }

    if (clinicalContext.length > MAX_CONTEXT_LENGTH) {
      return NextResponse.json({
        error: `Clinical context exceeds ${MAX_CONTEXT_LENGTH} characters`
      }, { status: 400 });
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: 'At least one question is required' }, { status: 400 });
    }

    if (questions.length > MAX_QUESTIONS) {
      return NextResponse.json({
        error: `Maximum ${MAX_QUESTIONS} questions allowed`
      }, { status: 400 });
    }

    // Filter and validate each question
    const validQuestions = questions.filter(q => typeof q === 'string' && q.trim().length > 0);

    if (validQuestions.length === 0) {
      return NextResponse.json({ error: 'At least one non-empty question is required' }, { status: 400 });
    }

    for (const q of validQuestions) {
      if (q.length > MAX_QUESTION_LENGTH) {
        return NextResponse.json({
          error: `Each question must be under ${MAX_QUESTION_LENGTH} characters`
        }, { status: 400 });
      }
    }

    // 3. Quota check, only after the request is known to be valid
    //    (shares quota with note_improvement)
    const quotaCheck = await checkAndIncrementQuota(
      user.id,
      'note_improvement'
    );

    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Quota exceeded',
          message: quotaCheck.message,
          quota: {
            used: quotaCheck.used,
            limit: quotaCheck.limit,
            remaining: 0
          }
        },
        { status: 429 }
      );
    }

    // From here on the user has been charged; refund if anything fails
    chargedUserId = user.id;

    // 4. Generate answers with Claude
    const startTime = Date.now();

    const formattedQuestions = validQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');

    const response = await getClaude().beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000, // covers adaptive thinking + up to 5 answers of ~400 words
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: {
        effort: 'high', // clinical reasoning benefits from deeper thinking
        format: betaZodOutputFormat(AnswersSchema),
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `<clinical_context>
${clinicalContext.trim()}
</clinical_context>

<questions>
${formattedQuestions}
</questions>

Please answer each question based on the clinical context provided.`,
        },
      ],
    });

    assertCompleted(response);
    const generationTime = Date.now() - startTime;
    const usage = summarizeUsage(response);

    // 5. Map structured answers back onto the original questions
    const byNumber = new Map(
      (response.parsed_output?.answers ?? []).map((a) => [a.question_number, a.answer.trim()])
    );
    if (byNumber.size === 0) {
      throw new Error('The AI returned no answers.');
    }
    const answers: QuestionAnswer[] = validQuestions.map((question, i) => ({
      question,
      answer: byNumber.get(i + 1) || MISSING_ANSWER,
    }));

    // 6. Log actual API usage
    await logApiUsage(user.id, 'answer_questions', usage.costUsd, usage.tokens, true);

    // 7. Return response
    return NextResponse.json({
      answers,
      metadata: {
        generationTime,
        questionCount: validQuestions.length
      },
      quota: {
        used: quotaCheck.used,
        limit: quotaCheck.limit,
        remaining: quotaCheck.remaining
      }
    });

  } catch (error) {
    console.error('Error answering questions:', error);
    const { status, message } = toHttpError(error);
    if (chargedUserId) {
      await refundQuota(chargedUserId, 'note_improvement', message, 'answer_questions');
    }
    return NextResponse.json({ error: `Failed to answer questions: ${message}` }, { status });
  }
}
