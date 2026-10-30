/** Saves text as a file through the browser's normal download. */
export function downloadText(filename: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked later so the download has time to start.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
