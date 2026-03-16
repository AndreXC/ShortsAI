import { useEffect, useMemo, useState } from 'react'

import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { ToastViewport } from '@/components/ToastViewport'
import { GeneratorPage } from '@/pages/GeneratorPage'
import { VoiceGeneratorPage } from '@/pages/VoiceGeneratorPage'
import { useJobStore } from '@/store/jobStore'
import { defaultSettings } from '@/types/defaults'
import type { GenerationSettings } from '@/types/job'

type ThemeMode = 'light' | 'dark'
type AppMode = 'video' | 'voice'

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const persisted = window.localStorage.getItem('shorts-theme')
  if (persisted === 'light' || persisted === 'dark') {
    return persisted
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<GenerationSettings>(defaultSettings)
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [mode, setMode] = useState<AppMode>('video')
  const [showLogsScreen, setShowLogsScreen] = useState(false)
  const [showGeneratedShortsScreen, setShowGeneratedShortsScreen] = useState(false)

  const logsLength = useJobStore((state) => state.logs.length)
  const hasJob = useJobStore((state) => Boolean(state.jobId))

  const canOpenLogs = useMemo(() => logsLength > 0 || hasJob, [hasJob, logsLength])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('shorts-theme', theme)
  }, [theme])

  const onSettingChange = <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <main className='relative min-h-screen text-foreground'>
      <Header
        theme={theme}
        mode={mode}
        onChangeMode={setMode}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShorts={() => {
          setShowLogsScreen(false)
          setShowGeneratedShortsScreen(true)
        }}
        onOpenLogs={() => {
          setShowGeneratedShortsScreen(false)
          setShowLogsScreen(true)
        }}
        canOpenLogs={canOpenLogs}
      />

      {mode === 'video' ? (
        <GeneratorPage
          settings={settings}
          settingsOpen={settingsOpen}
          onSettingChange={onSettingChange}
          onSettingsOpenChange={setSettingsOpen}
          onResetSettings={() => setSettings(defaultSettings)}
          showLogsScreen={showLogsScreen}
          onShowLogsScreenChange={setShowLogsScreen}
          showGeneratedShortsScreen={showGeneratedShortsScreen}
          onShowGeneratedShortsScreenChange={setShowGeneratedShortsScreen}
        />
      ) : (
        <VoiceGeneratorPage />
      )}

      <Footer />
      <ToastViewport />
    </main>
  )
}

export default App
