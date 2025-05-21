// src/app/api/create-checkout-session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { stripe, PREMIUM_MONTHLY_PRICE_ID, PREMIUM_ANNUAL_PRICE_ID } from '@/lib/stripe/stripe';
import getURL from '@/lib/utils/getURL';

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const { priceId, isYearly } = await request.json();
    
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
    
    // Get or create Stripe customer for this user
    const { data: subscription } = await supabaseWithAuth
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();
    
    let customerId = subscription?.stripe_customer_id;
    
    // If the user doesn't have a Stripe customer ID yet, create one
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id
        }
      });
      
      customerId = customer.id;
      
      // Update the user's record with the new Stripe customer ID
      await supabaseWithAuth
        .from('subscriptions')
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }
    
    // Use the provided priceId or default to the appropriate price ID based on billing period
    const priceLookupId = priceId || (isYearly ? PREMIUM_ANNUAL_PRICE_ID : PREMIUM_MONTHLY_PRICE_ID);
    
    // Check if provided price ID is valid
    if (!priceLookupId) {
      return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 });
    }
    
    // Create a Checkout Session
    const baseUrl = getURL();
    
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceLookupId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${baseUrl}settings/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}settings/subscription?canceled=true`,
      subscription_data: {
        metadata: {
          userId: user.id,
        },
      },
    });
    
    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: `Failed to create checkout session: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}