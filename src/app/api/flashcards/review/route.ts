// src/app/api/flashcards/review/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SubmitReviewRequest, ReviewQuality } from '@/types/flashcard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// SM-2 Algorithm implementation
function calculateNextReview(
  quality: ReviewQuality,
  easeFactor: number,
  intervalDays: number,
  repetitions: number
) {
  let newEF = easeFactor;
  let newInterval = intervalDays;
  let newRepetitions = repetitions;
  
  if (quality >= 3) {
    // Correct response
    newRepetitions = repetitions + 1;
    
    if (newRepetitions === 1) {
      newInterval = 1;
    } else if (newRepetitions === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(intervalDays * easeFactor);
    }
    
    // Update ease factor
    newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEF = Math.max(newEF, 1.3);
  } else {
    // Incorrect response
    newRepetitions = 0;
    newInterval = 1;
  }
  
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);
  
  return {
    newEaseFactor: Math.round(newEF * 100) / 100,
    newInterval,
    newRepetitions,
    nextReviewDate
  };
}

function determineNewStatus(repetitions: number, quality: ReviewQuality): string {
  if (quality < 3) {
    return 'learning';
  }
  
  if (repetitions < 2) {
    return 'learning';
  } else if (repetitions < 5) {
    return 'review';
  } else {
    return 'mature';
  }
}

export async function POST(request: NextRequest) {
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

    const body: SubmitReviewRequest = await request.json();

    // Get current flashcard state
    const { data: flashcard, error: flashcardError } = await supabase
      .from('flashcards')
      .select('*')
      .eq('id', body.flashcard_id)
      .eq('user_id', user.id)
      .single();

    if (flashcardError || !flashcard) {
      return NextResponse.json({ error: 'Flashcard not found' }, { status: 404 });
    }

    // Calculate new spaced repetition values
    const { newEaseFactor, newInterval, newRepetitions, nextReviewDate } = 
      calculateNextReview(
        body.quality,
        flashcard.ease_factor,
        flashcard.interval_days,
        flashcard.repetitions
      );

    // Determine new status
    const newStatus = determineNewStatus(newRepetitions, body.quality);

    // Create review record
    const { error: reviewError } = await supabase
      .from('flashcard_reviews')
      .insert({
        flashcard_id: body.flashcard_id,
        user_id: user.id,
        reviewed_at: new Date().toISOString(),
        quality: body.quality,
        response_time: body.response_time,
        previous_ease_factor: flashcard.ease_factor,
        previous_interval: flashcard.interval_days,
        previous_repetitions: flashcard.repetitions,
        new_ease_factor: newEaseFactor,
        new_interval: newInterval,
        new_repetitions: newRepetitions
      });

    if (reviewError) {
      return NextResponse.json({ error: reviewError.message }, { status: 500 });
    }

    // Update flashcard
    const { data: updatedFlashcard, error: updateError } = await supabase
      .from('flashcards')
      .update({
        status: newStatus,
        ease_factor: newEaseFactor,
        interval_days: newInterval,
        repetitions: newRepetitions,
        last_reviewed: new Date().toISOString(),
        next_review: nextReviewDate.toISOString(),
        total_reviews: flashcard.total_reviews + 1,
        correct_reviews: flashcard.correct_reviews + (body.quality >= 3 ? 1 : 0),
        updated_at: new Date().toISOString()
      })
      .eq('id', body.flashcard_id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ flashcard: updatedFlashcard });
  } catch (error) {
    console.error('Error submitting review:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
