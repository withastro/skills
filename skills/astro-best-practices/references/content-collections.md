# Content collections

Read this when defining or querying collections, writing loaders or schemas, or generating routes from content. Guide: `https://docs.astro.build/en/guides/content-collections/`.

## Contents

- [Defining collections](#defining-collections)
- [Loaders](#loaders)
- [Schemas](#schemas)
- [Querying and rendering](#querying-and-rendering)
- [Generating routes](#generating-routes)
- [Live collections](#live-collections)

## Defining collections

Collections are defined in `src/content.config.ts`. Every collection has a `loader`.

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob, file } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/data/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
  }),
});

const authors = defineCollection({
  loader: file('src/data/authors.json'),
  schema: z.object({ name: z.string() }),
});

export const collections = { blog, authors };
```

- The file is `src/content.config.ts`, not `src/content/config.ts`.
- There is no `type: 'content'` or `type: 'data'`.
- Content can live anywhere in the project; `base` sets the directory. `src/content/` is a convention, not a requirement.
- A collection does not create pages. Add a route that queries it.
- Types are generated into `.astro/` by `astro sync`, which runs with `astro dev`, `astro build` and `astro check`. Run `npx astro sync` after changing the config if the editor shows stale types.

## Loaders

- `glob({ pattern, base })` loads one entry per file. The entry `id` is the slugified file path without extension. Override it per entry with a `slug` field in frontmatter, or for the collection with `generateId`.
- `file('path')` loads many entries from one JSON, YAML or TOML file. Each entry needs a unique `id`, either as an array of objects with `id` or an object keyed by id. Pass `parser` for other formats such as CSV.
- An inline loader is an async function that returns an array of objects with `id`:

```ts
const countries = defineCollection({
  loader: async () => {
    const response = await fetch('https://restcountries.com/v3.1/all');
    const data = await response.json();
    return data.map((country) => ({ id: country.cca3, ...country }));
  },
});
```

- A reusable loader is an object with `name` and `load({ store, parseData })`, typed with `Loader` from `astro/loaders`. Reference: `https://docs.astro.build/en/reference/content-loader-reference/`.

## Schemas

- Import `z` from `astro/zod`. It is Zod 4: use `z.email()` and `z.url()`, and `{ error: '...' }` for custom messages.
- Use `z.coerce.date()` for frontmatter dates.
- Reference another collection with `reference('authors')` from `astro:content`. The stored value is `{ collection, id }`; resolve it with `getEntry(post.data.author)` or `getEntries(post.data.relatedPosts)`.
- For images, use the schema function form so paths resolve relative to the entry file:

```ts
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      cover: image(),
    }),
});
```

The result can be passed straight to `<Image src={post.data.cover} alt="" />`.

## Querying and rendering

```astro
---
import { getCollection, getEntry, render } from 'astro:content';

const posts = await getCollection('blog', ({ data }) => data.draft !== true);
const about = await getEntry('pages', 'about');
if (!about) throw new Error('Missing about page');
const { Content, headings } = await render(about);
---
<Content />
```

- `render(entry)` is a function imported from `astro:content`. Entries have no `render()` method.
- The identifier is `entry.id`. There is no `entry.slug`. Use `entry.filePath` when the source file path is needed.
- `getEntry()` returns `undefined` when nothing matches; handle it.
- `getCollection()` returns entries in no guaranteed order. Sort them explicitly.
- `astro:content` cannot be imported in client code. Query on the server and pass data to islands as props.

## Generating routes

Prerendered (the default):

```astro
---
// src/pages/posts/[id].astro
import { getCollection, render } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map((post) => ({
    params: { id: post.id },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content } = await render(post);
---
<h1>{post.data.title}</h1>
<Content />
```

On demand:

```astro
---
// src/pages/posts/[id].astro
import { getEntry, render } from 'astro:content';

export const prerender = false;

const { id } = Astro.params;
const post = id ? await getEntry('blog', id) : undefined;
if (!post) {
  return Astro.rewrite('/404');
}
const { Content } = await render(post);
---
<Content />
```

- Ids from nested directories contain `/`. Use a rest parameter file name, `[...id].astro`, for them.
- `getStaticPaths()` params must be strings.

## Live collections

Live collections fetch data at request time instead of build time. Use them only when content must be fresh on every request; build-time collections are faster and need no adapter.

```ts
// src/live.config.ts
import { defineLiveCollection } from 'astro:content';
import { storeLoader } from '@mystore/astro-loader';

const products = defineLiveCollection({
  loader: storeLoader({
    apiKey: process.env.STORE_API_KEY,
    endpoint: 'https://api.mystore.com/v1',
  }),
});

export const collections = { products };
```

```astro
---
import { getLiveEntry } from 'astro:content';

export const prerender = false;

const { entry, error } = await getLiveEntry('products', Astro.params.id);
if (error || !entry) {
  return Astro.rewrite('/404');
}
---
<h1>{entry.data.name}</h1>
```

- The config file is `src/live.config.ts`. There are no built-in live loaders; a loader provides `loadCollection` and `loadEntry`.
- Pages that use live collections must render on demand, which needs an adapter.
- `getLiveCollection()` and `getLiveEntry()` return `{ entries | entry, error, cacheHint }`. They do not throw; check `error`.
- Pass `cacheHint` to `Astro.cache.set()` to cache the response when route caching is configured.
