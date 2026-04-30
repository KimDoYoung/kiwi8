import api from '@/lib/api'

export interface LayoutPreset {
  id: number
  user_id: string
  name: string
  layout_json: string
  created_at: string
  updated_at: string
}

export async function fetchLayoutPresets(): Promise<LayoutPreset[]> {
  const res = await api.get('/api/v1/layout-presets/')
  return res.data.data.presets as LayoutPreset[]
}

export async function upsertLayoutPreset(name: string, layoutJson: string): Promise<LayoutPreset> {
  const res = await api.post('/api/v1/layout-presets/upsert', {
    name,
    layout_json: layoutJson,
  })
  return res.data.data.preset as LayoutPreset
}

export async function deleteLayoutPreset(id: number): Promise<void> {
  await api.delete(`/api/v1/layout-presets/${id}`)
}
