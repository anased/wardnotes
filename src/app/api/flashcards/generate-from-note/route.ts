// src/app/api/flashcards/generate-from-note/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { GenerateFlashcardsRequest } from '@/types/flashcard';
import { generateSmartFlashcards } from '@/lib/utils/smartFlashcardGeneration';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Helper function to convert TipTap JSON to plain text
function convertTipTapToPlainText(content: any): string {
  let plainText = '';

  const processNode = (node: any) => {
    if (node.text) {
      plainText += node.text;
    } else if (node.content) {
      node.content.forEach(processNode);
      
      // Add appropriate line breaks based on node type
      if (node.type === 'paragraph') {
        plainText += '\n\n';
      } else if (node.type === 'heading') {
        plainText += '\n\n';
      } else if (node.type === 'bulletList' || node.type === 'orderedList') {
        plainText += '\n';
      } else if (node.type === 'listItem') {
        plainText += '- ';
      }
    }
  };

  processNode(content);
  return plainText.trim();
}

// No need for old generateFlashcards function - using smart generation now

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

    const body: GenerateFlashcardsRequest & { preview?: boolean; enable_deduplication?: boolean } = await request.json();
    const { note_id, card_type, deck_id, max_cards = 10, preview = false, enable_deduplication = false } = body;

    // Get the note
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', note_id)
      .single();

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    // Convert note content to plain text
    const plainText = convertTipTapToPlainText(note.content);

    // Generate flashcards using smart two-stage AI generation
    const startTime = Date.now();
    const generatedCards = await generateSmartFlashcards(
      plainText,
      note.title,
      card_type,
      max_cards,
      enable_deduplication
    );
    const generationTime = Date.now() - startTime;

    // If this is just a preview, save to flashcard_generations table and return
    if (preview) {
      // Save preview to flashcard_generations table for later retrieval
      const { error: savePreviewError } = await supabase
        .from('flashcard_generations')
        .upsert({
          note_id: note_id,
          user_id: user.id,
          cards: generatedCards,
          card_type: card_type,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'note_id' // Update if exists, insert if not
        });

      if (savePreviewError) {
        console.error('Error saving preview to flashcard_generations:', savePreviewError);
        // Continue anyway - don't fail the preview generation
      }

      return NextResponse.json({
        cards: generatedCards,
        preview: true,
        metadata: {
          generationTime,
          totalGenerated: generatedCards.length,
          cardTypes: generatedCards.reduce((acc, card) => {
            acc[card.type] = (acc[card.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          importanceLevels: generatedCards.reduce((acc, card) => {
            acc[card.importance] = (acc[card.importance] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        }
      });
    }

    // For non-preview mode, save the flashcards to the database
    let finalDeckId = deck_id;
    
    // Get default deck if none specified
    if (!finalDeckId) {
      let { data: defaultDeck } = await supabase
        .from('flashcard_decks')
        .select('id')
        .eq('name', 'Default Deck')
        .eq('user_id', user.id)
        .single();
      
      if (!defaultDeck) {
        // Create default deck if it doesn't exist
        const { data: newDeck, error: createError } = await supabase
          .from('flashcard_decks')
          .insert({
            user_id: user.id,
            name: 'Default Deck',
            description: 'Auto-generated default deck for flashcards',
            color: '#3B82F6'
          })
          .select()
          .single();
        
        if (createError || !newDeck) {
          return NextResponse.json({ error: 'Failed to create default deck' }, { status: 500 });
        }
        
        defaultDeck = newDeck;
      }
      
      // Explicit null check to satisfy TypeScript
      if (!defaultDeck) {
        return NextResponse.json({ error: 'Failed to get or create default deck' }, { status: 500 });
      }
      
      finalDeckId = defaultDeck.id;
    }

    // Verify deck ownership
    const { data: deck, error: deckError } = await supabase
      .from('flashcard_decks')
      .select('id')
      .eq('id', finalDeckId)
      .eq('user_id', user.id)
      .single();

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found or unauthorized' }, { status: 404 });
    }

    // Create flashcards in the database
    const flashcardData = generatedCards.map(card => ({
      deck_id: finalDeckId!,
      note_id: note_id,
      user_id: user.id,
      card_type: card_type,
      front_content: card_type === 'front_back' ? card.front : undefined,
      back_content: card_type === 'front_back' ? card.back : undefined,
      cloze_content: card_type === 'cloze' ? card.cloze : undefined,
      tags: [],
      status: 'new' as const,
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      last_reviewed: null,
      next_review: new Date().toISOString(),
      total_reviews: 0,
      correct_reviews: 0
    }));

    const { data: savedFlashcards, error: insertError } = await supabase
      .from('flashcards')
      .insert(flashcardData)
      .select();

    if (insertError) {
      console.error('Error saving flashcards:', insertError);
      return NextResponse.json({ error: 'Failed to save flashcards' }, { status: 500 });
    }

    return NextResponse.json({
      flashcards: savedFlashcards,
      preview: false,
      metadata: {
        generationTime,
        totalGenerated: generatedCards.length,
        totalSaved: savedFlashcards?.length || 0,
        cardTypes: generatedCards.reduce((acc, card) => {
          acc[card.type] = (acc[card.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        importanceLevels: generatedCards.reduce((acc, card) => {
          acc[card.importance] = (acc[card.importance] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }
    });
  } catch (error) {
    console.error('Error in generate-from-note API:', error);
    return NextResponse.json(
      { error: `Failed to generate flashcards: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}