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
  try {
    // Get the raw body
    const buf = await buffer(request.body as ReadableStream<Uint8Array>);
    const rawBody = buf.toString('utf8');
    
    // Get Stripe signature from header
    const signature = request.headers.get('stripe-signature');
    
    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }
    
    // Verify the webhook signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('Missing STRIPE_WEBHOOK_SECRET environment variable');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    
    // Verify Stripe webhook
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
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
          console.warn('Could not determine subscription period end date, using fallback');
        }
        
        // Get the price ID from the subscription
        let planName = 'premium'; // Default plan name
        
        if (subscriptionObject.items && 
            subscriptionObject.items.data && 
            subscriptionObject.items.data.length > 0 &&
            subscriptionObject.items.data[0].price) {
          
          const priceId = subscriptionObject.items.data[0].price.id;
          
          try {
            const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
            if (price.product && typeof price.product !== 'string') {
              const product = price.product as Stripe.Product;
              if (product.metadata && product.metadata.plan) {
                planName = product.metadata.plan;
              }
            }
          } catch (priceError) {
            console.error('Error retrieving price information:', priceError);
          }
        }
        
        // Update the database with the new subscription details
        await supabase
          .from('subscriptions')
          .update({
            stripe_subscription_id: subscriptionId,
            subscription_status: isActive ? 'active' : subscriptionStatus,
            subscription_plan: isActive ? planName : 'free',
            valid_until: currentPeriodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', stripeCustomerId);
        
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscriptionObject = event.data.object as StripeSubscriptionObject;
        const stripeCustomerId = subscriptionObject.customer;
        
        // Update the database to reflect the canceled subscription
        await supabase
          .from('subscriptions')
          .update({
            subscription_status: 'canceled',
            subscription_plan: 'free',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', stripeCustomerId);
        
        break;
      }
    }
    
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: `Webhook error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}