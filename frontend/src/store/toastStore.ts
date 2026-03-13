import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'error' | 'warning'

export interface ToastItem {
  id: string
  title: string
  description?: string
  tone: ToastTone
  durationMs: number
}

interface ToastStore {
  toasts: ToastItem[]
  push: (toast: Omit<ToastItem, 'id' | 'durationMs'> & { durationMs?: number }) => void
  remove: (id: string) => void
  clear: () => void
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id: createId(),
          title: toast.title,
          description: toast.description,
          tone: toast.tone,
          durationMs: toast.durationMs ?? 3200,
        },
      ],
    })),
  remove: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  clear: () => set({ toasts: [] }),
}))