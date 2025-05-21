// src/lib/middleware/requirePremium.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

export async function requirePremium(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - no valid Authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.split(' ')[1];
    
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    // Create Supabase client with auth token
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
    
    // Get the current user
    const { data: { user }, error: userError } = await supabaseWithAuth.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication error - invalid token' }, { status: 401 });
    }
    
    // Check if user has premium subscription
    const { data: subscription, error: subscriptionError } = await supabaseWithAuth
      .from('subscriptions')
      .select('subscription_status, subscription_plan, valid_until')
      .eq('user_id', user.id)
      .single();
    
    if (subscriptionError) {
      return NextResponse.json({ error: 'Error fetching subscription information' }, { status: 500 });
    }
    
    const isPremium = 
      subscription.subscription_status === 'active' && 
      subscription.subscription_plan === 'premium' && 
      (subscription.valid_until === null || new Date(subscription.valid_until) > new Date());
    
    if (!isPremium) {
      return NextResponse.json({ error: 'This feature requires a premium subscription' }, { status: 403 });
    }
    
    // User is premium, continue with the request
    return null;
  } catch (error) {
    console.error('Error in premium check middleware:', error);
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}