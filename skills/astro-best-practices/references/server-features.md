# Server features

Read this for actions and forms, environment variables, sessions, and security settings.

## Contents

- [Actions](#actions)
- [Environment variables](#environment-variables)
- [Sessions](#sessions)
- [Security](#security)

## Actions

Actions are type-safe server functions with validated input. Use them for form submissions and mutations instead of hand-written API endpoints.

```ts
// src/actions/index.ts
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';

export const server = {
  likePost: defineAction({
    input: z.object({ postId: z.string() }),
    handler: async (input, ctx) => {
      if (!ctx.cookies.has('user-session')) {
        throw new ActionError({
          code: 'UNAUTHORIZED',
          message: 'User must be logged in.',
        });
      }
      return { likes: await addLike(input.postId) };
    },
  }),
};
```

- All actions are exported from the `server` object in `src/actions/index.ts`.
- Import `z` from `astro/zod`.
- **Every action is a public HTTP endpoint** (`/_actions/<name>`). Check authentication and authorization inside the handler, using `ctx.cookies`, `ctx.session` or `ctx.locals`. Middleware alone is not sufficient.
- Throw `ActionError` with a `code` for expected failures.

Calling from client code:

```ts
import { actions, isInputError } from 'astro:actions';

const { data, error } = await actions.likePost({ postId });
if (error) {
  if (isInputError(error)) console.log(error.fields.postId);
  return;
}
```

A call returns `{ data, error }`; check `error` before using `data`. `actions.likePost.orThrow(input)` returns the data and throws on error.

HTML form without client JavaScript:

```ts
createProduct: defineAction({
  accept: 'form',
  input: z.object({ name: z.string(), price: z.number() }),
  handler: async ({ name, price }) => ({ id: await saveProduct(name, price) }),
}),
```

```astro
---
import { actions } from 'astro:actions';

export const prerender = false;

const result = Astro.getActionResult(actions.createProduct);
if (result && !result.error) {
  return Astro.redirect('/products/' + result.data.id);
}
---
<form method="POST" action={actions.createProduct}>
  <input name="name" />
  <input name="price" type="number" />
  <button>Create</button>
</form>
```

- `accept: 'form'` parses `FormData`. Use `z.number()` for number inputs, `z.coerce.boolean()` for checkboxes and `z.instanceof(File)` for uploads (the form also needs `enctype="multipart/form-data"`). Empty inputs arrive as `null`.
- A page whose form posts to an action must render on demand.
- On the server, call an action with `Astro.callAction(actions.findProduct, { query })`.

Guide: `https://docs.astro.build/en/guides/actions/`.

## Environment variables

Prefer `astro:env` with a schema. It validates values, types them, and keeps secrets out of client bundles.

```js
// astro.config.mjs
import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  env: {
    schema: {
      API_URL: envField.string({ context: 'client', access: 'public', optional: true }),
      PORT: envField.number({ context: 'server', access: 'public', default: 4321 }),
      API_SECRET: envField.string({ context: 'server', access: 'secret' }),
    },
  },
});
```

```ts
import { API_URL } from 'astro:env/client';
import { API_SECRET, getSecret } from 'astro:env/server';
```

| Context and access | Import from | Notes |
| --- | --- | --- |
| client, public | `astro:env/client` | Inlined into client and server bundles |
| server, public | `astro:env/server` | Inlined into the server bundle |
| server, secret | `astro:env/server` | Not bundled; read at runtime |
| client, secret | Not allowed | |

- `astro:env/server` cannot be imported in client code.
- `astro:env` is not available inside `astro.config.mjs`. Use `process.env` there.
- Importing anything from `astro:env/server` validates every secret in the schema, so builds need all of them defined.

`import.meta.env`:

- Only variables prefixed `PUBLIC_` are available in client code.
- Values are inlined at build time and never coerced: `import.meta.env.FLAG === 'true'`, not a boolean test.
- A secret read through `import.meta.env` is baked into the server bundle at build time. For a value that must come from the runtime environment, use a secret `astro:env` field or `getSecret()`.
- On Cloudflare, runtime bindings and variables come from `import { env } from 'cloudflare:workers'`; `astro:env/server` also works.

Guide: `https://docs.astro.build/en/guides/environment-variables/`.

## Sessions

Sessions store per-visitor data on the server. They work on on-demand routes only.

```astro
---
export const prerender = false;

const cart = (await Astro.session?.get('cart')) ?? [];
---
<a href="/checkout">Cart ({cart.length})</a>
```

```ts
// src/pages/api/cart.ts
import type { APIContext } from 'astro';

export const prerender = false;

export async function POST(context: APIContext) {
  const cart = (await context.session?.get('cart')) ?? [];
  const data = await context.request.json();
  cart.push(data.item);
  context.session?.set('cart', cart);
  return Response.json(cart);
}
```

- `Astro.session` (or `context.session` in endpoints, middleware and actions) may be `undefined`; use optional chaining.
- `get()` is async and must be awaited. `set()`, `regenerate()` and `destroy()` return nothing.
- Call `session.regenerate()` after login to prevent session fixation, and `session.destroy()` on logout.
- The Node, Cloudflare and Netlify adapters configure a storage driver automatically. Other adapters, including Vercel, need one:

```js
import { defineConfig, sessionDrivers } from 'astro/config';

export default defineConfig({
  session: {
    driver: sessionDrivers.redis({ url: process.env.REDIS_URL }),
  },
});
```

- Type session data by declaring `App.SessionData` in `src/env.d.ts`.

Guide: `https://docs.astro.build/en/guides/sessions/`.

## Security

- `security.checkOrigin` is `true` by default. It rejects cross-origin form submissions to on-demand routes with a 403. Do not turn it off to fix a failing form; fix the origin of the request.
- Behind a reverse proxy, set `security.allowedDomains` so `Astro.url` only trusts expected forwarded hosts.
- Content Security Policy is built in:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  security: {
    csp: {
      directives: ["default-src 'self'", "img-src 'self' https://images.cdn.example.com"],
    },
  },
});
```

  Astro hashes its own scripts and styles. CSP is not active in `astro dev`; test with a build and preview. It does not support `<ClientRouter />` or Shiki-highlighted code.
- Never render untrusted HTML with `set:html` without sanitising it.
- Keep secrets in server-only code: component frontmatter, endpoints, actions and middleware. Anything passed as a prop to a `client:*` component is sent to the browser.
