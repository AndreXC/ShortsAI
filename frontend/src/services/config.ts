const trimTrailingSlash = (value: string) => value.replace(/\/$/, '')

export const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? '')

export const getApiUrl = (path: string) => {
  if (!apiBaseUrl) {
    return path
  }
  return `${apiBaseUrl}${path}`
}

export const getWsUrl = (jobId: string) => {
  const configured = trimTrailingSlash(import.meta.env.VITE_WS_BASE_URL ?? '')
  if (configured) {
    return `${configured}/logs/${jobId}`
  }

  if (apiBaseUrl) {
    const wsBase = apiBaseUrl.startsWith('https://')
      ? apiBaseUrl.replace('https://', 'wss://')
      : apiBaseUrl.replace('http://', 'ws://')
    return `${wsBase}/logs/${jobId}`
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/logs/${jobId}`
}
