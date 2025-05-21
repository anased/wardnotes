import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import OpenAI from 'openai';
import { TipTapNode } from '@/types/content';
import { requirePremium } from '@/lib/middleware/requirePremium';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Define the maximum age for cached flashcards in minutes
const MAX_CACHE_AGE_MINUTES = 60; // 1 hour TTL

export async function GET(request: NextRequest) {
  try {
    const premiumCheckResult = await requirePremium(request);
    if (premiumCheckResult) {
      return premiumCheckResult; // Return error response if not premium
    }
    // Get the note ID from the query params
    const searchParams = request.nextUrl.searchParams;
    const noteId = searchParams.get('noteId');
    console.log(`Processing preview request for noteId: ${noteId}`);
    
    if (!noteId) {
      return NextResponse.json({ error: 'Note ID is required' }, { status: 400 });
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No valid Authorization header found');
      return NextResponse.json({ error: 'Unauthorized - no valid Authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.split(' ')[1];
    console.log(`Token received (first 10 chars): ${token.substring(0, 10)}...`);

    // Create a new Supabase client with the auth token
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
    
    // Try to get the user with the auth token
    const { data: { user }, error: userError } = await supabaseWithAuth.auth.getUser();
    
    if (userError || !user) {
      console.error('Error getting user:', userError);
      return NextResponse.json({ error: 'Authentication error - invalid token' }, { status: 401 });
    }
    
    console.log(`Authenticated as user: ${user.id}`);
    
    // Step 1: Check for existing flashcards in the database
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - MAX_CACHE_AGE_MINUTES);
    
    const { data: existingGeneration, error: fetchError } = await supabaseWithAuth
      .from('flashcard_generations')
      .select('cards, created_at')
      .eq('note_id', noteId)
      .gte('created_at', cutoffTime.toISOString())
      .single();
    
    // If we found a recent generation, return it
    if (existingGeneration && !fetchError) {
      console.log(`Found existing flashcard generation from ${existingGeneration.created_at}`);
      return NextResponse.json({ cards: existingGeneration.cards });
    }
    
    // Step 2: If no recent generation, fetch the note
    const { data: note, error: noteError } = await supabaseWithAuth
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .single();
    
    if (noteError) {
      console.error('Error fetching note:', noteError);
      return NextResponse.json({ error: `Failed to fetch note: ${noteError.message}` }, { status: 404 });
    }
    
    if (!note) {
      console.log(`No note found with ID: ${noteId}`);
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    
    console.log(`Successfully retrieved note: ${note.title}`);

    // Step 3: Convert TipTap JSON content to plain text
    const plainText = convertTipTapToPlainText(note.content);
    console.log(`Converted note content to plain text (${plainText.length} characters)`);

    // Step 4: Generate flashcards using OpenAI
    const clozeCards = await generateClozeCards(plainText, note.title);
    console.log(`Generated ${clozeCards.length} flashcards`);
    
    // Step 5: Store the generated flashcards in the database
    // First, delete any existing generations for this note
    await supabaseWithAuth
      .from('flashcard_generations')
      .delete()
      .eq('note_id', noteId);
    
    // Then insert the new generation
    const { error: insertError } = await supabaseWithAuth
      .from('flashcard_generations')
      .insert({
        note_id: noteId,
        user_id: user.id,
        cards: clozeCards
      });
    
    if (insertError) {
      console.error('Error saving flashcard generation:', insertError);
      // Even if saving fails, we can still return the generated cards
    } else {
      console.log('Successfully saved flashcard generation to database');
    }

    // Return the generated flashcards
    return NextResponse.json({ cards: clozeCards });
  } catch (error) {
    console.error('Error generating flashcard preview:', error);
    return NextResponse.json(
      { error: `Failed to generate flashcard preview: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

// Helper function to convert TipTap JSON to plain text
function convertTipTapToPlainText(content: TipTapNode): string {
  let plainText = '';

  // Process nodes recursively
  const processNode = (node: any) => {
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

// Generate cloze deletion cards using OpenAI
async function generateClozeCards(noteContent: string, noteTitle: string): Promise<string[]> {
  const prompt = `
Generate comprehensive Anki flashcards for the following medical note using cloze deletion format.

Guidelines:
- Create ONLY 1-2 cards total 
- Focus on the most clinically relevant information 
- Create one cloze per fact (avoid multiple clozes in one card unless it is needed for reinforcing relationships between different elements) 
- Provide contextual information (never isolated facts) 
- Use hints with :: syntax only when needed (e.g., {{c1::term::hint}}) 
- Prefer individual cards for each list item.
- Use bidirectional phrasing where possible. 
- Format clozes as: {{c1::concept::hint}} or {{c1::term}}  
- Don't create back note
- when the information has list of items that needs to be memorized, create one card with multiple clozes

Medical Note Title: ${noteTitle}
Content:
${noteContent}

Return each card on a new line.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "You are a medical education expert who creates high-quality Anki flashcards with cloze deletions following best practices."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });
    
    const result = response.choices[0].message.content || '';
    return result.split('\n').filter(line => line.trim().length > 0);
  } catch (error) {
    console.log('Error with primary model, trying fallback model:', error);
    
    // Try a cheaper model as fallback
    try {
      const fallbackResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Cheaper model as fallback
        messages: [
          { 
            role: "system", 
            content: "You are a medical education expert who creates high-quality Anki flashcards with cloze deletions following best practices."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });
      
      const fallbackResult = fallbackResponse.choices[0].message.content || '';
      return fallbackResult.split('\n').filter(line => line.trim().length > 0);
    } catch (fallbackError) {
      console.error('All models failed:', fallbackError);
      throw fallbackError;
    }
  }
}