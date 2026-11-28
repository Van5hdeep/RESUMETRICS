import assert from 'node:assert/strict'
import { ALL_INDIA, INDIA_STATES, citiesOf, placeNamesFor, searchLocationOf, stateNear, stateOfPlace } from '../shared/indiaLocations.js'
import { FIT, buildSearchProfile, splitByFit, worthReason } from '../shared/jobMatch.js'
import { boardListingUrl, postingFromSlug } from '../server/jobs/sources.js'
import { placeFits } from '../server/jobs/companyFeeds.js'
import { salaryPlaceOf, searchQueries } from '../server/jobs/jobSearch.js'

// 28 states and 8 union territories.
assert.equal(INDIA_STATES.length, 36)
assert.equal(new Set(INDIA_STATES).size, 36)

// A place → its state: state names and abbreviations, cities and their old names, a city inside a longer part.
assert.equal(stateOfPlace('Pune, Maharashtra'), 'Maharashtra')
assert.equal(stateOfPlace('Bangalore'), 'Karnataka')
assert.equal(stateOfPlace('Gurgaon, HR'), 'Haryana')
assert.equal(stateOfPlace('Noida, UP, India'), 'Uttar Pradesh')
assert.equal(stateOfPlace('Electronic City, Bengaluru Urban'), 'Karnataka')
assert.equal(stateOfPlace('New Delhi'), 'Delhi')
assert.equal(stateOfPlace('Orissa'), 'Odisha')
assert.equal(stateOfPlace('London, UK'), null, '"UK" is the United Kingdom, not Uttarakhand')
assert.equal(stateOfPlace('Remote'), null)
assert.equal(searchLocationOf('Maharashtra'), 'Maharashtra')
assert.equal(searchLocationOf('Pune'), 'Maharashtra')
assert.equal(searchLocationOf(''), ALL_INDIA)
assert.deepEqual(citiesOf('Karnataka', 2), ['Bengaluru', 'Mysuru'])
assert.ok(placeNamesFor('Karnataka').includes('bangalore'))
assert.deepEqual(placeNamesFor(ALL_INDIA), [])
// Every state has at least one city, so "Use my location" and the city-only sources can reach it.
for (const state of INDIA_STATES) assert.ok(citiesOf(state, 1).length === 1, `${state} has a city`)

// Coordinates → state, on the device; outside India → nothing.
assert.equal(stateNear(18.53, 73.85).state, 'Maharashtra')
assert.equal(stateNear(28.62, 77.37).state, 'Uttar Pradesh')   // Noida
assert.equal(stateNear(28.46, 77.03).state, 'Haryana')         // Gurugram
assert.equal(stateNear(12.31, 76.65).city, 'Mysuru')
assert.equal(stateNear(51.5, -0.12), null)                      // London
assert.equal(stateNear('x', 77), null)

// The search profile carries a state; older city values become their state; remote or unknown is all of India.
assert.equal(buildSearchProfile({ location: 'Pune, Maharashtra' }).location, 'Maharashtra')
assert.equal(buildSearchProfile({ location: 'Remote' }).location, ALL_INDIA)
assert.equal(buildSearchProfile({}, { location: 'Bengaluru' }).location, 'Karnataka')
assert.equal(buildSearchProfile({ location: 'Pune' }, { location: 'Kerala' }).location, 'Kerala')

// Every source searches by state (formats checked on the boards' own sites): board pages, web search terms,
// employer feeds and the salary city.
assert.equal(boardListingUrl('naukri', { role: 'React Developer', location: 'Maharashtra', datePosted: 'week' }), 'https://www.naukri.com/react-developer-jobs-in-maharashtra?jobAge=7')
assert.equal(boardListingUrl('naukri', { role: 'React Developer', location: ALL_INDIA }), 'https://www.naukri.com/react-developer-jobs?jobAge=30')
assert.equal(boardListingUrl('indeed', { role: 'React Developer', location: 'Maharashtra', datePosted: 'week' }), 'https://in.indeed.com/jobs?q=React+Developer&l=Maharashtra&fromage=7')
assert.equal(boardListingUrl('internshala', { role: 'React Developer', location: 'Maharashtra' }), 'https://internshala.com/jobs/keywords-react-developer/jobs-in-maharashtra/')
assert.equal(boardListingUrl('internshala', { role: 'React Developer', location: ALL_INDIA }), 'https://internshala.com/jobs/keywords-react-developer/')
assert.equal(searchQueries({ role: 'React Developer', location: 'Kerala', remote: false }).jsearch, 'React Developer in Kerala')
assert.equal(postingFromSlug('https://www.naukri.com/job-listings-react-developer-acme-labs-pune-2-to-4-years-180226034721', 'Maharashtra').location, 'Pune')
assert.equal(placeFits('Bangalore, KA, India', { location: 'Karnataka' }), true)
assert.equal(placeFits('Navi Mumbai, India', { location: 'Maharashtra' }), true)
assert.equal(placeFits('Pune, India', { location: 'Karnataka' }), false)
assert.equal(placeFits('Gangtok', { location: 'Goa' }), false)
assert.equal(salaryPlaceOf({ location: 'Maharashtra' }), 'Mumbai')
assert.equal(salaryPlaceOf({ location: ALL_INDIA }), ALL_INDIA)
assert.equal(salaryPlaceOf({ location: 'Karnataka', remote: true }), ALL_INDIA)

// Best matches above, "Worth a try" below, long shots behind "Show more".
const job = (key, score, platform = 'linkedin', extra = {}) => ({ key, title: `Frontend Developer ${key}`, company: `Co ${key}`, score, platform, url: `https://${platform}.example/${key}`, matched: ['React'], missing: [], ...extra })
const rows = [
  { platform: 'linkedin', name: 'LinkedIn', jobs: [job('a', 82), job('b', 61), job('c', 50), job('d', 20)] },
  { platform: 'naukri', name: 'Naukri', jobs: [job('c', 55, 'naukri'), job('e', 40, 'naukri'), job('f', null, 'naukri')] },
  { platform: 'indeed', name: 'Indeed', jobs: [job('g', 45, 'indeed')] }
]
const { best, worth, longShots } = splitByFit(rows, { role: 'Frontend Developer', identity: item => item.key })
assert.deepEqual(best.map(row => [row.platform, row.jobs.map(item => item.key)]), [['linkedin', ['a', 'b']]], 'only rows with best matches stay, holding only those')
assert.deepEqual(worth.map(entry => entry.job.key), ['c', 'g', 'e', 'f'], 'best first, unscored last')
assert.deepEqual(worth[0].links.map(link => link.platform), ['linkedin', 'naukri'], 'one card per opening, every board it is on')
assert.equal(worth[0].job.score, 55, 'the card shows its best score')
assert.deepEqual(longShots.map(entry => entry.job.key), ['d'])
assert.ok(worth.every(entry => entry.reason))
assert.equal(FIT.best, 60)
assert.equal(FIT.worth, 35)
// The reason says why it's still worth a look.
assert.equal(worthReason(job('x', 50, 'linkedin', { matched: ['React', 'CSS', 'Git'], missing: ['Angular', 'Java', 'Go'] }), 'Frontend Developer'), 'Matches 3 of your skills · missing Angular, Java')
assert.equal(worthReason({ ...job('y', 48), title: 'UI Engineer', matched: ['React'] }, 'Frontend Developer'), 'Matches 1 of your skills · a related role')
assert.equal(worthReason(job('z', null)), 'Not scored: open the posting to check the fit')

console.log('jobLocations: ok')
