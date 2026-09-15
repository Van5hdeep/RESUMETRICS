const severityLabel = severity => severity === 'warning' ? 'Needs attention' : 'Checked'

export default function TemplateQualityReport({ report, usesCurrentResume = false, onAutoFix }) {
  if (!report) return null
  const fixesAvailable = Object.keys(report.suggestedPresentation || {}).length > 0
  const topIssues = report.issues.slice(0, 3)

  return <section className="template-quality-report" aria-live="polite" aria-label="Template quality checks">
    <div className="template-quality-heading">
      <div>
        <span className="eyebrow">PREVIEW HEALTH</span>
        <h4>{report.renderFits ? 'Layout checks passed' : `${report.issues.length} layout issue${report.issues.length === 1 ? '' : 's'} detected`}</h4>
      </div>
      <span className={`template-ats-status ${report.atsLabel.toLowerCase().replace(/\s+/g, '-')}`}>{report.atsLabel}</span>
    </div>

    <div className="template-quality-metrics">
      <span><strong>{report.estimatedPages}</strong> estimated {report.estimatedPages === 1 ? 'page' : 'pages'}{usesCurrentResume ? ' with your resume' : ' for this preview'}</span>
      <span><strong>{report.contrastStatus}</strong> contrast</span>
    </div>

    {topIssues.length > 0 ? <ul className="template-quality-issues">
      {topIssues.map(issue => <li key={issue.code} className={issue.severity}>
        <span>{severityLabel(issue.severity)}</span>
        <div><strong>{issue.title}</strong><p>{issue.detail}</p></div>
      </li>)}
    </ul> : <p className="template-quality-passed">This preview fits its page, preserves readable contrast, and contains no detected text overflow.</p>}

    {fixesAvailable && <button className="template-autofix-button" type="button" onClick={onAutoFix}>Auto-fix presentation</button>}

    <details className="template-stress-details">
      <summary>Stress checks covered</summary>
      <p>{report.stressScenarios.join(' · ')}</p>
    </details>
  </section>
}
