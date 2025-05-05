// src/app/api/test-db/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    // Get the note ID from the query params
    const searchParams = request.nextUrl.searchParams;
    const noteId = searchParams.get('noteId');
    
    if (!noteId) {
      return NextResponse.json({ error: 'Note ID is required' }, { status: 400 });
    }

    console.log(`Testing database connection for note ID: ${noteId}`);
    
    // Check if we can connect to Supabase at all - without using aggregate functions
    const { data: connectionTest, error: connectionError } = await supabase
      .from('notes')
      .select('id')
      .limit(1);
      
    if (connectionError) {
      return NextResponse.json({
        status: 'error',
        message: 'Database connection failed',
        error: connectionError
      });
    }
    
    // Try to get the specific note without any auth
    const { data: noteData, error: noteError } = await supabase
      .from('notes')
      .select('id, title, user_id')
      .eq('id', noteId)
      .maybeSingle();
      
    return NextResponse.json({
      status: 'success',
      environment: process.env.NODE_ENV,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 15) + '...',
      connectionTest: connectionTest && connectionTest.length > 0,
      noteExists: !!noteData,
      noteData: noteData ? {
        id: noteData.id,
        title: noteData.title,
        user_id: noteData.user_id
      } : null,
      noteError: noteError ? noteError.message : null,
      allNotes: connectionTest
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Exception occurred',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}