// src/app/api/improve-note/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import OpenAI from 'openai';
import { TipTapNode } from '@/types/content';
import { convertTipTapToPlainText } from '@/lib/utils/content-converter';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Define the maximum character limit
const MAX_CHARACTERS = 4000;

export async function POST(request: NextRequest) {
  try {
    const requestData = await request.json();
    const { content } = requestData;
    
    if (!content) {
      return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
    }
    
    // Convert TipTap JSON to plain text for character count if needed
    let plainText = '';
    if (typeof content === 'object') {
      plainText = convertTipTapToPlainText(content as TipTapNode);
    } else {
      plainText = content;
    }
    
    // Validate character count
    if (plainText.length > MAX_CHARACTERS) {
      return NextResponse.json({ 
        error: `Note exceeds maximum character limit of ${MAX_CHARACTERS} characters` 
      }, { status: 400 });
    }
    
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - no valid Authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.split(' ')[1];
    
    // Create Supabase client with auth token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabaseWithAuth = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );
    
    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabaseWithAuth.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication error - invalid token' }, { status: 401 });
    }

    // Send to OpenAI for improvement
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
            role: "system",
            content: `You are an expert medical note editor. Your task is to improve medical notes by:
            1. Making them more concise and structured
            2. Organizing information into clear sections with headings (using # for main headings and ## for subheadings)
            3. Using Markdown formatting that TipTap can render:
               - Bold text with **asterisks**
               - Bullet lists with - prefix
               - Headings with # and ##
            4. Standardizing medical terminology while maintaining accuracy
            5. Ensuring all critical medical information is preserved
            6. Maintaining a professional medical tone
            
            The improved note should be formatted for a rich text editor that supports Markdown-style formatting.`
        },
        {
          role: "user",
          content: `Please improve the following medical note to make it more concise, structured, and professional while maintaining all important clinical information:
          
          ${plainText}`
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent results
    });

    const improvedNote = response.choices[0].message.content;
    
    // Return the improved note
    return NextResponse.json({ improvedNote });
  } catch (error) {
    console.error('Error improving note:', error);
    return NextResponse.json({ 
      error: `Failed to improve note: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}