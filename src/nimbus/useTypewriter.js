import { useEffect, useRef, useState } from 'react'

// NIMBUS text appears as if typed (PLAN-034, D42): about 480 characters a second, so a long answer still lands in
// a second or two. Reduced motion shows it at once; `skip()` finishes it (a click on the message).
export const CHARS_PER_FRAME = 8
export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** How many characters to show after `elapsed` ms. Pure, for tests. */
export const typedLength = (length, elapsed) => Math.min(length, Math.ceil(elapsed / (1000 / 60)) * CHARS_PER_FRAME)

export function useTypewriter(text, enabled = true) {
  const value = String(text ?? '')
  const animate = enabled && !prefersReducedMotion()
  const [shown, setShown] = useState(animate ? 0 : value.length)
  const frameRef = useRef(0)
  // The text that has finished typing; it never types again (re-renders, or the same text arriving twice).
  const finishedRef = useRef(animate ? null : value)

  useEffect(() => {
    if (!animate || !value || finishedRef.current === value) { setShown(value.length); return undefined }
    const started = performance.now()
    const tick = now => {
      const next = typedLength(value.length, now - started)
      setShown(next)
      if (next < value.length) frameRef.current = requestAnimationFrame(tick)
      else finishedRef.current = value
    }
    setShown(0)
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value, animate])

  const skip = () => { cancelAnimationFrame(frameRef.current); finishedRef.current = value; setShown(value.length) }
  return { text: value.slice(0, shown), done: shown >= value.length, skip }
}
