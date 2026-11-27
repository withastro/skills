# Markdown and assets

Read this for Markdown and MDX configuration, plugins, images and fonts.

## Contents

- [Markdown processor](#markdown-processor)
- [MDX](#mdx)
- [Syntax highlighting](#syntax-highlighting)
- [Images](#images)
- [Fonts](#fonts)

## Markdown processor

Astro 7 renders `.md` and `.mdx` with Sätteri. GitHub-Flavored Markdown and SmartyPants are on by default. With no plugins, no configuration or extra package is needed.

Sätteri plugins need `@astrojs/markdown-satteri` installed. Plugins are called when registered:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import satteriCallouts from 'satteri-callouts';

export default defineConfig({
  markdown: {
    processor: satteri({
      hastPlugins: [satteriCallouts()],
    }),
  },
});
```

Remark and rehype plugins need the unified processor and `@astrojs/markdown-remark` installed. Plugins with options are tuples:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkToc from 'remark-toc';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export default defineConfig({
  markdown: {
    processor: unified({
      remarkPlugins: [[remarkToc, { heading: 'contents' }]],
      rehypePlugins: [rehypeAutolinkHeadings],
    }),
  },
});
```

- The top-level `markdown.remarkPlugins`, `markdown.rehypePlugins` and `markdown.gfm` options are deprecated. Pass them to the processor.
- Adding a remark or rehype plugin to a project that has neither package installed does nothing useful until `@astrojs/markdown-remark` is added and `unified()` is set. Check `package.json` first.
- Prefer porting to a Sätteri plugin when one exists; keep `unified()` when the project depends on plugins that have no Sätteri equivalent.

Guide: `https://docs.astro.build/en/guides/markdown-content/`.

## MDX

- Add MDX with `npx astro add mdx`.
- `@astrojs/mdx` inherits the `markdown` configuration, including the processor. Options passed to `mdx({ ... })` override it.
- Recma plugins work with the unified processor only.
- Map HTML elements to components when rendering: `<Content components={{ h1: Heading }} />`.
- MDX files can import and use components. Plain `.md` files cannot.

## Syntax highlighting

Shiki is the default highlighter, configured under `markdown.shikiConfig`:

```js
export default defineConfig({
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
});
```

Use the `<Code />` component from `astro:components` to highlight code in `.astro` files.

## Images

```astro
---
import { Image, Picture } from 'astro:assets';
import hero from '../assets/hero.png';
---
<Image src={hero} alt="A description of the image." />
<Picture src={hero} formats={['avif', 'webp']} alt="A description of the image." />
<Image src="https://example.com/cat.png" inferSize alt="A cat sleeping in the sun." />
```

- `alt` is required. Use `alt=""` for decorative images.
- Store images in `src/` and import them. An imported image passed to `<Image />` is optimised and gets `width` and `height` set automatically, which prevents layout shift.
- Images in `public/` are never optimised. They are referenced by URL and need explicit `width` and `height` with `<Image />`.
- A plain `<img>` with an imported image needs `src={hero.src}`.
- Remote images are optimised only when their host is allowed with `image.domains` or `image.remotePatterns`. They need `width` and `height`, or `inferSize`.
- Responsive images: set `layout="constrained"`, `"full-width"` or `"fixed"` on the component, or `image.layout` in the config for all images including Markdown ones. Set `image.responsiveStyles: true` to have Astro emit the matching styles.
- The default image service crops when `width` and `height` change the aspect ratio and never upscales.
- `getImage()` runs on the server only. Call it in frontmatter and pass the resulting `src` to client code.
- Import an SVG as a component: `import Logo from '../assets/logo.svg'`, then `<Logo width={64} height={64} fill="currentColor" />`. This works in `.astro` files, not inside framework components.
- In Markdown, `![alt](./image.png)` with a relative path to a file in `src/` is optimised.
- In content collections, use the `image()` schema helper; see [content-collections](content-collections.md#schemas).

Guide: `https://docs.astro.build/en/guides/images/`.

## Fonts

The Fonts API downloads, self-hosts and preloads fonts. Prefer it to `<link>` tags pointing at a font CDN.

```js
// astro.config.mjs
import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Roboto',
      cssVariable: '--font-roboto',
    },
  ],
});
```

```astro
---
import { Font } from 'astro:assets';
---
<head>
  <Font cssVariable="--font-roboto" preload />
</head>

<style is:global>
  body {
    font-family: var(--font-roboto);
  }
</style>
```

- `fonts` is a top-level option, not under `experimental`.
- Each entry needs `provider`, `name` and `cssVariable`. Providers include `fontProviders.google()`, `fontsource()`, `bunny()`, `fontshare()`, `adobe()` and `local()`.
- `fontProviders.local()` needs `options.variants` listing the font files, which live in `src/`.
- Use `preload` only for fonts used above the fold.
- With Tailwind 4, register the variable: `@theme inline { --font-sans: var(--font-roboto); }`.

Guide: `https://docs.astro.build/en/guides/fonts/`.
