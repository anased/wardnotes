/** @type {import('next-sitemap').IConfig} */
module.exports = {
    siteUrl: process.env.SITE_URL || 'https://wardnotes.app',
    generateRobotsTxt: true,
    robotsTxtOptions: {
      policies: [
        {
          userAgent: '*',
          allow: '/',
        },
        {
          userAgent: '*',
          disallow: ['/api/', '/auth/reset-password', '/auth/verify'],
        },
      ],
    },
    exclude: ['/auth/reset-password', '/auth/verify', '/api/*'],
    generateIndexSitemap: false,
  }