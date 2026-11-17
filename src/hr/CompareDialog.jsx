import { useEffect, useRef, useState } from 'react'
import { HR_CATEGORY_LABELS } from '../../shared/hrScoring.js'
import { hrApi } from './hrApi.js'
import { displayName, Icon, Meter, ScoreMark, StatusBadge } from './hrUi.jsx'

const LEVEL = { strong: 'Strong match', partial: 'Partial match', low: 'Little overlap' }

/** Two or three resumes side by side: one column each, the same rows in the same order, so differences line up. */
export default function CompareDialog({ openingId, ids, blind, onClose, onOpen }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const closeRef = useRef(null)

  useEffect(() => {
    let live = true
    Promise.all(ids.map(id => hrApi.getCandidate(openingId, id)))
      .then(next => live && setRows(next))
      .catch(problem => live && setError(problem.message))
    return () => { live = false }
  }, [openingId, ids])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const first = rows?.[0]?.evaluation
  const categoryKeys = first ? Object.keys(first.categories) : []
  const terms = list => list.items.map(item => item.term)
  const bestRole = evaluation => [...(evaluation.categories.experience?.roles ?? [])].sort((a, b) => b.relevance - a.relevance)[0]
  const topScore = rows ? Math.max(...rows.map(row => row.score)) : null

  return <>
    <div className="hr-scrim" onClick={onClose} aria-hidden="true" />
    <section className="hr-modal hr-compare" role="dialog" aria-modal="true" aria-labelledby="hr-compare-title">
      <header className="hr-modal-head">
        <div><p className="hr-eyebrow">Side by side</p><h2 id="hr-compare-title">Compare {ids.length} resumes</h2></div>
        <button ref={closeRef} className="hr-icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </header>
      {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}
      {!rows ? !error && <div className="hr-loading"><span className="hr-spinner" /></div> : <div className="hr-compare-scroll">
        <table className="hr-compare-table" style={{ '--cols': rows.length }}>
          <thead>
            <tr><th scope="col"><span className="hr-visually-hidden">Measure</span></th>
              {rows.map(row => <th key={row.id} scope="col">
                <button type="button" className="hr-compare-name" onClick={() => onOpen(row.id)}>{displayName(row, blind)}</button>
                <span className="hr-sub">{row.headline}</span>
                <StatusBadge status={row.status} />
              </th>)}
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">Overall</th>{rows.map(row => <td key={row.id} className={row.score === topScore ? 'is-best' : ''}><ScoreMark score={row.score} size="sm" /></td>)}</tr>
            {categoryKeys.map(key => <tr key={key}>
              <th scope="row">{HR_CATEGORY_LABELS[key]} <i>{first.categories[key].weight}%</i></th>
              {rows.map(row => <td key={row.id}><span className="hr-compare-meter"><Meter value={row.evaluation.categories[key].score} label={HR_CATEGORY_LABELS[key]} /><b>{row.evaluation.categories[key].score}</b></span></td>)}
            </tr>)}
            <tr><th scope="row">Why</th>{rows.map(row => <td key={row.id} className="hr-compare-why">{row.evaluation.why}</td>)}</tr>
            {terms(first.mustHave).map((term, index) => <tr key={`must-${term}`} className={index === 0 ? 'hr-compare-group' : ''}>
              <th scope="row">{index === 0 && <span className="hr-label">Must-have</span>}{term}</th>
              {rows.map(row => { const found = row.evaluation.mustHave.items[index]?.found; return <td key={row.id} className={found ? 'is-found' : 'is-missing'}><Icon name={found ? 'check' : 'cross'} /><span className="hr-visually-hidden">{found ? 'found' : 'missing'}</span></td> })}
            </tr>)}
            {terms(first.niceToHave).map((term, index) => <tr key={`nice-${term}`} className={index === 0 ? 'hr-compare-group' : ''}>
              <th scope="row">{index === 0 && <span className="hr-label">Nice-to-have</span>}{term}</th>
              {rows.map(row => { const found = row.evaluation.niceToHave.items[index]?.found; return <td key={row.id} className={found ? 'is-found' : 'is-missing is-soft'}><Icon name={found ? 'check' : 'cross'} /><span className="hr-visually-hidden">{found ? 'found' : 'missing'}</span></td> })}
            </tr>)}
            <tr className="hr-compare-group"><th scope="row">Years</th>{rows.map(row => <td key={row.id}>{row.evaluation.years}{row.evaluation.minYears ? <span className="hr-sub">{row.evaluation.years >= row.evaluation.minYears ? 'meets' : 'below'} {row.evaluation.minYears}+</span> : null}</td>)}</tr>
            <tr><th scope="row">Closest role</th>{rows.map(row => { const role = bestRole(row.evaluation); return <td key={row.id}>{role ? <>{role.label}<span className="hr-sub">{LEVEL[role.level]}</span></> : <span className="hr-muted">None listed</span>}</td> })}</tr>
            {first.categories.education && <tr><th scope="row">Education</th>{rows.map(row => <td key={row.id}>{row.evaluation.categories.education?.notes?.[0]}</td>)}</tr>}
          </tbody>
        </table>
      </div>}
    </section>
  </>
}
