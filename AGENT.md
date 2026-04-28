# 🤖 OpenAPI to Services CLI - Technical Specification

This document outlines the plan to refactor the hardcoded OpenAPI service generator into a standalone, portable CLI tool with a Terminal UI (TUI).

## 🎯 Vision
Transform the current internal script into a professional developer tool that can be used across multiple projects with a seamless configuration experience.

---

## 🛠️ Technical Specifications

### 1. Core Stack
- **Runtime**: Node.js / Bun
- **Language**: TypeScript
- **CLI Framework**: [Clack](https://github.com/natemoo-re/clack) (Modern, beautiful TUI)
- **Configuration**: [Conf](https://github.com/sindresorhus/conf) (Cross-platform persistence)
- **API Fetching**: Axios (Already used)
- **Filesystem**: `node:fs/promises`

### 2. Configuration Schema
Each project will be stored as a "Profile" with the following structure:
```ts
interface ProjectProfile {
  id: string;          // Unique identifier
  name: string;        // Human-readable name
  openapiUrl: string;  // Endpoint for openapi.json
  outputPaths: {
    services: string;  // Relative or absolute path to services folder
    types: string;     // Relative or absolute path to types folder
    config: string;    // Relative or absolute path to config folder
  };
  settings: {
    stripPrefix: string; // e.g., "/api/v1/"
    useHooks: boolean;   // Whether to generate React hooks
  };
}
```

---

## 🖥️ Terminal UI (TUI) Design

### Main Menu
1. **🚀 Run Generator**
   - Select from saved projects.
   - Confirmation prompt.
   - Real-time progress indicators (spinners).
2. **➕ Add Project**
   - Interactive wizard to input name, URL, and target directories.
   - Path auto-completion or directory picker.
3. **⚙️ Manage Projects**
   - Edit existing project configurations.
   - Delete projects.
4. **🚪 Exit**

### Project Setup Wizard
- **Name**: "Enter project name (e.g., My Dashboard)"
- **OpenAPI URL**: "Enter OpenAPI JSON URL"
- **Target Dir**: "Enter target frontend root directory" (Default: current working directory)
- **Sub-paths**: Pre-fill defaults (`src/services-generated`, `src/types`, `src/config`) but allow overrides.
- **Prefix**: "API prefix to strip (e.g., /api/v1/)"

---

## 🏗️ Refactoring Plan

### Phase 1: Decoupling (Logic vs. Config)
- [x] **`GeneratorEngine`**: Extract the core generation logic from `src/index.ts` into a dedicated class/module that accepts a `ProjectProfile` object.
- [x] **Path Resolution**: Use `path.resolve()` to handle absolute/relative paths correctly regardless of where the CLI is executed.
- [x] **Prefix Logic**: Pass `stripPrefix` into `generateFunctionApi` to replace the current hardcoded `/api/v1/`.

### Phase 2: Configuration Layer
- [x] Implement `ProfileManager` using `conf` to store project data in the user's config directory (e.g., `~/.config/openapi-to-services/config.json`).
- [x] Provide methods to list, add, update, and remove profiles.

### Phase 3: TUI Integration
- [x] Replace the `prompt-sync` implementation in `main()` with a `clack`-based interface.
- [x] Implement spinners for network requests and file writing.
- [x] Add colorful success/error messages.

### Phase 4: CLI Entry Point
- [x] Setup `bin` in `package.json`.
- [x] Create a new entry point `src/cli.ts` to handle command-line arguments (e.g., `openapi-to-services run <project-name>`).

---

## 📈 Next Steps
1. Initialize the new dependency structure (Clack, Conf).
2. Implement the `ProfileManager`.
3. Refactor the `GeneratorEngine` to be config-driven.
4. Build the TUI wrapper.
