/** Destination photos (Unsplash, see public/images/CREDITS.md), keyed by country slug. Countries without a photo fall back to a plain card. */
export const COUNTRY_IMAGES: Record<string, { src: string; alt: string; position?: string }> = {
  india: { src: '/images/countries/india.jpg', alt: 'The Taj Mahal reflected in a long pool, India' },
  thailand: { src: '/images/countries/thailand.jpg', alt: 'Traditional temple rooftops in Bangkok, Thailand' },
  singapore: { src: '/images/countries/singapore.jpg', alt: 'Aerial view of the Marina Bay waterfront, Singapore' },
  malaysia: { src: '/images/countries/malaysia.jpg', alt: 'The Petronas Towers lit at dusk, Kuala Lumpur, Malaysia' },
  turkey: { src: '/images/countries/turkey.jpg', alt: 'A mosque with tall minarets at sunset, Istanbul, Turkey' },
  'united-arab-emirates': { src: '/images/countries/united-arab-emirates.jpg', alt: 'The Dubai skyline at sunrise, United Arab Emirates' },
  germany: { src: '/images/countries/germany.jpg', alt: 'The Brandenburg Gate in Berlin, Germany' },
  'south-korea': { src: '/images/countries/south-korea.jpg', alt: 'A busy street with neon signs at night, Seoul, South Korea', position: 'center 40%' },
};
