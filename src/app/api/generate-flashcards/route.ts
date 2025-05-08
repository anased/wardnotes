// src/app/api/generate-flashcards/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import OpenAI from 'openai';
import { TipTapNode } from '@/types/content';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Define the maximum age for cached flashcards in minutes
const MAX_CACHE_AGE_MINUTES = 60; // 1 hour TTL

export async function GET(request: NextRequest) {
  try {
    // Get the note ID from the query params
    const searchParams = request.nextUrl.searchParams;
    const noteId = searchParams.get('noteId');
    console.log(`Processing download request for noteId: ${noteId}`);
    
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
    
    // First, get the note to retrieve its title (needed for the filename)
    const { data: note, error: noteError } = await supabaseWithAuth
      .from('notes')
      .select('title')
      .eq('id', noteId)
      .single();
    
    if (noteError || !note) {
      console.error('Error fetching note:', noteError);
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    
    const noteTitle = note.title;
    
    // Step 1: Check for existing flashcards in the database
    let clozeCards: string[] = [];
    
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - MAX_CACHE_AGE_MINUTES);
    
    const { data: existingGeneration, error: fetchError } = await supabaseWithAuth
      .from('flashcard_generations')
      .select('cards, created_at')
      .eq('note_id', noteId)
      .gte('created_at', cutoffTime.toISOString())
      .single();
    
    // If we found a recent generation, use it
    if (existingGeneration && !fetchError) {
      console.log(`Found existing flashcard generation from ${existingGeneration.created_at}`);
      clozeCards = existingGeneration.cards;
    } else {
      // Generate new flashcards
      // Query for the note using the authenticated client
      console.log(`No recent flashcard generation found, fetching full note content`);
      const { data: fullNote, error: fullNoteError } = await supabaseWithAuth
        .from('notes')
        .select('*')
        .eq('id', noteId)
        .single();
      
      if (fullNoteError || !fullNote) {
        console.error('Error fetching note content:', fullNoteError);
        return NextResponse.json({ error: 'Failed to fetch note content' }, { status: 404 });
      }
      
      // Convert TipTap JSON content to plain text
      const plainText = convertTipTapToPlainText(fullNote.content);
      console.log(`Converted note content to plain text (${plainText.length} characters)`);

      // Generate cloze cards using OpenAI
      clozeCards = await generateClozeCards(plainText, noteTitle);
      console.log(`Generated ${clozeCards.length} flashcards`);
      
      // Store the generated flashcards in the database
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
        // Even if saving fails, we can still continue with the download
      } else {
        console.log('Successfully saved flashcard generation to database');
      }
    }

    // Format as text file for Anki import
    const textContent = formatFlashcardsForAnki(clozeCards, noteTitle);
    
    // Generate a filename based on the note title
    const filename = `${noteTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_flashcards.txt`;
    
    // Return the text file for download
    return new NextResponse(textContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error('Error generating flashcards:', error);
    return NextResponse.json(
      { error: `Failed to generate flashcards: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

// Helper function to convert TipTap JSON to plain text
function convertTipTapToPlainText(content: TipTapNode): string {
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
    
    let responseContent: string = response.choices[0].message.content || '';
    return responseContent.split('\n').filter(line => line.trim().length > 0);
  } catch (error) {
    console.log('Error with primary model, trying fallback model:', error);
    
    // Try a cheaper model as fallback
    try {
      const fallbackResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Cheaper model
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

// Format flashcards for Anki import
function formatFlashcardsForAnki(cards: string[], noteTitle: string): string {
  // Add header with instructions
  let content = `# Anki Flashcards for "${noteTitle}"\n`;
  content += "# Import Instructions:\n";
  content += "# 1. In Anki, go to File > Import\n";
  content += "# 2. Select this text file\n";
  content += "# 3. Choose 'Cloze' as the note type\n";
  content += "# 4. Select 'Tab' as the field separator\n";
  content += "# 5. Map the field to 'Text'\n";
  content += "# 6. Click Import\n\n";
  
  // Add the cards
  content += cards.join('\n\n');
  
  return content;
}