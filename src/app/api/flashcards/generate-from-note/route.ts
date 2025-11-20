// src/app/api/flashcards/generate-from-note/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type { GenerateFlashcardsRequest } from '@/types/flashcard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper function to convert TipTap JSON to plain text
function convertTipTapToPlainText(content: any): string {
  let plainText = '';

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

// Generate flashcards using OpenAI
async function generateFlashcards(
  content: string, 
  title: string, 
  cardType: 'cloze' | 'front_back', 
  maxCards: number
): Promise<Array<{front?: string, back?: string, cloze?: string}>> {
  const prompt = cardType === 'cloze' 
    ? `Generate ${maxCards} cloze deletion flashcards for the following medical note using {{c1::word}} format.

Guidelines:
- Create comprehensive cards covering key concepts
- Use {{c1::term}} or {{c1::term::hint}} format
- Focus on clinically relevant information
- Provide context, not isolated facts
- Create one cloze per fact (avoid multiple clozes in one card unless it reinforces relationships)
- Use bidirectional phrasing where possible

Medical Note Title: ${title}
Content: ${content}

Return each card on a new line.`
    : `Generate ${maxCards} front-and-back flashcards for the following medical note.

Guidelines:
- Create clear, concise questions
- Provide detailed, accurate answers
- Focus on clinically relevant information
- Use active recall principles
- Questions should test understanding, not just memorization
- Answers should be complete but concise

Medical Note Title: ${title}
Content: ${content}

Format each card as:
Q: [Question]
A: [Answer]

Separate each card with a blank line.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "You are a medical education expert who creates high-quality flashcards for medical students. Focus on creating clinically relevant, well-structured flashcards that promote deep understanding."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const result = response.choices[0].message.content || '';
    
    if (cardType === 'cloze') {
      return result.split('\n')
        .filter(line => line.trim().length > 0)
        .slice(0, maxCards)
        .map(line => ({ cloze: line.trim() }));
    } else {
      const cards: Array<{front: string, back: string}> = [];
      const lines = result.split('\n');
      let currentQuestion = '';
      let currentAnswer = '';
      
      for (const line of lines) {
        if (line.startsWith('Q:')) {
          currentQuestion = line.substring(2).trim();
        } else if (line.startsWith('A:')) {
          currentAnswer = line.substring(2).trim();
          if (currentQuestion && currentAnswer) {
            cards.push({ front: currentQuestion, back: currentAnswer });
            currentQuestion = '';
            currentAnswer = '';
            
            if (cards.length >= maxCards) break;
          }
        }
      }
      
      return cards;
    }
  } catch (error) {
    console.error('Error generating flashcards with AI:', error);
    
    // Fallback to simple text-based cards
    const sentences = content.split('.').filter(s => s.trim().length > 10);
    const fallbackCards = sentences.slice(0, Math.min(maxCards, 5)).map(sentence => {
      if (cardType === 'cloze') {
        const words = sentence.trim().split(' ');
        const importantWordIndex = Math.floor(words.length / 2);
        words[importantWordIndex] = `{{c1::${words[importantWordIndex]}}}`;
        return { cloze: words.join(' ') };
      } else {
        return { 
          front: `What is the meaning of: "${sentence.trim().substring(0, 50)}..."?`, 
          back: sentence.trim() 
        };
      }
    });
    
    return fallbackCards;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: GenerateFlashcardsRequest & { preview?: boolean } = await request.json();
    const { note_id, card_type, deck_id, max_cards = 10, preview = false } = body;

    // Get the note
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', note_id)
      .single();

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    // Convert note content to plain text
    const plainText = convertTipTapToPlainText(note.content);

    // Generate flashcards using AI
    const generatedCards = await generateFlashcards(
      plainText, 
      note.title, 
      card_type, 
      max_cards
    );

    // If this is just a preview, save to flashcard_generations table and return
    if (preview) {
      // Save preview to flashcard_generations table for later retrieval
      const { error: savePreviewError } = await supabase
        .from('flashcard_generations')
        .upsert({
          note_id: note_id,
          user_id: user.id,
          cards: generatedCards,
          card_type: card_type,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'note_id' // Update if exists, insert if not
        });

      if (savePreviewError) {
        console.error('Error saving preview to flashcard_generations:', savePreviewError);
        // Continue anyway - don't fail the preview generation
      }

      return NextResponse.json({
        cards: generatedCards,
        preview: true
      });
    }

    // For non-preview mode, save the flashcards to the database
    let finalDeckId = deck_id;
    
    // Get default deck if none specified
    if (!finalDeckId) {
      let { data: defaultDeck } = await supabase
        .from('flashcard_decks')
        .select('id')
        .eq('name', 'Default Deck')
        .eq('user_id', user.id)
        .single();
      
      if (!defaultDeck) {
        // Create default deck if it doesn't exist
        const { data: newDeck, error: createError } = await supabase
          .from('flashcard_decks')
          .insert({
            user_id: user.id,
            name: 'Default Deck',
            description: 'Auto-generated default deck for flashcards',
            color: '#3B82F6'
          })
          .select()
          .single();
        
        if (createError || !newDeck) {
          return NextResponse.json({ error: 'Failed to create default deck' }, { status: 500 });
        }
        
        defaultDeck = newDeck;
      }
      
      // Explicit null check to satisfy TypeScript
      if (!defaultDeck) {
        return NextResponse.json({ error: 'Failed to get or create default deck' }, { status: 500 });
      }
      
      finalDeckId = defaultDeck.id;
    }

    // Verify deck ownership
    const { data: deck, error: deckError } = await supabase
      .from('flashcard_decks')
      .select('id')
      .eq('id', finalDeckId)
      .eq('user_id', user.id)
      .single();

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found or unauthorized' }, { status: 404 });
    }

    // Create flashcards in the database
    const flashcardData = generatedCards.map(card => ({
      deck_id: finalDeckId!,
      note_id: note_id,
      user_id: user.id,
      card_type: card_type,
      front_content: card_type === 'front_back' ? card.front : undefined,
      back_content: card_type === 'front_back' ? card.back : undefined,
      cloze_content: card_type === 'cloze' ? card.cloze : undefined,
      tags: [],
      status: 'new' as const,
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      last_reviewed: null,
      next_review: new Date().toISOString(),
      total_reviews: 0,
      correct_reviews: 0
    }));

    const { data: savedFlashcards, error: insertError } = await supabase
      .from('flashcards')
      .insert(flashcardData)
      .select();

    if (insertError) {
      console.error('Error saving flashcards:', insertError);
      return NextResponse.json({ error: 'Failed to save flashcards' }, { status: 500 });
    }

    return NextResponse.json({ 
      flashcards: savedFlashcards,
      preview: false 
    });
  } catch (error) {
    console.error('Error in generate-from-note API:', error);
    return NextResponse.json(
      { error: `Failed to generate flashcards: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}