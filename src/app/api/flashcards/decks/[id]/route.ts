// src/app/api/flashcards/decks/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
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

    const { data, error } = await supabase
      .from('flashcard_decks')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deck: data });
  } catch (error) {
    console.error('Error fetching deck:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
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

    const body = await request.json();
    const { name, description, color } = body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Deck name is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('flashcard_decks')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        color: color || '#3B82F6',
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deck: data });
  } catch (error) {
    console.error('Error updating deck:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
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

    // First check if the deck exists and belongs to the user
    const { data: deck, error: fetchError } = await supabase
      .from('flashcard_decks')
      .select('name')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !deck) {
      return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 });
    }

    // Get the count of flashcards in this deck
    const { count: cardCount, error: countError } = await supabase
      .from('flashcards')
      .select('id', { count: 'exact' })
      .eq('deck_id', params.id)
      .eq('user_id', user.id);

    if (countError) {
      console.warn('Could not get card count:', countError);
    }

    // Delete all flashcards in this deck first
    if (cardCount && cardCount > 0) {
      const { error: deleteCardsError } = await supabase
        .from('flashcards')
        .delete()
        .eq('deck_id', params.id)
        .eq('user_id', user.id);

      if (deleteCardsError) {
        console.error('Error deleting cards from deck:', deleteCardsError);
        return NextResponse.json({ error: 'Error deleting flashcards from deck' }, { status: 500 });
      }
    }

    // Delete any flashcard reviews associated with this deck's cards
    // First get the flashcard IDs, then delete reviews
    const { data: flashcardIds, error: flashcardIdsError } = await supabase
      .from('flashcards')
      .select('id')
      .eq('deck_id', params.id)
      .eq('user_id', user.id);

    if (!flashcardIdsError && flashcardIds && flashcardIds.length > 0) {
      const cardIds = flashcardIds.map(card => card.id);
      const { error: deleteReviewsError } = await supabase
        .from('flashcard_reviews')
        .delete()
        .eq('user_id', user.id)
        .in('flashcard_id', cardIds);

      if (deleteReviewsError) {
        console.warn('Warning: Could not delete all reviews for deck cards:', deleteReviewsError);
      }
    }

    // Finally, delete the deck itself
    const { error: deleteDeckError } = await supabase
      .from('flashcard_decks')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (deleteDeckError) {
      console.error('Error deleting deck:', deleteDeckError);
      return NextResponse.json({ error: 'Error deleting deck' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Deck "${deck.name}" and all its flashcards have been deleted`,
      deletedCards: cardCount || 0
    });
  } catch (error) {
    console.error('Error deleting deck:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}