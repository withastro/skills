import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.example.com',
  integrations: [
    starlight({
      title: 'Example Docs',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' },
        { icon: 'discord', label: 'Discord', href: 'https://astro.build/chat' },
      ],
      sidebar: [
        {
          label: 'Guides',
          items: [{ label: 'Install', slug: 'guides/install' }],
        },
      ],
    }),
  ],
});
