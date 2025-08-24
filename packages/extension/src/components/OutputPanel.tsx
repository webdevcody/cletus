import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useJobOutput } from "@/hooks/useJobs";
import { Job, JobOutput } from "@/types";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface OutputPanelProps {
  jobId: string | null;
  job: Job | null;
  onClose: () => void;
}

export function OutputPanel({ jobId, job, onClose }: OutputPanelProps) {
  const [lastOutputTimestamp, setLastOutputTimestamp] = useState(0);
  const [chunks, setChunks] = useState<JobOutput["chunks"]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  const { data: outputData } = useJobOutput(jobId, !!jobId);

  // Update chunks when new output data arrives
  useEffect(() => {
    if (outputData && outputData.chunks && outputData.chunks.length > 0) {
      const wasScrolledToBottom = isScrolledToBottom();

      // Filter only new chunks since last timestamp
      const newChunks = outputData.chunks.filter(
        (chunk) => chunk.timestamp > lastOutputTimestamp
      );

      if (newChunks.length > 0) {
        setChunks((prevChunks) => [...prevChunks, ...newChunks]);
        setLastOutputTimestamp(outputData.lastUpdate);

        // Auto-scroll if user was at bottom
        if (wasScrolledToBottom && isAutoScrollEnabled) {
          setTimeout(scrollToBottom, 0);
        }
      }
    }
  }, [outputData, lastOutputTimestamp, isAutoScrollEnabled]);

  // Reset chunks when job changes
  useEffect(() => {
    if (jobId !== null) {
      setChunks([]);
      setLastOutputTimestamp(0);
      setIsAutoScrollEnabled(true);
    }
  }, [jobId]);

  // Handle scroll events to manage auto-scroll
  useEffect(() => {
    const output = outputRef.current;
    if (!output) return;

    const handleScroll = () => {
      setIsAutoScrollEnabled(isScrolledToBottom());
    };

    output.addEventListener("scroll", handleScroll);
    return () => output.removeEventListener("scroll", handleScroll);
  }, []);

  const isScrolledToBottom = () => {
    const output = outputRef.current;
    if (!output) return false;
    const { scrollTop, scrollHeight, clientHeight } = output;
    return scrollTop + clientHeight >= scrollHeight - 5; // 5px tolerance
  };

  const scrollToBottom = () => {
    const output = outputRef.current;
    if (output) {
      output.scrollTop = output.scrollHeight;
    }
  };

  if (!job || !jobId) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="module-card h-full flex items-center justify-center text-center p-6">
          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-theme-100 dark:bg-theme-900 flex items-center justify-center">
              <div className="text-2xl">📋</div>
            </div>
            <div className="space-y-1">
              <div className="font-medium text-foreground">No job selected</div>
              <div className="text-sm text-description">
                Click on a job to view its output
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusText =
    job.status === "completed"
      ? "Done"
      : job.status === "failed"
      ? "Failed"
      : job.status === "offline"
      ? "Offline"
      : "Running";

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="module-card h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 pb-3 border-b border-border/50">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate text-foreground">
              {job.prompt?.substring(0, 60) || jobId}
              {job.prompt && job.prompt.length > 60 && "..."}
            </div>
          </div>

          <div
            className={cn("status-badge", {
              "status-badge-green": job.status === "completed",
              "status-badge-red": job.status === "failed",
              "status-badge-orange": job.status === "offline",
              "status-badge-blue":
                job.status === "running" || job.status === "pending",
            })}
          >
            {statusText}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-theme-600 hover:text-white"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Output console */}
        <div className="flex-1 bg-code-bg text-code-fg rounded-lg overflow-hidden flex flex-col m-4 mt-3 shadow-elevation-1">
          <div
            ref={outputRef}
            className="flex-1 overflow-y-auto overflow-x-hidden p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words min-h-[200px] max-h-[400px]"
          >
            {chunks.length === 0 ? (
              <div className="text-muted-foreground italic text-center py-8">
                {job.status === "running"
                  ? "Waiting for output..."
                  : "No output available"}
              </div>
            ) : (
              chunks.map((chunk, index) => (
                <div
                  key={index}
                  className={cn("mb-1", {
                    "text-code-fg": chunk.type === "stdout",
                    "text-yellow-400": chunk.type === "stderr",
                    "text-red-400": chunk.type === "error",
                    "text-green-400 italic": chunk.type === "system",
                  })}
                >
                  {chunk.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
