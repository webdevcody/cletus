# Cletus

## ⚠️ CRITICAL SECURITY WARNING ⚠️

**THIS EXTENSION USES CLAUDE CODE HEADLESS MODE WITH DANGEROUSLY SKIPPED PERMISSIONS**

By using this extension, you acknowledge that:

- **Agentic prompts have extensive access to your machine and files**
- **Claude Code Hooks, Commands, and Subagents can execute with dangerous permissions**
- **This poses significant security risks to your system and data**

**USE AT YOUR OWN RISK. This tool should only be used in isolated/sandboxed environments.**

---

## Installation

1. Clone and install dependencies:

   ```bash
   git@github.com:webdevcody/cletus.git
   cd cletus && bun install
   bun run build:extension
   ```

2. Link the Cletus package:

   ```bash
   cd packages/api && bun link cletus
   ```

3. Navigate to your project root and run the api:

   ```bash
   cletus
   ```

4. Install the extension in chrome:

   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `cletus/packages/extension/dist`

## Development on API

To develop the Chrome extension:

1. Run the api in dev mode:
   ```bash
   bun run dev:api
   ```

## Development on Extension

To develop the Chrome extension:

1. Build and install the extension:

   ```bash
   bun run dev:extension
   ```

2. Load the extension in Chrome:

   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `cletus/packages/extension/dist`

3. As you change, vite will refresh and your extension will refresh automatically. Just collapse and reopen extension to view changes.
