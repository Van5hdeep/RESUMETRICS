import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { App, Octokit } from 'octokit'
import { env, GitHubConfigurationError, validateGitHubConfiguration } from '../config/env.js'

let githubApp

function getGitHubApp() {
  if (githubApp) return githubApp
  validateGitHubConfiguration()
  let privateKey = env.github.privateKey
  if (!privateKey) {
    const privateKeyPath = resolve(env.github.privateKeyPath)
    if (!existsSync(privateKeyPath)) throw new GitHubConfigurationError('The GitHub App private key file could not be found.')

    try {
      privateKey = readFileSync(privateKeyPath, 'utf8')
    } catch {
      throw new GitHubConfigurationError('The GitHub App private key could not be read.')
    }
  }

  githubApp = new App({ appId: env.github.appId, privateKey })
  return githubApp
}

function installationIdOrThrow(installationId) {
  const parsed = Number(installationId)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('Invalid GitHub installation.')
  return parsed
}

function sanitizeRepository(repository) {
  return {
    id: repository.id,
    name: repository.name,
    full_name: repository.full_name,
    html_url: repository.html_url,
    description: repository.description ?? null,
    private: Boolean(repository.private),
    default_branch: repository.default_branch ?? null,
    language: repository.language ?? null,
    updated_at: repository.updated_at ?? null,
    pushed_at: repository.pushed_at ?? repository.updated_at ?? null,
    stargazers_count: repository.stargazers_count ?? 0,
    fork: Boolean(repository.fork),
    archived: Boolean(repository.archived),
    topics: Array.isArray(repository.topics) ? repository.topics.slice(0, 20) : [],
    size: repository.size ?? 0
  }
}

export function getGitHubInstallationUrl(state) {
  validateGitHubConfiguration()
  const url = new URL(`https://github.com/apps/${encodeURIComponent(env.github.appSlug)}/installations/new`)
  url.searchParams.set('state', state)
  return url.toString()
}

/** GitHub's user sign-in page for the App. It returns a one-time code, which proves which installations the user can reach. */
export function getGitHubUserAuthorizationUrl(state) {
  validateGitHubConfiguration()
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', env.github.clientId)
  url.searchParams.set('redirect_uri', env.github.callbackUrl)
  url.searchParams.set('state', state)
  return url.toString()
}

export async function getInstallationProfile(installationId) {
  const { data } = await getGitHubApp().octokit.request('GET /app/installations/{installation_id}', {
    installation_id: installationIdOrThrow(installationId)
  })
  return {
    installationId: String(data.id),
    login: data.account?.login ?? 'GitHub account',
    avatarUrl: data.account?.avatar_url ?? ''
  }
}

export async function getGitHubAuthorizationIdentity(code) {
  validateGitHubConfiguration()
  if (typeof code !== 'string' || !code.trim() || code.length > 500) throw new Error('Missing GitHub authorization code.')
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.github.clientId,
      client_secret: env.github.clientSecret,
      code,
      redirect_uri: env.github.callbackUrl
    })
  })
  const tokenPayload = await tokenResponse.json().catch(() => null)
  if (!tokenResponse.ok || !tokenPayload?.access_token) throw new Error('GitHub user authorization could not be verified.')

  // This short-lived user token is used only to confirm the user can access the
  // installation returned by GitHub. It is not persisted or returned to clients.
  const userOctokit = new Octokit({ auth: tokenPayload.access_token })
  const [userResponse, installationsResponse] = await Promise.all([
    userOctokit.request('GET /user'),
    userOctokit.request('GET /user/installations', { per_page: 100 })
  ])
  return {
    login: userResponse.data.login ?? 'GitHub user',
    avatarUrl: userResponse.data.avatar_url ?? '',
    installationIds: (installationsResponse.data.installations ?? []).map(installation => String(installation.id))
  }
}

export async function getGitHubUserForAuthorizationCode(code, installationId) {
  const identity = await getGitHubAuthorizationIdentity(code)
  const requestedInstallationId = String(installationIdOrThrow(installationId))
  if (!identity.installationIds.includes(requestedInstallationId)) {
    throw new Error('The authorized GitHub user cannot access this installation.')
  }
  return identity
}

// Tokens are generated only when GitHub data is requested and are never persisted.
export async function getInstallationToken(installationId) {
  const { data } = await getGitHubApp().octokit.request('POST /app/installations/{installation_id}/access_tokens', {
    installation_id: installationIdOrThrow(installationId)
  })
  return data.token
}

export async function getInstallationClient(installationId) {
  const token = await getInstallationToken(installationId)
  return new Octokit({ auth: token })
}

export async function getUserRepositoriesWithClient(octokit) {
  const { data } = await octokit.request('GET /installation/repositories', { per_page: 100 })
  return data.repositories.map(sanitizeRepository)
}

// Every repository the installation can see (GitHub pages these 100 at a time).
export async function getAllInstallationRepositoriesWithClient(octokit, { maxPages = 10 } = {}) {
  const repositories = []
  let total = 0
  for (let page = 1; page <= maxPages; page += 1) {
    const { data } = await octokit.request('GET /installation/repositories', { per_page: 100, page })
    total = data.total_count ?? total
    repositories.push(...data.repositories.map(sanitizeRepository))
    if (data.repositories.length < 100 || repositories.length >= total) break
  }
  return { repositories, total: Math.max(total, repositories.length) }
}

export async function getUserRepositories(installationId) {
  return getUserRepositoriesWithClient(await getInstallationClient(installationId))
}

export async function getRepositoryLanguagesWithClient(octokit, owner, repo) {
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/languages', { owner, repo })
  return data
}

export async function getRepositoryLanguages(installationId, owner, repo) {
  return getRepositoryLanguagesWithClient(await getInstallationClient(installationId), owner, repo)
}

function decodeFileContent(data) {
  if (data.encoding !== 'base64' || !data.content) return ''
  return Buffer.from(data.content, 'base64').toString('utf8')
}

export async function getRepositoryReadmeWithClient(octokit, owner, repo) {
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/readme', { owner, repo })
  return {
    name: data.name,
    path: data.path,
    sha: data.sha,
    htmlUrl: data.html_url,
    content: decodeFileContent(data)
  }
}

export async function getRepositoryReadme(installationId, owner, repo) {
  return getRepositoryReadmeWithClient(await getInstallationClient(installationId), owner, repo)
}

export async function getRepositoryFileWithClient(octokit, owner, repo, path, ref) {
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', { owner, repo, path, ...(ref ? { ref } : {}) })
  if (Array.isArray(data)) return null
  return {
    name: data.name,
    path: data.path,
    size: data.size,
    htmlUrl: data.html_url,
    content: decodeFileContent(data)
  }
}

export async function getRepositoryContents(installationId, owner, repo, path = '', ref) {
  const octokit = await getInstallationClient(installationId)
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', { owner, repo, path, ...(ref ? { ref } : {}) })
  const entries = Array.isArray(data) ? data : [data]
  return entries.map(entry => ({
    name: entry.name,
    path: entry.path,
    type: entry.type,
    size: entry.size,
    sha: entry.sha,
    htmlUrl: entry.html_url,
    downloadUrl: entry.download_url ?? null
  }))
}

export async function getRepositoryPullRequests(installationId, owner, repo) {
  const octokit = await getInstallationClient(installationId)
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/pulls', { owner, repo, state: 'all', per_page: 100 })
  return data.map(item => ({ number: item.number, title: item.title, state: item.state, htmlUrl: item.html_url, createdAt: item.created_at, updatedAt: item.updated_at }))
}

export async function getRepositoryIssues(installationId, owner, repo) {
  const octokit = await getInstallationClient(installationId)
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/issues', { owner, repo, state: 'all', per_page: 100 })
  return data.map(item => ({ number: item.number, title: item.title, state: item.state, htmlUrl: item.html_url, createdAt: item.created_at, updatedAt: item.updated_at, isPullRequest: Boolean(item.pull_request) }))
}
