// src/app/api/flashcards/generate-from-note/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type { GenerateFlashcardsRequest } from '@/types/flashcard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    const body: GenerateFlashcardsRequest = await request.json();

    // Get the note
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', body.note_id)
      .single();

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    // Convert note content to plain text
    const plainText = convertTipTapToPlainText(note.content);

    // Generate flashcards using AI
    const flashcards = await generateFlashcards(
      plainText, 
      note.title, 
      body.card_type, 
      body.max_cards || 10
    );

    // Get default deck if none specified
    let deckId = body.deck_id;
    if (!deckId) {
      // Try to find or create a default deck
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
        
        if (createError) {
          return NextResponse.json({ error: 'Failed to create default deck' }, { status: 500 });
        }
        
        defaultDeck = newDeck;
      }
      
      deckId = defaultDeck.id;
    }

    // Create flashcards in the database
    const flashcardData = flashcards.map(card => ({
      deck_id: deckId!,
      note_id: body.note_id,
      user_id: user.id,
      card_type: body.card_type,
      front_content: body.card_type === 'front_back' ? card.front : undefined,
      back_content: body.card_type === 'front_back' ? card.back : undefined,
      cloze_content: body.card_type === 'cloze' ? card.cloze : undefined,
      tags: note.tags || [],
      status: 'new' as const,
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      next_review: new Date().toISOString(),
      total_reviews: 0,
      correct_reviews: 0
    }));

    const { data: createdFlashcards, error: createError } = await supabase
      .from('flashcards')
      .insert(flashcardData)
      .select();

    if (createError) {
      console.error('Error creating flashcards:', createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    // Also save to flashcard_generations table for compatibility
    await supabase
      .from('flashcard_generations')
      .upsert({
        note_id: body.note_id,
        user_id: user.id,
        cards: flashcards.map(card => 
          body.card_type === 'cloze' ? card.cloze! : `${card.front} -> ${card.back}`
        ),
        card_type: body.card_type
      });

    return NextResponse.json({ 
      flashcards: createdFlashcards,
      count: createdFlashcards?.length || 0
    });
  } catch (error) {
    console.error('Error generating flashcards from note:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` }, 
      { status: 500 }
    );
  }
}

// Helper function to convert TipTap JSON to plain text
function convertTipTapToPlainText(content: any): string {
  let plainText = '';

  const processNode = (node: any) => {
    if (node.text) {
      plainText += node.text;
    } else if (node.content) {
      node.content.forEach(processNode);
      
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

// Generate flashcards using AI
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
    const sentences = content.split('.').filter(s => s.trim().length > 20);
    const numCards = Math.min(maxCards, sentences.length);
    
    return sentences.slice(0, numCards).map((sentence, i) => {
      if (cardType === 'cloze') {
        // Simple cloze: blank out the first significant word
        const words = sentence.trim().split(' ');
        const significantWordIndex = words.findIndex(w => w.length > 4);
        if (significantWordIndex !== -1) {
          const word = words[significantWordIndex];
          const clozeText = sentence.replace(word, `{{c1::${word}}}`);
          return { cloze: clozeText };
        }
        return { cloze: `{{c1::${sentence.trim()}}}` };
      } else {
        return {
          front: `What does this medical concept refer to: "${sentence.trim()}"?`,
          back: `This refers to a concept discussed in the note about ${title}.`
        };
      }
    });
  }
}