// src/app/api/check-schema/route.ts
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
    
    // Try to get table information
    const { data: tableInfo, error: tableError } = await supabase
      .rpc('get_schema_info');
    
    // Try different approach if the RPC fails
    let tables = [];
    if (tableError) {
      // Fallback to querying information_schema
      const { data: tablesData, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');
        
      if (!tablesError) {
        tables = tablesData;
      }
    } else {
      tables = tableInfo;
    }
    
    // Check notes table columns
    const { data: notesColumns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'notes')
      .eq('table_schema', 'public');
    
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email
      },
      schema: {
        tables: tables || [],
        tableError: tableError ? tableError.message : null,
        notesColumns: notesColumns || [],
        columnsError: columnsError ? columnsError.message : null
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Schema check error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}