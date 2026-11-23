---
name: starlight-best-practices
description: Current best practices for Starlight, Astro's documentation framework. Use this skill whenever working in a project that depends on `@astrojs/starlight` - editing the `starlight()` options in `astro.config.*` (sidebar, social links, head, locales, custom CSS), writing or organising docs pages in `src/content/docs/`, page frontmatter, asides and built-in components, overriding Starlight components, route data, custom pages, Tailwind or CSS theming, i18n, search, Starlight plugins, or fixing a Starlight build error. Starlight's configuration and override APIs changed in many 0.x releases, so load it even for small edits. For Astro features outside Starlight (islands, actions, adapters, other collections) use astro-best-practices.
license: MIT
metadata:
  author: Astro
  version: "0.1.0"
  tags:
    - astro
    - starlight
    - documentation
---

# Starlight Best Practices

## Purpose

Help write, configure and customise Starlight documentation sites correctly for the installed Starlight version. Starlight is pre-1.0 and has renamed or removed configuration and override APIs in many minor releases, so remembered Starlight code is often wrong. This skill lists what changed and points to the official docs for details.

## Start here

1. Read the installed `@astrojs/starlight` and `astro` versions from the project's dependencies. This skill describes Starlight 0.43 on Astro 7. Each Starlight minor supports one Astro major (0.41+ needs Astro 7, 0.38-0.40 need Astro 6, 0.30-0.37 need Astro 5), so upgrade both together with `npx @astrojs/upgrade`.
2. Starlight is an Astro integration. Astro's own rules still apply; load `astro-best-practices` for anything that is not Starlight-specific.
3. When unsure about an option or component name, look it up. Use the Astro docs MCP tool `search_astro_docs` if it is available (it covers the Starlight docs); otherwise read the relevant page under `https://starlight.astro.build/`. Do not fetch `starlight.astro.build/llms.txt`; it does not exist.

The `starlight()` options object is strictly validated: an unknown or removed key fails the build. Do not guess option names.

## Outdated patterns to replace

Never write the left-hand form in a current Starlight project, and flag it in reviews.

| Outdated | Current |
| --- | --- |
| Sidebar group `{ label: 'Reference', autogenerate: { directory: 'reference' } }` | `{ label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] }`. The old form throws since 0.39 |
| `social: { github: 'https://...' }` | `social: [{ icon: 'github', label: 'GitHub', href: 'https://...' }]` |
| `src/content/config.ts` with `defineCollection({ schema: docsSchema() })` | `src/content.config.ts` with `loader: docsLoader()` from `@astrojs/starlight/loaders` and `schema: docsSchema()` from `@astrojs/starlight/schema` |
| `import { z } from 'astro:content'` when extending the schema | `import { z } from 'astro/zod'` |
| In overrides: `Astro.props`, `import type { Props } from '@astrojs/starlight/props'`, `<Default {...Astro.props}>` | `Astro.locals.starlightRoute` for page data and `<Default><slot /></Default>` |
| `Astro.props.labels` for UI strings | `Astro.locals.t('search.label')` |
| Plugin hook `hooks: { setup() {} }` with `injectTranslations` inside it | `hooks: { 'config:setup'() {} }`; translations go in `'i18n:setup'` |
| `@astrojs/tailwind`, `tailwind.config.mjs` with `starlightPlugin()`, `@tailwind base;` | Tailwind 4 through `@tailwindcss/vite` and `@astrojs/starlight-tailwind` imported in CSS. See [customization](references/customization.md#tailwind) |
| `head: [{ tag: 'meta', content: '...', attrs: { name } }]` | Put `content` inside `attrs` |
| `tagline` option | Removed in 0.42 |
| `markdown.remarkPlugins` assumed to work out of the box | Astro 7 renders Markdown with Sätteri. Unified plugins need `@astrojs/markdown-remark` installed and `markdown.processor: unified({ remarkPlugins })` |
| Adding `@astrojs/mdx`, `@astrojs/sitemap` or `astro-expressive-code` to `integrations` | Starlight adds them itself. Configure code blocks through the `expressiveCode` option |

## Rules that prevent build failures

- **Pages are files in `src/content/docs/`.** Each needs `title` in frontmatter. Starlight renders the title as the page `<h1>`, so start body headings at `##`. Files whose name starts with `_` are ignored.
- **Sidebar internal links use the page ID**: `'guides/intro'` or `{ slug: 'guides/intro' }`, with no leading or trailing slash, and `'index'` for the root page. A slug that matches no page is a build error. Use `{ label, link }` only for external URLs or pages outside the docs collection.
- **Use built-in components only in `.mdx` files**, imported from `@astrojs/starlight/components`. In `.md` files use the `:::note`, `:::tip[Title]`, `:::caution` and `:::danger` aside syntax.
- **Override components by name** with `components: { SocialIcons: './src/components/MySocialIcons.astro' }`, using names from `https://starlight.astro.build/reference/overrides/`.
- **`customCss` paths must be under `src/` or an npm package**, not `public/`.
- **Do not name a Starlight route middleware file `src/middleware.ts`.** That name belongs to Astro middleware.
- **Custom pages belong in `src/pages/`** and wrap their content in `StarlightPage`. A custom `src/pages/404.astro` needs `disable404Route: true`; otherwise customise the 404 page with `src/content/docs/404.md`.

## Behaviour to expect

- Search (Pagefind) only works in a production build. Test it with `astro build` and `astro preview`, not `astro dev`. It cannot be combined with `prerender: false`.
- Starlight's CSS is in the `starlight` cascade layer, so unlayered rules in `customCss` win without `!important`.
- Asides, heading anchor links and other Starlight Markdown features apply only to the docs collection. Add other directories to `markdown.processedDirs` to opt them in.
- With an Astro `base`, sidebar links are prefixed automatically. Links written in Markdown, hero actions, `LinkCard` and `LinkButton` are not; include the base yourself.
- `lastUpdated` reads git history; a shallow clone in CI gives wrong dates.

## References

| Reference | Read it when |
| --- | --- |
| [configuration.md](references/configuration.md) | Editing `starlight()` options: sidebar, social, head, locales and i18n, search, content collections setup |
| [authoring.md](references/authoring.md) | Writing pages: frontmatter, splash pages and hero, asides, components, code blocks, Markdown plugins |
| [customization.md](references/customization.md) | Overriding components, route data and route middleware, custom pages, CSS and Tailwind, writing plugins |

## Check your work

Run `npx astro check` and `npx astro build`. The build validates the Starlight config, frontmatter schema and sidebar slugs, so it catches most mistakes in this skill's tables. Use `astro dev --background` with `astro dev status`, `logs` and `stop` to inspect pages.

## Limitations

This skill covers Starlight's own configuration and authoring surface. It does not cover community plugins; check each plugin's documentation, and note that plugins that inject remark plugins may not work with the default Markdown processor in Astro 7.
