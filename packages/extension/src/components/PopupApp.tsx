import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JobItem } from "@/components/JobItem";
import { OutputPanel } from "@/components/OutputPanel";
import { useJobs, useCreateJob, useDeleteJob } from "@/hooks/useJobs";
import { useStringLocalStorage } from "@/hooks/useLocalStorage";
import {
  ChromeService,
  generateHighContrastColor,
  StorageService,
} from "@/lib/api";
import { Job, MODEL_OPTIONS, ModelType, PageContext } from "@/types";
import { Loader2, Settings, Trash2, Sparkles, Send } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000,
    },
  },
});

function PopupContent() {
  const [prompt, setPrompt] = useStringLocalStorage("cletus-last-input", "");
  const [model, setModel] = useStringLocalStorage(
    "cletus-model-selection",
    "claude-sonnet-4-20250514"
  );
  const [includePath, setIncludePath] = useState(true);
  const [currentPath, setCurrentPath] = useState("/loading...");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [trackedJobs, setTrackedJobs] = useState<Map<string, Job>>(new Map());
  let jobCounter = 0;

  const { data: serverJobs, error } = useJobs();
  const createJobMutation = useCreateJob();
  const deleteJobMutation = useDeleteJob();

  // Load tracked jobs on mount
  useEffect(() => {
    StorageService.loadTrackedJobs().then(setTrackedJobs);
  }, []);

  // Load current page context
  useEffect(() => {
    const loadPageContext = async () => {
      try {
        const tab = await ChromeService.getActiveTab();
        if (tab) {
          const context = await ChromeService.collectContext(tab.id!);
          setCurrentPath(context.path || "/unknown");
        }
      } catch (error) {
        console.error("Failed to load page context:", error);
        setCurrentPath("/unknown");
      }
    };
    loadPageContext();
  }, []);

  // Sync server jobs with tracked jobs
  useEffect(() => {
    if (serverJobs) {
      setTrackedJobs((prevTracked) => {
        const newTracked = new Map(prevTracked);

        // Update with server data, preserving tracked fields
        for (const job of serverJobs) {
          const prevJob = newTracked.get(job.id);
          newTracked.set(job.id, {
            ...job,
            sourceUrl: prevJob?.sourceUrl || null,
            sourceTab: prevJob?.sourceTab || null,
          });
        }

        // Mark offline jobs that are no longer on server
        for (const [jobId, job] of newTracked) {
          if (
            !serverJobs.find((sj) => sj.id === jobId) &&
            (job.status === "running" || job.status === "pending")
          ) {
            newTracked.set(jobId, { ...job, status: "offline" });
          }
        }

        return newTracked;
      });
    } else if (error) {
      // Server not available - mark running jobs as offline
      setTrackedJobs((prev) => {
        const newTracked = new Map();
        for (const [id, job] of prev) {
          if (job.status === "running" || job.status === "pending") {
            newTracked.set(id, { ...job, status: "offline" });
          } else {
            newTracked.set(id, job);
          }
        }
        return newTracked;
      });
    }
  }, [serverJobs, error]);

  // Save tracked jobs when they change
  useEffect(() => {
    StorageService.saveTrackedJobs(trackedJobs);
  }, [trackedJobs]);

  const createRequestId = () => {
    jobCounter += 1;
    return `job_${Date.now()}_${jobCounter}`;
  };

  const buildPrompt = (userPrompt: string, pageContext: PageContext) => {
    const url = pageContext?.url || "<unknown>";
    const path = pageContext?.path || "<unknown>";

    if (includePath) {
      return `I need you to look at the route located at ${url} and path ${path} and implement the following code change: ${userPrompt}\n\n UPDATE MY CODE BASED ON YOUR SUGGESTIONS`;
    } else {
      return `I need you to implement the following code change: ${userPrompt}\n\n UPDATE MY CODE BASED ON YOUR SUGGESTIONS`;
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setStatus("Please enter a prompt.");
      return;
    }

    try {
      setIsSubmitting(true);
      setStatus("Running in background...");

      const tab = await ChromeService.getActiveTab();
      const pageContext = tab
        ? await ChromeService.collectContext(tab.id!)
        : { path: "", url: "", title: "", selection: "", components: [] };

      const requestId = createRequestId();
      const composedPrompt = buildPrompt(prompt, pageContext);

      // Optimistically add job to tracked jobs
      const optimisticJob: Job = {
        id: requestId,
        color: generateHighContrastColor(),
        text: "",
        startedAt: Date.now(),
        finishedAt: null,
        status: "running",
        prompt: prompt,
        sourceUrl: tab?.url || null,
        sourceTab: tab?.id || null,
      };

      setTrackedJobs((prev) => new Map(prev).set(requestId, optimisticJob));
      setSelectedJobId(requestId);

      // Clear input and save
      setPrompt("");
      StorageService.clearLastInput();

      // Create job on server
      const result = await createJobMutation.mutateAsync({
        prompt: composedPrompt,
        jobId: requestId,
        options: { model: model as ModelType },
      });

      // If server returned different jobId, update our tracking
      if (result.jobId !== requestId) {
        setTrackedJobs((prev) => {
          const newTracked = new Map(prev);
          const optimistic = newTracked.get(requestId);
          if (optimistic) {
            newTracked.delete(requestId);
            newTracked.set(result.jobId, { ...optimistic, id: result.jobId });
          }
          return newTracked;
        });
        setSelectedJobId(result.jobId);
      }

      setTimeout(() => setStatus(""), 2000);
    } catch (error) {
      setStatus(String(error) || "Failed to create job");
      console.error("Submit error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
  };

  const handleJobDismiss = async (jobId: string) => {
    try {
      await deleteJobMutation.mutateAsync(jobId);

      // If this was the selected job, clear selection
      if (selectedJobId === jobId) {
        setSelectedJobId(null);
      }

      // Remove from tracked jobs
      setTrackedJobs((prev) => {
        const newTracked = new Map(prev);
        newTracked.delete(jobId);
        return newTracked;
      });
    } catch (error) {
      setStatus("Could not dismiss job. Try again.");
      console.error("Dismiss error:", error);
    }
  };

  const handleJobNavigate = async (jobId: string) => {
    const job = trackedJobs.get(jobId);
    if (!job || !job.sourceUrl) {
      setStatus("No source URL found for job.");
      return;
    }

    try {
      await ChromeService.navigateToUrl(job.sourceUrl);
    } catch (error) {
      setStatus("Could not navigate to original page.");
      console.error("Navigation error:", error);
    }
  };

  const handleClearCompleted = async () => {
    const completedJobs = Array.from(trackedJobs.values())
      .filter((job) => job.status !== "running")
      .map((job) => job.id);

    for (const jobId of completedJobs) {
      try {
        await deleteJobMutation.mutateAsync(jobId);
      } catch (error) {
        console.error("Failed to delete job:", jobId, error);
      }
    }
  };

  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open("options.html");
    }
  };

  const sortedJobs = Array.from(trackedJobs.values()).sort(
    (a, b) => b.startedAt - a.startedAt
  );

  const selectedJob = selectedJobId
    ? trackedJobs.get(selectedJobId) || null
    : null;

  return (
    <div className="min-h-screen p-6">
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <h1 className="text-2xl font-bold mb-2">
          <span className="text-gradient">Cletus</span> AI Assistant
        </h1>
      </div>

      <div className="flex gap-6">
        {/* Left Panel */}
        <div className="w-[380px] flex-shrink-0 space-y-6">
          {/* Header */}

          {/* Main Card */}
          <div
            className="module-card p-6 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
            style={{ animationDelay: "0.1s" }}
          >
            {/* Prompt input */}
            <div>
              <label className="text-sm font-medium mb-2 block">Prompt</label>
              <Textarea
                placeholder="Describe the feature or edit you want..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[120px] resize-y bg-muted/30 border-theme-200/40 dark:border-theme-800/40 focus:border-theme-500"
                autoFocus
              />
            </div>

            {/* Include path checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-path"
                checked={includePath}
                onCheckedChange={(checked) => setIncludePath(checked === true)}
                className="border-theme-300 data-[state=checked]:bg-theme-500 data-[state=checked]:border-theme-500"
              />
              <label htmlFor="include-path" className="text-sm cursor-pointer">
                <span className="text-muted-foreground">Include path:</span>{" "}
                <span className="font-mono text-xs text-theme-600 dark:text-theme-400">
                  {currentPath}
                </span>
              </label>
            </div>

            {/* Model selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Model</label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="bg-muted/30 border-theme-200/40 dark:border-theme-800/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="shadow-elevation-2"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send Request
              </Button>
              <Button
                variant="secondary"
                onClick={handleClearCompleted}
                size="sm"
                className="ml-auto"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear Done
              </Button>
              <Button variant="ghost" onClick={openOptions} size="icon">
                <Settings className="w-4 h-4" />
              </Button>
            </div>

            {/* Status */}
            {status && (
              <div className="text-sm text-muted-foreground p-2 bg-muted/20 rounded">
                {status}
              </div>
            )}
          </div>

          {/* Jobs list */}
          {sortedJobs.length > 0 && (
            <div
              className="module-card p-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
                <Sparkles className="w-4 h-4 text-theme-500" />
                <h2 className="font-semibold">Recent Jobs</h2>
                <span className="ml-auto text-xs text-muted-foreground">
                  {sortedJobs.length} total
                </span>
              </div>
              <div className="space-y-1 max-h-[280px] overflow-y-auto">
                {sortedJobs.map((job) => (
                  <JobItem
                    key={job.id}
                    job={job}
                    isSelected={selectedJobId === job.id}
                    onSelect={handleJobSelect}
                    onDismiss={handleJobDismiss}
                    onNavigate={handleJobNavigate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Output */}
        <div
          className="w-[380px] flex-shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-500"
          style={{ animationDelay: "0.3s" }}
        >
          <OutputPanel
            jobId={selectedJobId}
            job={selectedJob}
            onClose={() => setSelectedJobId(null)}
          />
        </div>
      </div>
    </div>
  );
}

export function PopupApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <PopupContent />
    </QueryClientProvider>
  );
}
