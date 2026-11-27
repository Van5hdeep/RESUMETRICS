import mammoth from 'mammoth/mammoth.browser.js'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
// Bundled through Vite's worker pipeline so it ships as a .js file: some hosts serve
// .mjs as application/octet-stream, which browsers refuse to run as a module.
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MIN_READABLE_PDF_CHARACTERS = 24

function cleanExtractedText(value) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function createMetadata({ file, fileType, pages, warnings = [], errors = [] }) {
  const rawText = pages.map(page => page.text).join('\n\n')
  const unreadablePages = pages.filter(page => !page.text.trim()).map(page => page.pageNumber)
  const allWarnings = [
    ...warnings,
    ...(unreadablePages.length ? [`No selectable text was found on page${unreadablePages.length === 1 ? '' : 's'} ${unreadablePages.join(', ')}. OCR may be required for those pages.`] : [])
  ]

  return {
    fileName: file.name,
    fileType,
    totalPages: pages.length || null,
    pagesProcessed: pages.length,
    rawCharCount: rawText.length,
    normalizedCharCount: cleanExtractedText(rawText).length,
    extractedSections: [],
    warnings: allWarnings,
    errors,
    isCompleteParse: unreadablePages.length === 0 && errors.length === 0
  }
}

function pageTextFromPdfItems(items) {
  const lines = []
  let line = ''

  for (const item of items) {
    if (typeof item.str !== 'string' || !item.str) continue
    const value = item.str.replace(/\u0000/g, '')
    if (!value) continue
    const needsSpace = line && !/[\s-]$/.test(line) && !/^[,.;:!?%\])}]/.test(value)
    line += `${needsSpace ? ' ' : ''}${value}`
    if (item.hasEOL) {
      lines.push(line)
      line = ''
    }
  }

  if (line) lines.push(line)
  return cleanExtractedText(lines.join('\n'))
}

const MAX_DOCUMENT_LINKS = 60
const supportedLinkPattern = /^(https?:|mailto:|tel:)/i

function addLink(links, url, text, pageNumber) {
  const cleanUrl = String(url ?? '').trim()
  if (!supportedLinkPattern.test(cleanUrl) || links.length >= MAX_DOCUMENT_LINKS) return
  const key = cleanUrl.toLocaleLowerCase()
  if (links.some(link => link.url.toLocaleLowerCase() === key)) return
  links.push({ url: cleanUrl, text: cleanExtractedText(text).slice(0, 160), pageNumber })
}

// A PDF stores hyperlinks as annotations with a clickable rectangle; the visible text inside that
// rectangle tells us what the link was labelled as on the page (for example "GitHub" or a project name).
function anchorTextForRect(items, rect) {
  const [left, bottom, right, top] = [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])]
  return items
    .filter(item => typeof item.str === 'string' && item.str.trim() && Array.isArray(item.transform))
    .filter(item => {
      const fontHeight = Math.abs(item.transform[3]) || item.height || 0
      const centerX = item.transform[4] + (item.width || 0) / 2
      const centerY = item.transform[5] + fontHeight / 3
      return centerX >= left - 2 && centerX <= right + 2 && centerY >= bottom - 2 && centerY <= top + 2
    })
    .map(item => item.str)
    .join(' ')
}

async function extractPdfDocument(file) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const documentProxy = await loadingTask.promise
    const pages = []
    const links = []
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push({ pageNumber, text: pageTextFromPdfItems(content.items) })
      try {
        const annotations = await page.getAnnotations({ intent: 'display' })
        for (const annotation of annotations) {
          if (annotation.subtype !== 'Link') continue
          const url = annotation.url || annotation.unsafeUrl
          if (url) addLink(links, url, anchorTextForRect(content.items, annotation.rect ?? []), pageNumber)
        }
      } catch {
        // Hyperlinks are optional; a page whose annotations cannot be read still contributes its text.
      }
    }

    const rawText = pages.map(page => page.text).join('\n\n')
    if (cleanExtractedText(rawText).length < MIN_READABLE_PDF_CHARACTERS) {
      throw new Error('This PDF appears to be scanned or does not contain enough selectable text. Please upload a text-based PDF or use OCR first.')
    }

    return { rawText, pages, links, metadata: createMetadata({ file, fileType: 'pdf', pages }) }
  } catch (error) {
    if (error?.name === 'PasswordException') throw new Error('This PDF is password-protected. Please upload an unlocked copy.')
    throw error
  } finally {
    await loadingTask.destroy?.()
  }
}

function inlineText(element) {
  const text = element.textContent?.replace(/\s+/g, ' ').trim() || ''
  const urls = [...element.querySelectorAll?.('a[href]') ?? []]
    .map(link => link.getAttribute('href')?.trim())
    .filter(url => url && !text.includes(url))
  return [text, ...urls].filter(Boolean).join(' ')
}

function htmlToStructuredText(html) {
  const documentFragment = new DOMParser().parseFromString(html, 'text/html')
  const lines = []
  const append = value => {
    const cleaned = cleanExtractedText(value)
    if (cleaned) lines.push(cleaned)
  }
  const visit = element => {
    if (!(element instanceof Element)) return
    const tag = element.tagName.toLowerCase()
    if (tag === 'table') {
      for (const row of element.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')) {
        const cells = [...row.querySelectorAll(':scope > th, :scope > td')].map(inlineText).filter(Boolean)
        if (cells.length) append(cells.join(' | '))
      }
      return
    }
    if (tag === 'li') {
      append(`• ${inlineText(element)}`)
      return
    }
    if (/^(p|h[1-6]|div|blockquote)$/.test(tag)) {
      const directChildBlocks = [...element.children].some(child => /^(p|h[1-6]|div|ul|ol|table|blockquote)$/.test(child.tagName.toLowerCase()))
      if (!directChildBlocks) append(inlineText(element))
      else [...element.children].forEach(visit)
      return
    }
    if (/^(ul|ol|section|article|main|body)$/.test(tag)) {
      [...element.children].forEach(visit)
    }
  }

  [...documentFragment.body.children].forEach(visit)
  return cleanExtractedText(lines.join('\n'))
}

async function extractDocxDocument(file) {
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  const text = htmlToStructuredText(result.value)
  if (!text) throw new Error('This DOCX file does not contain readable text.')
  const warnings = result.messages
    .filter(message => message.type === 'warning')
    .map(message => message.message)
    .slice(0, 6)
  const links = []
  for (const anchor of new DOMParser().parseFromString(result.value, 'text/html').querySelectorAll('a[href]')) {
    addLink(links, anchor.getAttribute('href'), anchor.textContent, 1)
  }
  const pages = [{ pageNumber: 1, text }]
  return { rawText: text, pages, links, metadata: createMetadata({ file, fileType: 'docx', pages, warnings }) }
}

async function extractTextDocument(file) {
  const rawText = cleanExtractedText(await file.text())
  if (!rawText) throw new Error('This text file does not contain readable content.')
  const pages = rawText.split(/\f+/).map((text, index) => ({ pageNumber: index + 1, text: cleanExtractedText(text) }))
  return { rawText, pages, links: [], metadata: createMetadata({ file, fileType: 'txt', pages }) }
}

export async function extractResumeDocument(file) {
  const fileName = file.name.toLowerCase()
  if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) return extractPdfDocument(file)
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) return extractDocxDocument(file)
  if (file.type === 'text/plain' || fileName.endsWith('.txt')) return extractTextDocument(file)
  throw new Error('Could not read this file. Try a text-based PDF, DOCX, or TXT file.')
}
