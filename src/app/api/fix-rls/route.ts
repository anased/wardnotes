// src/app/api/fix-rls/route.ts
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
    
    // Try to see what notes schema looks like
    const { data: notesInfo, error: notesInfoError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'notes')
      .eq('table_schema', 'public');
    
    // Check user_id field type if possible from metadata
    let userIdFieldType = 'uuid';
    if (notesInfo) {
      const userIdColumn = notesInfo.find(col => col.column_name === 'user_id');
      if (userIdColumn) {
        userIdFieldType = userIdColumn.data_type;
      }
    }
    
    // Try to insert a test note with minimal fields to avoid potential schema issues
    const testNote = {
      title: 'RLS Test Note',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Testing RLS.' }] }] },
      user_id: user.id
    };
    
    const { data: newNote, error: insertError } = await supabase
      .from('notes')
      .insert(testNote)
      .select()
      .single();
    
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email
      },
      schemaInfo: {
        notesColumns: notesInfo || [],
        userIdFieldType
      },
      insert: {
        success: !!newNote,
        note: newNote || null,
        error: insertError ? {
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint
        } : null
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: `RLS test error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}