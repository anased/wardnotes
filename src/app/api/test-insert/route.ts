// src/app/api/test-insert/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - no valid Authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.split(' ')[1];
    
    // Get the current user from the token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized - invalid token' }, { status: 401 });
    }
    
    // Try to insert a test note
    const testNote = {
      title: 'Test Note - Please Delete',
      content: { 
        type: 'doc', 
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'This is a test note.' }] }] 
      },
      tags: ['test'],
      category: 'General',
      user_id: user.id
    };
    
    const { data: newNote, error: insertError } = await supabase
      .from('notes')
      .insert(testNote)
      .select()
      .single();
    
    if (insertError) {
      return NextResponse.json({
        status: 'error',
        message: 'Failed to insert test note',
        error: insertError
      });
    }
    
    // Now try to retrieve the note we just inserted
    const { data: retrievedNote, error: retrieveError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', newNote.id)
      .single();
    
    return NextResponse.json({
      status: 'success',
      user: {
        id: user.id,
        email: user.email
      },
      inserted: {
        success: !!newNote,
        note: newNote
      },
      retrieved: {
        success: !!retrievedNote,
        note: retrievedNote,
        error: retrieveError ? retrieveError.message : null
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Test insert error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}