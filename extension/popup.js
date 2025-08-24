async function getActiveTab() {
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

const sendBtn = document.getElementById("send");
const spinnerEl = document.getElementById("spinner");
const statusEl = document.getElementById("status");
const jobsEl = document.getElementById("jobs");
const outputPanel = document.getElementById("outputPanel");
const outputHeader = document.getElementById("outputHeader");
const outputTitle = document.getElementById("outputTitle");
const outputStatus = document.getElementById("outputStatus");
const outputContent = document.getElementById("outputContent");
const emptyState = document.getElementById("emptyState");
const closeOutput = document.getElementById("closeOutput");
const includePathCheckbox = document.getElementById("includePath");
const currentPathLabel = document.getElementById("currentPath");
const modelSelect = document.getElementById("modelSelect");

let jobCounter = 0;
const jobs = new Map(); // id -> { id, color, text, startedAt, finishedAt, status, prompt, sourceUrl, sourceTab }

const POLLING_INTERVAL_MS = 1000;
let pollingIntervalId = null;

// Output panel state
let currentOutputJobId = null;
let outputPollingIntervalId = null;
let lastOutputTimestamp = 0;

// Path tracking
let currentPagePath = "/loading...";

// Job tracking with persistent storage
// This extension now tracks job metadata including the source URL and tab where the job was created.
// Users can navigate back to the original page by clicking the ↗ button next to completed jobs.
async function saveTrackedJobs() {
  try {
    const jobsArray = Array.from(jobs.entries()).map(([id, job]) => [id, job]);
    await chrome.storage.local.set({ trackedJobs: jobsArray });
  } catch (error) {
    console.error("Failed to save tracked jobs:", error);
  }
}

async function loadTrackedJobs() {
  try {
    const result = await chrome.storage.local.get('trackedJobs');
    if (result.trackedJobs && Array.isArray(result.trackedJobs)) {
      jobs.clear();
      result.trackedJobs.forEach(([id, job]) => {
        jobs.set(id, job);
      });
    }
  } catch (error) {
    console.error("Failed to load tracked jobs:", error);
  }
}

function updatePathLabel(path) {
  currentPagePath = path || "/unknown";
  if (currentPathLabel) {
    currentPathLabel.textContent = currentPagePath;
  }
}

// Load jobs from server on startup
async function loadJobsFromServer() {
  try {
    const response = await fetch("http://localhost:1337/jobs");
    if (!response.ok) {
      // Server might not be available, but we still show tracked jobs
      markOfflineJobs();
      return;
    }
    const data = await response.json();
    updateJobsFromServer(data.jobs || []);
  } catch (error) {
    console.error("Failed to load jobs from server:", error);
    // Server might not be available, but we still show tracked jobs
    markOfflineJobs();
  }
}

// Mark jobs as offline if server is not available
function markOfflineJobs() {
  let hasChanges = false;
  jobs.forEach((job) => {
    if (job.status === "running" || job.status === "pending") {
      job.status = "offline";
      hasChanges = true;
    }
  });
  if (hasChanges) {
    renderJobs();
  }
}

function updateJobsFromServer(serverJobs) {
  // Sync local jobs with server jobs; preserve tracked fields
  for (const job of serverJobs) {
    const prev = jobs.get(job.id);
    jobs.set(job.id, {
      id: job.id,
      color: job.color,
      text: prev?.text || "",
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      status: job.status,
      prompt: job.prompt,
      sourceUrl: prev?.sourceUrl || null, // Preserve tracked source URL
      sourceTab: prev?.sourceTab || null, // Preserve tracked source tab
    });
  }

  renderJobs();
  ensurePollingState();
  saveTrackedJobs(); // Save updated jobs to storage
}

function ensurePollingState() {
  const hasPending = Array.from(jobs.values()).some(
    (j) => j.status !== "completed" && j.status !== "failed"
  );
  if (hasPending) startPolling();
  else stopPolling();
}

function startPolling() {
  if (pollingIntervalId) return;
  // Poll immediately, then every interval
  pollOnce();
  pollingIntervalId = setInterval(pollOnce, POLLING_INTERVAL_MS);
}

function stopPolling() {
  if (!pollingIntervalId) return;
  clearInterval(pollingIntervalId);
  pollingIntervalId = null;
}

async function pollOnce() {
  try {
    const response = await fetch("http://localhost:1337/jobs");
    if (!response.ok) return;
    const data = await response.json();
    updateJobsFromServer(data.jobs || []);

    // If no jobs pending after update, stop polling
    const hasPending = Array.from(jobs.values()).some(
      (j) => j.status !== "completed" && j.status !== "failed"
    );
    if (!hasPending) stopPolling();
  } catch (error) {
    console.warn("Polling error:", error);
  }
}

// Save input value to localStorage
function saveLastInput(value) {
  try {
    localStorage.setItem("vibert-last-input", value);
  } catch (error) {
    console.error("Failed to save input to localStorage:", error);
  }
}

// Restore input value from localStorage
function restoreLastInput() {
  try {
    const lastInput = localStorage.getItem("vibert-last-input");
    const promptEl = document.getElementById("prompt");
    if (lastInput && promptEl) {
      promptEl.value = lastInput;
    }
  } catch (error) {
    console.error("Failed to restore input from localStorage:", error);
  }
}

// Clear saved input
function clearLastInput() {
  try {
    localStorage.removeItem("vibert-last-input");
  } catch (error) {
    console.error("Failed to clear input from localStorage:", error);
  }
}

// Save model selection to localStorage
function saveModelSelection(model) {
  try {
    localStorage.setItem("vibert-model-selection", model);
  } catch (error) {
    console.error("Failed to save model selection to localStorage:", error);
  }
}

// Restore model selection from localStorage
function restoreModelSelection() {
  try {
    const savedModel = localStorage.getItem("vibert-model-selection");
    if (savedModel && modelSelect) {
      modelSelect.value = savedModel;
    }
  } catch (error) {
    console.error(
      "Failed to restore model selection from localStorage:",
      error
    );
  }
}

// Navigate to the original page where the job was created
async function navigateToJobSource(jobId) {
  const job = jobs.get(jobId);
  if (!job || !job.sourceUrl) {
    console.error("No source URL found for job:", jobId);
    return;
  }

  try {
    // Try to find existing tab with the same URL
    const tabs = await chrome.tabs.query({ url: job.sourceUrl });
    if (tabs.length > 0) {
      // Switch to existing tab
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      // Create new tab
      await chrome.tabs.create({ url: job.sourceUrl, active: true });
    }
    
    // Close the popup
    window.close();
  } catch (error) {
    console.error("Failed to navigate to job source:", error);
    setStatus("Could not navigate to original page.");
  }
}

// Dismiss a job from both UI and server
async function dismissJob(jobId, clickedElement) {
  try {
    const response = await fetch(`http://localhost:1337/jobs/${jobId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`Failed to dismiss job ${jobId}`);
    }

    // If this is the currently selected job, reset the output panel
    if (currentOutputJobId === jobId) {
      showEmptyState();
    }

    // Remove from local state
    jobs.delete(jobId);

    // Remove the clicked alert/row from UI
    const row = clickedElement
      ? clickedElement.closest(`[data-job-id="${jobId}"]`)
      : document.querySelector(`[data-job-id="${jobId}"]`);
    if (row) row.remove();

    ensurePollingState();
    saveTrackedJobs(); // Save after removing job
  } catch (error) {
    console.error("Failed to dismiss job:", error);
    setStatus("Could not dismiss job. Try again.");
  }
}

// No details view in simplified UI

// Load jobs and restore last input when popup opens
document.addEventListener("DOMContentLoaded", async () => {
  await loadTrackedJobs(); // Load tracked jobs from storage first
  loadJobsFromServer(); // Then sync with server
  restoreLastInput();
  restoreModelSelection();

  // Show empty state initially
  showEmptyState();

  // Load initial path
  try {
    const tab = await getActiveTab();
    if (tab) {
      collectContext(tab.id).catch(() => {
        // Fallback if collectContext fails
        updatePathLabel("/unknown");
      });
    }
  } catch (error) {
    updatePathLabel("/unknown");
  }

  // Save input on every change
  const promptEl = document.getElementById("prompt");
  if (promptEl) {
    promptEl.addEventListener("input", (e) => {
      saveLastInput(e.target.value);
    });
  }

  // Save model selection on every change
  if (modelSelect) {
    modelSelect.addEventListener("change", (e) => {
      saveModelSelection(e.target.value);
    });
  }

  // Handle job interactions: dismiss buttons, navigation buttons, and row clicks
  if (jobsEl) {
    jobsEl.addEventListener("click", (e) => {
      const dismissButton = e.target.closest("[data-dismiss-job]");
      if (dismissButton) {
        e.preventDefault();
        e.stopPropagation();
        const jobId = dismissButton.getAttribute("data-dismiss-job");
        dismissJob(jobId, dismissButton);
        return;
      }

      const navigateButton = e.target.closest("[data-navigate-job]");
      if (navigateButton) {
        e.preventDefault();
        e.stopPropagation();
        const jobId = navigateButton.getAttribute("data-navigate-job");
        navigateToJobSource(jobId);
        return;
      }

      // Handle job row clicks to show output
      const jobRow = e.target.closest("[data-job-id]");
      if (jobRow) {
        e.preventDefault();
        e.stopPropagation();
        const jobId = jobRow.getAttribute("data-job-id");
        showJobOutput(jobId);
      }
    });
  }

  // Close output panel
  if (closeOutput) {
    closeOutput.addEventListener("click", () => {
      showEmptyState();
    });
  }

  // Clear all completed/failed jobs
  const clearCompletedBtn = document.getElementById("clearCompleted");
  if (clearCompletedBtn) {
    clearCompletedBtn.addEventListener("click", async () => {
      const doneJobIds = Array.from(jobs.values())
        .filter((j) => j.status !== "running")
        .map((j) => j.id);
      await Promise.all(doneJobIds.map((id) => dismissJob(id)));
    });
  }
});

function createRequestId() {
  jobCounter += 1;
  return `job_${Date.now()}_${jobCounter}`;
}

function setLoading(isLoading) {
  if (isLoading) {
    sendBtn.disabled = true;
    spinnerEl.style.display = "inline-block";
  } else {
    sendBtn.disabled = false;
    spinnerEl.style.display = "none";
  }
}

function setStatus(text) {
  if (!statusEl) return;
  if (text && String(text).trim()) {
    statusEl.textContent = text;
    statusEl.style.display = "block";
  } else {
    statusEl.textContent = "";
    statusEl.style.display = "none";
  }
}

async function collectContext(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "collectContext",
    });
    if (!response?.ok) throw new Error(response?.error || "Failed");
    // Update path label when we get the context
    updatePathLabel(response.context?.path);
    return response.context;
  } catch (err) {
    // Try to inject content script if not already present (MV3 scripting API)
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "collectContext",
      });
      if (!response?.ok) throw new Error(response?.error || "Failed");
      // Update path label when we get the context
      updatePathLabel(response.context?.path);
      return response.context;
    } catch (_) {
      // Some pages (e.g., chrome://, Web Store, PDF viewer) won't allow scripts
      // Fallback: use tab metadata so URL/Title/Path are still populated
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
          // Update path label with fallback path
          updatePathLabel(path);
          return {
            path,
            url: tab.url || "",
            title: tab.title || "",
            selection: "",
            components: [],
          };
        }
      } catch (_) {}
      updatePathLabel("");
      return { path: "", url: "", title: "", selection: "", components: [] };
    }
  }
}

function buildPrompt(userPrompt, pageContext) {
  const safeString = (value) =>
    typeof value === "string" ? value : value == null ? "" : String(value);

  const url = safeString(pageContext?.url) || "<unknown>";
  const path = safeString(pageContext?.path) || "<unknown>";

  const includePathInPrompt = includePathCheckbox?.checked ?? true;

  if (includePathInPrompt) {
    return `I need you to look at the route located at ${url} and path ${path} and implement the following code change: ${userPrompt}\n\n UPDATE MY CODE BASED ON YOUR SUGGESTIONS`;
  } else {
    return `I need you to implement the following code change: ${userPrompt}\n\n UPDATE MY CODE BASED ON YOUR SUGGESTIONS`;
  }
}

async function invokeLocalAgent({ userPrompt, pageContext, requestId }) {
  const headers = { "content-type": "application/json" };
  const composedPrompt = buildPrompt(userPrompt, pageContext);
  const selectedModel = modelSelect?.value || "claude-3-5-haiku-20241022";

  const res = await fetch("http://localhost:1337/prompt", {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt: composedPrompt,
      jobId: requestId,
      options: { model: selectedModel },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Server error: ${res.status} ${res.statusText} ${errorText}`
    );
  }

  const result = await res.json();
  return { jobId: result.jobId, status: result.status };
}

// Settings no longer required; always allow sending to local server
async function ensureSettings() {
  return true;
}

document.getElementById("openOptions").addEventListener("click", () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open("options.html");
  }
});

document.getElementById("send").addEventListener("click", async () => {
  try {
    const hasSettings = await ensureSettings();
    if (!hasSettings) {
      setStatus(
        "Missing settings. Click 'Settings' to configure your Local Agent URL."
      );
      return;
    }

    const tab = await getActiveTab();
    const prompt = document.getElementById("prompt").value.trim();
    if (!prompt) {
      setStatus("Please enter a prompt.");
      return;
    }

    (async () => {
      try {
        // Save input before clearing and clear prompt immediately after submit
        saveLastInput(prompt);
        document.getElementById("prompt").value = "";
        clearLastInput(); // Clear since we successfully submitted
        setLoading(true);
        setStatus("Running in background...");
        const pageContext = await collectContext(tab.id);
        const delay = (ms) => new Promise((r) => setTimeout(r, ms));
        await delay(1000); // keep spinner visible ~1s
        setLoading(false);
        setTimeout(() => setStatus(""), 2000);

        const requestId = createRequestId();

        // Optimistically add job to UI immediately (minimal fields)
        ensureJob(requestId, {
          color: generateHighContrastColor(),
          prompt: prompt,
          status: "running",
          sourceUrl: tab?.url,
          sourceTab: tab?.id,
        });
        startPolling();

        // Auto-select the new job
        showJobOutput(requestId);

        const { jobId } = await invokeLocalAgent({
          userPrompt: prompt,
          pageContext,
          requestId,
        });

        // If server returned a different jobId, re-key the optimistic entry
        if (jobId && jobId !== requestId && jobs.has(requestId)) {
          const optimistic = jobs.get(requestId);
          jobs.delete(requestId);
          jobs.set(jobId, { ...optimistic, id: jobId });
          renderJobs();

          // Update the selected job to the new ID
          if (currentOutputJobId === requestId) {
            currentOutputJobId = jobId;
          }
        }
      } catch (error) {
        setStatus(String(error?.message || error));
      }
    })();
  } catch (error) {
    setStatus(String(error?.message || error));
  }
});

function generateHighContrastColor() {
  // Pick bright hues and high saturation for dark UIs
  const hue = Math.floor(Math.random() * 360);
  const saturation = 95; // percent
  const lightness = 70; // percent for readability on dark backgrounds
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function ensureJob(id, { color, prompt, status, sourceUrl, sourceTab }) {
  if (!jobs.has(id)) {
    jobs.set(id, {
      id,
      color: color || null,
      text: "",
      startedAt: Date.now(),
      finishedAt: null,
      prompt: prompt || id,
      status: status || "pending",
      sourceUrl: sourceUrl || null,
      sourceTab: sourceTab || null,
    });
    renderJobs();
    saveTrackedJobs(); // Save after adding new job
  }
}

function renderJobs() {
  if (!jobsEl) return;

  // Clear existing content
  jobsEl.innerHTML = "";

  const sortedJobs = Array.from(jobs.values()).sort(
    (a, b) => b.startedAt - a.startedAt
  );

  sortedJobs.forEach((job) => {
    const status =
      job.status === "completed"
        ? "Done"
        : job.status === "failed"
          ? "Failed"
          : job.status === "offline"
            ? "Offline"
            : "Running";
    const isDone = job.status === "completed" || job.status === "failed" || job.status === "offline";
    const shortPrompt = job.prompt
      ? job.prompt.length > 30
        ? job.prompt.substring(0, 30) + "..."
        : job.prompt
      : job.id;

    // Determine circle color based on status
    let circleColor = job.color || "#38bdf8"; // Default running color
    if (job.status === "completed") {
      circleColor = "#22c55e"; // Green for completed
    } else if (job.status === "failed") {
      circleColor = "#ef4444"; // Red for failed
    } else if (job.status === "offline") {
      circleColor = "#94a3b8"; // Gray for offline
    }

    // Create job row element (now clickable)
    const jobRow = document.createElement("div");
    jobRow.style.cssText = `display:flex; align-items:center; gap:6px; padding: 4px; border-radius: 4px;`;
    jobRow.setAttribute("data-job-id", job.id);
    jobRow.classList.add("clickable-job");
    
    // Add tooltip to indicate source page if available
    if (job.sourceUrl) {
      jobRow.title = `Click to view output • Original page: ${job.sourceUrl}`;
    } else {
      jobRow.title = "Click to view output";
    }

    // Create circle indicator
    const circle = document.createElement("span");
    circle.style.cssText = `display:inline-block; width:10px; height:10px; border-radius:50%; background:${circleColor}`;

    // Create prompt text
    const promptSpan = document.createElement("span");
    promptSpan.style.cssText =
      "flex: 1; min-width: 0; text-overflow: ellipsis; overflow: hidden;";
    promptSpan.textContent = shortPrompt;

    // Create status text
    const statusSpan = document.createElement("span");
    const statusColor = 
      job.status === "failed" ? "#ef4444" : 
      job.status === "offline" ? "#94a3b8" : 
      "inherit";
    statusSpan.style.cssText = `color: ${statusColor}`;
    statusSpan.textContent = status;

    // Append elements
    jobRow.appendChild(circle);
    jobRow.appendChild(promptSpan);
    jobRow.appendChild(statusSpan);
    
    // Add navigation button if we have source URL
    if (job.sourceUrl) {
      const navBtn = document.createElement("button");
      navBtn.style.cssText =
        "margin-left: 4px; padding: 2px 6px; font-size: 12px; background: var(--primary); color: var(--primary-foreground); border: none; border-radius: 4px; cursor: pointer; min-width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;";
      navBtn.textContent = "↗";
      navBtn.title = `Go to original page: ${job.sourceUrl}`;
      navBtn.setAttribute("data-navigate-job", job.id);
      jobRow.appendChild(navBtn);
    }
    
    // Dismiss button for completed/failed jobs
    if (isDone) {
      const dismissBtn = document.createElement("button");
      dismissBtn.style.cssText =
        "margin-left: 4px; padding: 2px 6px; font-size: 14px; font-weight: bold; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; min-width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;";
      dismissBtn.textContent = "×";
      dismissBtn.setAttribute("data-dismiss-job", job.id);
      jobRow.appendChild(dismissBtn);
    }

    jobsEl.appendChild(jobRow);
  });

  jobsEl.style.display = sortedJobs.length ? "block" : "none";
}

// Output panel functions
async function showJobOutput(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  currentOutputJobId = jobId;
  lastOutputTimestamp = 0;

  // Show header and hide empty state
  outputHeader.style.display = "flex";
  emptyState.style.display = "none";

  // Update panel header
  outputTitle.textContent = `${job.prompt?.substring(job.prompt.length - 50) || jobId}...`;
  outputStatus.textContent =
    job.status === "completed"
      ? "Done"
      : job.status === "failed"
        ? "Failed"
        : "Running";
  outputStatus.className = `output-status ${job.status}`;

  // Show the panel
  outputPanel.style.display = "flex";

  // Load initial output
  await loadJobOutput(jobId);

  // Start polling for updates if job is running
  if (job.status === "running") {
    startOutputPolling();
  }
}

function showEmptyState() {
  currentOutputJobId = null;
  stopOutputPolling();
  outputContent.innerHTML = "";
  lastOutputTimestamp = 0;

  // Hide header and show empty state
  outputHeader.style.display = "none";
  emptyState.style.display = "flex";

  // Keep the panel visible to show empty state
  outputPanel.style.display = "flex";
}

function hideJobOutput() {
  outputPanel.style.display = "none";
  currentOutputJobId = null;
  stopOutputPolling();
  outputContent.innerHTML = "";
  lastOutputTimestamp = 0;
}

async function loadJobOutput(jobId) {
  try {
    const response = await fetch(
      `http://localhost:1337/jobs/${jobId}/stream?since=${lastOutputTimestamp}`
    );
    if (!response.ok) return;

    const data = await response.json();

    // Update status
    const job = jobs.get(jobId);
    if (job && job.status !== data.status) {
      job.status = data.status;
      jobs.set(jobId, job);
      renderJobs();

      // Update output panel status
      outputStatus.textContent =
        data.status === "completed"
          ? "Done"
          : data.status === "failed"
            ? "Failed"
            : "Running";
      outputStatus.className = `output-status ${data.status}`;

      // Stop polling if job is done
      if (data.status === "completed" || data.status === "failed") {
        stopOutputPolling();
      }
    }

    // Append new chunks
    if (data.chunks && data.chunks.length > 0) {
      const wasScrolledToBottom = isScrolledToBottom();

      data.chunks.forEach((chunk) => {
        const chunkDiv = document.createElement("div");
        chunkDiv.className = `output-chunk ${chunk.type}`;
        chunkDiv.textContent = chunk.text;
        outputContent.appendChild(chunkDiv);
      });

      // Auto-scroll to bottom if user was already at bottom
      if (wasScrolledToBottom) {
        scrollToBottom();
      }

      // Update timestamp for next poll
      lastOutputTimestamp = data.lastUpdate;
    }
  } catch (error) {
    console.error("Failed to load job output:", error);
  }
}

function startOutputPolling() {
  if (outputPollingIntervalId || !currentOutputJobId) return;

  outputPollingIntervalId = setInterval(() => {
    if (currentOutputJobId) {
      loadJobOutput(currentOutputJobId);
    }
  }, 500); // Poll output more frequently for better UX
}

function stopOutputPolling() {
  if (!outputPollingIntervalId) return;
  clearInterval(outputPollingIntervalId);
  outputPollingIntervalId = null;
}

function isScrolledToBottom() {
  const { scrollTop, scrollHeight, clientHeight } = outputContent;
  return scrollTop + clientHeight >= scrollHeight - 5; // 5px tolerance
}

function scrollToBottom() {
  outputContent.scrollTop = outputContent.scrollHeight;
}
