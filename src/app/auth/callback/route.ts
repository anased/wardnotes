// src/app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('AUTH CALLBACK TRIGGERED 🔍');
  
  // Get the URL and its parameters
  const requestUrl = new URL(request.url);
  console.log('Full callback URL:', request.url);
  
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  
  // Log important parameters for debugging
  console.log('Auth callback parameters:', { 
    code, 
    error, 
    errorDescription
  });
  
  // Handle error from OAuth provider
  if (error) {
    console.error('OAuth error:', error, errorDescription);
    return NextResponse.redirect(`${requestUrl.origin}/auth?error=provider_error&description=${encodeURIComponent(errorDescription || 'Unknown error')}`);
  }
  
  // Check if we have a code (the standard OAuth flow)
  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      return NextResponse.redirect(`${requestUrl.origin}/auth?error=configuration_error`);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    try {
      console.log('Exchanging code for session...');
      // Exchange the code for a session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Error exchanging code for session:', error);
        return NextResponse.redirect(`${requestUrl.origin}/auth?error=session_error&description=${encodeURIComponent(error.message)}`);
      }

      console.log('Session established successfully:', !!data.session);
      
      // Check for X-Forwarded-Host header which might be present behind load balancers
      const forwardedHost = request.headers.get('x-forwarded-host');
      const forwardedProto = request.headers.get('x-forwarded-proto');
      
      // Determine the destination URL
      let destination = `${requestUrl.origin}/dashboard`;
      
      if (forwardedHost && forwardedProto) {
        destination = `${forwardedProto}://${forwardedHost}/dashboard`;
        console.log('Using forwarded headers for redirect:', destination);
      }
      
      console.log('Redirecting to:', destination);
      return NextResponse.redirect(destination);
    } catch (err) {
      console.error('Unexpected error during auth callback:', err);
      return NextResponse.redirect(`${requestUrl.origin}/auth?error=unexpected_error`);
    }
  }

  // If we reach here, something went wrong
  console.error('Auth callback called without code parameter');
  return NextResponse.redirect(`${requestUrl.origin}/auth?error=missing_code`);
}