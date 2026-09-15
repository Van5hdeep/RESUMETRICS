import { useEffect, useState } from 'react'

const wordmark = Array.from('Resumetrics')
const letterTilts = [-4, -2, 1, -2, 2, -1, 1, -3, 2, -1, 1]

export default function AnimatedLogo() {
  const [writtenLetters, setWrittenLetters] = useState(0)

  useEffect(() => {
    const isComplete = writtenLetters === wordmark.length
    const timer = window.setTimeout(() => {
      setWrittenLetters(current => isComplete ? 0 : current + 1)
    }, isComplete ? 1450 : 155)
    return () => window.clearTimeout(timer)
  }, [writtenLetters])

  return <div className="animated-logo-wrap">
    <span className="logo-glow" aria-hidden="true" />
    <div className="logo-writing-stage" role="img" aria-label="Resumetrics">
      <span className="logo-wordmark">{wordmark.map((letter, index) => <span className={`logo-letter${index >= 4 ? ' is-metrics' : ''}${index < writtenLetters ? ' is-written' : ''}`} style={{ '--letter-tilt': `${letterTilts[index]}deg` }} key={`${letter}-${index}`}>{letter}</span>)}</span>
    </div>
    <span className="logo-caption">CAREER DATA, IN FOCUS</span>
  </div>
}
