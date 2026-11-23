import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkToc from 'remark-toc';

export default defineConfig({
  site: 'https://example.com',
  markdown: {
    processor: unified({
      remarkPlugins: [remarkToc],
    }),
  },
});
