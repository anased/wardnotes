import { Metadata } from 'next';

interface MetaProps {
  title: string;
  description?: string;
  keywords?: string[];
  image?: string;
  noIndex?: boolean;
}

export function generateMetadata({
  title,
  description = 'Capture and organize clinical learning points during your medical rotations',
  keywords = [],
  image = '/og-image.jpg',
  noIndex = false,
}: MetaProps): Metadata {
  const baseKeywords = ['medical notes', 'clinical learning', 'medical education', 'ward rounds'];
  const mergedKeywords = [...baseKeywords, ...keywords];

  return {
    title,
    description,
    keywords: mergedKeywords,
    openGraph: {
      title,
      description,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    robots: noIndex ? 'noindex, nofollow' : 'index, follow',
  };
}