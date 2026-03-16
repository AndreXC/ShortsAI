import { useEffect, useMemo, useState } from 'react'

import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { ToastViewport } from '@/components/ToastViewport'
import { readVoiceSettings, writeVoiceSettings } from '@/lib/voice-storage'
import { GeneratorPage } from '@/pages/GeneratorPage'
import { VoiceGeneratorPage } from '@/pages/VoiceGeneratorPage'
import { useJobStore } from '@/store/jobStore'
import { defaultAudioSettings, defaultSettings } from '@/types/defaults'
import type { AudioGenerationSettings, GenerationSettings } from '@/types/job'

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
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false)
  const [voiceSettings, setVoiceSettings] = useState<AudioGenerationSettings>(() => readVoiceSettings())
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [mode, setMode] = useState<AppMode>('video')
  const [showLogsScreen, setShowLogsScreen] = useState(false)
  const [showGeneratedShortsScreen, setShowGeneratedShortsScreen] = useState(false)
  const [showGeneratedAudiosScreen, setShowGeneratedAudiosScreen] = useState(false)

  const logsLength = useJobStore((state) => state.logs.length)
  const hasJob = useJobStore((state) => Boolean(state.jobId))

  const canOpenLogs = useMemo(() => logsLength > 0 || hasJob, [hasJob, logsLength])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('shorts-theme', theme)
  }, [theme])

  useEffect(() => {
    writeVoiceSettings(voiceSettings)
  }, [voiceSettings])

  const onSettingChange = <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const onVoiceSettingChange = <K extends keyof AudioGenerationSettings>(key: K, value: AudioGenerationSettings[K]) => {
    setVoiceSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <main className='relative min-h-screen text-foreground'>
      <Header
        theme={theme}
        mode={mode}
        onChangeMode={setMode}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onOpenSettings={() => {
          if (mode === 'video') {
            setSettingsOpen(true)
            return
          }
          setVoiceSettingsOpen(true)
        }}
        onOpenShorts={() => {
          setShowLogsScreen(false)
          setShowGeneratedShortsScreen(true)
        }}
        onOpenAudios={() => {
          setShowGeneratedAudiosScreen(true)
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
        <VoiceGeneratorPage
          settings={voiceSettings}
          settingsOpen={voiceSettingsOpen}
          onSettingsOpenChange={setVoiceSettingsOpen}
          onSettingChange={onVoiceSettingChange}
          onResetSettings={() => setVoiceSettings(defaultAudioSettings)}
          showGeneratedAudiosScreen={showGeneratedAudiosScreen}
          onShowGeneratedAudiosScreenChange={setShowGeneratedAudiosScreen}
        />
      )}

      <Footer />
      <ToastViewport />
    </main>
  )
}

export default App
