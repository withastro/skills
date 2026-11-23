# Rendering and routing

Read this for on-demand rendering, adapters, dynamic routes, middleware, redirects and rewrites, advanced routing, route caching and i18n.

## Contents

- [Rendering modes](#rendering-modes)
- [On-demand pages](#on-demand-pages)
- [Dynamic routes](#dynamic-routes)
- [Middleware](#middleware)
- [Advanced routing](#advanced-routing)
- [Route caching](#route-caching)
- [Internationalisation](#internationalisation)

## Rendering modes

- The default is `output: 'static'`: every page and endpoint is prerendered at build time.
- Opt one route into on-demand rendering with `export const prerender = false`. This is the right choice for a mostly static site with a few dynamic routes.
- `output: 'server'` only flips the default, so routes render on demand unless they export `prerender = true`. It adds no other capability. Use it when most routes are dynamic.
- There is no `output: 'hybrid'`.
- Any on-demand route, server island, action called from a form, session or live collection needs an adapter. Install one with `npx astro add node` (or `netlify`, `vercel`, `cloudflare`), which also updates the config.

## On-demand pages

```astro
---
export const prerender = false;

const product = await getProduct(Astro.params.id);
if (!product) {
  return new Response(null, { status: 404, statusText: 'Not found' });
}
if (!product.isAvailable) {
  return Astro.redirect('/products', 301);
}
Astro.response.headers.set('Cache-Control', 'public, max-age=3600');
---
<h1>{product.name}</h1>
```

- Set status, headers and redirects in the page's own frontmatter. They do not work inside components or layouts, because the response has started streaming by then.
- `Astro.cookies`, `Astro.request.headers`, `Astro.session` and `Astro.locals` are only meaningful on on-demand routes. On a prerendered page they hold build-time values.
- `Astro.rewrite('/404')` renders another route without changing the URL.
- `src/pages/404.astro` is the custom not-found page. `src/pages/500.astro` works for on-demand pages only.
- Endpoints (`src/pages/api/data.ts`) export functions named after HTTP methods and return a `Response`:

```ts
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  return Response.json({ ok: true });
};
```

## Dynamic routes

- Prerendered dynamic routes (`[slug].astro`, `[...path].astro`) must export `getStaticPaths()` returning every `params` value, as strings. Pass data to the page through `props`.
- On-demand dynamic routes do not use `getStaticPaths()`. Read `Astro.params` and handle the missing case.
- Do not use the `Astro` global inside `getStaticPaths()`.
- When routes overlap, more specific wins: static segments before dynamic, named parameters before rest parameters, prerendered before on-demand.

## Middleware

```ts
// src/middleware.ts
import { defineMiddleware, sequence } from 'astro:middleware';

const auth = defineMiddleware(async (context, next) => {
  context.locals.user = await getUser(context.cookies);
  return next();
});

export const onRequest = sequence(auth);
```

- The export is named `onRequest`. A default export is ignored.
- Set properties on `context.locals`; replacing the object throws. Type it by declaring `App.Locals` in `src/env.d.ts`.
- Middleware runs at build time for prerendered pages, with no real request. Guard request-dependent logic so it only runs for on-demand routes.
- `context.rewrite()` re-runs middleware. `next('/path')` rewrites without re-running it, but recreates the request, which breaks reading a form body afterwards.
- Do not treat middleware as the only authorization layer for actions or endpoints; check permissions in the handler too.

## Advanced routing

`src/fetch.ts` replaces Astro's request pipeline with your own. The file name is reserved. Most projects do not need it; use middleware first.

```ts
// src/fetch.ts
import { FetchState, astro } from 'astro/fetch';

export default {
  async fetch(request: Request): Promise<Response> {
    const state = new FetchState(request);
    // custom pre-processing here
    const response = await astro(state);
    // custom post-processing here
    return response;
  },
};
```

- `astro(state)` runs the full default pipeline. When composing the individual handlers from `astro/fetch` (`actions`, `middleware`, `pages`, `i18n`, `redirects`, `sessions`, `cache`, `notFound`), anything left out does not run, including `src/middleware.ts`.
- `astro/hono` exports the same handlers as Hono middleware.
- Do not authorize by string-matching `url.pathname` before calling Astro; the pathname may differ from the route Astro matches. Use a router that owns the matching.
- Rename the file with `fetchFile: './src/handler.ts'` or disable the feature with `fetchFile: null`.

Guide: `https://docs.astro.build/en/guides/routing/#advanced-routing`.

## Route caching

Route caching stores responses of on-demand routes. Configure a provider at the top level of the config:

```js
// astro.config.mjs
import { defineConfig, memoryCache } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  cache: {
    provider: memoryCache(),
  },
  routeRules: {
    '/products/[...slug]': { maxAge: 3600, tags: ['products'] },
    '/blog/[...slug]': { maxAge: 300, swr: 60 },
  },
});
```

```astro
---
export const prerender = false;

Astro.cache.set({ maxAge: 120, swr: 60, tags: ['home'] });
---
```

- Only on-demand pages and endpoints are cached. Prerendered pages are already static.
- `routeRules` keys use file-route syntax (`[...slug]`), not `*` globs. A page's `Astro.cache.set()` merges over the matching rule.
- Invalidate with `await context.cache.invalidate({ tags: ['products'] })` or `{ path: '/api/data' }`. Paths match exactly.
- Caching is disabled in `astro dev`. Test with `astro build` and `astro preview`.
- Never cache a response that depends on the visitor (cookies, session, auth) without `Astro.cache.set(false)` or a per-user design; the memory provider ignores the `Cookie` header when building cache keys.
- `memoryCache()` suits a single long-running server. Hosted providers come from the adapter packages (`@astrojs/netlify/cache`, `@astrojs/vercel/cache`, `@astrojs/cloudflare/cache`) and are experimental; check the adapter docs.

Guide: `https://docs.astro.build/en/guides/caching/`.

## Internationalisation

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: true,
    },
  },
});
```

- The folder structure under `src/pages/` must match the locale URLs (`src/pages/fr/about.astro`).
- `prefixDefaultLocale` defaults to `false`: the default locale has no prefix.
- `redirectToDefaultLocale` defaults to `false` and only applies with `prefixDefaultLocale: true`.
- Build links with `getRelativeLocaleUrl('fr', 'about')` from `astro:i18n` instead of concatenating strings.

Guide: `https://docs.astro.build/en/guides/internationalization/`.
