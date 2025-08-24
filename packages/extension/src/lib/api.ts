import {
  CreateJobRequest,
  CreateJobResponse,
  Job,
  JobsResponse,
  JobOutput,
} from "@/types";

const API_BASE_URL = "http://localhost:1337";

export class ApiService {
  static async createJob(
    request: CreateJobRequest
  ): Promise<CreateJobResponse> {
    const response = await fetch(`${API_BASE_URL}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Server error: ${response.status} ${response.statusText} ${errorText}`
      );
    }

    return response.json();
  }

  static async getJobs(): Promise<Job[]> {
    const response = await fetch(`${API_BASE_URL}/jobs`);

    if (!response.ok) {
      throw new Error("Failed to fetch jobs");
    }

    const data: JobsResponse = await response.json();
    return data.jobs || [];
  }

  static async deleteJob(jobId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error(`Failed to delete job ${jobId}`);
    }
  }

  static async getJobOutput(
    jobId: string,
    since: number = 0
  ): Promise<JobOutput> {
    const response = await fetch(
      `${API_BASE_URL}/jobs/${jobId}/stream?since=${since}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch job output");
    }

    return response.json();
  }
}

// Chrome extension utilities
export class ChromeService {
  static async getActiveTab(): Promise<chrome.tabs.Tab | null> {
    // Prefer the currently active tab in the current window
    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) return tabs[0];

    // Fallback to last focused window active tab
    tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs[0]) return tabs[0];

    // Final fallback: any tab in last focused window
    tabs = await chrome.tabs.query({ lastFocusedWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  static async collectContext(tabId: number) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "collectContext",
      });
      if (!response?.ok) throw new Error(response?.error || "Failed");
      return response.context;
    } catch (err) {
      // Try to inject content script if not already present
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "collectContext",
        });
        if (!response?.ok) throw new Error(response?.error || "Failed");
        return response.context;
      } catch (_) {
        // Fallback: use tab metadata
        try {
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tab && tab.url) {
            let path = "";
            try {
              const u = new URL(tab.url);
              path = u.pathname + u.search + u.hash;
            } catch (_) {
              path = tab.url;
            }
            return {
              path,
              url: tab.url || "",
              title: tab.title || "",
              selection: "",
              components: [],
            };
          }
        } catch (_) {}
        return { path: "", url: "", title: "", selection: "", components: [] };
      }
    }
  }

  static async navigateToUrl(url: string): Promise<void> {
    try {
      // Try to find existing tab with the same URL
      const tabs = await chrome.tabs.query({ url });
      if (tabs.length > 0) {
        // Switch to existing tab
        await chrome.tabs.update(tabs[0].id!, { active: true });
        await chrome.windows.update(tabs[0].windowId!, { focused: true });
      } else {
        // Create new tab
        await chrome.tabs.create({ url, active: true });
      }

      // Close the popup
      window.close();
    } catch (error) {
      console.error("Failed to navigate to URL:", error);
      throw error;
    }
  }
}

// Storage utilities
export class StorageService {
  static async saveTrackedJobs(jobs: Map<string, Job>): Promise<void> {
    try {
      const jobsArray = Array.from(jobs.entries()).map(([id, job]) => [
        id,
        job,
      ]);
      await chrome.storage.local.set({ trackedJobs: jobsArray });
    } catch (error) {
      console.error("Failed to save tracked jobs:", error);
    }
  }

  static async loadTrackedJobs(): Promise<Map<string, Job>> {
    try {
      const result = await chrome.storage.local.get("trackedJobs");
      if (result.trackedJobs && Array.isArray(result.trackedJobs)) {
        const jobs = new Map<string, Job>();
        result.trackedJobs.forEach(([id, job]: [string, Job]) => {
          jobs.set(id, job);
        });
        return jobs;
      }
      return new Map();
    } catch (error) {
      console.error("Failed to load tracked jobs:", error);
      return new Map();
    }
  }

  static saveLastInput(value: string): void {
    try {
      localStorage.setItem("cletus-last-input", value);
    } catch (error) {
      console.error("Failed to save input to localStorage:", error);
    }
  }

  static getLastInput(): string {
    try {
      return localStorage.getItem("cletus-last-input") || "";
    } catch (error) {
      console.error("Failed to restore input from localStorage:", error);
      return "";
    }
  }

  static clearLastInput(): void {
    try {
      localStorage.removeItem("cletus-last-input");
    } catch (error) {
      console.error("Failed to clear input from localStorage:", error);
    }
  }

  static saveModelSelection(model: string): void {
    try {
      localStorage.setItem("cletus-model-selection", model);
    } catch (error) {
      console.error("Failed to save model selection to localStorage:", error);
    }
  }

  static getModelSelection(): string {
    try {
      return (
        localStorage.getItem("cletus-model-selection") ||
        "claude-sonnet-4-20250514"
      );
    } catch (error) {
      console.error(
        "Failed to restore model selection from localStorage:",
        error
      );
      return "claude-sonnet-4-20250514";
    }
  }
}

// Utility functions
export function generateHighContrastColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 95;
  const lightness = 70;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}
