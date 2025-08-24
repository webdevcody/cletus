# Cletus

## Installation

1. Install dependencies:

   ```bash
   bun install
   bun run build:extension
   ```

2. Link the Cletus package:

   ```bash
   cd packages/api && bun link cletus
   ```

3. Navigate to your project root and install:

   ```bash
   cletus
   ```

4. Install the extension:

   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `packages/extension/dist`

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
   - Select `packages/extension/dist`

3. As you change, vite will refresh and your extension will refresh automatically. Just collapse and reopen extension to view changes.
