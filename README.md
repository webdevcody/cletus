# Cletus - Professional Claude Job Management Monorepo

A comprehensive monorepo containing a Claude job management API and Chrome extension, built with modern tooling and clean architecture.

## 📁 Repository Structure

```
cletus-monorepo/
├── packages/
│   ├── api/                    # Claude job management API
│   │   ├── endpoints/          # API route handlers
│   │   ├── services/           # Business logic services
│   │   ├── utils/              # Utility functions
│   │   ├── tests/              # Test suites
│   │   └── server.ts           # API server entry point
│   └── extension/              # Chrome extension (React)
│       ├── src/
│       │   ├── components/     # React components
│       │   ├── hooks/          # Custom React hooks
│       │   ├── lib/            # API services and utilities
│       │   ├── popup/          # Extension popup
│       │   ├── options/        # Extension settings
│       │   └── content/        # Content script
│       └── dist/               # Built extension files
├── package.json                # Workspace configuration
└── README.md                   # This file
```

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh) >= 1.0.0 (for package management and runtime)

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd cletus-monorepo

# Install all dependencies
bun install
```

## 🛠️ Development Commands

### API Development
```bash
# Start API in development mode
bun run dev:api

# Run API tests
bun run test:api

# Run API tests in watch mode
bun run test:watch

# Type check API
bun run type-check:api
```

### Extension Development
```bash
# Start extension in development mode
bun run dev:extension

# Build extension for production
bun run build:extension

# Type check extension
bun run type-check:extension
```

### Monorepo Commands
```bash
# Start API (default)
bun run dev

# Build all packages
bun run build

# Type check all packages
bun run type-check

# Clean all build artifacts
bun run clean
```

## 📦 Package Details

### API Package (`packages/api`)
Professional Claude job management API built with:
- **Hono** - Fast, lightweight web framework
- **Bun** - JavaScript runtime and package manager
- **TypeScript** - Type safety and developer experience
- **Comprehensive Testing** - Unit and integration tests

Features:
- Job creation and management
- Real-time output streaming
- Batch processing capabilities
- Health monitoring
- Clean architecture with proper separation of concerns

### Extension Package (`packages/extension`)
Modern Chrome extension built with:
- **React 18** - Modern UI framework
- **Vite** - Fast build tool and dev server
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - High-quality, accessible UI components
- **TanStack Query** - Server state management

Features:
- Intuitive popup interface for job creation
- Real-time job status updates and output streaming
- Model selection (Haiku, Sonnet, Opus)
- Page context collection and navigation
- Settings management
- Persistent storage

## 🏗️ Architecture

### Monorepo Benefits
- **Shared tooling** - Common TypeScript, testing, and linting configurations
- **Easy development** - Run API and extension development from single root
- **Coordinated versioning** - Manage releases across packages
- **Code sharing** - Share types and utilities between packages (future)

### API Architecture
- **Clean Architecture** - Separation of concerns with clear boundaries
- **Service Layer** - Business logic isolated from HTTP concerns  
- **Endpoint Handlers** - Focused, single-responsibility route handlers
- **Comprehensive Testing** - Unit and integration test coverage

### Extension Architecture
- **Component-Based** - Reusable React components with proper separation
- **Modern State Management** - TanStack Query for server state, React hooks for local state
- **Type Safety** - Full TypeScript coverage prevents runtime errors
- **Modern Tooling** - Vite for fast builds and excellent developer experience

## 🔧 Configuration

### Environment Variables
Copy `.env.example` to `.env` in the API package and configure:
- `CLAUDE_API_KEY` - Your Claude API key
- `PORT` - API server port (default: 1337)
- Additional configuration as needed

### Extension Configuration
The extension can be configured through its options page after installation.

## 🧪 Testing

### API Tests
```bash
# Run all tests
bun run test:api

# Run unit tests only
bun run test:unit

# Run integration tests only  
bun run test:integration

# Run tests with coverage
bun run test:coverage
```

### Extension Testing
Extension testing setup can be added as needed for UI components and logic.

## 📋 Development Workflow

1. **Start API development**: `bun run dev:api`
2. **Start extension development**: `bun run dev:extension` 
3. **Load extension in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `packages/extension/dist`

## 🤝 Contributing

1. Follow TypeScript strict mode guidelines
2. Maintain test coverage for API changes
3. Use conventional commit messages
4. Test both API and extension functionality together

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Related

- [Claude API Documentation](https://docs.anthropic.com/)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Bun Documentation](https://bun.sh/docs)