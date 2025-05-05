import { http, HttpResponse } from 'msw'

// Define the Supabase API endpoint base URL
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';

export const handlers = [
  // Mock authentication
  http.post(`${supabaseUrl}/auth/v1/token`, () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh-token',
      user: {
        id: 'user1',
        email: 'test@example.com',
      }
    })
  }),
  
  // Mock notes fetch
  http.get(`${supabaseUrl}/rest/v1/notes`, () => {
    return HttpResponse.json([
      {
        id: 'note1',
        user_id: 'user1',
        title: 'Test Note 1',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test content' }] }] },
        tags: ['test', 'example'],
        category: 'General',
        created_at: '2025-05-01T12:00:00Z'
      },
      {
        id: 'note2',
        user_id: 'user1',
        title: 'Test Note 2',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'More test content' }] }] },
        tags: ['example'],
        category: 'Cardiology',
        created_at: '2025-05-02T12:00:00Z'
      }
    ])
  }),
  
  // Add more handlers for other Supabase endpoints
]