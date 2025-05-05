// src/app/api/generate-flashcards/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export async function GET(request: NextRequest) {
  try {
    // Get the note ID from the query params
    const searchParams = request.nextUrl.searchParams;
    const noteId = searchParams.get('noteId');
    console.log(`Processing request for noteId: ${noteId}`);
    
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
    
    // Query for the note using the authenticated client
    console.log(`Querying for note with ID: ${noteId}`);
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

    // Convert TipTap JSON content to plain text
    const plainText = convertTipTapToPlainText(note.content);
    console.log(`Converted note content to plain text (${plainText.length} characters)`);

    // Generate cloze cards using OpenAI
    const clozeCards = await generateClozeCards(plainText, note.title);
    console.log(`Generated ${clozeCards.length} flashcards`);

    // Since we can't use anki-apkg-export in Next.js easily,
    // let's return a text file formatted for Anki import
    const textContent = formatFlashcardsForAnki(clozeCards, note.title);
    
    // Return the text file for download
    return new NextResponse(textContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(note.title)}_flashcards.txt"`,
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
function convertTipTapToPlainText(content: any): string {
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
Convert the following medical note into Anki flashcards using cloze deletion format.

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
      // Generate simple flashcards as a final fallback
      return generateSimpleFlashcards(noteContent, noteTitle);
    }
  }
}

// Format flashcards for Anki import
function formatFlashcardsForAnki(cards: string[], deckName: string): string {
  // Add header with instructions
  let content = `# Anki Flashcards for "${deckName}"\n`;
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

// Simple function to generate basic flashcards without OpenAI
function generateSimpleFlashcards(noteContent: string, noteTitle: string): string[] {
  // Split the content into sentences
  const sentences = noteContent
    .replace(/([.?!])\s*(?=[A-Z])/g, "$1|")
    .split("|")
    .filter(s => s.trim().length > 10) // Only use substantial sentences
    .slice(0, 10); // Limit to 10 cards
  
  // Create simple cloze deletions
  return sentences.map(sentence => {
    // Find important terms (capitalized words, words after colons, etc.)
    const importantTerms = sentence.match(/\b[A-Z][a-z]+\b|\b[a-z]+(?=:)/g);
    
    if (importantTerms && importantTerms.length > 0) {
      // Choose a random important term to make into a cloze
      const term = importantTerms[Math.floor(Math.random() * importantTerms.length)];
      return sentence.replace(term, `{{c1::${term}}}`);
    } 
    
    // Fallback: Just cloze the first 2+ word phrase
    const words = sentence.split(' ');
    if (words.length >= 4) {
      const startIdx = Math.floor(Math.random() * (words.length - 2));
      const toReplace = words.slice(startIdx, startIdx + 2).join(' ');
      return sentence.replace(toReplace, `{{c1::${toReplace}}}`);
    }
    
    // Just return the sentence if we can't create a good cloze
    return sentence;
  });
}