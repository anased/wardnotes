// src/app/api/user/quota/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getFormattedQuota } from '@/lib/services/quotaService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * GET /api/user/quota
 * Returns current quota information for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
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

    // Get formatted quota information
    const quota = await getFormattedQuota(user.id);

    return NextResponse.json({
      flashcard_generation: {
        used: quota.flashcardGeneration.used,
        limit: quota.flashcardGeneration.limit,
        remaining: quota.flashcardGeneration.remaining,
        isUnlimited: quota.flashcardGeneration.isUnlimited
      },
      note_improvement: {
        used: quota.noteImprovement.used,
        limit: quota.noteImprovement.limit,
        remaining: quota.noteImprovement.remaining,
        isUnlimited: quota.noteImprovement.isUnlimited
      },
      period: {
        start: quota.period.start.toISOString(),
        end: quota.period.end.toISOString(),
        daysRemaining: quota.period.daysRemaining
      }
    });
  } catch (error) {
    console.error('Error fetching quota:', error);
    return NextResponse.json(
      { error: `Failed to fetch quota: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
