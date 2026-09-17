# 📊 RESUMETRICS

**Evidence-led resumes that prove your impact**

[![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=white)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5+-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4+-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![GitHub App](https://img.shields.io/badge/GitHub_App-evidence-181717?logo=github&logoColor=white)](https://docs.github.com/en/apps)

---

## Overview

Resumetrics is an AI-powered resume builder that helps you create resumes backed by verifiable evidence and measurable impact. Instead of vague claims, Resumetrics connects your professional achievements to real data sources—GitHub contributions, LinkedIn experience, and coding profiles—ensuring every statement on your resume is defensible and credible.

The platform features role-alignment analysis, AI-assisted editing, resume import, and multiple professional templates designed to highlight metrics and outcomes that matter to hiring managers.

---

## ✨ Features

- **🔐 Secure Authentication** — Google Sign-In via Firebase Authentication with persistent sessions, protected routes, profile picture, and sign-out
- **📝 Professional Resume Templates** — Choose from five original layouts: Classic Professional, Modern Minimal, Tech Focused, Compact ATS, and Elegant Sidebar
- **🎯 Role Alignment Analysis** — Paste job descriptions and compare them against extracted resume skills with a match score, strengths, missing skills, and recommendations
- **🤖 AI-Assisted Editing** — Improve bullets and use the workspace assistant for focused resume changes
- **📊 Evidence Sourcing** — Connect GitHub, LinkedIn, and LeetCode to surface verifiable proof for projects, skills, and outcomes
- **🐙 GitHub Evidence Integration** — Securely connect the Resumetrics-evidence GitHub App, verify its installation, and prepare repository evidence for review
- **🎨 Visual Resume Editor** — Customize fonts, colors, sizes, and left/center/right alignment in an editable canvas
- **📥 Resume Import** — Upload existing resumes in PDF, Word, or TXT format and generate a separate editable draft
- **📤 Multi-Format Export** — Download your resume as PDF, DOCX, PPTX, or TXT
- **🔒 Protected Routes** — Secure workspace with authentication-gated access
- **📱 Responsive Design** — Clean, modern UI that works across devices

---

## 🛠 Tech Stack

- **[React](https://reactjs.org/)** — Component-based UI library
- **[Vite](https://vitejs.dev/)** — Fast build tool and development server
- **[Tailwind CSS](https://tailwindcss.com/)** — Existing styling and design-system support
- **[Firebase Authentication](https://firebase.google.com/products/auth)** — Google Sign-In and user session management
- **[React Router DOM](https://reactrouter.com/)** — Client-side routing and protected navigation
- **PDF.js and Mammoth** — Browser-side PDF and DOCX text extraction
- **jsPDF, docx, and PptxGenJS** — Resume export formats
- **Node.js and Express** — Private backend and API routes
- **Firebase Admin and Firestore** — Server-side Firebase ID-token verification and per-user GitHub connection metadata
- **Octokit** — Server-side GitHub App authentication, installation tokens, and read-only repository access
- **CORS, dotenv, and Groq SDK** — Server configuration and AI integration
- **IntersectionObserver, requestAnimationFrame, and CSS animations** — Lightweight landing-page motion

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- A **Firebase project** with Google Authentication enabled ([Setup Guide](https://console.firebase.google.com/))
- A Groq API key for AI features

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/Van5hdeep/RESUMETRICS.git
   cd RESUMETRICS
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy `.env.example` to `.env.local` and fill in the Firebase configuration values:

   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

   Create `server/.env.local` for the private AI configuration:

   ```env
   RESUMETRICS_AI_API_KEY=your_groq_api_key_here
   RESUMETRICS_AI_PROVIDER=groq
   RESUMETRICS_AI_DEFAULT_MODEL=your_current_groq_model
   ```

   Add the server-only Firebase Admin and GitHub App configuration to the same file. Keep the service-account JSON and private key outside Git tracking, for example under the ignored `server/secrets/` directory:

   ```env
   FIREBASE_SERVICE_ACCOUNT_PATH=server/secrets/firebase-service-account.json
   GITHUB_APP_ID=your_github_app_id
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   GITHUB_PRIVATE_KEY_PATH=server/secrets/resumetrics-evidence.private-key.pem
   GITHUB_APP_SLUG=resumetrics-evidence
   GITHUB_CALLBACK_URL=http://localhost:5173/workspace
   FRONTEND_URL=http://localhost:5173
   ```

   `FIREBASE_SERVICE_ACCOUNT_PATH`, `GITHUB_CLIENT_SECRET`, and `GITHUB_PRIVATE_KEY_PATH` are backend-only values. Never prefix them with `VITE_` or commit their files.

   **Important:** Never use a `VITE_` prefix for the Groq key. Never commit `.env`, `.env.local`, or real credentials.

4. **Enable Google Authentication in Firebase**

   - Go to **Authentication** → **Sign-in method**
   - Enable **Google** as a sign-in provider
   - Allow `localhost` as an authorized domain during local development

5. **Configure the GitHub App (optional evidence integration)**

   - Install the `Resumetrics-evidence` GitHub App for the account or repositories you want to review.
   - Enable read access to repository contents, metadata, issues, and pull requests.
   - Set the GitHub App redirect URL to `http://localhost:5173/workspace` for this local setup.
   - Create a Cloud Firestore database in the Firebase project so connection metadata can be stored by Firebase UID.

6. **Start the development servers**

   ```bash
   npm run dev:all
   ```

   Or run them separately with `npm run dev` and `npm run server`.

   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📁 Project Structure

```text
resumetrics/
├── public/                    # Static public assets
├── server/                    # Private Express AI backend
│   ├── config/env.js          # Server environment configuration
│   ├── index.js               # Express entry point
│   ├── routes/                # AI, resume, and GitHub API routes
│   └── services/              # AI, Firebase Admin, GitHub, extraction, normalization
├── shared/roleAnalysis.js     # Shared deterministic skill comparison
├── src/
│   ├── assets/                # Images and static resources
│   ├── components/
│   │   ├── landing/           # Public landing-page sections and motion
│   │   ├── templates/         # Original resume template components
│   │   ├── ProtectedRoute.jsx # Authentication gate
│   │   ├── UserMenu.jsx       # Authenticated profile/dropdown
│   │   └── Resume*.jsx        # Import, review, and template flow
│   ├── config/                # Central template registry
│   ├── context/AuthContext.jsx# Firebase auth state and actions
│   ├── data/resumeData.js     # Blank and normalized resume data
│   ├── pages/                 # LandingPage.jsx and Login.jsx
│   ├── firebase.js            # Firebase SDK initialization
│   ├── main.jsx               # App entry point and routing
│   └── styles/                # Global, landing, and resume styles
├── .env.example               # Placeholder Firebase variables
├── server/.env.example        # Backend-only AI, Firebase Admin, and GitHub placeholders
├── .gitignore                 # Secrets and generated files
├── package.json               # Dependencies and scripts
├── vite.config.js             # Vite config and /api proxy
└── README.md                  # This file
```

---

## 🌐 Routes and API

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | Public | Landing page |
| `/login` | Public | Google authentication |
| `/workspace` | Authenticated | Main resume workspace |
| `/evaluation` | Authenticated | Evidence review |

The Vite development server proxies `/api` requests to the Express server at `http://localhost:8787`.

- `GET /api/ai/health` — confirms server AI configuration
- `POST /api/ai/test` — tests the AI abstraction
- `POST /api/resume/extract` — extracts structured data from resume text
- `POST /api/resume/analyze` — compares resume skills against a job description
- `POST /api/resume/rewrite-bullet` — returns an improved resume bullet
- `GET /api/github/connect` — starts an authenticated GitHub App connection
- `GET /api/github/callback` — handles the GitHub App callback
- `POST /api/github/complete-installation` — securely completes an installation-only callback
- `POST /api/github/complete-authorization` — securely completes an OAuth-on-install callback
- `GET /api/github/status` — verifies the stored installation is still available
- `GET /api/github/repos` — returns sanitized repositories for the current user
- `POST /api/github/evidence-analysis` — prepares GitHub evidence analysis for a structured resume
- `DELETE /api/github/disconnect` — removes the Resumetrics connection without uninstalling the GitHub App

AI errors are logged only on the server; the frontend receives safe user-facing messages. A deterministic matcher provides a local role-analysis fallback when AI is unavailable. GitHub credentials, JWTs, installation access tokens, and Firebase service-account data remain server-only; installation tokens are generated when needed and are not persisted.

---

## 📜 Available Scripts

### `npm run dev`

Starts the Vite development server with hot module replacement.

### `npm run server`

Starts the Express backend on port `8787`.

### `npm run dev:all`

Starts the frontend and backend together.

### `npm run build`

Creates an optimized production build in the `dist/` folder.

### `npm run preview`

Previews the production build locally.

---

## 🧩 Adding a Resume Template

1. Create a component in `src/components/templates/` that accepts the common `resumeData` object.
2. Add its metadata and component to `src/config/resumeTemplates.js`.
3. Add any template-specific styles to the resume styling files.
4. The selector and generated editor flow will discover it from the central registry.

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add some amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style and component structure
- Test authentication flows after auth-related changes
- Keep API keys in server environment files only
- Ensure responsive design works on mobile, tablet, and desktop
- Keep components modular and reusable
- Write meaningful commit messages

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Resume templates are original components inspired by modern design principles for technical roles
- Built with open-source tools from the React, Vite, Firebase, and Node.js communities
- Firebase for providing robust authentication infrastructure

---

## 📞 Support

If you encounter issues or have questions:

1. Check the Firebase setup and server environment variables
2. Open an issue in the [GitHub Issues](https://github.com/Van5hdeep/RESUMETRICS/issues) page
3. Review the browser and server console for error messages

---

**Made with ❤️ for job seekers who want their resumes to tell a data-driven story**
