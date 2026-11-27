import { defineConfig, memoryCache } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://example.com',
  adapter: node({ mode: 'standalone' }),
  cache: {
    provider: memoryCache(),
  },
});
