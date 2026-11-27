// The product's name and how it describes itself, in one place for the browser and the server. Renaming the product
// is a change here (plus index.html, which is static, and the logo files in src/assets/brand).
// Internal identifiers keep the old name on purpose: RESUMETRICS_* environment variables, storage keys, cookie names,
// the Firebase project and the GitHub App. Renaming those would sign people out or break the deployment's settings.

export const BRAND = Object.freeze({
  name: 'Refile',
  /** The HR side: the portal at /hr where hiring teams organise the resumes they receive. */
  hiring: 'Refile Hiring',
  pro: 'Refile Pro',
  /** Shown in screenshots' address bars on the landing page. */
  domain: 'refile.app',
  tagline: 'Refine your resume for every job. Organize every resume you receive.',
  /** One line on each side, for the landing page, meta tags and the legal pages. */
  candidates: 'a resume workspace where job seekers rework one resume into the right version for every job',
  hiringTeams: 'a resume organizer where hiring teams read, score and sort the resumes they receive'
})
