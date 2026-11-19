// src/app/api/improve-note/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import {
  CLAUDE_MODEL,
  FALLBACK_BETA,
  assertCompleted,
  extractText,
  getClaude,
  summarizeUsage,
  toHttpError,
} from '@/lib/ai/claude';
import { TipTapNode } from '@/types/content';
import { convertTipTapToPlainText } from '@/lib/utils/content-converter';
import { checkAndIncrementQuota, logApiUsage } from '@/lib/services/quotaService';

export const maxDuration = 120;

const SYSTEM_PROMPT = `You are a medical education assistant. A user has submitted a free-text note capturing what they learned during clinical rounds. Your task is to clarify, organize, and elevate the learning content without altering its core message.

Apply the following guidelines:
1. Rewrite the note using clear, concise, and formal medical language.
2. Organize the content using bullet points or numbered lists if appropriate.
3. Expand abbreviations and incomplete phrases when their meaning is clear.
4. Emphasize key concepts, mechanisms, or decision points relevant to clinical learning.
5. If useful, include short explanations, references to clinical guidelines, or examples to reinforce understanding, but do not add facts not implied by the original note.
6. Maintain the original tone and intent; this is a learning note, not a patient record.
7. Organize information into clear sections with headings (# for main headings, ## for subheadings).
8. Use only Markdown that the TipTap editor renders: **bold**, bullet lists with "- ", numbered lists, and # / ## headings.
9. Preserve all critical medical information.

Return only the improved note in Markdown, with no preamble or closing remarks.`;

// Define the maximum character limit
const MAX_CHARACTERS = 4000;

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - no valid Authorization header' }, { status: 401 });
    }

    // Extract the token
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

    // Check and increment quota before improving
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
        { status: 429 } // Too Many Requests
      );
    }

    const requestData = await request.json();
    const { content } = requestData;

    if (!content) {
      return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
    }

    // Convert TipTap JSON to plain text for character count if needed
    let plainText = '';
    if (typeof content === 'object') {
      plainText = convertTipTapToPlainText(content as TipTapNode);
    } else {
      plainText = content;
    }

    // Validate character count
    if (plainText.length > MAX_CHARACTERS) {
      return NextResponse.json({
        error: `Note exceeds maximum character limit of ${MAX_CHARACTERS} characters`
      }, { status: 400 });
    }

    // Send to Claude for improvement
    const response = await getClaude().beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'low' }, // rewriting/formatting, not deep reasoning
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please improve the following note to make it more concise, structured, and professional while maintaining all important clinical information:\n\n<note>\n${plainText}\n</note>`,
        },
      ],
    });

    assertCompleted(response);
    const improvedNote = extractText(response);
    const usage = summarizeUsage(response);

    // Log actual API usage for analytics
    await logApiUsage(user.id, 'note_improvement', usage.costUsd, usage.tokens, true);

    // Return the improved note with quota info
    return NextResponse.json({
      improvedNote,
      quota: {
        used: quotaCheck.used,
        limit: quotaCheck.limit,
        remaining: quotaCheck.remaining
      }
    });
  } catch (error) {
    console.error('Error improving note:', error);
    const { status, message } = toHttpError(error);
    return NextResponse.json({ error: `Failed to improve note: ${message}` }, { status });
  }
}