const trimTrailingSlash = (value: string) => value.replace(/\/$/, '')

export const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? '')

export const getApiUrl = (path: string) => {
  if (!apiBaseUrl) {
    return path
  }
  return `${apiBaseUrl}${path}`
}

function getWsBaseUrl() {
  const configured = trimTrailingSlash(import.meta.env.VITE_WS_BASE_URL ?? '')
  if (configured) {
    return configured
  }

  if (apiBaseUrl) {
    return apiBaseUrl.startsWith('https://') ? apiBaseUrl.replace('https://', 'wss://') : apiBaseUrl.replace('http://', 'ws://')
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}`
}

export const getWsUrlForPath = (path: string) => `${getWsBaseUrl()}${path}`

export const getWsUrl = (jobId: string) => getWsUrlForPath(`/logs/${jobId}`)

export const getVoiceWsUrl = (jobId: string) => getWsUrlForPath(`/voice/logs/${jobId}`)
