export default function LandingIcon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  const paths = {
    shield: <><path d="M12 3 19 6v5c0 4.5-3 7.8-7 10-4-2.2-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    spark: <><path d="m12 3 1.2 4.4L17.5 9l-4.3 1.6L12 15l-1.2-4.4L6.5 9l4.3-1.6L12 3Z" /><path d="m19 15 .6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15Z" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    doc: <><path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4M9.5 12h6M9.5 15.5h6M9.5 8.5h2.5" /></>,
    stack: <><rect x="4" y="3.5" width="16" height="5" rx="1.5" /><rect x="4" y="10" width="16" height="5" rx="1.5" /><rect x="4" y="16.5" width="16" height="4" rx="1.5" /><path d="M7.5 6h5M7.5 12.5h3M7.5 18.5h4" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h10" />,
    instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r=".6" fill="currentColor" /></>,
    x: <path d="M4 4h4.3L20 20h-4.3L4 4Zm15.3 0-6.1 7M10.6 13.2 4.7 20" />,
    facebook: <path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8.8v3h2.6V21" />
  }
  return <svg {...common}>{paths[name] || paths.spark}</svg>
}
