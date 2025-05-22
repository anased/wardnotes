// src/app/api/webhooks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { stripe } from '@/lib/stripe/stripe';
import Stripe from 'stripe';

// Disable body parsing as Stripe needs the raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

// Define a more comprehensive type for Stripe subscription events
interface StripeSubscriptionObject {
  id: string;
  customer: string;
  status: string;
  items: {
    data: Array<{
      price: {
        id: string;
      };
    }>;
  };
  // Define both possible structures for the period end
  current_period_end?: number;
  current_period?: {
    end: number;
  };
}

// Updated buffer function for modern ReadableStream
async function buffer(readable: ReadableStream<Uint8Array>) {
  const reader = readable.getReader();
  const chunks: Uint8Array[] = [];
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  
  return Buffer.concat(chunks);
}

export async function POST(request: NextRequest) {
  console.log('⭐ Webhook endpoint called');
  try {
    // Get the raw body
    const buf = await buffer(request.body as ReadableStream<Uint8Array>);
    const rawBody = buf.toString('utf8');
    
    // Get Stripe signature from header
    const signature = request.headers.get('stripe-signature');
    
    if (!signature) {
      console.error('❌ Missing stripe-signature header');
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }
    
    // Verify the webhook signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('❌ Missing STRIPE_WEBHOOK_SECRET environment variable');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    
    console.log('🔐 Using webhook secret starting with:', webhookSecret.substring(0, 5));
    
    // Verify Stripe webhook
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      console.log('✅ Webhook signature verified successfully');
    } catch (err) {
      console.error(`❌ Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    
    console.log('📨 Received webhook event type:', event.type);
    
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('❌ Missing Supabase environment variables');
      throw new Error('Missing Supabase environment variables');
    }
    
    console.log('🔌 Initializing Supabase client with service role key');
    
    // Use service role key for webhook processing
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    // Handle the event
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscriptionObject = event.data.object as StripeSubscriptionObject;
        const stripeCustomerId = subscriptionObject.customer;
        const subscriptionStatus = subscriptionObject.status;
        const subscriptionId = subscriptionObject.id;
        const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
        
        console.log('💳 Processing subscription event:', {
          eventType: event.type,
          customerId: stripeCustomerId,
          subscriptionId: subscriptionId,
          status: subscriptionStatus,
          isActive: isActive
        });
        
        // Calculate the current period end date
        let currentPeriodEnd: Date;
        if (typeof subscriptionObject.current_period_end === 'number') {
          currentPeriodEnd = new Date(subscriptionObject.current_period_end * 1000);
        } else if (subscriptionObject.current_period && typeof subscriptionObject.current_period.end === 'number') {
          currentPeriodEnd = new Date(subscriptionObject.current_period.end * 1000);
        } else {
          // Fallback to 30 days from now
          currentPeriodEnd = new Date();
          currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
          console.warn('⚠️ Could not determine subscription period end date, using fallback');
        }
        
        console.log('📅 Subscription valid until:', currentPeriodEnd.toISOString());
        
        // Get the price ID from the subscription
        let planName = 'premium'; // Default plan name
        
        if (subscriptionObject.items && 
            subscriptionObject.items.data && 
            subscriptionObject.items.data.length > 0 &&
            subscriptionObject.items.data[0].price) {
          
          const priceId = subscriptionObject.items.data[0].price.id;
          console.log('💰 Price ID from subscription:', priceId);
          
          try {
            const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
            if (price.product && typeof price.product !== 'string') {
              const product = price.product as Stripe.Product;
              if (product.metadata && product.metadata.plan) {
                planName = product.metadata.plan;
                console.log('📋 Plan name from product metadata:', planName);
              }
            }
          } catch (priceError) {
            console.error('❌ Error retrieving price information:', priceError);
          }
        }
        
        // First check if we can find the subscription record
        const { data: subscriptionRecord, error: findError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('stripe_customer_id', stripeCustomerId);
        
        console.log('🔍 Looking up subscription by customer ID:', {
          customerId: stripeCustomerId,
          found: subscriptionRecord && subscriptionRecord.length > 0,
          count: subscriptionRecord?.length || 0,
          error: findError
        });
        
        if (findError) {
          console.error('❌ Error finding subscription record:', findError);
        }
        
        if (!subscriptionRecord || subscriptionRecord.length === 0) {
          console.error(`❌ No subscription record found for Stripe customer ID: ${stripeCustomerId}`);
          
          // Try to find the user by metadata in Stripe
          try {
            const customer = await stripe.customers.retrieve(stripeCustomerId);
            if (customer && !customer.deleted) {
              const userId = customer.metadata?.userId;
              console.log('👤 Found user ID in Stripe customer metadata:', userId);
              
              if (userId) {
                // Create or update the subscription record for this user using proper upsert
                const { data: createData, error: createError } = await supabase
                  .from('subscriptions')
                  .upsert({
                    user_id: userId,
                    stripe_customer_id: stripeCustomerId,
                    stripe_subscription_id: subscriptionId,
                    subscription_status: isActive ? 'active' : subscriptionStatus,
                    subscription_plan: isActive ? planName : 'free',
                    valid_until: currentPeriodEnd.toISOString(),
                    updated_at: new Date().toISOString(),
                  }, { 
                    onConflict: 'user_id',
                    ignoreDuplicates: false 
                  })
                  .select();
                
                console.log('🆕 Created/Updated subscription record:', {
                  success: !createError,
                  data: createData,
                  error: createError
                });
              }
            }
          } catch (customerError) {
            console.error('❌ Error retrieving customer from Stripe:', customerError);
          }
        } else {
          // Update all matching subscription records
          // (There should be only one, but this is safer)
          for (const record of subscriptionRecord) {
            console.log('📝 Updating subscription record ID:', record.id);
            
            const { data: updateData, error: updateError } = await supabase
              .from('subscriptions')
              .update({
                stripe_subscription_id: subscriptionId,
                subscription_status: isActive ? 'active' : subscriptionStatus,
                subscription_plan: isActive ? planName : 'free',
                valid_until: currentPeriodEnd.toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', record.id)
              .select();
            
            console.log('🔄 Subscription update result:', {
              recordId: record.id,
              userId: record.user_id,
              success: !updateError,
              data: updateData,
              error: updateError,
              newStatus: isActive ? 'active' : subscriptionStatus,
              newPlan: isActive ? planName : 'free'
            });
          }
        }
        
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscriptionObject = event.data.object as StripeSubscriptionObject;
        const stripeCustomerId = subscriptionObject.customer;
        
        console.log('🗑️ Processing subscription deletion:', {
          customerId: stripeCustomerId
        });
        
        // Find all subscription records for this customer
        const { data: subscriptionRecords, error: findError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('stripe_customer_id', stripeCustomerId);
        
        console.log('🔍 Looking up subscriptions to cancel:', {
          customerId: stripeCustomerId,
          found: subscriptionRecords && subscriptionRecords.length > 0,
          count: subscriptionRecords?.length || 0,
          error: findError
        });
        
        if (findError) {
          console.error('❌ Error finding subscription records:', findError);
        }
        
        if (subscriptionRecords && subscriptionRecords.length > 0) {
          // Update each matching record
          for (const record of subscriptionRecords) {
            const { data: updateData, error: updateError } = await supabase
              .from('subscriptions')
              .update({
                subscription_status: 'canceled',
                subscription_plan: 'free',
                updated_at: new Date().toISOString(),
              })
              .eq('id', record.id)
              .select();
            
            console.log('🔄 Subscription cancellation result:', {
              recordId: record.id,
              userId: record.user_id,
              success: !updateError,
              data: updateData,
              error: updateError
            });
          }
        } else {
          console.warn(`⚠️ No subscription records found to cancel for customer ID: ${stripeCustomerId}`);
        }
        
        break;
      }
      
      default: {
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
      }
    }
    
    console.log('✅ Webhook processed successfully');
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    return NextResponse.json(
      { error: `Webhook error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}