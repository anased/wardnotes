import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

  Deno.serve(async (req) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { error } = await supabase.rpc('reset_monthly_quotas')

    if (error) {
      console.error('Error resetting quotas:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, message: 'Quotas reset' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  })