# WardNotes

WardNotes is a specialized note-taking application designed for medical students and residents to capture and organize clinical learning points during their rotations.

## Features

- **User Authentication**: Secure login, signup, and password reset functionality
- **Note Organization**: Categorize notes by medical specialty (Neurology, Cardiology, etc.)
- **Tagging System**: Add custom tags to easily filter and find related notes
- **Rich Text Editor**: Format your clinical notes with headings, lists, and more
- **Search Functionality**: Quickly find notes based on title, content, or tags
- **Responsive Design**: Works seamlessly on both desktop and mobile devices
- **Dark Mode**: Easy on the eyes during night shifts

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Authentication & Database**: Supabase
- **Editor**: TipTap (based on ProseMirror)
- **Forms**: React Hook Form with Zod validation

## Getting Started

### Prerequisites

- Node.js 18.0 or later
- Supabase account (for backend)

### Environment Setup

Create a `.env.local` file in the root directory with the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/wardnotes.git
   cd wardnotes
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

### Supabase Setup

1. Create a new Supabase project
2. Set up the following tables:
   - `profiles`: User profiles
   - `notes`: Clinical notes with categories and tags
3. Set up authentication with email/password
4. Configure row-level security policies for data protection

## Deployment

The easiest way to deploy your WardNotes application is to use the [Vercel Platform](https://vercel.com/new). Connect your GitHub repository and add your environment variables.

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.