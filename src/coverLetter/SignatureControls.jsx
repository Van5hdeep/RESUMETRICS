// Signature panel for the Format column (PLAN-033): upload, clean-up, ink, size, alignment.
// The picture is ink on a transparent background, so the page's paper colour shows through and always matches.
import { safeImageSrc } from '../utils/safeUrl.js'

const field = (label, children) => <div className="fp-field is-wide"><span className="fp-label">{label}</span>{children}</div>

export default function SignatureControls({ signature, onPick, onChange, onRemove, busy, error, textColor, accentColor, paper }) {
  const has = Boolean(signature?.image)
  const inks = [['Text', textColor || '#172033'], ['Black', '#111111'], ['Navy', '#14285a'], ['Accent', accentColor || '#2563eb']]
  const active = (signature?.ink || inks[0][1]).toLowerCase()
  return <section className="fp-group letter-signature-panel">
    <h3>Signature</h3>
    {!has && <p className="fp-hint letter-panel-note">Photograph your signature on plain white paper, or upload a scan. The background is removed, so it matches the page.</p>}
    <div className="fp-row">
      <button type="button" className="btn btn-secondary btn-sm" onClick={onPick} disabled={busy}>{busy ? 'Working…' : has ? 'Replace image' : 'Upload image'}</button>
      {has && <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>Remove</button>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {signature?.advice && <p className="fp-warning" role="status">{signature.advice}</p>}
    {has && <>
      <div className="letter-signature-preview" style={{ background: paper || '#fff' }}><img src={safeImageSrc(signature.image)} alt="Your signature on the page colour" /></div>
      {field('Clean-up', <input className="letter-range" type="range" min="0" max="100" value={Math.round((signature.cleanup ?? 0.5) * 100)} aria-label="Clean-up strength" onChange={event => onChange({ cleanup: Number(event.target.value) / 100 })} />)}
      {field('Size', <input className="letter-range" type="range" min="4" max="16" step="0.5" value={signature.width ?? 9} aria-label="Signature size" onChange={event => onChange({ width: Number(event.target.value) })} />)}
      {field('Ink', <div className="fp-swatches" role="group" aria-label="Signature ink">
        {inks.map(([name, hex]) => <button key={name} type="button" className={active === hex.toLowerCase() ? 'is-active' : ''} style={{ '--swatch': hex }} aria-label={`${name} ink`} title={name} onClick={() => onChange({ ink: hex })} />)}
        <label className="fp-custom-colour" title="Custom ink"><input type="color" value={signature.ink || '#172033'} aria-label="Custom ink colour" onChange={event => onChange({ ink: event.target.value })} /><span /></label>
      </div>)}
      {field('Align', <div className="fp-segmented" role="group" aria-label="Signature alignment">
        {['left', 'center', 'right'].map(side => <button key={side} type="button" className={(signature.align || 'left') === side ? 'is-active' : ''} aria-pressed={(signature.align || 'left') === side} onClick={() => onChange({ align: side })}>{side[0].toUpperCase() + side.slice(1)}</button>)}
      </div>)}
    </>}
  </section>
}
