import { Router } from 'express'
import { env, GitHubConfigurationError } from '../config/env.js'
import { SecretConfigurationError } from '../config/secrets.js'
import { requireFirebaseUser, FirebaseServerConfigurationError } from '../services/firebaseAdmin.js'
import { getGitHubAuthorizationIdentity, getGitHubInstallationUrl, getGitHubUserAuthorizationUrl, getInstallationProfile, getUserRepositories } from '../services/githubApp.js'
import { getGitHubConnection, removeGitHubConnection, saveGitHubConnection } from '../services/githubConnectionStore.js'
import { scanGitHubEvidence } from '../github/githubScan.js'
import { persistScanResult } from '../github/persistScan.js'
import { evidenceStore } from '../db/evidenceStore.js'
import { RESUME_ID } from '../db/resumeStore.js'
import { startNdjson } from '../ai/ndjson.js'
import { createGitHubConnectionState, githubConnectionStateTtlMs, verifyGitHubConnectionState } from '../services/githubState.js'
import { BRAND } from '../../shared/brand.js'

// Connecting GitHub always ends with a GitHub user sign-in (a one-time OAuth code). The code proves which App
// installations that GitHub user can reach, and only one of those is ever linked to the Resumetrics account.
// An installation id on its own (from a URL) is never trusted: anyone can type one.

function publicConfigurationMessage() {
  return 'GitHub connection is not configured on the server yet. Add the required GitHub and Firebase Admin values to server/.env.local.'
}

function isConfigurationError(error) {
  return error instanceof GitHubConfigurationError || error instanceof FirebaseServerConfigurationError || error instanceof SecretConfigurationError
}

function isFirestoreUnavailable(error) {
  const message = String(error?.message ?? '')
  return Number(error?.code) === 7 && /cloud firestore api|firestore.*(?:disabled|not been used)/i.test(message)
}

function isMissingGitHubInstallation(error) {
  return Number(error?.status) === 404
}

function publicPersistenceMessage() {
  return 'GitHub could not be saved because Cloud Firestore is not enabled for this app yet. Create a Cloud Firestore database in Firebase Console, then try again.'
}

/** A problem the person can act on; its message is safe to show. Everything else gets a generic message. */
export class GitHubConnectionChoiceError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GitHubConnectionChoiceError'
  }
}

export const connectionStateCookie = 'resumetrics_github_connection_state'

function readCookie(request, name) {
  const header = request.get('cookie') ?? ''
  const cookie = header.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))
  if (!cookie) return ''
  try {
    return decodeURIComponent(cookie.slice(name.length + 1))
  } catch {
    return ''
  }
}

function storeConnectionStateCookie(response, state) {
  response.cookie(connectionStateCookie, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.github.frontendUrl.startsWith('https://'),
    maxAge: githubConnectionStateTtlMs,
    path: '/'
  })
}

function clearConnectionStateCookie(response) {
  response.clearCookie(connectionStateCookie, { path: '/' })
}

function redirectToWorkspace(response, outcome, parameters = {}) {
  try {
    const url = new URL('/workspace', env.github.frontendUrl)
    url.searchParams.set('github', outcome)
    Object.entries(parameters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    })
    return response.redirect(302, url.toString())
  } catch {
    return response.status(500).send(`GitHub connection could not return to ${BRAND.name}. Check FRONTEND_URL in server/.env.local.`)
  }
}

/** The installation to link: one the authorized GitHub user can reach, preferring the one GitHub just reported. */
export function selectAuthorizedInstallation(installationId, authorizationIdentity) {
  const accessibleInstallationIds = authorizationIdentity.installationIds ?? []
  if (typeof installationId === 'string' && /^\d+$/.test(installationId)) {
    if (!accessibleInstallationIds.includes(installationId)) {
      throw new GitHubConnectionChoiceError('Your GitHub account cannot access that installation. Install our GitHub App on your own account, then connect again.')
    }
    return installationId
  }
  if (accessibleInstallationIds.length === 1) return accessibleInstallationIds[0]
  if (!accessibleInstallationIds.length) throw new GitHubConnectionChoiceError('No installation of our GitHub App was found for your GitHub account. Install the App, then try again.')
  throw new GitHubConnectionChoiceError('More than one GitHub App installation is available. Choose one installation in GitHub, then try connecting again.')
}

const defaultGitHub = { getGitHubAuthorizationIdentity, getGitHubInstallationUrl, getGitHubUserAuthorizationUrl, getInstallationProfile, getUserRepositories, scanGitHubEvidence }
const defaultConnections = { get: getGitHubConnection, save: saveGitHubConnection, remove: removeGitHubConnection }
const defaultState = { create: createGitHubConnectionState, verify: verifyGitHubConnectionState }

/**
 * createGitHubRouter({ authenticate, aiGuard, github, connections, state, evidence }). Every dependency is swappable for
 * tests. aiGuard: middleware run before the evidence scan (it calls the AI model), e.g. per-user limits and the daily
 * token allowance; it runs after `authenticate`, so request.firebaseUser is set.
 */
export function createGitHubRouter({ authenticate = requireFirebaseUser, aiGuard = [], github = defaultGitHub, connections = defaultConnections, state = defaultState, evidence = evidenceStore } = {}) {
  const router = Router()

  /** The signed state from the request, accepted only when it matches the HTTP-only cookie set for this browser. */
  function pendingFrom(request, givenState) {
    const cookieState = readCookie(request, connectionStateCookie)
    if (typeof givenState !== 'string' || !givenState || givenState !== cookieState) return null
    return state.verify(givenState)
  }

  async function link(firebaseUid, code, installationId) {
    const identity = await github.getGitHubAuthorizationIdentity(code)
    const chosen = selectAuthorizedInstallation(installationId, identity)
    const installation = await github.getInstallationProfile(chosen)
    return connections.save(firebaseUid, { ...installation, login: identity.login, avatarUrl: identity.avatarUrl, installationId: installation.installationId })
  }

  function startFlow(request, response, urlFor) {
    try {
      const installationId = typeof request.query.installation_id === 'string' ? request.query.installation_id : ''
      const value = state.create(request.firebaseUser.uid, { installationId })
      storeConnectionStateCookie(response, value)
      return response.json({ ok: true, authorizationUrl: urlFor(value) })
    } catch (error) {
      console.error('GitHub connection start failed:', error?.message)
      const message = isConfigurationError(error) ? publicConfigurationMessage() : 'Could not start the GitHub connection. Please try again.'
      return response.status(isConfigurationError(error) ? 503 : 502).json({ ok: false, error: message })
    }
  }

  // Step 1: install the App (GitHub then asks the user to authorize it when "Request user authorization" is on).
  router.get('/connect', authenticate, (request, response) => startFlow(request, response, value => github.getGitHubInstallationUrl(value)))

  // When GitHub returned only an installation id (no code), the browser comes here to get a GitHub sign-in link.
  // The installation id rides inside the signed state, and is checked against the signed-in GitHub user later.
  router.get('/authorize', authenticate, (request, response) => startFlow(request, response, value => github.getGitHubUserAuthorizationUrl(value)))

  router.get('/callback', async (request, response) => {
    const { state: givenState, installation_id: installationId, code, error } = request.query
    // An installation id without a code: send the person back, signed in, to authorize as their GitHub user.
    if (!error && !code && typeof installationId === 'string' && /^\d+$/.test(installationId)) {
      return redirectToWorkspace(response, 'installation-pending', { installation_id: installationId })
    }
    const pending = pendingFrom(request, givenState)
    clearConnectionStateCookie(response)
    if (!pending) return redirectToWorkspace(response, 'invalid-state')
    if (error || typeof code !== 'string' || !code || code.length > 500) return redirectToWorkspace(response, 'cancelled')
    try {
      await link(pending.firebaseUid, code, typeof installationId === 'string' && installationId ? installationId : pending.installationId)
      return redirectToWorkspace(response, 'connected')
    } catch (problem) {
      console.error('GitHub installation callback failed:', problem?.status ?? problem?.message)
      return redirectToWorkspace(response, isConfigurationError(problem)
        ? 'configuration-error'
        : isFirestoreUnavailable(problem)
          ? 'storage-unavailable'
          : 'connection-failed')
    }
  })

  // GitHub can also return to the frontend, which forwards the one-time code here, so the token exchange and the
  // installation check stay on the server.
  router.post('/complete-authorization', authenticate, async (request, response) => {
    const { code, state: givenState, installationId } = request.body ?? {}
    const pending = pendingFrom(request, givenState)
    if (!pending || pending.firebaseUid !== request.firebaseUser.uid) {
      return response.status(400).json({ ok: false, error: `This GitHub connection link expired. Start the connection again from ${BRAND.name}.` })
    }
    if (typeof code !== 'string' || !code.trim() || code.length > 500) {
      return response.status(400).json({ ok: false, error: 'GitHub did not return a valid authorization code.' })
    }
    try {
      const connection = await link(request.firebaseUser.uid, code, typeof installationId === 'string' && installationId ? installationId : pending.installationId)
      clearConnectionStateCookie(response)
      return response.json({ ok: true, connection })
    } catch (error) {
      console.error('GitHub authorization completion failed:', error?.status ?? error?.message)
      const message = isConfigurationError(error)
        ? publicConfigurationMessage()
        : isFirestoreUnavailable(error)
          ? publicPersistenceMessage()
          : error instanceof GitHubConnectionChoiceError
            ? error.message
            : 'GitHub could not be connected. Please try again.'
      const status = isConfigurationError(error) || isFirestoreUnavailable(error) ? 503 : error instanceof GitHubConnectionChoiceError ? 403 : 502
      return response.status(status).json({ ok: false, error: message })
    }
  })

  // Older clients finished an installation with only its id. That trusted the id as typed, so it is gone.
  router.post('/complete-installation', authenticate, (_request, response) => response.status(410).json({ ok: false, code: 'authorize', error: 'Reconnect GitHub: sign in with GitHub to confirm the installation is yours.' }))

  router.get('/status', authenticate, async (request, response) => {
    try {
      const connection = await connections.get(request.firebaseUser.uid)
      if (!connection.connected) return response.json({ ok: true, connection })
      try {
        await github.getInstallationProfile(connection.githubInstallationId)
      } catch (error) {
        if (!isMissingGitHubInstallation(error)) throw error
        await connections.remove(request.firebaseUser.uid)
        return response.json({
          ok: true,
          connection: {
            connected: false,
            message: 'The GitHub App is no longer installed. Connect it again to restore repository evidence.'
          }
        })
      }
      return response.json({ ok: true, connection })
    } catch (error) {
      console.error('GitHub connection status failed:', error?.message)
      const message = isConfigurationError(error)
        ? publicConfigurationMessage()
        : isFirestoreUnavailable(error)
          ? publicPersistenceMessage()
          : 'Could not check the GitHub connection right now.'
      return response.status(isConfigurationError(error) || isFirestoreUnavailable(error) ? 503 : 502).json({ ok: false, error: message })
    }
  })

  router.get('/repos', authenticate, async (request, response) => {
    try {
      const connection = await connections.get(request.firebaseUser.uid)
      if (!connection.connected) return response.status(409).json({ ok: false, error: 'Connect GitHub before loading repositories.' })
      const repositories = await github.getUserRepositories(connection.githubInstallationId)
      return response.json({ ok: true, repositories })
    } catch (error) {
      console.error('GitHub repository request failed:', error?.status ?? error?.message)
      const message = isConfigurationError(error)
        ? publicConfigurationMessage()
        : 'Could not load GitHub repositories. Check that the app still has repository access and try again.'
      return response.status(isConfigurationError(error) ? 503 : 502).json({ ok: false, error: message })
    }
  })

  // Streamed evidence scan of the most recently pushed repositories (live progress for the evidence screen).
  // It calls the AI model, so aiGuard (limits and the daily allowance) runs first.
  router.post('/evidence-scan', authenticate, ...aiGuard, async (request, response) => {
    const { resumeData, resumeId = null } = request.body ?? {}
    if (!resumeData || typeof resumeData !== 'object' || Array.isArray(resumeData)) {
      return response.status(400).json({ ok: false, error: 'A structured resume is required before GitHub evidence can be scanned.' })
    }
    // resumeId says which saved resume the result belongs to; without it the scan still runs but isn't kept.
    if (resumeId !== null && (typeof resumeId !== 'string' || !RESUME_ID.test(resumeId))) {
      return response.status(400).json({ ok: false, error: 'Invalid resume id.' })
    }

    let connection
    try {
      connection = await connections.get(request.firebaseUser.uid)
    } catch (error) {
      const message = isConfigurationError(error) ? publicConfigurationMessage() : isFirestoreUnavailable(error) ? publicPersistenceMessage() : 'Could not check the GitHub connection.'
      return response.status(503).json({ ok: false, error: message })
    }
    if (!connection.connected) return response.status(409).json({ ok: false, error: 'Connect GitHub before scanning repositories.' })

    const stream = startNdjson(request, response)
    try {
      const scan = github.scanGitHubEvidence({ installationId: connection.githubInstallationId, resumeData, signal: stream.signal })
      for await (const event of persistScanResult(scan, { uid: request.firebaseUser.uid, resumeId, store: evidence })) {
        if (stream.closed) return
        stream.send(event)
      }
      stream.end({ type: 'done' })
    } catch (error) {
      console.error('GitHub evidence scan failed:', error?.status ?? error?.message)
      stream.end({ type: 'error', message: isConfigurationError(error) ? publicConfigurationMessage() : 'Could not scan GitHub. Check the app’s repository permissions and try again.' })
    }
  })

  router.delete('/disconnect', authenticate, async (request, response) => {
    try {
      await connections.remove(request.firebaseUser.uid)
      return response.json({ ok: true, message: `GitHub has been disconnected from ${BRAND.name}. The GitHub App remains installed until you uninstall it in GitHub.` })
    } catch (error) {
      console.error('GitHub disconnect failed:', error?.message)
      const message = isConfigurationError(error)
        ? publicConfigurationMessage()
        : isFirestoreUnavailable(error)
          ? publicPersistenceMessage()
          : 'Could not disconnect GitHub right now.'
      return response.status(isConfigurationError(error) || isFirestoreUnavailable(error) ? 503 : 502).json({ ok: false, error: message })
    }
  })

  return router
}

export default createGitHubRouter()
