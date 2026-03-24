import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

export type QrMode = 'ensure_primary' | 'regenerate'

export function usePlantQrMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ plantId, mode }: { plantId: string; mode: QrMode }) => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; code?: string }>(
        'plant-qr-upsert',
        { body: { plant_id: plantId, mode } },
      )
      if (error) throw new Error(error.message)
      if (data && 'error' in data && data.error) throw new Error(data.error as string)
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plants'] })
      void qc.invalidateQueries({ queryKey: ['plant'] })
      void qc.invalidateQueries({ queryKey: ['plant-qrs'] })
      void qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })
}
