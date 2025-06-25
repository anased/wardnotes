// src/app/api/flashcards/decks/[id]/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const { data: deck, error: deckError } = await supabase
      .from('flashcard_decks')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();
    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 });
    }
    // Fetch flashcards for the specified deck
    const { data, error } = await supabase
      .from('flashcards')
      .select('status, next_review')
      .eq('deck_id', params.id)
      .eq('user_id', user.id);
    

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const now = new Date();
    const stats = {
      totalCards: data?.length || 0,
      newCards: 0,
      dueCards: 0,
      learningCards: 0,
      matureCards: 0,
      suspendedCards: 0
    };

    data?.forEach(card => {
      switch (card.status) {
        case 'new':
          stats.newCards++;
          stats.dueCards++;
          break;
        case 'learning':
          stats.learningCards++;
          if (new Date(card.next_review) <= now) {
            stats.dueCards++;
          }
          break;
        case 'review':
          if (new Date(card.next_review) <= now) {
            stats.dueCards++;
          }
          break;
        case 'mature':
          stats.matureCards++;
          if (new Date(card.next_review) <= now) {
            stats.dueCards++;
          }
          break;
        case 'suspended':
          stats.suspendedCards++;
          break;
      }
    });

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Error fetching deck stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}