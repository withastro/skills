import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  site: 'https://example.com',
  env: {
    schema: {
      ANNOUNCEMENT: envField.string({ context: 'client', access: 'public', optional: true }),
      API_SECRET: envField.string({ context: 'server', access: 'secret' }),
    },
  },
});
