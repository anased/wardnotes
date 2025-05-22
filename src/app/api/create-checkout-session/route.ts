// src/app/api/create-checkout-session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { getStripeClient, PREMIUM_MONTHLY_PRICE_ID, PREMIUM_ANNUAL_PRICE_ID } from '@/lib/stripe/stripe';
import getURL from '@/lib/utils/getURL';

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const { priceId, isYearly } = await request.json();
    console.log('🛒 Creating checkout session for:', { priceId, isYearly });
    
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No valid Authorization header');
      return NextResponse.json({ error: 'Unauthorized - no valid Authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.split(' ')[1];
    console.log('🔑 Token received (first 10 chars):', token.substring(0, 10));
    
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
      console.log('❌ Authentication error:', userError);
      return NextResponse.json({ error: 'Authentication error - invalid token' }, { status: 401 });
    }
    
    console.log('👤 Authenticated user:', { id: user.id, email: user.email });
    
    // Get or create subscription record for this user
    let { data: subscription, error: subscriptionError } = await supabaseWithAuth
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();
    
    console.log('📋 Current subscription record:', { 
      subscription, 
      error: subscriptionError,
      hasCustomerId: !!subscription?.stripe_customer_id 
    });
    
    // If no subscription record exists, create one
    if (!subscription && subscriptionError?.code === 'PGRST116') {
      console.log('🆕 No subscription record found, creating one...');
      
      const { data: newSubscription, error: createError } = await supabaseWithAuth
        .from('subscriptions')
        .insert({
          user_id: user.id,
          subscription_status: 'free',
          subscription_plan: 'free',
        })
        .select('stripe_customer_id')
        .single();
      
      console.log('✅ Created subscription record:', {
        success: !createError,
        data: newSubscription,
        error: createError
      });
      
      if (!createError) {
        subscription = newSubscription;
      }
    }
    
    let customerId = subscription?.stripe_customer_id;
    
    // Initialize Stripe client
    const stripe = getStripeClient();
    
    // If the user doesn't have a Stripe customer ID yet, create one
    if (!customerId) {
      console.log('🆕 Creating new Stripe customer for user:', user.email);
      
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id
        }
      });
      
      customerId = customer.id;
      console.log('✅ Created Stripe customer:', customerId);
      
      // Update the user's record with the new Stripe customer ID
      console.log('🔄 Attempting to update subscription for user:', user.id);
      
      const { data: updateData, error: updateError, count } = await supabaseWithAuth
        .from('subscriptions')
        .update({ 
          stripe_customer_id: customerId, 
          updated_at: new Date().toISOString() 
        })
        .eq('user_id', user.id)
        .select('*');
      
      console.log('💾 Updated subscription with customer ID:', {
        success: !updateError,
        data: updateData,
        count: count,
        error: updateError,
        customerId: customerId,
        userId: user.id
      });
      
      // Double-check by fetching the record again
      const { data: verifyData, error: verifyError } = await supabaseWithAuth
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      console.log('🔍 Verification check after update:', {
        data: verifyData,
        error: verifyError,
        hasCustomerId: !!verifyData?.stripe_customer_id
      });
      
      if (updateError) {
        console.error('❌ Failed to update subscription with customer ID:', updateError);
        // Continue anyway - we can still create the checkout session
      }
    } else {
      console.log('✅ Using existing Stripe customer:', customerId);
    }
    
    // Use the provided priceId or default to the appropriate price ID based on billing period
    const priceLookupId = priceId || (isYearly ? PREMIUM_ANNUAL_PRICE_ID : PREMIUM_MONTHLY_PRICE_ID);
    
    console.log('💰 Using price ID:', priceLookupId);
    
    // Check if provided price ID is valid
    if (!priceLookupId) {
      console.log('❌ Invalid price ID');
      return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 });
    }
    
    // Create a Checkout Session
    const baseUrl = getURL();
    
    console.log('🔗 Creating checkout session with:', {
      customer: customerId,
      priceId: priceLookupId,
      successUrl: `${baseUrl}settings/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}settings/subscription?canceled=true`
    });
    
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
    
    console.log('✅ Checkout session created:', checkoutSession.id);
    
    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('❌ Error creating checkout session:', error);
    return NextResponse.json(
      { error: `Failed to create checkout session: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}