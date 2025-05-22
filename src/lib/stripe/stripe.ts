// src/lib/stripe/stripe.ts
import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2025-04-30.basil',
    });
  }
  
  return stripeClient;
}

// Constants for product/price IDs
export const PREMIUM_MONTHLY_PRICE_ID = process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || '';
export const PREMIUM_ANNUAL_PRICE_ID = process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID || '';

// Helper function to format amount for display
export function formatStripeAmount(amount: number): string {
  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  
  return currencyFormatter.format(amount / 100);
}

// Helper to get subscription name from Stripe price
export async function getProductNameFromPrice(priceId: string): Promise<string> {
  try {
    const stripe = getStripeClient();
    const price = await stripe.prices.retrieve(priceId, {
      expand: ['product'],
    });
    
    const product = price.product as Stripe.Product;
    return product.name;
  } catch (error) {
    console.error('Error retrieving product name:', error);
    return 'Premium Subscription';
  }
}