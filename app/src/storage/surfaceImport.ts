import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { isTauriRuntime } from './tauri'

// Importing a screen surface from disk:
//  - Preview  → a single image, stored as a data URL.
//  - Live     → a folder containing index.html, inlined (CSS/JS/images turned
//               into data URLs) into one self-contained HTML string so it can
//               render inside the sandboxed srcDoc iframe (no same-origin, so
//               data URLs are the only assets that work).

const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
}

export type Asset = { mime: string; bytes: Uint8Array; b64?: string }

/** A picked surface = a map of relative path → file, with index.html inside. */
export type SurfaceBundle = Map<string, Asset>

export function mimeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

const dataUrlOf = (a: Asset): string => `data:${a.mime};base64,${a.b64 ?? bytesToBase64(a.bytes)}`
export const textOf = (a: Asset): string => new TextDecoder().decode(a.bytes)

/** Text-ish mimes are written to disk as UTF-8; everything else as base64. */
export const isTextAsset = (a: Asset): boolean =>
  /^(text\/|application\/(json|javascript|xml)|image\/svg)/.test(a.mime)

export function normalizePath(p: string): string {
  const parts: string[] = []
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

function dirOf(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

const isExternalRef = (ref: string): boolean =>
  /^(data:|https?:|blob:|\/\/|#|mailto:|tel:|about:)/i.test(ref)

/** Resolve an href/src/url() reference (relative to baseDir) to an asset. */
function resolveAsset(ref: string, baseDir: string, assets: Map<string, Asset>): Asset | undefined {
  const clean = ref.trim().split(/[?#]/)[0]
  if (!clean || isExternalRef(clean)) return undefined
  const key = clean.startsWith('/')
    ? normalizePath(clean.slice(1))
    : normalizePath(baseDir ? `${baseDir}/${clean}` : clean)
  return assets.get(key)
}

/** Rewrite url(...) references inside a CSS string to data URLs. */
function inlineCss(css: string, baseDir: string, assets: Map<string, Asset>): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, _q, ref) => {
    const asset = resolveAsset(ref, baseDir, assets)
    return asset ? `url(${dataUrlOf(asset)})` : match
  })
}

function findIndexKey(keys: string[]): string | null {
  const byDepth = (a: string, b: string) => a.split('/').length - b.split('/').length
  const indexes = keys.filter((k) => /(^|\/)index\.html?$/i.test(k)).sort(byDepth)
  if (indexes.length) return indexes[0]
  const htmls = keys.filter((k) => /\.html?$/i.test(k)).sort(byDepth)
  return htmls[0] ?? null
}

/** Turn a folder's files into one self-contained HTML string (or null). */
export function inlineHtmlFolder(assets: Map<string, Asset>): string | null {
  const indexKey = findIndexKey([...assets.keys()])
  if (!indexKey) return null
  const baseDir = dirOf(indexKey)
  const html = textOf(assets.get(indexKey)!)
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // <link rel="stylesheet"> → <style> (with url() resolved against the CSS dir)
  doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach((link) => {
    const href = link.getAttribute('href') ?? ''
    const asset = resolveAsset(href, baseDir, assets)
    if (!asset) return
    const cssDir = dirOf(normalizePath(href.startsWith('/') ? href.slice(1) : `${baseDir}/${href}`))
    const style = doc.createElement('style')
    style.textContent = inlineCss(textOf(asset), cssDir, assets)
    link.replaceWith(style)
  })

  // <script src> → inline <script>
  doc.querySelectorAll('script[src]').forEach((script) => {
    const asset = resolveAsset(script.getAttribute('src') ?? '', baseDir, assets)
    if (!asset) return
    const inline = doc.createElement('script')
    const type = script.getAttribute('type')
    if (type) inline.setAttribute('type', type)
    inline.textContent = textOf(asset)
    script.replaceWith(inline)
  })

  // Remaining src/href attributes (img, source, video, audio, favicon…) → data URL
  doc.querySelectorAll('[src]').forEach((el) => {
    const asset = resolveAsset(el.getAttribute('src') ?? '', baseDir, assets)
    if (asset) el.setAttribute('src', dataUrlOf(asset))
  })
  doc.querySelectorAll('link[href]').forEach((el) => {
    const asset = resolveAsset(el.getAttribute('href') ?? '', baseDir, assets)
    if (asset) el.setAttribute('href', dataUrlOf(asset))
  })

  // Inline <style> blocks: resolve their url() against the index.html dir.
  doc.querySelectorAll('style').forEach((style) => {
    style.textContent = inlineCss(style.textContent ?? '', baseDir, assets)
  })

  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
}

/** Open a native/browser file input and resolve the chosen files. */
function openFileInput(opts: { accept?: string; directory?: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (opts.accept) input.accept = opts.accept
    if (opts.directory) {
      input.multiple = true
      ;(input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true
    }
    input.style.display = 'none'
    document.body.appendChild(input)
    const finish = (files: File[]) => {
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => finish(input.files ? Array.from(input.files) : []), {
      once: true,
    })
    // Resolve (empty) when the picker is dismissed so callers never hang.
    input.addEventListener('cancel', () => finish([]), { once: true })
    input.click()
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Preview surface — pick an image, return it as a data URL. */
export async function pickPreviewImage(): Promise<string | null> {
  const [file] = await openFileInput({ accept: 'image/png,image/*' })
  if (!file) return null
  return fileToDataUrl(file)
}

/** Strip the chosen folder's own name (web `webkitRelativePath` prefixes it) so
    bundle keys are relative to the folder root: "myapp/index.html" → "index.html". */
function stripRootSegment(rel: string): string {
  const i = rel.indexOf('/')
  return i === -1 ? rel : rel.slice(i + 1)
}

/** Pick a folder (with index.html + assets) → bundle of relpath → file. */
export async function pickFolderBundle(): Promise<SurfaceBundle | null> {
  const bundle: SurfaceBundle = new Map()
  if (isTauriRuntime()) {
    const dir = await open({ directory: true, multiple: false })
    if (typeof dir !== 'string') return null
    const files = await invoke<{ path: string; base64: string }[]>('read_dir_files', { dir })
    for (const f of files) {
      const key = normalizePath(f.path)
      bundle.set(key, { mime: mimeOf(key), bytes: base64ToBytes(f.base64), b64: f.base64 })
    }
  } else {
    const files = await openFileInput({ directory: true })
    if (!files.length) return null
    for (const file of files) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      const key = normalizePath(stripRootSegment(rel))
      bundle.set(key, { mime: file.type || mimeOf(key), bytes: new Uint8Array(await file.arrayBuffer()) })
    }
  }
  return bundle.size ? bundle : null
}

/** Pick a single .html file → a one-entry bundle keyed "index.html". */
export async function pickHtmlFileBundle(): Promise<SurfaceBundle | null> {
  const [file] = await openFileInput({ accept: 'text/html,.html,.htm' })
  if (!file) return null
  const bundle: SurfaceBundle = new Map()
  bundle.set('index.html', { mime: 'text/html', bytes: new Uint8Array(await file.arrayBuffer()) })
  return bundle
}
