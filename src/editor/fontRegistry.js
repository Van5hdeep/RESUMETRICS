export const resumeFonts = [
  { name: 'Inter', family: 'Inter, sans-serif', category: 'Sans serif', recommended: true, weights: [400, 500, 600, 700] },
  { name: 'DM Sans', family: 'DM Sans, sans-serif', category: 'Sans serif', recommended: true, weights: [400, 500, 700] },
  { name: 'Space Grotesk', family: 'Space Grotesk, sans-serif', category: 'Display', recommended: true, weights: [400, 500, 600, 700] },
  { name: 'Source Sans 3', family: 'Source Sans 3, sans-serif', category: 'Sans serif', recommended: true, weights: [400, 600, 700] },
  { name: 'Roboto', family: 'Roboto, sans-serif', category: 'Sans serif', recommended: true, weights: [400, 500, 700] },
  { name: 'Open Sans', family: 'Open Sans, sans-serif', category: 'Sans serif', recommended: true, weights: [400, 600, 700] },
  { name: 'Lato', family: 'Lato, sans-serif', category: 'Sans serif', recommended: true, weights: [400, 700] },
  { name: 'Manrope', family: 'Manrope, sans-serif', category: 'Sans serif', recommended: false, weights: [400, 500, 700] },
  { name: 'Nunito Sans', family: 'Nunito Sans, sans-serif', category: 'Sans serif', recommended: false, weights: [400, 600, 700] },
  { name: 'Montserrat', family: 'Montserrat, sans-serif', category: 'Sans serif', recommended: false, weights: [400, 500, 700] },
  { name: 'Poppins', family: 'Poppins, sans-serif', category: 'Sans serif', recommended: false, weights: [400, 500, 600, 700] },
  { name: 'Work Sans', family: 'Work Sans, sans-serif', category: 'Sans serif', recommended: false, weights: [400, 500, 700] },
  { name: 'Merriweather', family: 'Merriweather, serif', category: 'Serif', recommended: true, weights: [400, 700] },
  { name: 'Georgia', family: 'Georgia, serif', category: 'System serif', recommended: true, weights: [400, 700] },
  { name: 'Playfair Display', family: 'Playfair Display, serif', category: 'Display serif', recommended: false, weights: [400, 500, 700] },
  { name: 'Libre Baskerville', family: 'Libre Baskerville, serif', category: 'Serif', recommended: false, weights: [400, 700] },
  { name: 'IBM Plex Serif', family: 'IBM Plex Serif, serif', category: 'Serif', recommended: false, weights: [400, 600, 700] },
  { name: 'Roboto Slab', family: 'Roboto Slab, serif', category: 'Slab serif', recommended: false, weights: [400, 600, 700] },
  { name: 'Fira Code', family: 'Fira Code, monospace', category: 'Monospace', recommended: false, weights: [400, 500, 600] },
  { name: 'JetBrains Mono', family: 'JetBrains Mono, monospace', category: 'Monospace', recommended: false, weights: [400, 600] },
  { name: 'Arial', family: 'Arial, sans-serif', category: 'System sans', recommended: true, weights: [400, 700] },
  { name: 'Helvetica', family: 'Helvetica, sans-serif', category: 'System sans', recommended: false, weights: [400, 700] }
]

const loadedFonts = new Set()
export function loadResumeFont(font) {
  if (!font?.name || loadedFonts.has(font.name) || typeof document === 'undefined') return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${font.name.replace(/ /g, '+')}:wght@${font.weights.join(';')}&display=swap`
  document.head.appendChild(link)
  loadedFonts.add(font.name)
}
