// Until the old src/lib/markdown.ts is deleted (Task 8), `@/lib/markdown`
// resolves to that file, so import from `@/lib/markdown/index` or the modules.
export { parseMarkdown, safeHref, type MdNode } from './rules'
export { highlight, cachedHighlight, languageFor } from './highlight'
