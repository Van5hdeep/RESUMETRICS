import assert from 'node:assert/strict'
import { safeImageSrc, safeLinkUrl } from '../src/utils/safeUrl.js'

// Links: only http(s).
assert.equal(safeLinkUrl('https://github.com/owner/repo'), 'https://github.com/owner/repo')
assert.equal(safeLinkUrl('  http://example.com/a?b=c  '), 'http://example.com/a?b=c')
for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', '//evil.example', '/relative', 'https://', 'https://a b', '', null, undefined, 42, {}]) {
  assert.equal(safeLinkUrl(bad), undefined, `link should be refused: ${String(bad)}`)
}

// Images: http(s), this site's own paths, blob: previews and raster data URLs.
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
for (const good of [png, 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', 'data:image/webp;base64,UklGRg==', 'https://avatars.githubusercontent.com/u/1?v=4', '/assets/sample-resume-portrait-DncNr4UG.jpg', '/src/assets/sample-resume-portrait.jpg', 'blob:http://localhost:5173/6f1c2f0e-1a2b-4c3d-9e8f-001122334455']) {
  assert.equal(safeImageSrc(good), good, `image should be allowed: ${good.slice(0, 40)}`)
}
for (const bad of ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/png;base64,<script>', '//evil.example/x.png', '', null, undefined, ['x']]) {
  assert.equal(safeImageSrc(bad), undefined, `image should be refused: ${String(bad)}`)
}

console.log('safeUrl: all checks passed')
