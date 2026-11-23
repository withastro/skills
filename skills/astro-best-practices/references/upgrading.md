# Upgrading Astro

Read this when the project is on Astro 4-6, when asked to upgrade, or when a build fails on an API that no longer exists.

## Contents

- [How to upgrade](#how-to-upgrade)
- [Astro 7](#astro-7)
- [Astro 6](#astro-6)
- [Astro 5](#astro-5)
- [Cloudflare adapter](#cloudflare-adapter)

## How to upgrade

1. Check the installed version in `package.json` and upgrade one major at a time. Each major's guide assumes the previous one is done.
2. Run `npx @astrojs/upgrade`. It bumps `astro` and the official integrations together; do not edit version ranges by hand.
3. Check the Node.js version. Astro 6 and 7 need Node 22; read the exact minimum from `engines.node` of the installed `astro` package and update `.nvmrc`, `.node-version`, CI and host settings to match.
4. Apply the changes below for the major you moved to, then run `npx astro check` and `npx astro build`. Fix errors before changing anything else.
5. For anything not listed here, read the official guide for that major. These are the source of truth:
   - `https://docs.astro.build/en/guides/upgrade-to/v7/`
   - `https://docs.astro.build/en/guides/upgrade-to/v6/`
   - `https://docs.astro.build/en/guides/upgrade-to/v5/`

Do not combine an upgrade with unrelated refactors. If the user asked for a feature and the project is on an older major, write code that is valid for the installed version and mention that an upgrade is available.

## Astro 7

Dependencies: Vite 8. Check third-party Vite plugins against the Vite 8 migration guide.

| Change | What to do |
| --- | --- |
| The Rust compiler is the only compiler. Unclosed non-void tags are build errors. Invalid nesting (a `<div>` inside a `<p>`) is passed through unrepaired. | Add missing closing tags. Fix invalid nesting where rendered output changed. |
| `compressHTML` defaults to `'jsx'`. Whitespace between inline elements on separate lines is removed. | Add `{" "}` where a space is needed, or set `compressHTML: true` to keep the Astro 6 behaviour. |
| Sätteri renders Markdown and MDX. `@astrojs/markdown-remark` is no longer installed by default. | No action without plugins. To keep remark/rehype plugins, install `@astrojs/markdown-remark` and set `markdown.processor: unified()`. |
| `src/fetch.ts` (or `.js`) is reserved for advanced routing. | Rename an unrelated file, or set `fetchFile: './src/other.ts'` or `fetchFile: null`. |
| Stabilised: `experimental.cache`, `routeRules`, `logger`, `queuedRendering`, `rustCompiler`, `advancedRouting`. | Move `cache`, `routeRules` and `logger` to the top level of the config. Delete the other flags. |
| `@astrojs/db` is removed. | Replace with `node:sqlite`, Drizzle or another database library. |
| Removed from `astro:transitions`: `TRANSITION_*` constants, `isTransitionBeforePreparationEvent()`, `isTransitionBeforeSwapEvent()`, `createAnimationScope()`. | Compare `event.type` with the event name, for example `'astro:before-preparation'`. |
| Deprecated: `getContainerRenderer()` from an integration's package root. | Import from `@astrojs/<framework>/container-renderer`. |

Keeping unified plugins:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';

export default defineConfig({
  markdown: {
    processor: unified(),
  },
});
```

Moving stabilised options out of `experimental`:

```js
// astro.config.mjs
import { defineConfig, memoryCache } from 'astro/config';

export default defineConfig({
  cache: {
    provider: memoryCache(),
  },
  routeRules: {
    '/blog/[...path]': { maxAge: 300, swr: 60 },
  },
});
```

## Astro 6

Dependencies: Node 22, Vite 7, Zod 4, Shiki 4.

| Change | What to do |
| --- | --- |
| Legacy content collections are removed with no backwards compatibility. | Move `src/content/config.ts` to `src/content.config.ts`. Give every collection a `loader`. Delete `type: 'content'` / `'data'`. Replace `entry.slug` with `entry.id`, `entry.render()` with `render(entry)`, and `getEntryBySlug()` / `getDataEntryById()` with `getEntry()`. |
| `z` from `astro:content` and the `astro:schema` module are deprecated. | `import { z } from 'astro/zod'`. |
| Zod 4. | `z.string().email()` becomes `z.email()` (same for `url` and other formats). Error messages use `{ error: '...' }`, not `{ message: '...' }`. A `.default()` after a transform must match the output type. |
| `Astro.glob()` is removed. | `getCollection()` for content, `import.meta.glob()` otherwise. |
| `<ViewTransitions />` is removed. | `<ClientRouter />` from `astro:transitions`. Its `handleForms` prop is also gone. |
| Session `driver` strings are deprecated. | `driver: sessionDrivers.redis({ url })`, with `sessionDrivers` from `astro/config`. |
| `import.meta.env` values are always inlined and never coerced. | Compare strings explicitly (`=== 'true'`), read runtime secrets from `process.env`, or use `astro:env`. |
| `<script>` and `<style>` tags render in the order they are defined. | Check CSS that relied on the old ordering. |
| The default image service crops by default and never upscales. `getImage()` throws on the client. | Review images with both `width` and `height`. Call `getImage()` only in server code. |
| `getStaticPaths()` params cannot be numbers. `Astro` inside `getStaticPaths()` is deprecated. | Return string params. Use `import.meta.env` or imports there. |
| `rewrite()` is removed from the Actions context. Internal `astro:actions` exports are removed. | Use `getActionContext()` in middleware. |
| CommonJS config files are not supported. | Use `astro.config.mjs` or `.ts`. |
| Stabilised: live content collections, fonts, CSP. | Delete the `experimental` flags. |

Content collection before and after:

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/data/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
  }),
});

export const collections = { blog };
```

## Astro 5

| Change | What to do |
| --- | --- |
| `output: 'hybrid'` is removed. `static` is the default and allows on-demand routes. | Delete `output: 'hybrid'`. Keep `export const prerender = false` on on-demand routes. |
| The Content Layer API replaces the original collections API. | Same changes as the Astro 6 row above; do them before moving to 6. |
| `astro:content` cannot be imported in client code. | Query on the server and pass data as props. |
| `compiledContent()` is async. | `await` it. |
| `<script>` tags are no longer hoisted implicitly. | Do not rely on scripts moving to `<head>`. |
| `src/env.d.ts` is no longer required; types come from `.astro/types.d.ts`. | Add `.astro/types.d.ts` to `include` in `tsconfig.json`. |
| CSRF origin checking (`security.checkOrigin`) is on by default for on-demand pages. | Do not disable it to make a cross-origin form work; fix the request origin. |
| Squoosh image service and `@astrojs/lit` are removed. | Use the default Sharp service. |

## Cloudflare adapter

`@astrojs/cloudflare` 13 and later (Astro 6+):

- `Astro.locals.runtime` is removed. Read bindings with `import { env } from 'cloudflare:workers'`, read `cf` from the request, and use `Astro.locals.cfContext` for the execution context.
- `astro dev` and `astro preview` run in `workerd`, as does prerendering by default. Node-only APIs and CommonJS packages fail there. Set `prerenderEnvironment: 'node'` in the adapter options only if prerendering needs Node.
- Cloudflare Pages is not supported; deploy to Workers.

Details: `https://docs.astro.build/en/guides/integrations-guide/cloudflare/`.
