declare module 'webring:data' {
  import type { ImageMetadata } from 'astro'
  export type WebringDataImage = {
    localPath: ImageMetadata
    site: URL
    vibrantColorRgb: [number, number, number]
  }
  const data: WebringDataImage[]
  export default data
}
