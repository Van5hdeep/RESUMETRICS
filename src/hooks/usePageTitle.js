import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { BRAND } from '../../shared/brand.js'

const APP = BRAND.name
const HIRING = BRAND.hiring

// [path pattern, title]. First match wins; the HR portal has its own suffix so its tabs are easy to tell apart.
const TITLES = [
  [/^\/$/, `${APP} — Resume workspace and HR resume organizer`],
  [/^\/login\/?$/, `Sign in · ${APP}`],
  [/^\/dashboard\/?$/, `Dashboard · ${APP}`],
  [/^\/workspace\/editor/, `Editor · ${APP}`],
  [/^\/workspace\/tailor/, `Job tailoring · ${APP}`],
  [/^\/workspace\/letter/, `Cover letter · ${APP}`],
  [/^\/workspace\/evidence/, `Evidence check · ${APP}`],
  [/^\/workspace\/templates/, `Choose a template · ${APP}`],
  [/^\/workspace/, `Resume workspace · ${APP}`],
  [/^\/templates\/?$/, `Templates · ${APP}`],
  [/^\/settings\/?$/, `Settings · ${APP}`],
  [/^\/help\/?$/, `Help & support · ${APP}`],
  [/^\/plan\/?$/, `Plan · ${APP}`],
  [/^\/jobs\/?$/, `Job tracker · ${APP}`],
  [/^\/privacy\/?$/, `Privacy Policy · ${APP}`],
  [/^\/terms\/?$/, `Terms of Service · ${APP}`],
  [/^\/hr\/login\/?$/, `Sign in · ${HIRING}`],
  [/^\/hr\/register\/?$/, `Create an HR account · ${HIRING}`],
  [/^\/hr\/openings\/new\/?$/, `New job opening · ${HIRING}`],
  [/^\/hr\/openings\/[^/]+\/edit\/?$/, `Edit job opening · ${HIRING}`],
  [/^\/hr\/openings\/[^/]+\/?$/, `Job opening · ${HIRING}`],
  [/^\/hr\/openings\/?$/, `Job openings · ${HIRING}`],
  [/^\/hr\/plan\/?$/, `Plan & billing · ${HIRING}`],
  [/^\/hr\/profile\/?$/, `Company profile · ${HIRING}`],
  [/^\/hr\/?$/, `Overview · ${HIRING}`]
]

export const titleFor = pathname => TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? `Page not found · ${APP}`

/** Keeps the browser tab title in step with the route. */
export default function usePageTitle() {
  const { pathname } = useLocation()
  useEffect(() => { document.title = titleFor(pathname) }, [pathname])
}
