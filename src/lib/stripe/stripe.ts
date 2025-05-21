// src/lib/stripe/stripe.ts
import Stripe from 'stripe';

// Initialize Stripe with API key from environment variables
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-04-30.basil', // Update to use the current API version
});

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