import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.example.com',
  integrations: [
    starlight({
      title: 'Example Docs',
      components: {
        Footer: './src/components/Footer.astro',
      },
      sidebar: [
        {
          label: 'Guides',
          items: [{ label: 'Install', slug: 'guides/install' }],
        },
      ],
    }),
  ],
});
