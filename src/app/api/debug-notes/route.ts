// src/app/api/debug-notes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
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
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized - invalid token' }, { status: 401 });
    }
    
    // Get the top 10 notes for this user
    const { data: userNotes, error: notesError } = await supabase
      .from('notes')
      .select('id, title, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (notesError) {
      return NextResponse.json({ error: `Database error: ${notesError.message}` }, { status: 500 });
    }
    
    // Get all tables in the database to check schema
    const { data: tables, error: tablesError } = await supabase
      .from('pg_tables')
      .select('schemaname, tablename')
      .eq('schemaname', 'public');
    
    const dbInfo = {
      user: {
        id: user.id,
        email: user.email
      },
      userNotes: userNotes || [],
      tables: tablesError ? 'Error fetching tables' : (tables || []),
      noteCount: userNotes ? userNotes.length : 0
    };
    
    return NextResponse.json(dbInfo);
  } catch (error) {
    return NextResponse.json(
      { error: `Debug error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}