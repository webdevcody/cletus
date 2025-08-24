import { Button } from '@/components/ui/button'
import { Job } from '@/types'
import { ExternalLink, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface JobItemProps {
  job: Job
  isSelected?: boolean
  onSelect: (jobId: string) => void
  onDismiss: (jobId: string) => void
  onNavigate: (jobId: string) => void
}

export function JobItem({ job, isSelected, onSelect, onDismiss, onNavigate }: JobItemProps) {
  const isDone = job.status === 'completed' || job.status === 'failed' || job.status === 'offline'
  
  const shortPrompt = job.prompt
    ? job.prompt.length > 30
      ? job.prompt.substring(0, 30) + '...'
      : job.prompt
    : job.id

  // Determine circle color based on status
  let circleColor = job.color || '#38bdf8' // Default running color
  if (job.status === 'completed') {
    circleColor = '#22c55e' // Green for completed
  } else if (job.status === 'failed') {
    circleColor = '#ef4444' // Red for failed
  } else if (job.status === 'offline') {
    circleColor = '#94a3b8' // Gray for offline
  }

  const statusText = 
    job.status === 'completed' ? 'Done' :
    job.status === 'failed' ? 'Failed' :
    job.status === 'offline' ? 'Offline' :
    'Running'

  const tooltip = job.sourceUrl 
    ? `Click to view output • Original page: ${job.sourceUrl}`
    : 'Click to view output'

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200',
        'hover:bg-theme-100/20 hover:border-theme-200/40 hover:shadow-elevation-1',
        'dark:hover:bg-theme-900/20 dark:hover:border-theme-800/40',
        'border border-transparent',
        isSelected && 'bg-theme-100/30 border-theme-200/60 shadow-elevation-1',
        isSelected && 'dark:bg-theme-900/30 dark:border-theme-800/60'
      )}
      title={tooltip}
      onClick={() => onSelect(job.id)}
    >
      {/* Status circle */}
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-white/20"
        style={{ backgroundColor: circleColor }}
      />
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate font-medium">
          {shortPrompt}
        </div>
      </div>
      
      {/* Status badge */}
      <div
        className={cn('status-badge', {
          'status-badge-green': job.status === 'completed',
          'status-badge-red': job.status === 'failed',
          'status-badge-orange': job.status === 'offline',
          'status-badge-blue': job.status === 'running' || job.status === 'pending',
        })}
      >
        {statusText}
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Navigation button */}
        {job.sourceUrl && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-theme-600 hover:text-white"
            title={`Go to original page: ${job.sourceUrl}`}
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(job.id)
            }}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
        
        {/* Dismiss button for completed jobs */}
        {isDone && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-red-500 hover:text-white"
            onClick={(e) => {
              e.stopPropagation()
              onDismiss(job.id)
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}