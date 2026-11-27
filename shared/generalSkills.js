// Skills outside software: office and administration, languages, sales, HR, finance, operations and service work.
// The tech dictionary (shared/roleAnalysis.js) stays as it is, because the fact check and the GitHub evidence scan use
// it; this one is read only where job posts and resumes are matched: shared/jdExtract.js and textHasTerm in
// shared/jdScoring.js. Each skill lists the ways people write it, so "Calendar management" in a post is met by
// "managed the MD's calendar" on a resume. Patterns stay specific: a bare "word" is never MS Word.
const definitions = [
  // Office software
  ['MS Office', [/\bms[\s-]?office\b/i, /\bmicrosoft office\b/i, /\b(?:microsoft|office)\s?365\b/i]],
  ['MS Word', [/\bms[\s-]?word\b/i, /\bmicrosoft word\b/i]],
  ['PowerPoint', [/\bpower\s?point\b/i, /\bms[\s-]?ppt\b/i]],
  ['Outlook', [/\b(?:ms|microsoft)\s+outlook\b/i]],
  ['Google Workspace', [/\bgoogle workspace\b/i, /\bg[\s-]?suite\b/i, /\bgoogle (?:docs|sheets|slides|calendar|drive)\b/i]],
  ['Typing', [/\btyping\b/i]],
  // Administration and personal assistance
  ['Calendar management', [/\bcalendar management\b/i, /\bdiary management\b/i, /\bmanag\w*\s+(?:the\s+|his\s+|her\s+|their\s+|an?\s+)?(?:[\w’'-]+\s+){0,2}(?:calendars?|diar(?:y|ies))\b/i, /\b(?:calendars?|diar(?:y|ies))\s+(?:for|of)\s+(?:the\s+)?\w+/i, /\bschedul\w*\s+(?:\d+\s+)?(?:\w+\s+)?(?:meetings|appointments)\b/i]],
  ['Travel arrangements', [/\btravel\s+(?:arrangements?|bookings?|planning|management|coordination|desk)\b/i, /\b(?:arrang|book|plan|coordinat|organi[sz])\w*\s+(?:[\w-]+\s+){0,3}travel\b/i, /\bitinerar(?:y|ies)\b/i]],
  ['Minutes of meeting', [/\bminutes of (?:the\s+)?(?:\w+\s+)?meetings?\b/i, /\bmeeting minutes\b/i, /\b(?:took|take|taking|recorded|record)\s+(?:the\s+)?minutes\b/i, /\bminute[\s-]taking\b/i]],
  ['Correspondence', [/\bcorrespondence\b/i, /\bdraft\w*\s+(?:\w+\s+)?(?:letters|emails)\b/i]],
  ['Phone handling', [/\bphone calls?\b/i, /\btelephone (?:handling|calls?)\b/i, /\bcall handling\b/i]],
  ['Data entry', [/\bdata entry\b/i]],
  ['Record keeping', [/\brecord[\s-]?keeping\b/i, /\bdocument (?:management|control)\b/i, /\bfil(?:ing|ed)\s+(?:and\s+)?(?:\w+\s+)?(?:documents|records|files)\b/i]],
  ['Office administration', [/\boffice (?:administration|management)\b/i]],
  ['Front desk', [/\bfront[\s-]?(?:desk|office)\b/i, /\breception(?:ist)?\b/i]],
  ['Event coordination', [/\bevent (?:coordination|management|planning|organi[sz]ation)\b/i, /\b(?:organi[sz]|coordinat|plann?)\w*\s+(?:[\w-]+\s+){0,3}events?\b/i]],
  ['Vendor management', [/\bvendor (?:management|coordination|relations)\b/i, /\bcoordinat\w*\s+with\s+(?:\w+\s+){0,2}vendors\b/i]],
  ['Expense tracking', [/\bexpense(?:s)?\s+(?:tracking|management|reports?|claims)\b/i, /\btrack\w*\s+(?:\w+\s+)?expenses\b/i, /\bpetty cash\b/i]],
  ['Confidentiality', [/\bconfidential(?:ity)?\b/i, /\bdiscretion\b/i]],
  // Finance and accounting
  ['Tally', [/\btally(?:\s*(?:erp|prime))?\b/i]],
  ['Bookkeeping', [/\bbook[\s-]?keeping\b/i]],
  ['Accounting', [/\baccounting\b/i]],
  ['GST', [/\bgst\b/i]],
  ['Accounts payable', [/\baccounts payable\b/i]],
  ['Accounts receivable', [/\baccounts receivable\b/i]],
  ['Payroll', [/\bpayroll\b/i]],
  ['Billing', [/\bbilling\b/i, /\binvoic(?:e|es|ing)\b/i]],
  ['Cash handling', [/\bcash handling\b/i, /\bhandl\w*\s+(?:\w+\s+)?cash\b/i]],
  // Sales, marketing and service
  ['Sales', [/\bsales\b/i]],
  ['Lead generation', [/\blead generation\b/i]],
  ['CRM', [/\bcrm\b/i, /\bsalesforce\b/i, /\bhubspot\b/i, /\bzoho crm\b/i]],
  ['Digital marketing', [/\bdigital marketing\b/i]],
  ['SEO', [/\bseo\b/i, /\bsearch engine optimi[sz]ation\b/i]],
  ['Social media', [/\bsocial media\b/i]],
  ['Content writing', [/\bcontent writing\b/i, /\bcopywriting\b/i]],
  ['Customer service', [/\bcustomer (?:service|support|care)\b/i]],
  ['Complaint handling', [/\bcomplaint(?:s)? (?:handling|resolution|management)\b/i, /\bhandl\w*\s+(?:\w+\s+)?complaints\b/i]],
  // HR and operations
  ['Recruitment', [/\brecruit(?:ment|ing)\b/i, /\btalent acquisition\b/i]],
  ['Onboarding', [/\bonboarding\b/i]],
  ['Inventory management', [/\binventory (?:management|control)\b/i, /\bstock (?:management|control)\b/i]],
  ['Procurement', [/\bprocurement\b/i, /\bpurchas(?:e|ing) orders?\b/i]],
  ['Logistics', [/\blogistics\b/i]],
  ['Supply chain', [/\bsupply chain\b/i]],
  ['SAP', [/\bsap\b/i]],
  ['Point of sale', [/\bpoint of sale\b/i, /\bpos\s+(?:system|software|terminal)s?\b/i]],
  ['Quality control', [/\bquality (?:control|assurance|checks?)\b/i]],
  ['Driving licence', [/\bdriving licen[cs]e\b/i]],
  // Languages
  ...['English', 'Hindi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Punjabi', 'Urdu', 'Odia', 'French', 'German', 'Spanish', 'Arabic', 'Japanese', 'Mandarin']
    .map(language => [language, [new RegExp(`\\b${language}\\b`, 'i')]])
]

/** Every general skill named in the text, in dictionary order. */
export function generalSkillsIn(text) {
  const source = String(text ?? '')
  if (!source) return []
  return definitions.filter(([, patterns]) => patterns.some(pattern => pattern.test(source))).map(([label]) => label)
}

/** True when the label is one of these skills (any case). */
export const isGeneralSkill = label => definitions.some(([name]) => name.toLowerCase() === String(label ?? '').trim().toLowerCase())
