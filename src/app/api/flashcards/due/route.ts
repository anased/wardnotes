import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    const deckId = searchParams.get('deck_id');
    const limit = parseInt(searchParams.get('limit') || '20');

    let query = supabase
      .from('flashcards')
      .select('*')
      .lte('next_review', new Date().toISOString())
      .neq('status', 'suspended')
      .order('next_review', { ascending: true })
      .limit(limit);

    if (deckId) {
      query = query.eq('deck_id', deckId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ flashcards: data });
  } catch (error) {
    console.error('Error fetching due cards:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}