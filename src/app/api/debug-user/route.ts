// src/app/api/debug-user/route.ts
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
    
    // Get the current user from the token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized - invalid token' }, { status: 401 });
    }
    
    // Check direct database access using admin rights
    // This checks all users in the 'profiles' table
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');
    
    // Try to find all notes in the database, regardless of user ID
    const { data: allNotes, error: allNotesError } = await supabase
      .from('notes')
      .select('id, title, user_id');
    
    return NextResponse.json({
      authUser: {
        id: user.id,
        email: user.email,
      },
      profiles: profiles || [],
      profilesError: profilesError ? profilesError.message : null,
      allNotes: allNotes || [],
      allNotesError: allNotesError ? allNotesError.message : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Debug error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}