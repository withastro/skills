import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://docs.example.com',
  vite: { plugins: [tailwindcss()] },
  integrations: [
    starlight({
      title: 'Example Docs',
      customCss: ['./src/styles/global.css'],
      sidebar: [
        {
          label: 'Guides',
          items: [{ label: 'Install', slug: 'guides/install' }],
        },
      ],
    }),
  ],
});
