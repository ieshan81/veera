import { useMutation, useQueryClient } from '@tanstack/react-query'
import { requestPlantQrUpsert } from '@/lib/plantQrEdgeRequest'
import type { QrMode } from '@/lib/plantQrEdgeRequest'

export type { QrMode }

export function usePlantQrMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ plantId, mode }: { plantId: string; mode: QrMode }) => {
      const result = await requestPlantQrUpsert(plantId, mode)
      if (!result.ok) {
        throw new Error(result.message)
      }
      return result.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plants'] })
      void qc.invalidateQueries({ queryKey: ['plant'] })
      void qc.invalidateQueries({ queryKey: ['plant-qrs'] })
      void qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      void qc.invalidateQueries({ queryKey: ['plant-qr-url'] })
    },
  })
}
