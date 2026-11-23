---
name: astro-best-practices
description: Current best practices for building with Astro 7 and for upgrading older Astro projects. Use this skill whenever working in a project that depends on `astro` - creating or editing `.astro` components, pages, layouts or `astro.config.*`; content collections (`src/content.config.ts`); Markdown or MDX content; islands and `client:*` directives; server islands; on-demand rendering and adapters; actions, sessions, `astro:env`, images, view transitions, middleware or route caching; fixing Astro build errors; or reviewing Astro code. Astro's APIs changed substantially in v5, v6 and v7, so load it even for small edits - it lists the removed and renamed APIs that older knowledge gets wrong. For Starlight-specific configuration use starlight-best-practices instead.
license: MIT
metadata:
  author: Astro
  version: "0.2.0"
  tags:
    - astro
    - web-framework
    - frontend
---

# Astro Best Practices

## Purpose

Astro 5, 6 and 7 removed or renamed many APIs, so remembered Astro code is often wrong or deprecated. This file lists what changed. It describes Astro 7; check the installed `astro` version in `package.json` first, and for a project on Astro 4-6 keep the code valid for that version (see the upgrading reference before bumping it).

This file is enough for most edits. Open a reference only for the topics listed at the end. When unsure of an API or option name, look it up at `https://docs.astro.build/en/` before writing it.

## Outdated patterns to replace

These still appear in older code and examples. Do not write the left-hand form in an Astro 7 project, and flag it in reviews.

| Outdated | Current |
| --- | --- |
| `import { z } from 'astro:content'` or `'astro:schema'` (deprecated, still runs) | `import { z } from 'astro/zod'` in content configs, actions and anywhere else |
| Zod 3 forms: `z.string().email()`, `{ message: '...' }` | Zod 4: `z.email()`, `z.url()`, `{ error: '...' }` |
| `src/content/config.ts`, collections without a `loader`, `type: 'content'` | `src/content.config.ts`; every collection has `loader: glob({ pattern, base })` or `file()` from `astro/loaders` |
| `entry.render()`, `entry.slug`, `getEntryBySlug()` | `render(entry)` from `astro:content`, `entry.id`, `getEntry()` |
| `Astro.glob()` | `getCollection()` for content, `import.meta.glob()` for other files |
| `output: 'hybrid'` | Default static output plus `export const prerender = false` on on-demand routes, with an adapter |
| `<ViewTransitions />`, `TRANSITION_*` constants | `<ClientRouter />` from `astro:transitions`; event names as strings such as `'astro:after-swap'` |
| `@astrojs/tailwind` | `npx astro add tailwind`: Tailwind 4 through `@tailwindcss/vite`, with `@import "tailwindcss"` in a stylesheet |
| `@astrojs/db`, `astro:db` | Removed; use a database client directly |
| `experimental.*` flags for cache, route rules, logger, fonts, CSP or live collections | Stable top-level options: `cache`, `routeRules`, `logger`, `fonts`, `security.csp` |
| `session: { driver: 'redis', options }` | `driver: sessionDrivers.redis({ ... })`, with `sessionDrivers` from `astro/config` |
| Remark or rehype plugins in `markdown.remarkPlugins` | Install `@astrojs/markdown-remark` and set `markdown.processor: unified({ remarkPlugins })`; Markdown is rendered by Sätteri by default |
| `Astro.locals.runtime.env` on Cloudflare | `import { env } from 'cloudflare:workers'` |

## Behaviour that builds but is wrong

- **Whitespace between inline elements on separate lines is removed.** Write `{" "}` where a space is needed, for example `By{" "}<strong>{author}</strong>`.
- **`import.meta.env` values are strings.** `PUBLIC_FLAG=false` is truthy; compare with `=== 'true'`, or declare the variable with `astro:env`.
- **An endpoint or page is prerendered unless it has `export const prerender = false`.** Anything that must run per request (current time, cookies, sessions, form handling) needs it, plus an adapter.
- **A framework component is static HTML without a `client:*` directive.** Prefer `client:visible` or `client:idle` to `client:load`.
- **With `<ClientRouter />`, scripts run once.** Put per-page setup inside `document.addEventListener('astro:page-load', ...)`.
- **Images must be imported.** `import hero from '../assets/hero.png'` with `<Image src={hero} alt="..." />` from `astro:assets`; a path string such as `/src/assets/hero.png` is broken in the built site.
- **A `<script>` with any attribute other than `src` is not bundled** and cannot use imports. **`src/fetch.ts` is a reserved file name.**

## Check your work

Run `npx astro build` before finishing (and `npx astro check` for types, if the project uses it). An edit that is not built is not verified. Use `npx astro add <integration>` and `npx @astrojs/upgrade` instead of editing dependency versions by hand.

## References

Open one only when the task is about its topic.

| Reference | Topic |
| --- | --- |
| [content-collections.md](references/content-collections.md) | Loaders, schemas and references, querying, routes from content, live collections |
| [components-and-islands.md](references/components-and-islands.md) | Hydration and props, server islands, client scripts, scoped styles, view transitions |
| [rendering-and-routing.md](references/rendering-and-routing.md) | Adapters, dynamic routes, middleware, advanced routing, route caching, i18n |
| [server-features.md](references/server-features.md) | Actions and forms, `astro:env`, sessions, security settings |
| [markdown-and-assets.md](references/markdown-and-assets.md) | Markdown processors and plugins, MDX, images, fonts |
| [upgrading.md](references/upgrading.md) | Moving a project from Astro 4, 5 or 6 |

For Starlight documentation sites, also load `starlight-best-practices`.
