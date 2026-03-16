import { i18n } from 'astro:config/server'
import { getRelativeLocaleUrl } from 'astro:i18n'
import { env } from 'cloudflare:workers'
import type { APIRoute } from 'astro'

export const prerender = false

export const _GET: APIRoute = async (ctx) => {
  if (ctx.isPrerendered) throw new Error("this route shouldn't be prerendered")

  if (i18n === undefined) {
    throw new Error('i18n not defined in locale handler middleware')
  }

  const locales = i18n.locales as string[]
  const hereAlternates: string[] = []

  const stripLocaleUrl: string = ctx.url.pathname

  for (const locale of locales) {
    const relativeUrl = getRelativeLocaleUrl(locale, stripLocaleUrl)

    let exists = false
    try {
      const result = await env.ASSETS.fetch(new URL(relativeUrl, ctx.url), {
        method: 'HEAD',
      })
      if (result.ok) exists = true
    } catch (_e) {
      // ignore
    }
    if (exists) {
      hereAlternates.push(locale)
    }
  }

  if (ctx.preferredLocaleList) {
    for (const preferredLocale of ctx.preferredLocaleList) {
      if (hereAlternates.includes(preferredLocale)) {
        return ctx.redirect(
          getRelativeLocaleUrl(preferredLocale, stripLocaleUrl),
          302,
        )
      }
    }
  }

  if (hereAlternates.includes(i18n.defaultLocale)) {
    return ctx.redirect(
      getRelativeLocaleUrl(i18n.defaultLocale, stripLocaleUrl),
      302,
    )
  }

  // const tryFetchDefault = await env.ASSETS.fetch(
  //   new URL(getRelativeLocaleUrl('en', stripLocaleUrl), ctx.url),
  //   { method: 'HEAD' },
  // )
  //
  // const debugInfo = {
  //   locales,
  //   enRelUrl: getRelativeLocaleUrl('en', stripLocaleUrl),
  //   wholeRelUrl: new URL(
  //     getRelativeLocaleUrl('en', stripLocaleUrl),
  //     ctx.url,
  //   ).toString(),
  //   hereAlternates,
  //   preferred: ctx.preferredLocaleList,
  //   defaultLocale: i18n.defaultLocale,
  //   enStatus: tryFetchDefault.status,
  //   enOk: tryFetchDefault.ok,
  //   enUrl: tryFetchDefault.url,
  // }
  // JSON.stringify(debugInfo, undefined, 2)

  return new Response(null, {
    status: 404,
    statusText: 'Not found',
  })
}
