# Authoring Starlight pages

Read this when writing or editing docs pages. Frontmatter reference: `https://starlight.astro.build/reference/frontmatter/`.

## Contents

- [Page basics](#page-basics)
- [Frontmatter](#frontmatter)
- [Splash pages and hero](#splash-pages-and-hero)
- [Asides](#asides)
- [Components](#components)
- [Code blocks](#code-blocks)
- [Markdown plugins](#markdown-plugins)

## Page basics

- A page is a `.md`, `.mdx` or `.mdoc` file in `src/content/docs/`. Its path is its URL: `src/content/docs/guides/intro.md` is served at `/guides/intro/`.
- `title` is required. Starlight renders it as the `<h1>`, so the body starts with text or `##` headings. Do not add a `#` heading.
- Link to other pages with root-relative URLs (`/guides/intro/`). If the site sets an Astro `base`, include it in Markdown links yourself.
- Images: use relative paths to files in `src/` for optimised images, or `/file.png` for files in `public/`.

## Frontmatter

```md
---
title: Getting started
description: Install and configure the project.
sidebar:
  label: Start
  order: 1
  badge: New
---
```

| Field | Notes |
| --- | --- |
| `title` | Required |
| `description` | Used for page metadata and link previews |
| `slug` | Overrides the page ID and URL |
| `template` | `'doc'` (default) or `'splash'` |
| `hero` | See below |
| `tableOfContents` | `false` or `{ minHeadingLevel, maxHeadingLevel }` |
| `sidebar` | `label`, `order`, `hidden`, `badge`, `attrs` for this page's sidebar link |
| `prev`, `next` | `false`, a label string, or `{ link, label }` |
| `draft` | `true` excludes the page from production builds |
| `pagefind` | `false` excludes the page from search |
| `lastUpdated`, `editUrl` | Override the site-wide setting; `false` hides it |
| `head` | Extra `<head>` tags for this page |
| `banner` | `{ content: '...' }` shown at the top of the page |

Fields outside this list fail schema validation unless the schema is extended in `src/content.config.ts`.

## Splash pages and hero

```md
---
title: My Docs
description: Documentation for my project.
template: splash
hero:
  tagline: Everything you need to get started.
  image:
    file: ~/assets/logo.png
  actions:
    - text: Get started
      link: /guides/intro/
      icon: right-arrow
      variant: primary
    - text: View on GitHub
      link: https://github.com/withastro/starlight
      icon: external
      variant: minimal
---
```

- `template: splash` removes the sidebars. Use it for landing pages.
- `hero.image` takes `file` (a relative path or `~/assets/...`), a `dark` and `light` pair, or raw `html`.
- `variant` is `primary`, `secondary` or `minimal`.

## Asides

Asides work in `.md` and `.mdx` with no import:

```md
:::note
Starlight is a documentation toolkit.
:::

:::tip[Did you know?]
The bracket text replaces the default title.
:::

:::caution
Check this before continuing.
:::

:::danger{icon="warning"}
A custom icon is set with the icon attribute.
:::
```

The four types are `note`, `tip`, `caution` and `danger`. The syntax is the same under Astro 7's default Markdown processor; no configuration is needed.

## Components

Built-in components need an `.mdx` file and one import path:

```mdx
---
title: Using components
---

import { Aside, Badge, Card, CardGrid, Code, FileTree, Icon, LinkButton, LinkCard, Steps, TabItem, Tabs } from '@astrojs/starlight/components';

<Tabs syncKey="pkg">
  <TabItem label="npm">`npm install`</TabItem>
  <TabItem label="pnpm">`pnpm install`</TabItem>
</Tabs>

<Steps>

1. Install the package.
2. Add the configuration.

</Steps>

<CardGrid>
  <Card title="Guides" icon="open-book">Read the guides.</Card>
  <LinkCard title="Reference" href="/reference/configuration/" />
</CardGrid>
```

- A plain `.md` file cannot import components. Rename it to `.mdx` or use asides.
- `<Steps>` must wrap exactly one ordered list.
- `<Tabs syncKey>` keeps tab groups with the same labels in sync across a page.
- `<Badge>` and `<Icon>` do not add a trailing space; write the space yourself.
- `LinkCard` and `LinkButton` `href` values are used as written; include an Astro `base` if there is one.
- Add `class="not-content"` to your own component's root element to opt it out of Starlight's prose styles.
- In Markdoc files use tags (`{% aside %}`, `{% tabs %}`, `{% card %}`) with no import, after adding `@astrojs/starlight-markdoc`.

Component docs: `https://starlight.astro.build/components/using-components/`.

## Code blocks

Starlight renders fenced code with Expressive Code. Use the info string for titles, frames and line markers:

````md
```js title="astro.config.mjs" {2} ins={4} del={5}
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const added = true;
const removed = true;
```
````

Configure themes and behaviour through the `expressiveCode` option of `starlight()`, not by adding `astro-expressive-code` to `integrations`.

## Markdown plugins

Astro 7 renders Markdown and MDX with Sätteri. Starlight's own features work with it automatically. Remark and rehype plugins do not run unless the project switches processor:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';

export default defineConfig({
  markdown: {
    processor: unified({ remarkPlugins: [remarkMath] }),
  },
  integrations: [starlight({ title: 'My Docs' })],
});
```

`@astrojs/markdown-remark` must be installed as a project dependency. Use only `satteri()` or `unified()` as the processor; with any other, Starlight's asides and heading links do not run.

Starlight's Markdown features apply only to the docs collection. For Markdown elsewhere, list the directory in `starlight({ markdown: { processedDirs: [...] } })`.
