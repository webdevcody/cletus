import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiService } from '@/lib/api'
import { Job } from '@/types'

export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: ApiService.getJobs,
    refetchInterval: (query) => {
      // Only poll if we have running/pending jobs
      const hasRunningJobs = query.state.data?.some((job: Job) => 
        job.status === 'running' || job.status === 'pending'
      )
      return hasRunningJobs ? 1000 : false
    },
    retry: (failureCount) => {
      // Don't retry if server is down, just mark jobs as offline
      return failureCount < 2
    }
  })
}

export function useCreateJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ApiService.createJob,
    onSuccess: () => {
      // Invalidate and refetch jobs
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export function useDeleteJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ApiService.deleteJob,
    onSuccess: () => {
      // Invalidate and refetch jobs
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export function useJobOutput(jobId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['job-output', jobId],
    queryFn: () => jobId ? ApiService.getJobOutput(jobId) : null,
    enabled: enabled && !!jobId,
    refetchInterval: (query) => {
      // Poll more frequently for output updates
      const isRunning = query.state.data?.status === 'running'
      return isRunning ? 500 : false
    },
  })
}