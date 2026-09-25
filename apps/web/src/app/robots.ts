import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/patient/', '/admin/', '/api/', '/login', '/register', '/reset-password', '/verify-email'] }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
