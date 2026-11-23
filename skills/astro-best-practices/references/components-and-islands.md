# Components and islands

Read this when writing `.astro` components, hydrating framework components, adding server islands, client scripts, styles or view transitions.

## Contents

- [Astro components](#astro-components)
- [Client islands](#client-islands)
- [Server islands](#server-islands)
- [Client scripts](#client-scripts)
- [Styles](#styles)
- [View transitions](#view-transitions)

## Astro components

- Frontmatter (between the `---` fences) runs on the server only, at build time or per request. There is no `window` or `document` there. Browser code goes in a `<script>` tag.
- Astro components never hydrate. They render HTML and ship no JavaScript of their own.
- Type props with `interface Props` in the frontmatter and read them from `Astro.props`.
- Imports need the file extension for `.astro`, `.md`, `.vue` and `.svelte` files.
- Write one `<head>` in a layout. A `<head>` inside a component is not merged or hoisted.
- Write valid HTML. Every non-void element needs a closing tag, and invalid nesting is not repaired.
- Whitespace between inline elements on separate lines is removed. Add `{" "}` where a space is needed.
- `class` is not forwarded to a child component automatically. Accept it and spread the rest so scoped styles from the parent apply:

```astro
---
const { class: className, ...rest } = Astro.props;
---
<div class={className} {...rest}>
  <slot />
</div>
```

## Client islands

A framework component (React, Preact, Svelte, Vue, Solid) renders to static HTML with no JavaScript unless it has a `client:*` directive. "My component is not interactive" almost always means the directive is missing.

| Directive | Hydrates | Use for |
| --- | --- | --- |
| `client:load` | Immediately on page load | UI that must work at once, such as a header menu |
| `client:idle` | When the browser is idle | Lower-priority UI. `client:idle={{ timeout: 500 }}` sets a deadline |
| `client:visible` | When scrolled into view | Below-the-fold UI. `client:visible={{ rootMargin: '200px' }}` starts earlier |
| `client:media="(max-width: 50em)"` | When the media query matches | UI that only exists at some screen sizes |
| `client:only="react"` | On the client only, with no server render | Components that cannot render on the server. The framework name is required |

```astro
<InteractiveButton client:load />
<InteractiveCounter client:visible />

<ClientComponent client:only="vue">
  <div slot="fallback">Loading</div>
</ClientComponent>
```

Rules:

- Choose the latest directive that works. Prefer `client:visible` or `client:idle` to `client:load`.
- Hydrate the smallest component that needs it, not a whole page or layout wrapped in one framework component.
- A directive only works on a framework component imported directly into a `.astro` file. It does not work on an Astro component, a dynamic tag, or a component passed through the MDX `components` prop.
- Props must be serializable: plain objects, arrays, strings, numbers, `Date`, `Map`, `Set`, `URL`, `RegExp`, `BigInt` and typed arrays. Functions cannot be passed, so event handlers and render props defined in `.astro` do not work. Pass data, and define handlers inside the framework component.
- Pass Astro content to a framework component as children or named slots. A framework component cannot import a `.astro` component.
- Islands do not share framework context. Share state between islands with a store such as Nano Stores; see `https://docs.astro.build/en/recipes/sharing-state-islands/`.

## Server islands

`server:defer` on an Astro component renders it on demand, separately from the page, so the rest of the page can be static or cached.

```astro
---
import Avatar from '../components/Avatar.astro';
import GenericAvatar from '../components/GenericAvatar.astro';
---
<Avatar server:defer>
  <GenericAvatar slot="fallback" />
</Avatar>
```

- An adapter is required, even when the page itself is prerendered.
- The `slot="fallback"` content renders with the page and is replaced when the island arrives.
- Props must be serializable. They are encrypted into the island request URL, so pass small values such as ids, not large objects; a long URL turns the request into a `POST` that browsers do not cache.
- Inside the island, `Astro.url` is the island's own URL, not the page URL. Read the page URL from the `Referer` request header.
- The encryption key is generated per build. For rolling deploys or multiple regions, run `astro create-key` and set `ASTRO_KEY` in the build environment.

## Client scripts

A `<script>` in a `.astro` file is processed (TypeScript, bundled imports, deduplicated to run once per page) only when it has no attributes other than `src`.

```astro
<button data-message="Hello">Greet</button>

<script>
  import { greet } from '../scripts/greet';

  document.querySelectorAll('button[data-message]').forEach((button) => {
    button.addEventListener('click', () => greet(button.dataset.message));
  });
</script>
```

- Any other attribute makes the script inline: no TypeScript, no import resolution, and one copy per component instance. `is:inline` and `define:vars` both do this. To use `import` in such a script, add `type="module"`.
- Pass server values to a script with `data-*` attributes read through `dataset`, not `define:vars`.
- Reference a script in `src/` with `<script src="../scripts/local.js">`. A script in `public/` or on a CDN needs `<script is:inline src="/my-script.js">`.
- Scripts render where they are written. They are not hoisted to `<head>`.
- A processed script runs once per page even if the component is used many times. For per-instance behaviour, use a custom element; its `connectedCallback` runs for each instance.

## Styles

- `<style>` in a `.astro` file is scoped to that component. It does not reach child components or slotted content. Use `:global(...)` inside the scoped block for a targeted exception, or `<style is:global>`.
- `class:list={['a', { b: isActive }]}` builds class strings.
- `<style define:vars={{ textColor }}>` exposes server values as CSS custom properties (`var(--textColor)`).
- Tailwind: run `npx astro add tailwind`. It sets up Tailwind 4 with `@tailwindcss/vite`; add `@import "tailwindcss";` to a global stylesheet and import that stylesheet in a layout. `@astrojs/tailwind` is for Tailwind 3 only.
- A component's styles are bundled as soon as it is imported, even when it is conditionally not rendered.

## View transitions

Add client-side navigation by putting `<ClientRouter />` in the shared `<head>`:

```astro
---
import { ClientRouter } from 'astro:transitions';
---
<head>
  <ClientRouter />
</head>
```

With the client router, bundled scripts run once and are not re-executed on navigation. Put per-page setup in the `astro:page-load` event:

```js
document.addEventListener('astro:page-load', () => {
  document.querySelector('.hamburger').addEventListener('click', () => {
    document.querySelector('.nav-links').classList.toggle('expanded');
  });
});
```

- Use `astro:after-swap` for work that must happen before paint, such as restoring a theme.
- Add `data-astro-rerun` to an inline script that must run on every navigation.
- Use `transition:name` to pair elements across pages and `transition:persist` to keep an island's state.
- Lifecycle event names are plain strings (`'astro:before-preparation'`, `'astro:after-swap'`). The `TRANSITION_*` constants were removed.
- `security.csp` does not support `<ClientRouter />`.

Guide: `https://docs.astro.build/en/guides/view-transitions/`.
