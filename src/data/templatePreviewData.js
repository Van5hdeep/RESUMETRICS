const johnDoePhoto = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="%232f6fed"/><circle cx="48" cy="36" r="16" fill="%23dbeafe"/><path d="M19 82c4-17 15-25 29-25s25 8 29 25" fill="%23dbeafe"/><text x="48" y="92" text-anchor="middle" font-family="Arial" font-size="10" font-weight="700" fill="white">JD</text></svg>'

export const templatePreviewResumeData = {
  fullName: 'John Doe',
  headline: 'Product-minded software engineer',
  email: 'john.doe@email.com',
  phone: '+1 555 123 4567',
  location: 'New York, NY',
  photo: { source: johnDoePhoto, width: 62, height: 62, shape: 'circle', objectFit: 'cover' },
  links: [
    { label: 'linkedin.com/in/johndoe', url: 'linkedin.com/in/johndoe' },
    { label: 'github.com/johndoe', url: 'github.com/johndoe' }
  ],
  summary: 'Software engineer building reliable web products with React, Node.js, and cloud services.',
  experience: [
    { role: 'Software Engineer', company: 'Acme Technologies', location: 'New York, NY', startDate: '2023', endDate: 'Present', bullets: ['Built React and TypeScript features used by 20k customers.', 'Designed REST APIs and improved page performance by 35%.', 'Partnered with product and design to ship weekly releases.'] },
    { role: 'Software Engineering Intern', company: 'Tech Labs', location: 'Boston, MA', startDate: '2022', endDate: '2023', bullets: ['Created reusable UI components and API integrations.', 'Improved accessibility and resolved priority production bugs.'] }
  ],
  projects: [
    { name: 'AI Resume Analyzer', techStack: ['React', 'Node.js'], description: 'Evidence-led resume feedback for job seekers.', bullets: ['Implemented resume parsing and job-description matching.'] },
    { name: 'Developer Dashboard', techStack: ['TypeScript'], description: 'Responsive analytics dashboard for engineering teams.', bullets: ['Integrated external APIs and authentication.'] }
  ],
  education: [{ degree: 'B.S. Computer Science', institution: 'University of Technology', location: 'Boston, MA', startDate: '2020', endDate: '2024', details: ['Dean’s List · 3.8 GPA'] }],
  skills: { languages: ['JavaScript', 'TypeScript', 'Python', 'SQL'], frameworks: ['React', 'Node.js'], tools: ['Git', 'REST APIs'], databases: ['Cloud Computing'], softSkills: [], other: [] },
  certifications: ['AWS Cloud Practitioner'],
  achievements: [],
  missingFields: [],
  confidenceNotes: []
}
