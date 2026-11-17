// Response headers for every API answer. The web pages get the same protections from vercel.json (hosting) and
// from Vite's dev server. API answers are JSON, so the policy can forbid everything a page would need.
export function securityHeaders(_request, response, next) {
  response.set({
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
  })
  if (_request.secure) response.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
}
