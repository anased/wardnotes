// src/app/api/flashcards/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { CreateFlashcardRequest, FlashcardSearchFilters } from '@/types/flashcard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
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
    // Build query with filters
    let query = supabase
      .from('flashcards')
      .select('*')
      .eq('user_id', user.id);  // User filtering
    
    // Apply filters from search params
    const deckId = searchParams.get('deck_id');
    const status = searchParams.get('status');
    const cardType = searchParams.get('card_type');
    const searchText = searchParams.get('search');

    if (deckId) {
      query = query.eq('deck_id', deckId);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (cardType) {
      query = query.eq('card_type', cardType);
    }
    if (searchText) {
      query = query.or(`front_content.ilike.%${searchText}%,back_content.ilike.%${searchText}%,cloze_content.ilike.%${searchText}%`);
    }
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ flashcards: data });
  } catch (error) {
    console.error('Error fetching flashcards:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

    const body: CreateFlashcardRequest = await request.json();

    // 🔒 ADD: Verify user owns the deck
    const { data: deck, error: deckError } = await supabase
      .from('flashcard_decks')
      .select('id')
      .eq('id', body.deck_id)
      .eq('user_id', user.id)
      .single();

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('flashcards')
      .insert({
        deck_id: body.deck_id,
        note_id: body.note_id,
        user_id: user.id,
        card_type: body.card_type,
        front_content: body.front_content,
        back_content: body.back_content,
        cloze_content: body.cloze_content,
        tags: body.tags || [],
        status: 'new',
        ease_factor: 2.5,
        interval_days: 0,
        repetitions: 0,
        next_review: new Date().toISOString(),
        total_reviews: 0,
        correct_reviews: 0
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ flashcard: data });
  } catch (error) {
    console.error('Error creating flashcard:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}