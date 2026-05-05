import { type GetLocaleOptions, getRelativeLocaleUrl as grlu } from 'astro:i18n'

export function getRelativeLocaleUrl(
  locale: string,
  path?: string,
  options?: GetLocaleOptions,
): string {
  if (path === undefined) return grlu(locale, path, options)
  else {
    const pathHasSlash = path.endsWith('/')
    if (pathHasSlash) {
      // remove the slash so Astro's version adds it back
      return grlu(locale, path.substring(0, path.length - 1), options)
    } else {
      const withSlash = grlu(locale, path, options)
      // remove the slash that Astro adds
      return withSlash.substring(0, withSlash.length - 1)
    }
  }
}
