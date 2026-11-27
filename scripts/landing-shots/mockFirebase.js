// Stand-ins for `firebase/app` and `firebase/auth` in the screenshot harness only (vite.config.js swaps them in):
// a demo user is always signed in, so the real app renders its signed-in screens without touching Google.
import { DEMO_USER } from './sample.js'

const user = {
  ...DEMO_USER,
  photoURL: '',
  providerData: [],
  metadata: { creationTime: 'Mon, 01 Sep 2026 09:00:00 GMT', lastSignInTime: new Date().toUTCString() },
  getIdToken: async () => 'landing-demo-token'
}
const auth = { currentUser: user }

export const initializeApp = () => ({})
export const getApps = () => [{}]
export const getApp = () => ({})
export const getAuth = () => auth
export const onAuthStateChanged = (_auth, callback) => { setTimeout(() => callback(user), 0); return () => {} }
export class GoogleAuthProvider { addScope() {} }
export const signInWithPopup = async () => ({ user })
export const signInWithCustomToken = async () => ({ user })
export const signOut = async () => {}
