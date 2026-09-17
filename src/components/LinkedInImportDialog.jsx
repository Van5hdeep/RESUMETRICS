const linkedInHelpUrl = 'https://www.linkedin.com/help/linkedin/answer/a541960/save-a-profile-as-a-pdf?lang=en'

export default function LinkedInImportDialog({ status, error, onClose, onChooseFile }) {
  const isBusy = status === 'reading' || status === 'extracting'
  const statusCopy = {
    reading: ['Reading your profile export…', 'Checking the document for readable profile content.'],
    extracting: ['Extracting your LinkedIn details…', 'Identifying your skills, roles, education, and certifications.']
  }[status]

  return <div className="linkedin-import-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !isBusy) onClose() }}>
    <section className="linkedin-import-dialog" role="dialog" aria-modal="true" aria-labelledby="linkedin-import-title">
      <div className="linkedin-import-dialog-header">
        <div><span className="eyebrow">LINKEDIN PROFILE</span><h2 id="linkedin-import-title">Import your profile PDF</h2><p>Download your public profile from LinkedIn, then upload the file here. Your source document is read to create a structured profile for this comparison.</p></div>
        <button className="linkedin-dialog-close" type="button" aria-label="Close LinkedIn import" disabled={isBusy} onClick={onClose}>×</button>
      </div>

      {statusCopy ? <div className="linkedin-import-progress" aria-live="polite"><div className="flow-spinner" /><div><strong>{statusCopy[0]}</strong><span>{statusCopy[1]}</span></div></div> : <>
        <div className="linkedin-download-guide">
          <span>How to download your LinkedIn PDF</span>
          <ol>
            <li>On a desktop browser, open LinkedIn and select <strong>Me → View Profile</strong>.</li>
            <li>In the top introduction section, choose <strong>More</strong> or <strong>Resources</strong>.</li>
            <li>Select <strong>Save to PDF</strong>; LinkedIn downloads a copy of your profile.</li>
            <li>Return here and upload that PDF. A DOCX export is accepted too.</li>
          </ol>
          <a href={linkedInHelpUrl} target="_blank" rel="noreferrer">Open LinkedIn’s current download instructions ↗</a>
        </div>
        {error && <p className="linkedin-import-error" role="alert">{error}</p>}
        <div className="linkedin-import-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="button" onClick={onChooseFile}>Choose profile PDF or DOCX</button></div>
      </>}
    </section>
  </div>
}
