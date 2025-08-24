import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Settings {
  localAgentUrl: string
  localAgentAuthToken: string
}

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings>({
    localAgentUrl: '',
    localAgentAuthToken: '',
  })
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await chrome.storage.sync.get(['localAgentUrl', 'localAgentAuthToken'])
        setSettings({
          localAgentUrl: result.localAgentUrl || '',
          localAgentAuthToken: result.localAgentAuthToken || '',
        })
        
        if (result.localAgentUrl) {
          setStatus({ type: 'success', message: 'Saved' })
        } else {
          setStatus({ type: 'info', message: 'No settings saved' })
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
        setStatus({ type: 'error', message: 'Failed to load settings' })
      } finally {
        setIsLoading(false)
      }
    }
    
    loadSettings()
  }, [])

  const handleSave = async () => {
    const url = settings.localAgentUrl.trim()
    const token = settings.localAgentAuthToken.trim()
    
    if (!url) {
      setStatus({ type: 'error', message: 'Please enter a Local Agent URL' })
      return
    }

    try {
      await chrome.storage.sync.set({
        localAgentUrl: url,
        localAgentAuthToken: token,
      })
      setStatus({ type: 'success', message: 'Saved' })
    } catch (error) {
      console.error('Failed to save settings:', error)
      setStatus({ type: 'error', message: 'Failed to save settings' })
    }
  }

  const handleUrlChange = (value: string) => {
    setSettings(prev => ({ ...prev, localAgentUrl: value }))
  }

  const handleTokenChange = (value: string) => {
    setSettings(prev => ({ ...prev, localAgentAuthToken: value }))
  }

  if (isLoading) {
    return (
      <div className="extension-options min-h-screen bg-gradient-to-br from-background via-theme-50/5 to-theme-100/10 dark:from-background dark:via-theme-950/10 dark:to-theme-900/20">
        <div className="p-6">
          <div className="max-w-2xl mx-auto">
            <div className="module-card p-8">
              <div className="skeleton h-6 w-32 mb-4"></div>
              <div className="space-y-4">
                <div className="skeleton h-4 w-full"></div>
                <div className="skeleton h-10 w-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="extension-options min-h-screen bg-gradient-to-br from-background via-theme-50/5 to-theme-100/10 dark:from-background dark:via-theme-950/10 dark:to-theme-900/20">
      <div className="p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h1 className="text-3xl font-bold mb-2">
              <span className="text-gradient">Cletus</span> Settings
            </h1>
            <p className="text-description">
              Configure your local AI agent connection
            </p>
          </div>
          
          {/* Settings Card */}
          <div className="module-card p-8 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: '0.1s' }}>
            {/* Agent URL */}
            <div className="space-y-3">
              <Label htmlFor="agentUrl" className="text-sm font-medium">
                Local Agent URL
              </Label>
              <Input
                id="agentUrl"
                type="text"
                placeholder="http://localhost:11434/agent"
                value={settings.localAgentUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                className="bg-muted/30 border-theme-200/40 dark:border-theme-800/40 focus:border-theme-500"
              />
              <p className="text-sm text-muted-foreground leading-relaxed">
                Set the HTTP endpoint for your locally running headless Claude instance.
              </p>
            </div>

            {/* Auth Token */}
            <div className="space-y-3">
              <Label htmlFor="authToken" className="text-sm font-medium">
                Auth Token <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="authToken"
                  type={showToken ? 'text' : 'password'}
                  placeholder="secret-token"
                  value={settings.localAgentAuthToken}
                  onChange={(e) => handleTokenChange(e.target.value)}
                  className="bg-muted/30 border-theme-200/40 dark:border-theme-800/40 focus:border-theme-500 pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-theme-600 hover:text-white"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If your endpoint requires auth, it will be sent as Authorization: Bearer &lt;token&gt;.
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4 pt-2">
              <Button 
                onClick={handleSave} 
                className="shadow-elevation-2"
              >
                Save Settings
              </Button>
              
              {status && (
                <div
                  className={cn('status-badge', {
                    'status-badge-green': status.type === 'success',
                    'status-badge-red': status.type === 'error',
                    'status-badge-blue': status.type === 'info',
                  })}
                >
                  {status.message}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}