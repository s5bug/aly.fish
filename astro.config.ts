import * as fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import cloudflare from '@astrojs/cloudflare'
import type { AstroIntegration } from 'astro'
import { defineConfig } from 'astro/config'
import compress from 'astro-compress'
import htmlMinifierNext from 'astro-html-minifier-next'
import browserslist from 'browserslist'
import { browserslistToTargets } from 'lightningcss'
import { Vibrant } from 'node-vibrant/node'
import sharp from 'sharp'

const lightningCssOptions = {
  minify: true,
  errorRecovery: false,
  targets: browserslistToTargets(browserslist('defaults')),
}

const locales: ['en', 'ja'] = ['en', 'ja']

interface WebringJson {
  '88x31': string
  site: string
}

interface DownloadedWebringImage {
  localPath: URL
  site: URL
  vibrantColorRgb: [number, number, number]
}

const generateWebringData = (downloadedImages: DownloadedWebringImage[]) => {
  let imports = ''

  let exportArray = '['

  for (let i = 0; i < downloadedImages.length; i++) {
    const thisx = downloadedImages[i]
    imports += `import img${i} from '${thisx.localPath.toString()}'\n`

    const obj = `{localPath: img${i}, site: new URL("${thisx.site.toString()}"), vibrantColorRgb: [${thisx.vibrantColorRgb[0]}, ${thisx.vibrantColorRgb[1]}, ${thisx.vibrantColorRgb[2]}]}`
    exportArray += obj
    exportArray += ','
  }

  exportArray = exportArray.slice(0, exportArray.length - 1)
  exportArray += ']'

  return `${imports}\n\nexport default ${exportArray}`
}

const downloadWebringData = async (codegenDir: URL, entry: WebringJson) => {
  const site = new URL(entry.site)
  const imgUrl = new URL(entry['88x31'])
  const siteId = site.host.replaceAll(/[^a-z0-9]/g, '')
  const imgPathname = imgUrl.pathname
  const imgExt = imgPathname.substring(imgPathname.lastIndexOf('.'))
  const outUrl = new URL(`webring-${siteId}${imgExt}`, codegenDir)

  let imgData: Buffer<ArrayBuffer>
  try {
    imgData = await fs.readFile(outUrl)
  } catch {
    const imgResp = await fetch(imgUrl)
    imgData = Buffer.from(await imgResp.arrayBuffer())
    await fs.writeFile(outUrl, imgData)
  }
  const sharpInstance = sharp(imgData)
  const sharpFormat = (await sharpInstance.metadata()).format

  let vibrant: Vibrant
  if (sharpFormat === 'gif' || sharpFormat === 'png' || sharpFormat === 'jpg') {
    vibrant = new Vibrant(imgData)
  } else {
    const convert = await sharpInstance.toFormat('png').toBuffer()
    vibrant = new Vibrant(convert)
  }
  const palette = await vibrant.getPalette()

  if (sharpFormat === 'gif') {
    // convert .gifs to lossless .webp
    const webpUrl = new URL(`webring-${siteId}.webp`, codegenDir)

    try {
      await fs.access(webpUrl)
    } catch {
      const animatedSharp = sharp(imgData, { animated: true })
      const webpResult = animatedSharp.toFormat('webp', {
        lossless: true,
        quality: 100,
        effort: 6,
      })
      await webpResult.toFile(fileURLToPath(webpUrl))
    }

    return {
      localPath: webpUrl,
      site,
      // biome-ignore lint/style/noNonNullAssertion: we know the palette generation will succeed here
      vibrantColorRgb: palette.Vibrant!.rgb,
    } satisfies DownloadedWebringImage
  } else {
    return {
      localPath: outUrl,
      site,
      // biome-ignore lint/style/noNonNullAssertion: we know the palette generation will succeed here
      vibrantColorRgb: palette.Vibrant!.rgb,
    } satisfies DownloadedWebringImage
  }
}

const webringFileFilter = (file: string) => {
  return /\/_astro\/webring-[^/]+$/.test(file)
}

const calculateWebringData: AstroIntegration = {
  name: 'calculate-webring-data',
  hooks: {
    'astro:config:setup': async (setupOptions) => {
      const webringPath = new URL('./src/webring.json', import.meta.url)
      setupOptions.addWatchFile(webringPath)

      const codegenDir = setupOptions.createCodegenDir()
      const webringTxt = (await fs.readFile(webringPath)).toString()

      // if the webring file hasn't been updated since the cached module, skip all the work
      const webringTxtHashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(webringTxt),
      )
      const webringTxtHashHex = Array.from(new Uint8Array(webringTxtHashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const moduleCacheFile = new URL(
        `module-${webringTxtHashHex}.js`,
        codegenDir,
      )

      let webringModule: string
      try {
        webringModule = (await fs.readFile(moduleCacheFile)).toString()
      } catch {
        const webringData = JSON.parse(webringTxt) as WebringJson[]

        const downloads: DownloadedWebringImage[] = await Promise.all(
          webringData.map((e) => downloadWebringData(codegenDir, e)),
        )

        webringModule = generateWebringData(downloads)

        await fs.writeFile(moduleCacheFile, webringModule)
      }

      setupOptions.updateConfig({
        vite: {
          plugins: [
            {
              name: 'vite-plugin-webring-virtuals',
              resolveId(id) {
                if (id === 'webring:data') return '\0webring:data'
              },
              load(id) {
                if (id === '\0webring:data') {
                  return webringModule
                }
              },
            },
          ],
        },
      })
    },
  },
}

const generateCloudflareRoutes: AstroIntegration = {
  name: 'generate-cloudflare-routes',
  hooks: {
    'astro:build:done': async (result) => {
      const noLocalePages: Set<string> = new Set()
      for (const page of result.pages) {
        for (const locale of locales) {
          if (page.pathname.startsWith(locale)) {
            const pageUrl = page.pathname.slice(locale.length)
            noLocalePages.add(pageUrl)
          }
        }
      }

      const runWorkerFirst = [...noLocalePages]

      const wranglerJsonPath = new URL('../server/wrangler.json', result.dir)
      const existingWranglerText = (
        await fs.readFile(wranglerJsonPath)
      ).toString()
      const existingWrangler = JSON.parse(existingWranglerText)
      // biome-ignore lint/complexity/useLiteralKeys: it's not camelCase lol
      existingWrangler.assets['run_worker_first'] = runWorkerFirst
      const newWrangler = JSON.stringify(existingWrangler)
      await fs.writeFile(wranglerJsonPath, newWrangler)
    },
  },
}

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    // we handle this with compress()
    imageService: 'passthrough',
    prerenderEnvironment: 'node',
  }),

  i18n: {
    locales,
    defaultLocale: 'en',
    routing: 'manual',
  },

  site: 'https://aly.fish',

  compressHTML: false,
  vite: {
    build: {
      cssMinify: 'lightningcss',
    },
    css: {
      lightningcss: lightningCssOptions,
    },
  },
  integrations: [
    calculateWebringData,
    htmlMinifierNext({
      alwaysWriteMinifiedHTML: true,
      caseSensitive: true,
      collapseBooleanAttributes: true,
      collapseInlineTagWhitespace: false,
      collapseWhitespace: true,
      conservativeCollapse: false,
      continueOnParseError: false,
      decodeEntities: true,
      includeAutoGeneratedTags: true,
      keepClosingSlash: false,
      minifyCSS: lightningCssOptions,
      minifyJS: true,
      minifyURLs: false,
      noNewlinesBeforeTagClose: false,
      preserveLineBreaks: false,
      preventAttributesEscaping: false,
      processConditionalComments: false,
      removeAttributeQuotes: false,
      removeComments: true,
      removeEmptyAttributes: true,
      removeEmptyElements: false,
      removeOptionalTags: false,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      removeTagWhitespace: false,
      sortAttributes: false,
      sortClassNames: false,
      useShortDoctype: true,
    }),
    compress({
      HTML: false,
      CSS: {
        csso: false,
        lightningcss: lightningCssOptions,
      },
      Exclude: ['88x31.svg', webringFileFilter],
    }),
    generateCloudflareRoutes,
  ],
})
