import { Link } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo.jsx'
import './simple-page.css'

// The Privacy Policy and Terms of Service. They describe what this code actually does with data (server/db/*,
// server/routes/*, the AI and job-search providers). Update them together with any change to what is stored or shared.
export const LEGAL_UPDATED = '17 November 2026'
// Where privacy and account requests go. Set VITE_LEGAL_CONTACT_EMAIL for the deployment; without it, requests go
// through the project's issue tracker, asking people to leave personal details out of the public issue.
const CONTACT_EMAIL = import.meta.env.VITE_LEGAL_CONTACT_EMAIL || ''
const ISSUES_URL = 'https://github.com/Van5hdeep/RESUMETRICS/issues'

function Contact() {
  return CONTACT_EMAIL
    ? <>email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></>
    : <>open an issue titled “Privacy request” at <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">{ISSUES_URL.replace('https://', '')}</a> without any personal details in it, and we will reply there with a private way to continue</>
}

function Privacy() {
  return <>
    <h2>Who we are</h2>
    <p>Resumetrics is a resume builder for candidates and a resume-screening portal for hiring teams (“Resumetrics Hiring”). This policy explains what personal data each part handles, why, who else processes it, and the choices you have. It is written with India’s Digital Personal Data Protection Act, 2023 in mind.</p>

    <h2>What we collect from candidates</h2>
    <ul>
      <li><b>Account:</b> your name, email address and profile photo from Google sign-in.</li>
      <li><b>Resumes:</b> everything you type, import or upload into a resume (contact details, work history, education, skills), its design choices, and up to 20 saved versions of each resume. A photo you add stays in your browser and is not uploaded to our database.</li>
      <li><b>Imported files:</b> PDF, Word or LinkedIn exports are read in your browser; only the text is sent to our server to turn it into resume fields. The files themselves are not stored.</li>
      <li><b>GitHub (optional):</b> if you connect GitHub, the installation id, your GitHub username and avatar, and the results of evidence scans of the repositories you allowed. Access tokens are created when needed and never stored.</li>
      <li><b>Job tools (Pro):</b> the job posts you paste for tailoring, your job searches and the jobs you save.</li>
      <li><b>Usage:</b> daily counts of AI requests and tokens per account, used to enforce fair-use limits.</li>
    </ul>

    <h2>What we collect from hiring teams</h2>
    <ul>
      <li><b>Account:</b> your name, work email, phone, job title, company details and a password, which is stored only as a salted scrypt hash.</li>
      <li><b>Job openings</b> you describe, and the <b>candidate resumes you upload</b> to them, with the scores and decisions (shortlisted, rejected, reasons) you record.</li>
    </ul>
    <p>When you upload a candidate’s resume, you decide why and how it is processed, so you act as the data fiduciary for that candidate and Resumetrics processes it on your behalf. You confirm, when you create an account, that you are allowed to share these resumes with us for screening. Remove a resume, or delete the opening, and it is deleted from our database.</p>
    <p><b>Demo workspaces</b> contain only made-up people. A demo and anything uploaded to it is deleted after 24 hours or when you sign out of it.</p>

    <h2>Why we use it</h2>
    <ul>
      <li>To provide the features you ask for: saving and designing resumes, AI writing and import, evidence checks, job tailoring and search, and resume screening.</li>
      <li>To keep accounts secure and the service available (sign-in checks, rate limits, fair-use limits, error logs).</li>
      <li>We do not sell personal data, use it for advertising, or use your resumes to train AI models.</li>
    </ul>

    <h2>Who processes it for us</h2>
    <ul>
      <li><b>Google Firebase</b> (authentication and the Cloud Firestore database).</li>
      <li><b>Vercel</b> (hosting of the website and the API).</li>
      <li><b>Groq</b> (AI model inference): the text needed for an AI request, such as resume text or a job post, is sent to the model and the answer comes back to us.</li>
      <li><b>GitHub</b>, only if you connect it.</li>
      <li><b>OpenWeb Ninja (JSearch), context.dev and Tavily</b> for job search: they receive search terms built from your resume (role, location, skills), not your contact details.</li>
    </ul>
    <p>These providers may process data outside India. We share only what each needs to do its job.</p>

    <h2>How long we keep it</h2>
    <ul>
      <li>Resumes, versions and evidence: until you delete them or your account.</li>
      <li>HR openings and candidate resumes: until you remove them.</li>
      <li>Demo workspaces: at most 24 hours.</li>
      <li>Daily AI usage counters (numbers only, no content) are kept with your account. Rate-limit records hold only a hashed network address or email and a count.</li>
    </ul>

    <h2>Your choices and rights</h2>
    <p>You can view, correct and delete your resumes in the app, disconnect GitHub at any time, and ask us to access, correct or erase any personal data we hold about you, or to delete your account. Candidates whose resume was uploaded by a hiring team should contact that company first; we will help it act on the request. To make a request, <Contact />.</p>

    <h2>Security</h2>
    <p>Data travels over HTTPS. Browsers never read the database directly: every request passes through our server, which checks who is signed in and only returns that account’s data. Passwords are stored as salted hashes. No system is perfectly secure, so please use a strong, unique password for an HR account.</p>

    <h2>Changes</h2>
    <p>We will update this page when what we collect or share changes, and change the date below.</p>
  </>
}

function Terms() {
  return <>
    <h2>Using Resumetrics</h2>
    <p>By creating an account or using the service you accept these terms. You must be at least 18, or have a parent’s or guardian’s permission, to use the candidate app; hiring accounts are for people who recruit for the company they register.</p>

    <h2>Your content</h2>
    <p>You own the resumes, letters and job openings you create. You give us permission to store and process them only to provide the service to you. You are responsible for keeping them accurate. NIMBUS and the other AI features are built not to invent facts, but you should review every suggestion before you use it.</p>

    <h2>Hiring accounts</h2>
    <ul>
      <li>Upload only resumes you are entitled to process for hiring, and use the scores as an aid to your own judgement, not as the only basis for a decision.</li>
      <li>Keep candidates’ data confidential and delete resumes you no longer need.</li>
      <li>Company details you give must be true; we may suspend accounts that impersonate a company.</li>
    </ul>

    <h2>Fair use</h2>
    <p>AI features, job searches and uploads have daily limits so the service stays available for everyone. Do not try to get around limits, access other people’s data, probe the service for weaknesses without our permission, or use it to send spam or unlawful content.</p>

    <h2>Plans and payments</h2>
    <p>Free plans have the limits shown on the plan pages. Paid plans are not on sale yet; when they are, prices, billing terms and refunds will be shown before you pay.</p>

    <h2>Availability and liability</h2>
    <p>We work to keep Resumetrics available and correct, but it is provided “as is”, without a guarantee that it will be uninterrupted or that it will get you an interview or a hire. To the extent the law allows, we are not liable for indirect losses arising from its use.</p>

    <h2>Ending your use</h2>
    <p>You can stop using Resumetrics and delete your content at any time. We may suspend accounts that break these terms. To ask a question about these terms, <Contact />.</p>
  </>
}

const PAGES = {
  privacy: { title: 'Privacy Policy', Body: Privacy },
  terms: { title: 'Terms of Service', Body: Terms }
}

export default function LegalPage({ kind }) {
  const { title, Body } = PAGES[kind] ?? PAGES.privacy
  return <main className="simple-page">
    <article className="legal">
      <header className="legal-head">
        <Link to="/" className="simple-page-brand" aria-label="Resumetrics home"><BrandLogo /></Link>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated {LEGAL_UPDATED}</p>
        <nav className="legal-nav" aria-label="Legal pages">
          <Link to="/privacy" aria-current={kind === 'privacy' ? 'page' : undefined}>Privacy Policy</Link>
          <Link to="/terms" aria-current={kind === 'terms' ? 'page' : undefined}>Terms of Service</Link>
        </nav>
      </header>
      <div className="legal-body"><Body /></div>
    </article>
  </main>
}
