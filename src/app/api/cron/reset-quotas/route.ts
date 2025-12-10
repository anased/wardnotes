// src/app/api/cron/reset-quotas/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Cron job endpoint to reset monthly quotas
 * Triggered by Vercel Cron on the 1st of each month
 *
 * Security: Protected by Vercel Cron secret token
 */
export async function GET(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get('authorization');

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error('Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the reset_monthly_quotas database function
    const { error } = await supabase.rpc('reset_monthly_quotas');

    if (error) {
      console.error('Error resetting monthly quotas:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message
        },
        { status: 500 }
      );
    }

    // Get statistics about the reset
    const { data: quotas } = await supabase
      .from('usage_quotas')
      .select('user_id, flashcard_generations_limit, note_improvements_limit')
      .eq('period_start', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);

    console.log('Successfully reset monthly quotas', {
      timestamp: new Date().toISOString(),
      usersReset: quotas?.length || 0
    });

    return NextResponse.json({
      success: true,
      message: 'Monthly quotas reset successfully',
      usersReset: quotas?.length || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
