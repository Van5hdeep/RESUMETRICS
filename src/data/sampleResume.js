// A fictional candidate shown on the landing page (the resume its hero writes) and in the landing-page
// screenshots (scripts/landing-shots). Same shape as templatePreviewData.js.
export const landingResumeData = {
  fullName: 'Aarav Mehta',
  headline: 'Full Stack Developer | React, Node.js',
  email: 'aarav.mehta@example.com',
  phone: '+91 98765 43210',
  location: 'Pune, Maharashtra',
  links: [
    // Placeholder handles on the reserved .example domain, so the sample never points at a real person's profile.
    { label: 'linkedin.example/aarav-mehta', url: 'linkedin.example/aarav-mehta' },
    { label: 'github.example/aarav-mehta', url: 'github.example/aarav-mehta' }
  ],
  summary: 'Full stack developer who ships product features end to end, from data model to polished UI. Built a real-time analytics dashboard used by 12,000 people every week and cut page load time by 38% on a high-traffic storefront. Comfortable owning features across React, Node.js and PostgreSQL.',
  experience: [
    {
      company: 'Northwind Labs', role: 'Software Engineer', location: 'Pune, Maharashtra', startDate: 'Jul 2024', endDate: 'Present',
      bullets: [
        'Built a real-time analytics dashboard in React and Node.js used by 12,000 weekly users.',
        'Rewrote the billing service with typed APIs, cutting payment errors by 61%.',
        'Mentored two interns through their first production launches.'
      ]
    },
    {
      company: 'Brightpath Retail', role: 'Frontend Developer Intern', location: 'Bengaluru, Karnataka', startDate: 'Jan 2024', endDate: 'Jun 2024',
      bullets: [
        'Shipped an accessible component library used across 40 storefront screens.',
        'Reduced the main bundle by 24% with route-level code splitting.'
      ]
    },
    {
      company: 'Freelance', role: 'Web Developer', location: 'Pune, Maharashtra', startDate: 'Jun 2022', endDate: 'Dec 2023',
      bullets: [
        'Built and launched websites for 9 local businesses, from first brief to deployment.',
        'Set up analytics and search basics that doubled enquiries for a dental clinic in three months.'
      ]
    }
  ],
  projects: [
    {
      name: 'ShelfSense', techStack: ['React', 'Express.js', 'MongoDB', 'Docker'],
      description: 'Inventory tracker for small shops with low-stock alerts.',
      bullets: ['Added barcode scanning and daily stock reports for 30 pilot stores.']
    },
    {
      name: 'CampusRide', techStack: ['Next.js', 'Node.js', 'PostgreSQL'],
      description: 'Ride-sharing board for college students.',
      bullets: ['Matched 1,800 rides in the first semester with route-based suggestions.']
    },
    {
      name: 'StudyCircle', techStack: ['React Native', 'Firebase'],
      description: 'Shared notes and doubt-solving app for classmates.',
      bullets: ['Grew to 600 weekly users across three colleges in one term.']
    }
  ],
  education: [
    {
      institution: 'Savitribai Phule Pune University', degree: 'B.E. in Computer Engineering', location: 'Pune, Maharashtra',
      startDate: '2020', endDate: '2024', details: ['CGPA: 8.7/10', 'Coursework: Data Structures, Databases, Operating Systems, Computer Networks']
    }
  ],
  skills: {
    languages: ['JavaScript', 'TypeScript', 'Python', 'SQL'],
    frontend: ['React', 'Next.js', 'HTML', 'CSS', 'Tailwind CSS'],
    backend: ['Node.js', 'Express.js', 'REST APIs'],
    databases: ['PostgreSQL', 'MongoDB', 'Redis'],
    tools: ['Git', 'Docker', 'AWS', 'Figma']
  },
  certifications: ['AWS Certified Cloud Practitioner', 'Meta Front-End Developer Certificate'],
  achievements: ['Winner, Smart India Hackathon 2023 (software edition)', 'Speaker, React Pune meetup, 2025'],
  missingFields: [],
  confidenceNotes: []
}

