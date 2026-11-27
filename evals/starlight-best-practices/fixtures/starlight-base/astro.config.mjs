import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://example.com',
  base: '/docs',
  integrations: [
    starlight({
      title: 'Example Docs',
      sidebar: [
        {
          label: 'Guides',
          items: [{ label: 'Install', slug: 'guides/install' }],
        },
      ],
    }),
  ],
});
