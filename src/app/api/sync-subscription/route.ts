// src/app/api/sync-subscription/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { getStripeClient } from '@/lib/stripe/stripe';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Sync subscription API called');
    
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
    
    console.log('👤 Syncing subscription for user:', user.id);
    
    // Get the user's subscription record
    const { data: subscription, error: subscriptionError } = await supabaseWithAuth
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (subscriptionError || !subscription || !subscription.stripe_subscription_id) {
      console.log('❌ No valid subscription record found');
      return NextResponse.json({ 
        subscription: null,
        message: 'No active subscription found' 
      });
    }
    
    console.log('📋 Current subscription record:', {
      id: subscription.id,
      status: subscription.subscription_status,
      plan: subscription.subscription_plan,
      stripeId: subscription.stripe_subscription_id
    });
    
    // Initialize Stripe client and get the actual subscription
    const stripe = getStripeClient();
    
    try {
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      
      const currentPeriodEndTimestamp = (stripeSubscription as any).current_period_end;
      
      console.log('📊 Stripe subscription status:', {
        id: stripeSubscription.id,
        status: stripeSubscription.status,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        currentPeriodEndRaw: currentPeriodEndTimestamp,
        currentPeriodEnd: currentPeriodEndTimestamp ? new Date(currentPeriodEndTimestamp * 1000).toISOString() : null
      });
      
      // Determine the correct status and plan
      const isActive = stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing';
      const isCanceled = stripeSubscription.status === 'canceled' || 
                        stripeSubscription.status === 'incomplete_expired' ||
                        stripeSubscription.cancel_at_period_end === true;
      
      const newStatus = isCanceled ? 'canceled' : (isActive ? 'active' : stripeSubscription.status);
      const newPlan = (isActive && !isCanceled) ? 'premium' : 'free';
      const validUntil = currentPeriodEndTimestamp ? 
        new Date(currentPeriodEndTimestamp * 1000).toISOString() : 
        null;
      
      console.log('🔄 Computed new status:', {
        newStatus,
        newPlan,
        isActive,
        isCanceled,
        validUntil
      });
      
      // Update the database if there's a difference
      const needsUpdate = subscription.subscription_status !== newStatus || 
                          subscription.subscription_plan !== newPlan ||
                          (validUntil && subscription.valid_until !== validUntil);
      
      if (needsUpdate) {
        console.log('📝 Updating subscription record with new status');
        
        const updatePayload: any = {
          subscription_status: newStatus,
          subscription_plan: newPlan,
          updated_at: new Date().toISOString(),
        };
        
        // Only update valid_until if we have a valid timestamp
        if (validUntil) {
          updatePayload.valid_until = validUntil;
        }
        
        const { data: updateData, error: updateError } = await supabaseWithAuth
          .from('subscriptions')
          .update(updatePayload)
          .eq('id', subscription.id)
          .select()
          .single();
        
        if (updateError) {
          console.error('❌ Error updating subscription:', updateError);
          throw updateError;
        }
        
        console.log('✅ Subscription updated successfully:', updateData);
        
        return NextResponse.json({ 
          subscription: updateData,
          updated: true,
          message: 'Subscription status synced successfully' 
        });
      } else {
        console.log('ℹ️ Subscription already up to date');
        return NextResponse.json({ 
          subscription,
          updated: false,
          message: 'Subscription already up to date' 
        });
      }
      
    } catch (stripeError) {
      console.error('❌ Error fetching from Stripe:', stripeError);
      throw stripeError;
    }
    
  } catch (error) {
    console.error('❌ Error syncing subscription:', error);
    return NextResponse.json(
      { error: `Failed to sync subscription: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}