import ClassicProfessionalTemplate from '../components/templates/ClassicProfessionalTemplate.jsx'
import ModernMinimalTemplate from '../components/templates/ModernMinimalTemplate.jsx'
import TechFocusedTemplate from '../components/templates/TechFocusedTemplate.jsx'
import CompactATSTemplate from '../components/templates/CompactATSTemplate.jsx'
import ExecutiveBriefTemplate from '../components/templates/ExecutiveBriefTemplate.jsx'
import SkillsFirstTemplate from '../components/templates/SkillsFirstTemplate.jsx'
import CareerTransitionTemplate from '../components/templates/CareerTransitionTemplate.jsx'
import AcademicStandardTemplate from '../components/templates/AcademicStandardTemplate.jsx'
import HarvardTraditionalTemplate from '../components/templates/HarvardTraditionalTemplate.jsx'
import ProductStartupTemplate from '../components/templates/ProductStartupTemplate.jsx'
import AzurillTemplate from '../components/templates/AzurillTemplate.jsx'
import BronzorTemplate from '../components/templates/BronzorTemplate.jsx'
import ChikoritaTemplate from '../components/templates/ChikoritaTemplate.jsx'
import DittoTemplate from '../components/templates/DittoTemplate.jsx'
import {
  DitgarTemplate,
  GengarTemplate,
  GlalieTemplate,
  KakunaTemplate,
  LaprasTemplate,
  LeafishTemplate,
  MeowthTemplate,
  OnyxTemplate,
  PikachuTemplate,
  RhyhornTemplate,
  ScizorTemplate,
} from '../components/templates/ReactiveTemplate.jsx'
import { reactiveResumeTemplateIds, reactiveResumeReference } from './reactiveResumeReference.js'

const supportedFeatures = Object.freeze([
  'personal-information', 'summary', 'experience', 'education', 'projects',
  'skills', 'certifications', 'achievements', 'links'
])

const defineTemplate = definition => Object.freeze({
  atsFriendly: true,
  supportedFeatures,
  defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#243b5a', fontFamily: 'Arial, Helvetica, sans-serif' },
  source: reactiveResumeTemplateIds.includes(definition.id) ? reactiveResumeReference : 'Resumetrics',
  ...definition
})

export const resumeTemplates = [
  defineTemplate({ id: 'azurill', name: 'Azurill', description: 'Colorful editorial sidebar with a compact identity band and skills rail.', category: 'Reactive Resume', atsFriendly: false, component: AzurillTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#2678a4', fontFamily: 'DM Sans, sans-serif' }, supportsPhoto: true, supportsSidebar: true }),
  defineTemplate({ id: 'bronzor', name: 'Bronzor', description: 'Dark ink sidebar, high-contrast serif headings, and structured two-column flow.', category: 'Reactive Resume', atsFriendly: false, component: BronzorTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#c7a96b', fontFamily: 'Georgia, Times New Roman, serif' }, supportsPhoto: true, supportsSidebar: true, supportsTwoColumn: true }),
  defineTemplate({ id: 'chikorita', name: 'Chikorita', description: 'Leaf-green profile header with rounded skill chips and airy section rhythm.', category: 'Reactive Resume', component: ChikoritaTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#5f9f70', fontFamily: 'DM Sans, sans-serif' }, supportsPhoto: true }),
  defineTemplate({ id: 'ditto', name: 'Ditto', description: 'Playful lavender and coral split layout with framed project and contact blocks.', category: 'Reactive Resume', atsFriendly: false, component: DittoTemplate, defaultTheme: { pageSize: 'A4', spacing: 'compact', accentColor: '#9d5b9f', fontFamily: 'Space Grotesk, sans-serif' }, supportsPhoto: true, supportsSidebar: true, supportsTwoColumn: true }),
  defineTemplate({ id: 'ditgar', name: 'Ditgar', description: 'Editorial split header with compact timeline entries and a confident accent rail.', category: 'Reactive Resume', atsFriendly: false, component: DitgarTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#8b5cf6', fontFamily: 'DM Sans, sans-serif' }, supportsPhoto: true, supportsSidebar: true }),
  defineTemplate({ id: 'gengar', name: 'Gengar', description: 'Midnight purple profile band with luminous section rules and a dense skills rail.', category: 'Reactive Resume', atsFriendly: false, component: GengarTemplate, defaultTheme: { pageSize: 'A4', spacing: 'compact', accentColor: '#7c3aed', fontFamily: 'Space Grotesk, sans-serif' }, supportsPhoto: true, supportsSidebar: true }),
  defineTemplate({ id: 'glalie', name: 'Glalie', description: 'Cool ice-blue sidebar and crisp geometric content blocks for technical profiles.', category: 'Reactive Resume', atsFriendly: false, component: GlalieTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#2b78b8', fontFamily: 'Inter, sans-serif' }, supportsPhoto: true, supportsSidebar: true }),
  defineTemplate({ id: 'kakuna', name: 'Kakuna', description: 'Warm ochre timeline with narrow labels and a deliberately structured reading flow.', category: 'Reactive Resume', atsFriendly: false, component: KakunaTemplate, defaultTheme: { pageSize: 'A4', spacing: 'compact', accentColor: '#b7791f', fontFamily: 'Source Sans 3, sans-serif' } }),
  defineTemplate({ id: 'lapras', name: 'Lapras', description: 'Ocean-blue top identity block with generous whitespace and rounded evidence cards.', category: 'Reactive Resume', atsFriendly: false, component: LaprasTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#147d92', fontFamily: 'Nunito Sans, sans-serif' }, supportsPhoto: true }),
  defineTemplate({ id: 'leafish', name: 'Leafish', description: 'Botanical green split layout with soft cards and a friendly profile presentation.', category: 'Reactive Resume', atsFriendly: false, component: LeafishTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#2f855a', fontFamily: 'Lato, sans-serif' }, supportsPhoto: true, supportsSidebar: true }),
  defineTemplate({ id: 'meowth', name: 'Meowth', description: 'Cream and copper editorial layout with pill labels and clear content grouping.', category: 'Reactive Resume', atsFriendly: false, component: MeowthTemplate, defaultTheme: { pageSize: 'A4', spacing: 'compact', accentColor: '#c05621', fontFamily: 'Merriweather Sans, sans-serif' }, supportsPhoto: true }),
  defineTemplate({ id: 'onyx', name: 'Onyx', description: 'Monochrome full-width layout with a strong black identity bar and measured hierarchy.', category: 'Reactive Resume', atsFriendly: false, component: OnyxTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#20242c', fontFamily: 'IBM Plex Sans, sans-serif' }, supportsPhoto: true }),
  defineTemplate({ id: 'pikachu', name: 'Pikachu', description: 'Bright yellow accent system with bold labels and a compact, energetic flow.', category: 'Reactive Resume', atsFriendly: false, component: PikachuTemplate, defaultTheme: { pageSize: 'A4', spacing: 'compact', accentColor: '#d69e2e', fontFamily: 'Poppins, sans-serif' }, supportsPhoto: true }),
  defineTemplate({ id: 'rhyhorn', name: 'Rhyhorn', description: 'Earthy rust timeline with strong date alignment and framed impact statements.', category: 'Reactive Resume', atsFriendly: false, component: RhyhornTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#b45309', fontFamily: 'Roboto Slab, serif' } }),
  defineTemplate({ id: 'scizor', name: 'Scizor', description: 'Sharp red sidebar, angular rules, and high-contrast typography for decisive profiles.', category: 'Reactive Resume', atsFriendly: false, component: ScizorTemplate, defaultTheme: { pageSize: 'A4', spacing: 'compact', accentColor: '#c53030', fontFamily: 'Roboto, sans-serif' }, supportsPhoto: true, supportsSidebar: true }),
  defineTemplate({ id: 'classic-professional', name: 'Classic Professional', description: 'Reverse-chronological, single-column structure for conventional applications.', category: 'ATS / Standard', component: ClassicProfessionalTemplate }),
  defineTemplate({ id: 'harvard-traditional', name: 'Harvard Traditional', description: 'Conservative serif hierarchy, centered identity, and clear academic-style rules.', category: 'Harvard / traditional', component: HarvardTraditionalTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#111827', fontFamily: 'Georgia, Times New Roman, serif' } }),
  defineTemplate({ id: 'modern-minimal', name: 'Modern Minimal', description: 'Skills-forward hybrid with restrained hierarchy and standard headings.', category: 'Modern professional', component: ModernMinimalTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#247464', fontFamily: 'Arial, Helvetica, sans-serif' } }),
  defineTemplate({ id: 'tech-focused', name: 'Tech Focused', description: 'Projects and technical skills appear before experience for technical roles.', category: 'Software engineering', component: TechFocusedTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#315eb8', fontFamily: 'Arial, Helvetica, sans-serif' } }),
  defineTemplate({ id: 'compact-ats', name: 'Compact ATS', description: 'Dense, readable chronological layout for high-signal applications.', category: 'Compact', component: CompactATSTemplate, defaultTheme: { pageSize: 'A4', spacing: 'compact', accentColor: '#27334a', fontFamily: 'Arial, Helvetica, sans-serif' } }),
  defineTemplate({ id: 'executive-brief', name: 'Executive Brief', description: 'Impact-led experience structure with education and credentials close behind.', category: 'Executive', component: ExecutiveBriefTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#27334a', fontFamily: 'Georgia, Times New Roman, serif' } }),
  defineTemplate({ id: 'skills-first', name: 'Skills First', description: 'Functional-hybrid layout that foregrounds validated capabilities before history.', category: 'Functional hybrid', component: SkillsFirstTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#4d3fb8', fontFamily: 'Arial, Helvetica, sans-serif' } }),
  defineTemplate({ id: 'career-transition', name: 'Career Transition', description: 'Transferable skills and education lead before experience for a focused pivot.', category: 'Career change', component: CareerTransitionTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#7b5127', fontFamily: 'Arial, Helvetica, sans-serif' } }),
  defineTemplate({ id: 'academic-standard', name: 'Academic Standard', description: 'Education-forward, single-column structure for students and early-career roles.', category: 'Academic', component: AcademicStandardTemplate, defaultTheme: { pageSize: 'A4', spacing: 'comfortable', accentColor: '#36566f', fontFamily: 'Georgia, Times New Roman, serif' } }),
  defineTemplate({ id: 'product-startup', name: 'Product & Startup', description: 'A balanced two-column layout that keeps supporting evidence beside product impact.', category: 'Two-column / product', atsFriendly: false, component: ProductStartupTemplate, defaultTheme: { pageSize: 'A4', spacing: 'compact', accentColor: '#166b79', fontFamily: 'Arial, Helvetica, sans-serif' } })
]

export const getResumeTemplate = templateId => resumeTemplates.find(template => template.id === templateId)

export const createResumePresentation = (templateId = null) => ({
  template: templateId,
  accentColor: null,
  fontFamily: null,
  density: null,
  spacing: null,
  pageSize: 'A4'
})
