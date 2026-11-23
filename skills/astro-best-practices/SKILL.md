---
name: astro-best-practices
description: Current best practices for building with Astro 7 and for upgrading older Astro projects. Use this skill whenever working in a project that depends on `astro` - creating or editing `.astro` components, pages, layouts or `astro.config.*`; content collections (`src/content.config.ts`); Markdown or MDX content; islands and `client:*` directives; server islands; on-demand rendering and adapters; actions, sessions, `astro:env`, images, view transitions, middleware or route caching; fixing Astro build errors; or reviewing Astro code. Astro's APIs changed substantially in v5, v6 and v7, so load it even for small edits - it lists the removed and renamed APIs that older knowledge gets wrong. For Starlight-specific configuration use starlight-best-practices instead.
license: MIT
metadata:
  author: Astro
  version: "0.1.0"
  tags:
    - astro
    - web-framework
    - frontend
---

# Astro Best Practices

## Purpose

Help write, review and upgrade Astro code that is correct for the installed Astro version. Astro 5, 6 and 7 removed or renamed many APIs, so remembered Astro code is often wrong. This skill lists what changed and points to the official docs for details.

## Start here

1. Read the installed `astro` version from the project's dependencies (and the lockfile if the range is loose). This skill describes Astro 7. For a project on Astro 4-6, keep the code valid for its installed version and read [upgrading](references/upgrading.md) before using a newer API or bumping the version.
2. Follow the project's existing conventions (package manager, TypeScript strictness, file layout, UI framework) unless they are the problem.
3. When unsure about an API, option name or default, look it up before writing it. Use the Astro docs MCP tool `search_astro_docs` if it is available; otherwise read the relevant page under `https://docs.astro.build/en/`. Do not fetch `docs.astro.build/llms.txt`; it no longer exists.

A small, local edit does not need a docs lookup or a project audit. Look things up when the code touches something in the table below or an API you have not seen in this project.

## Outdated patterns to replace

These are removed or deprecated. Never write the left-hand form in an Astro 7 project, and flag it in reviews.

| Outdated | Current |
| --- | --- |
| `src/content/config.ts`, collections without a `loader`, `type: 'content'` / `'data'` | `src/content.config.ts`; every collection has a `loader` such as `glob({ pattern, base })` or `file()` from `astro/loaders` |
| `entry.render()`, `entry.slug`, `getEntryBySlug()`, `getDataEntryById()` | `render(entry)` from `astro:content`, `entry.id`, `getEntry()` |
| `import { z } from 'astro:content'` or `'astro:schema'`; Zod 3 forms such as `z.string().email()` | `import { z } from 'astro/zod'` (Zod 4): `z.email()`, `z.url()`, `{ error: '...' }` for messages |
| `Astro.glob()` | `getCollection()` for content, `import.meta.glob()` for other files |
| `output: 'hybrid'` | Default `output: 'static'` plus `export const prerender = false` on the routes that render on demand (needs an adapter) |
| `<ViewTransitions />` and `TRANSITION_*` constants or `isTransition*Event()` helpers | `<ClientRouter />` from `astro:transitions`; compare `event.type` with strings such as `'astro:after-swap'` |
| `@astrojs/tailwind` integration | `astro add tailwind`, which sets up Tailwind 4 through `@tailwindcss/vite` and `@import "tailwindcss"` |
| `@astrojs/db`, `astro:db` | Removed. Use `node:sqlite`, Drizzle or another database client directly |
| `experimental.*` flags for cache, route rules, logger, fonts, CSP, live collections, the Rust compiler or advanced routing | These are stable. Use the top-level options (`cache`, `routeRules`, `logger`, `fonts`, `security.csp`) and delete the flag |
| `session: { driver: 'redis', options }` | `driver: sessionDrivers.redis({ ... })` with `sessionDrivers` imported from `astro/config` |
| `markdown.remarkPlugins` / `rehypePlugins` assumed to work out of the box | Markdown is rendered by Sätteri. Unified plugins need `@astrojs/markdown-remark` installed and `markdown.processor: unified()` |
| `Astro.locals.runtime.env` on Cloudflare | `import { env } from 'cloudflare:workers'` |
| Hand-editing dependency versions to add an integration or bump Astro | `astro add <integration>` and `npx @astrojs/upgrade` |

## Astro 7 behaviour that breaks silently

- **Whitespace between inline elements is dropped.** `compressHTML` defaults to `'jsx'`, so `<span>a</span>` followed by `<em>b</em>` on the next line renders `ab`. Write `{" "}` between inline elements that need a space.
- **The compiler is strict.** Every non-void element needs a closing tag, and invalid nesting such as `<div>` inside `<p>` is no longer repaired. Write valid HTML.
- **`src/fetch.ts` is reserved** for advanced routing, like `src/middleware.ts`. Do not create a helper with that name.
- **`import.meta.env` values are inlined at build time and never coerced.** `"true"` stays a string. Prefer `astro:env` with a schema for typed, validated variables.
- **Scripts run once per page load.** With `<ClientRouter />`, re-run setup code on the `astro:page-load` event.
- **A `<script>` with any attribute other than `src` is not bundled.** That includes `is:inline` and `define:vars`; such a script cannot use imports unless it has `type="module"` and browser-resolvable paths.

## Defaults to keep

- **Ship no JavaScript unless something is interactive.** Use `.astro` components for static UI. Add a `client:*` directive only to components that need interactivity, and choose the latest one that works: `client:visible` or `client:idle` before `client:load`. A framework component without a directive renders as static HTML.
- **Keep content in collections.** Query with `getCollection()` and `getEntry()`, validate frontmatter with a schema, and generate routes from entries.
- **Prerender by default.** Opt single routes into on-demand rendering; do not switch the whole site to `output: 'server'` for one dynamic page.
- **Use the built-in feature before a hand-rolled one**: `<Image />` and `<Picture />` from `astro:assets` for images in `src/`, actions for form and mutation endpoints, `astro:env` for environment variables, sessions for per-visitor server state, `Astro.cache` and `routeRules` for response caching.
- **Keep secrets and request data on the server.** Component frontmatter runs on the server only: there is no `window` or `document` there, and its variables are not available to client scripts unless passed explicitly.

## References

Read the file that matches the task. Each is self-contained.

| Reference | Read it when |
| --- | --- |
| [components-and-islands.md](references/components-and-islands.md) | Writing `.astro` components, hydrating framework components, server islands, client scripts, scoped styles, view transitions |
| [content-collections.md](references/content-collections.md) | Defining or querying collections, loaders, schemas, references, live collections, generating routes from content |
| [rendering-and-routing.md](references/rendering-and-routing.md) | On-demand rendering, adapters, dynamic routes, middleware, redirects and rewrites, advanced routing, caching, i18n |
| [server-features.md](references/server-features.md) | Actions and forms, `astro:env`, sessions, cookies, security settings |
| [markdown-and-assets.md](references/markdown-and-assets.md) | Markdown and MDX configuration, plugins, images, fonts |
| [upgrading.md](references/upgrading.md) | The project is on Astro 4-6, an upgrade is requested, or a build fails on a removed API |

## Check your work

- Run the project's own checks. If it has none, `npx astro check` type-checks `.astro` files and `npx astro build` catches compiler, content schema and routing errors.
- To inspect a running site, start the dev server in the background with `astro dev --background`, then use `astro dev status`, `astro dev logs` and `astro dev stop`. Do not start a second server when one is already running.
- After changing a content config or schema, run `npx astro sync` so generated types are current.

## Scope

This skill covers Astro core. For Starlight documentation sites, also load `starlight-best-practices`. For host-specific deployment details beyond what the adapter docs say, use the host's own documentation or skill.
