// src/app/api/debug-subscriptions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*');
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ subscriptions: data });
}