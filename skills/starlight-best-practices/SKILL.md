---
name: starlight-best-practices
description: Current best practices for Starlight, Astro's documentation framework. Use this skill whenever working in a project that depends on `@astrojs/starlight` - editing the `starlight()` options in `astro.config.*` (sidebar, social links, head, locales, custom CSS), writing or organising docs pages in `src/content/docs/`, page frontmatter, asides and built-in components, overriding Starlight components, route data, custom pages, Tailwind or CSS theming, i18n, search, Starlight plugins, or fixing a Starlight build error. Starlight's configuration and override APIs changed in many 0.x releases, so load it even for small edits. For Astro features outside Starlight (islands, actions, adapters, other collections) use astro-best-practices.
license: MIT
metadata:
  author: Astro
  version: "0.2.0"
  tags:
    - astro
    - starlight
    - documentation
---

# Starlight Best Practices

## Purpose

Starlight is pre-1.0 and has renamed or removed configuration and override APIs in many minor releases, so remembered Starlight code is often wrong. This file lists what changed. It describes Starlight 0.43 on Astro 7; check the installed versions in `package.json` first.

This file is enough for most edits. Open a reference only for the topics listed at the end, and verify an option name you are unsure of in the docs at `https://starlight.astro.build/` before writing it: the `starlight()` options are strictly validated, and an unknown key fails the build.

## Outdated patterns to replace

| Outdated | Current |
| --- | --- |
| Sidebar group `{ label: 'Reference', autogenerate: { directory: 'reference' } }` | `{ label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] }` |
| `social: { github: 'https://...' }` | `social: [{ icon: 'github', label: 'GitHub', href: 'https://...' }]` |
| `src/content/config.ts` with `defineCollection({ schema: docsSchema() })` | `src/content.config.ts` with `loader: docsLoader()` from `@astrojs/starlight/loaders` and `schema: docsSchema()` from `@astrojs/starlight/schema` |
| Extra frontmatter fields with `docsSchema().extend(...)`, or `z` from `astro:content` | `docsSchema({ extend: z.object({ category: z.enum(['guide', 'reference']).optional() }) })` with `import { z } from 'astro/zod'` |
| In overrides: `Astro.props`, `@astrojs/starlight/props`, `<Default {...Astro.props}>` | `Astro.locals.starlightRoute` for page data, `Astro.locals.t('key')` for UI strings, and `<Default><slot /></Default>` |
| Plugin hook `setup()` with `injectTranslations` | `'config:setup'()`; translations go in `'i18n:setup'()` |
| `@astrojs/tailwind`, `tailwind.config.mjs`, `@tailwind base;` | Tailwind 4; see below |
| `head: [{ tag: 'meta', content: '...', attrs: { name } }]` | `content` goes inside `attrs` |
| Adding `@astrojs/mdx`, `@astrojs/sitemap` or `astro-expressive-code` to `integrations` | Starlight adds them itself |
| Remark or rehype plugins in `markdown.remarkPlugins` | Install `@astrojs/markdown-remark` and set `markdown.processor: unified({ remarkPlugins })` |

## Rules

- **Pages** are files in `src/content/docs/` and need `title` in frontmatter. Starlight renders the title as the `<h1>`, so start body headings at `##`.
- **Sidebar links to docs pages** use the page ID with no slashes around it: `'guides/intro'` or `{ slug: 'guides/intro' }`. Use `{ label, link }` only for external URLs and pages outside the docs collection.
- **With a `base` in the Astro config**, sidebar links get the base automatically, but links written in Markdown, hero actions, `LinkCard` and `LinkButton` do not. Write them with the base (`/docs/guides/install/`) or as relative links.
- **Built-in components** (`Tabs`, `Card`, `Steps`, and so on) are imported from `@astrojs/starlight/components` and work only in `.mdx` files; an import in a `.md` file is printed as text. In `.md`, use asides: `:::note`, `:::tip[Title]`, `:::caution`, `:::danger`.
- **Component overrides** are set by name: `components: { Footer: './src/components/Footer.astro' }`, importing the default from `@astrojs/starlight/components/Footer.astro`.
- **Custom pages** go in `src/pages/` and wrap content in `StarlightPage` from `@astrojs/starlight/components/StarlightPage.astro` with `frontmatter={{ title }}`.
- **More than one language** needs `locales` in the config, with `root: { label, lang }` for the language served at the site root; a folder such as `de/` alone is not treated as German.
- **Tailwind**: run `npx astro add tailwind`, install `@astrojs/starlight-tailwind`, list the stylesheet in `customCss`, and give it exactly these imports (not `@import "tailwindcss"`, which resets Starlight's styles):

  ```css
  @layer base, starlight, theme, components, utilities;
  @import '@astrojs/starlight-tailwind';
  @import 'tailwindcss/theme.css' layer(theme);
  @import 'tailwindcss/utilities.css' layer(utilities);
  ```

## Check your work

Run `npx astro build` before finishing. It validates the config, the frontmatter schema and sidebar slugs, so it catches most of the mistakes above; an edit that is not built is not verified. Search only works in a build, not in `astro dev`.

## References

Open one only when the task is about its topic.

| Reference | Topic |
| --- | --- |
| [configuration.md](references/configuration.md) | Sidebar item forms, head and favicon, locales and UI translations, search options |
| [authoring.md](references/authoring.md) | Full frontmatter list, splash pages and hero, component usage, code blocks |
| [customization.md](references/customization.md) | Route data and route middleware, CSS theming, writing plugins |
