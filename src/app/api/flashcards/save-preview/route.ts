// src/app/api/flashcards/save-preview/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { FlashcardType } from '@/types/flashcard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface SavePreviewRequest {
  cards: Array<{front?: string, back?: string, cloze?: string}>;
  deck_id: string;
  note_id: string;
  card_type: FlashcardType;
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

    const body: SavePreviewRequest = await request.json();
    const { cards, deck_id, note_id, card_type } = body;

    if (!cards || cards.length === 0) {
      return NextResponse.json({ error: 'No cards provided' }, { status: 400 });
    }

    // Verify deck ownership
    const { data: deck, error: deckError } = await supabase
      .from('flashcard_decks')
      .select('id')
      .eq('id', deck_id)
      .eq('user_id', user.id)
      .single();

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found or unauthorized' }, { status: 404 });
    }

    // Verify note ownership
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('id')
      .eq('id', note_id)
      .eq('user_id', user.id)
      .single();

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found or unauthorized' }, { status: 404 });
    }

    // Create flashcards in the database using the provided cards
    const flashcardData = cards.map(card => ({
      deck_id: deck_id,
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
      message: `Successfully saved ${savedFlashcards?.length || 0} flashcards`
    });
  } catch (error) {
    console.error('Error in save-preview API:', error);
    return NextResponse.json(
      { error: `Failed to save flashcards: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}