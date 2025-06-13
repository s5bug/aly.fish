import { defineMiddleware, sequence } from "astro:middleware";
import {getRelativeLocaleUrl, getAbsoluteLocaleUrl, redirectToDefaultLocale, middleware} from 'astro:i18n';
import {i18n} from 'astro:config/server';

const apiContextRoutesSymbol = Symbol.for('context.routes');

export const userMiddleware = defineMiddleware(async (ctx, next) => {
  if(ctx.locals.alyfish_middleware_nest) return next();
  else ctx.locals.alyfish_middleware_nest = false;

  const locales = i18n!.locales as string[]

  let ourLocale: string | undefined;
  for (const locale of locales) {
    if (ctx.url.pathname.startsWith("/" + locale + "/")) {
      // we are a page with a locale and should generate a nav
      ourLocale = locale;
    }
  }

  if(ourLocale) {
    ctx.locals.alyfish_here_locale = ourLocale
  } else {
    ctx.locals.alyfish_here_locale = undefined
  }

  let stripLocaleUrl: string;
  if(!ourLocale) stripLocaleUrl = ctx.url.pathname;
  else stripLocaleUrl = ctx.url.pathname.substring(2 + ourLocale.length);
  ctx.locals.alyfish_here_url_stripped = stripLocaleUrl;

  ctx.locals.alyfish_here_alternates = []

  // When we rewrite to another page, we don't want this middleware applying to it
  // All rendering operations happen independently, so we won't cache the result of rendering without this middleware
  ctx.locals.alyfish_middleware_nest = true;
  for(const locale of locales) {
    if(locale === ourLocale) continue;
    let exists = false;
    try {
      const relativeUrl = getRelativeLocaleUrl(locale, stripLocaleUrl);
      // Introducing `any` here because I don't believe I have access to Pipeline type
      const pipeline: any = Reflect.get(ctx, apiContextRoutesSymbol);
      const {routeData} = await pipeline.tryRewrite(
        relativeUrl,
        ctx.request,
      );
      if (routeData.prerender) exists = true;
    } catch (e) {
      // ignore
    }
    if(exists) {
      ctx.locals.alyfish_here_alternates.push(locale)
    }
  }
  ctx.locals.alyfish_middleware_nest = false;

  // Then if we're a pre-rendered page, we don't want to reply with a redirect
  if(ctx.isPrerendered) return await next();

  if(ctx.preferredLocaleList) {
    for(const preferredLocale of ctx.preferredLocaleList) {
      if(ctx.locals.alyfish_here_alternates.includes(preferredLocale)) {
        return ctx.redirect(getRelativeLocaleUrl(preferredLocale, stripLocaleUrl), 302)
      }
    }
  }

  if(ctx.locals.alyfish_here_alternates.includes(i18n!.defaultLocale)) {
    return ctx.redirect(getRelativeLocaleUrl(i18n!.defaultLocale, stripLocaleUrl), 302)
  }

  return await next();
})

export const onRequest = sequence(
  userMiddleware,
  middleware({
    redirectToDefaultLocale: false,
    prefixDefaultLocale: true,
    fallbackType: "redirect"
  })
)
