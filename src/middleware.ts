import { i18n } from 'astro:config/server'
import { getRelativeLocaleUrl, middleware } from 'astro:i18n'
import { defineMiddleware, sequence } from 'astro:middleware'

const apiContextRoutesSymbol = Symbol.for('context.routes')

const extantPagesSet: Set<string> = new Set()
const missingPagesSet: Set<string> = new Set()

export const userMiddleware = defineMiddleware(async (ctx, next) => {
  if (ctx.locals.alyfish_middleware_nest) return await next()
  else ctx.locals.alyfish_middleware_nest = false

  if (i18n === undefined) {
    throw new Error('i18n not defined in locale handler middleware')
  }

  const locales = i18n.locales as string[]

  let ourLocale: string | undefined
  for (const locale of locales) {
    if (ctx.url.pathname.startsWith(`/${locale}/`)) {
      // we are a page with a locale and should generate a nav
      ourLocale = locale
    }
  }

  if (ourLocale) {
    ctx.locals.alyfish_here_locale = ourLocale
  } else {
    ctx.locals.alyfish_here_locale = undefined
  }

  let stripLocaleUrl: string
  if (!ourLocale) stripLocaleUrl = ctx.url.pathname
  else stripLocaleUrl = ctx.url.pathname.substring(2 + ourLocale.length)
  ctx.locals.alyfish_here_url_stripped = stripLocaleUrl

  ctx.locals.alyfish_here_alternates = []

  if (ctx.request.method === 'HEAD') return await next()

  // When we rewrite to another page, we don't want this middleware applying to it
  // All rendering operations happen independently, so we won't cache the result of rendering without this middleware
  ctx.locals.alyfish_middleware_nest = true
  for (const locale of locales) {
    if (locale === ourLocale) continue

    const relativeUrl = getRelativeLocaleUrl(locale, stripLocaleUrl)
    if (extantPagesSet.has(relativeUrl)) {
      ctx.locals.alyfish_here_alternates.push(locale)
      continue
    }
    if (missingPagesSet.has(relativeUrl)) continue

    let exists = false
    try {
      if (ctx.isPrerendered) {
        // biome-ignore lint/suspicious/noExplicitAny: I don't believe I have access to Pipeline type
        const pipeline: any = Reflect.get(ctx, apiContextRoutesSymbol)
        const { routeData } = await pipeline.tryRewrite(
          relativeUrl,
          ctx.request,
        )
        if (routeData.prerender) exists = true
      } else {
        const result = await fetch(new URL(relativeUrl, ctx.url), {
          method: 'HEAD',
        })
        if (result.ok) exists = true
      }
    } catch (_e) {
      // ignore
    }
    if (exists) {
      extantPagesSet.add(relativeUrl)
      ctx.locals.alyfish_here_alternates.push(locale)
    } else {
      missingPagesSet.add(relativeUrl)
    }
  }
  ctx.locals.alyfish_middleware_nest = false

  // Then if we're a pre-rendered page, we don't want to reply with a redirect
  if (ctx.isPrerendered) return await next()

  if (ctx.preferredLocaleList) {
    for (const preferredLocale of ctx.preferredLocaleList) {
      if (ctx.locals.alyfish_here_alternates.includes(preferredLocale)) {
        return ctx.redirect(
          getRelativeLocaleUrl(preferredLocale, stripLocaleUrl),
          302,
        )
      }
    }
  }

  if (ctx.locals.alyfish_here_alternates.includes(i18n.defaultLocale)) {
    return ctx.redirect(
      getRelativeLocaleUrl(i18n.defaultLocale, stripLocaleUrl),
      302,
    )
  }

  return await next()
})

export const onRequest = sequence(
  userMiddleware,
  middleware({
    redirectToDefaultLocale: false,
    prefixDefaultLocale: true,
    fallbackType: 'redirect',
  }),
)
