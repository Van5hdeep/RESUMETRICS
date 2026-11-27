import { createContext, useContext, useEffect, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithCustomToken, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../firebase.js'
import { resetLogoIntro } from '../components/BrandLogo.jsx'

const AuthContext = createContext(null)
const API_BASE = import.meta.env.VITE_API_URL || ''

/** { demo, demoExpiresAt } from the user's token, or { demo: false } (Google accounts, or when it can't be read). */
async function demoClaimsOf(user) {
  try {
    const { claims } = await user.getIdTokenResult()
    return claims?.demo === true ? { demo: true, demoExpiresAt: Number(claims.demoExpiresAt) || 0 } : { demo: false }
  } catch {
    return { demo: false }
  }
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [error, setError] = useState(null)
  const [demo, setDemo] = useState({ demo: false })

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return undefined
    }

    return onAuthStateChanged(auth, async user => {
      // A demo whose day is over is signed out (the server refuses it anyway).
      const claims = user && typeof user.getIdTokenResult === 'function' ? await demoClaimsOf(user) : { demo: false }
      if (claims.demo && !(claims.demoExpiresAt > Date.now())) {
        await firebaseSignOut(auth).catch(() => {})
        return
      }
      setDemo(claims)
      setCurrentUser(user)
      setLoading(false)
    }, authError => {
      console.error('Firebase auth state error:', authError)
      setError(authError)
      setLoading(false)
    })
  }, [])

  const signInWithGoogle = async () => {
    if (!auth) throw new Error('Firebase authentication is not configured.')
    const provider = new GoogleAuthProvider()
    provider.addScope('email')
    provider.addScope('profile')
    setError(null)
    const result = await signInWithPopup(auth, provider)
    return result.user
  }

  // "Try the demo": the server opens a private demo account and hands back a token to sign in with.
  const signInAsDemo = async () => {
    if (!auth) throw new Error('Firebase authentication is not configured.')
    setError(null)
    let response
    try {
      response = await fetch(`${API_BASE}/api/user/demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
    } catch {
      throw new Error('The demo could not be reached. Check your connection.')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.token) throw new Error(data.error || 'The demo could not be opened. Please try again.')
    const result = await signInWithCustomToken(auth, data.token)
    return result.user
  }

  // Signing out lets the sidebar logo play its entrance again on the next sign-in.
  const signOut = () => {
    resetLogoIntro()
    return auth ? firebaseSignOut(auth) : Promise.resolve()
  }

  return <AuthContext.Provider value={{ currentUser, loading, error, isConfigured: isFirebaseConfigured, signInWithGoogle, signInAsDemo, isDemo: demo.demo, demoExpiresAt: demo.demoExpiresAt ?? null, signOut }}>
    {children}
  </AuthContext.Provider>
}
