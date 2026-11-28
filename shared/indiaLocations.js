// Where to search for jobs: India's states and union territories, and the cities that decide which state a place is.
// Used by the job tracker's location controls (src/jobs/JobTrackerPage.jsx) and by every job source on the server
// (server/jobs). Works offline: "Use my location" finds the nearest listed city on the device, so the coordinates
// never leave the browser.

export const COUNTRIES = Object.freeze([{ code: 'IN', name: 'India' }])
/** The location value for a nationwide search. */
export const ALL_INDIA = 'India'

/** States, then union territories. */
export const INDIA_STATES = Object.freeze([
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry'
])

// Other ways people write a state ("MH", "Orissa", "NCR").
const STATE_ALIASES = {
  ap: 'Andhra Pradesh', assam: 'Assam', br: 'Bihar', cg: 'Chhattisgarh', chattisgarh: 'Chhattisgarh', gj: 'Gujarat', hr: 'Haryana', hp: 'Himachal Pradesh',
  jh: 'Jharkhand', ka: 'Karnataka', kl: 'Kerala', mp: 'Madhya Pradesh', mh: 'Maharashtra', orissa: 'Odisha', od: 'Odisha', pb: 'Punjab', rj: 'Rajasthan',
  // "UK" is left out: it far more often means the United Kingdom.
  tn: 'Tamil Nadu', ts: 'Telangana', tg: 'Telangana', up: 'Uttar Pradesh', uttaranchal: 'Uttarakhand', wb: 'West Bengal',
  'new delhi': 'Delhi', 'delhi ncr': 'Delhi', ncr: 'Delhi', 'nct of delhi': 'Delhi', jk: 'Jammu and Kashmir', 'j&k': 'Jammu and Kashmir',
  pondicherry: 'Puducherry', 'andaman': 'Andaman and Nicobar Islands', 'daman': 'Dadra and Nagar Haveli and Daman and Diu', 'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu'
}

/**
 * [city, state, latitude, longitude, other names]. Each state's first city is its main one; the first few are the
 * cities searched when a source only understands cities.
 */
const CITIES = [
  ['Mumbai', 'Maharashtra', 19.08, 72.88, ['bombay']], ['Pune', 'Maharashtra', 18.52, 73.86, ['poona']], ['Nagpur', 'Maharashtra', 21.15, 79.09], ['Nashik', 'Maharashtra', 20.0, 73.79],
  ['Thane', 'Maharashtra', 19.22, 72.98], ['Navi Mumbai', 'Maharashtra', 19.03, 73.03], ['Aurangabad', 'Maharashtra', 19.88, 75.34, ['chhatrapati sambhajinagar']], ['Solapur', 'Maharashtra', 17.66, 75.91],
  ['Kolhapur', 'Maharashtra', 16.7, 74.24], ['Amravati', 'Maharashtra', 20.93, 77.75], ['Nanded', 'Maharashtra', 19.15, 77.32], ['Akola', 'Maharashtra', 20.7, 77.0],
  ['Bengaluru', 'Karnataka', 12.97, 77.59, ['bangalore']], ['Mysuru', 'Karnataka', 12.3, 76.64, ['mysore']], ['Mangaluru', 'Karnataka', 12.91, 74.86, ['mangalore']], ['Hubballi', 'Karnataka', 15.36, 75.12, ['hubli']],
  ['Belagavi', 'Karnataka', 15.85, 74.5, ['belgaum']], ['Kalaburagi', 'Karnataka', 17.33, 76.83, ['gulbarga']], ['Davanagere', 'Karnataka', 14.46, 75.92], ['Udupi', 'Karnataka', 13.34, 74.75],
  ['Chennai', 'Tamil Nadu', 13.08, 80.27, ['madras']], ['Coimbatore', 'Tamil Nadu', 11.02, 76.96], ['Madurai', 'Tamil Nadu', 9.93, 78.12], ['Tiruchirappalli', 'Tamil Nadu', 10.79, 78.7, ['trichy']],
  ['Salem', 'Tamil Nadu', 11.66, 78.15], ['Tirunelveli', 'Tamil Nadu', 8.71, 77.76], ['Vellore', 'Tamil Nadu', 12.92, 79.13], ['Erode', 'Tamil Nadu', 11.34, 77.72], ['Hosur', 'Tamil Nadu', 12.74, 77.83],
  ['Hyderabad', 'Telangana', 17.39, 78.49, ['secunderabad', 'cyberabad']], ['Warangal', 'Telangana', 17.97, 79.59], ['Karimnagar', 'Telangana', 18.44, 79.13], ['Nizamabad', 'Telangana', 18.67, 78.09], ['Khammam', 'Telangana', 17.25, 80.15],
  ['Visakhapatnam', 'Andhra Pradesh', 17.69, 83.22, ['vizag']], ['Vijayawada', 'Andhra Pradesh', 16.51, 80.65], ['Guntur', 'Andhra Pradesh', 16.31, 80.44], ['Tirupati', 'Andhra Pradesh', 13.63, 79.42],
  ['Amaravati', 'Andhra Pradesh', 16.51, 80.52], ['Nellore', 'Andhra Pradesh', 14.44, 79.99], ['Kurnool', 'Andhra Pradesh', 15.83, 78.04], ['Kakinada', 'Andhra Pradesh', 16.99, 82.25], ['Anantapur', 'Andhra Pradesh', 14.68, 77.6],
  ['Kochi', 'Kerala', 9.93, 76.27, ['cochin', 'ernakulam']], ['Thiruvananthapuram', 'Kerala', 8.52, 76.94, ['trivandrum']], ['Kozhikode', 'Kerala', 11.26, 75.78, ['calicut']], ['Thrissur', 'Kerala', 10.53, 76.21],
  ['Kollam', 'Kerala', 8.89, 76.61], ['Kannur', 'Kerala', 11.87, 75.37], ['Palakkad', 'Kerala', 10.79, 76.65],
  ['Ahmedabad', 'Gujarat', 23.02, 72.57], ['Surat', 'Gujarat', 21.17, 72.83], ['Vadodara', 'Gujarat', 22.31, 73.18, ['baroda']], ['Rajkot', 'Gujarat', 22.3, 70.8], ['Gandhinagar', 'Gujarat', 23.22, 72.65],
  ['Bhavnagar', 'Gujarat', 21.76, 72.15], ['Jamnagar', 'Gujarat', 22.47, 70.06],
  ['Jaipur', 'Rajasthan', 26.91, 75.79], ['Jodhpur', 'Rajasthan', 26.24, 73.02], ['Udaipur', 'Rajasthan', 24.59, 73.71], ['Kota', 'Rajasthan', 25.21, 75.86], ['Ajmer', 'Rajasthan', 26.45, 74.64],
  ['Bikaner', 'Rajasthan', 28.02, 73.31], ['Alwar', 'Rajasthan', 27.55, 76.6],
  ['Indore', 'Madhya Pradesh', 22.72, 75.86], ['Bhopal', 'Madhya Pradesh', 23.26, 77.41], ['Jabalpur', 'Madhya Pradesh', 23.18, 79.99], ['Gwalior', 'Madhya Pradesh', 26.22, 78.18], ['Ujjain', 'Madhya Pradesh', 23.18, 75.78], ['Sagar', 'Madhya Pradesh', 23.84, 78.74],
  ['Noida', 'Uttar Pradesh', 28.54, 77.39], ['Lucknow', 'Uttar Pradesh', 26.85, 80.95], ['Ghaziabad', 'Uttar Pradesh', 28.67, 77.45], ['Kanpur', 'Uttar Pradesh', 26.45, 80.33], ['Greater Noida', 'Uttar Pradesh', 28.47, 77.5],
  ['Agra', 'Uttar Pradesh', 27.18, 78.01], ['Varanasi', 'Uttar Pradesh', 25.32, 82.97, ['banaras', 'benares']], ['Prayagraj', 'Uttar Pradesh', 25.44, 81.85, ['allahabad']], ['Meerut', 'Uttar Pradesh', 28.98, 77.71],
  ['Bareilly', 'Uttar Pradesh', 28.37, 79.43], ['Aligarh', 'Uttar Pradesh', 27.88, 78.08], ['Gorakhpur', 'Uttar Pradesh', 26.76, 83.37],
  ['New Delhi', 'Delhi', 28.61, 77.21, ['delhi']], ['Dwarka', 'Delhi', 28.59, 77.05], ['Rohini', 'Delhi', 28.74, 77.07],
  ['Gurugram', 'Haryana', 28.46, 77.03, ['gurgaon']], ['Faridabad', 'Haryana', 28.41, 77.32], ['Panipat', 'Haryana', 29.39, 76.97], ['Ambala', 'Haryana', 30.38, 76.78], ['Hisar', 'Haryana', 29.15, 75.72],
  ['Karnal', 'Haryana', 29.69, 76.99], ['Rohtak', 'Haryana', 28.9, 76.61], ['Sonipat', 'Haryana', 28.99, 77.02],
  ['Mohali', 'Punjab', 30.7, 76.72, ['sas nagar']], ['Ludhiana', 'Punjab', 30.9, 75.86], ['Amritsar', 'Punjab', 31.63, 74.87], ['Jalandhar', 'Punjab', 31.33, 75.58], ['Patiala', 'Punjab', 30.34, 76.39], ['Bathinda', 'Punjab', 30.21, 74.95],
  ['Chandigarh', 'Chandigarh', 30.73, 76.78],
  ['Shimla', 'Himachal Pradesh', 31.1, 77.17], ['Dharamshala', 'Himachal Pradesh', 32.22, 76.32], ['Mandi', 'Himachal Pradesh', 31.71, 76.93], ['Solan', 'Himachal Pradesh', 30.91, 77.1],
  ['Dehradun', 'Uttarakhand', 30.32, 78.03], ['Haridwar', 'Uttarakhand', 29.95, 78.16], ['Haldwani', 'Uttarakhand', 29.22, 79.51], ['Roorkee', 'Uttarakhand', 29.85, 77.89], ['Rishikesh', 'Uttarakhand', 30.09, 78.27],
  ['Srinagar', 'Jammu and Kashmir', 34.08, 74.8], ['Jammu', 'Jammu and Kashmir', 32.73, 74.86], ['Leh', 'Ladakh', 34.15, 77.58],
  ['Kolkata', 'West Bengal', 22.57, 88.36, ['calcutta']], ['Howrah', 'West Bengal', 22.59, 88.26], ['Durgapur', 'West Bengal', 23.52, 87.31], ['Asansol', 'West Bengal', 23.68, 86.98], ['Siliguri', 'West Bengal', 26.73, 88.4], ['Kharagpur', 'West Bengal', 22.35, 87.23],
  ['Bhubaneswar', 'Odisha', 20.3, 85.82], ['Cuttack', 'Odisha', 20.46, 85.88], ['Rourkela', 'Odisha', 22.26, 84.85], ['Berhampur', 'Odisha', 19.31, 84.79], ['Sambalpur', 'Odisha', 21.47, 83.97],
  ['Patna', 'Bihar', 25.59, 85.14], ['Gaya', 'Bihar', 24.79, 85.0], ['Bhagalpur', 'Bihar', 25.24, 86.97], ['Muzaffarpur', 'Bihar', 26.12, 85.39], ['Darbhanga', 'Bihar', 26.15, 85.9],
  ['Ranchi', 'Jharkhand', 23.34, 85.31], ['Jamshedpur', 'Jharkhand', 22.8, 86.2], ['Dhanbad', 'Jharkhand', 23.8, 86.43], ['Bokaro', 'Jharkhand', 23.67, 86.15],
  ['Raipur', 'Chhattisgarh', 21.25, 81.63], ['Bhilai', 'Chhattisgarh', 21.21, 81.38], ['Bilaspur', 'Chhattisgarh', 22.08, 82.15], ['Korba', 'Chhattisgarh', 22.36, 82.68],
  ['Guwahati', 'Assam', 26.14, 91.74], ['Dibrugarh', 'Assam', 27.47, 94.91], ['Silchar', 'Assam', 24.83, 92.78], ['Jorhat', 'Assam', 26.75, 94.2],
  ['Panaji', 'Goa', 15.49, 73.83, ['panjim']], ['Margao', 'Goa', 15.27, 73.96, ['madgaon']], ['Vasco da Gama', 'Goa', 15.4, 73.81],
  ['Puducherry', 'Puducherry', 11.94, 79.81, ['pondicherry']], ['Gangtok', 'Sikkim', 27.33, 88.61], ['Shillong', 'Meghalaya', 25.58, 91.89], ['Imphal', 'Manipur', 24.82, 93.94],
  ['Aizawl', 'Mizoram', 23.73, 92.72], ['Kohima', 'Nagaland', 25.67, 94.11], ['Dimapur', 'Nagaland', 25.91, 93.73], ['Agartala', 'Tripura', 23.83, 91.29], ['Itanagar', 'Arunachal Pradesh', 27.08, 93.61],
  ['Port Blair', 'Andaman and Nicobar Islands', 11.62, 92.73], ['Kavaratti', 'Lakshadweep', 10.57, 72.64], ['Daman', 'Dadra and Nagar Haveli and Daman and Diu', 20.4, 72.83], ['Silvassa', 'Dadra and Nagar Haveli and Daman and Diu', 20.27, 73.01]
]

const normal = value => String(value ?? '').toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ').trim()
const STATE_BY_NAME = new Map([...INDIA_STATES.map(state => [normal(state), state]), ...Object.entries(STATE_ALIASES)])
const STATE_BY_CITY = new Map(CITIES.flatMap(([city, state, , , others = []]) => [city, ...others].map(name => [normal(name), state])))

/** True for one of INDIA_STATES (exact name). */
export const isIndiaState = value => INDIA_STATES.includes(value)

/**
 * The state a place is in, from a resume's or a posting's location: "Pune, Maharashtra" → Maharashtra, "Bangalore" →
 * Karnataka, "Gurgaon, HR" → Haryana. Null when nothing in it is known (or it is another country).
 */
export function stateOfPlace(place) {
  const parts = String(place ?? '').split(/[,/|–-]/).map(normal).filter(Boolean)
  for (const part of [...parts].reverse()) if (STATE_BY_NAME.has(part)) return STATE_BY_NAME.get(part)
  for (const part of parts) if (STATE_BY_CITY.has(part)) return STATE_BY_CITY.get(part)
  // "Electronic City, Bengaluru Urban": a known city name inside a longer part.
  const whole = normal(place)
  for (const [name, state] of STATE_BY_CITY) if (name.length > 3 && new RegExp(`\\b${name}\\b`).test(whole)) return state
  return null
}

/** A search location from anything: a state stays, a city becomes its state, everything else is all of India. */
export function searchLocationOf(place) {
  if (isIndiaState(place)) return place
  return stateOfPlace(place) ?? ALL_INDIA
}

/** The cities searched for a state when a source only understands cities, main one first. */
export function citiesOf(state, limit = 4) {
  return CITIES.filter(([, cityState]) => cityState === state).slice(0, limit).map(([city]) => city)
}

/** Every name a city or state goes by, lower case, for matching posting locations ("Bangalore, KA"). */
export function placeNamesFor(location) {
  if (!location || location === ALL_INDIA) return []
  const state = isIndiaState(location) ? location : stateOfPlace(location)
  const cities = state ? CITIES.filter(([, cityState]) => cityState === state) : []
  const own = isIndiaState(location) ? [] : [location]
  return [...new Set([state, ...own, ...cities.flatMap(([city, , , , others = []]) => [city, ...others])].filter(Boolean).map(normal))]
}

const toRadians = degrees => degrees * Math.PI / 180
/** Great-circle distance in km. */
function distanceKm(lat1, lon1, lat2, lon2) {
  const a = Math.sin(toRadians(lat2 - lat1) / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(toRadians(lon2 - lon1) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

/**
 * The state for a device's coordinates, from the nearest listed city: { state, city, km }, or null outside India
 * (more than 300 km from every listed city, or outside India's bounding box). Near a state border it can pick the
 * neighbouring state, and just across the border (Kathmandu, Dhaka) it names the nearest Indian state; the person
 * can change it in the list.
 */
export function stateNear(latitude, longitude) {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 6 || lat > 37.5 || lon < 68 || lon > 97.5) return null
  let best = null
  for (const [city, state, cityLat, cityLon] of CITIES) {
    const km = distanceKm(lat, lon, cityLat, cityLon)
    if (!best || km < best.km) best = { state, city, km: Math.round(km) }
  }
  return best && best.km <= 300 ? best : null
}
