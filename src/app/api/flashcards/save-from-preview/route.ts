// src/app/api/flashcards/save-from-preview/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Flashcard } from '@/types/flashcard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface SaveFromPreviewRequest {
  note_id: string;
  deck_id: string;
  card_type: 'cloze' | 'front_back';
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

    const body: SaveFromPreviewRequest = await request.json();

    // Step 1: Get the previewed flashcards from flashcard_generations table
    const { data: generation, error: generationError } = await supabase
      .from('flashcard_generations')
      .select('cards')
      .eq('note_id', body.note_id)
      .eq('user_id', user.id)
      .single();

    if (generationError || !generation) {
      return NextResponse.json(
        { error: 'No preview flashcards found. Please generate a preview first.' }, 
        { status: 404 }
      );
    }

    // Step 2: Ensure the target deck exists and belongs to the user
    const { data: deck, error: deckError } = await supabase
      .from('flashcard_decks')
      .select('id')
      .eq('id', body.deck_id)
      .eq('user_id', user.id)
      .single();

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found or unauthorized' }, { status: 404 });
    }

    // Step 3: Convert the preview cards to flashcard records
    const flashcardData = generation.cards.map((cardText: string) => {
      const baseCard = {
        deck_id: body.deck_id,
        note_id: body.note_id,
        user_id: user.id,
        card_type: body.card_type,
        status: 'new' as const,
        ease_factor: 2.5,
        interval_days: 0,
        repetitions: 0,
        last_reviewed: null,
        next_review: new Date().toISOString(),
        total_reviews: 0,
        correct_reviews: 0,
        tags: []
      };

      if (body.card_type === 'cloze') {
        return {
          ...baseCard,
          cloze_content: cardText,
          front_content: null,
          back_content: null
        };
      } else {
        // For front_back cards, assume format is "front -> back" or "front\tback"
        const parts = cardText.includes(' -> ') 
          ? cardText.split(' -> ') 
          : cardText.split('\t');
        
        return {
          ...baseCard,
          front_content: parts[0]?.trim() || cardText,
          back_content: parts[1]?.trim() || '',
          cloze_content: null
        };
      }
    });

    // Step 4: Insert the flashcards into the database
    const { data: insertedCards, error: insertError } = await supabase
      .from('flashcards')
      .insert(flashcardData)
      .select();

    if (insertError) {
      console.error('Error inserting flashcards:', insertError);
      return NextResponse.json(
        { error: 'Failed to save flashcards to database' }, 
        { status: 500 }
      );
    }

    // Step 5: Clean up the preview generation (optional)
    await supabase
      .from('flashcard_generations')
      .delete()
      .eq('note_id', body.note_id)
      .eq('user_id', user.id);

    // Step 6: Return the saved flashcards
    return NextResponse.json({
      success: true,
      flashcards: insertedCards,
      count: insertedCards.length
    });

  } catch (error) {
    console.error('Error saving flashcards from preview:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}