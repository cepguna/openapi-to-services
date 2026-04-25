# 🚀 OpenAPI → Services Generator

An internal tool by **joonacode** to transform OpenAPI specs into fully structured, frontend-ready service layers.

---

## 🧠 Overview

This tool takes an OpenAPI schema and automatically generates a clean, scalable service architecture for your frontend (Axios + React Query).

Instead of manually wiring endpoints, types, and hooks — everything is generated and organized by **tags**.

---

## ⚙️ How It Works

### 1. Fetch OpenAPI Schema

Provide your OpenAPI endpoint:

```bash
http://localhost:8000/openapi.json
```

---

### 2. Generate Services by Tags

Endpoints are grouped based on their `tags` and mapped into:

```
src/services-generated/
  ├── auth/
  ├── user/
  └── ...
```

Each tag becomes its own domain module.

---

### 3. Generate Service Layer Files

For every tag, the generator creates **4 core files**:

#### 📦 `types.ts`

* Contains all TypeScript types derived from the OpenAPI schema
* Ensures full type safety across your app

#### 🔌 `<tag>.ts` (formerly `service.ts`)

* Axios-based API client
* Named after the group/tag (e.g. `auth.ts`, `user.ts`)
* Maps directly to backend endpoints

#### ⚛️ `use-service.ts`

* Prebuilt React Query hooks
* Includes:

  * `useQuery`
  * `useMutation`
* Ready for immediate use in components

#### 📚 `index.ts`

* Re-exports everything within the module
* Provides a clean import surface

Example:

```ts
export * from './types'
export * from './auth'
export * from './use-service'
```

---

### 4. Generate Query Key Types

A centralized file is created:

```
src/types/query-types-generated.ts
```

This file:

* Stores all React Query keys
* Keeps cache keys consistent and type-safe
* Helps avoid duplication and bugs in query management

---

## 🏗️ Example Output Structure

```
src/
  ├── services-generated/
  │   ├── auth/
  │   │   ├── index.ts
  │   │   ├── types.ts
  │   │   ├── auth.ts
  │   │   └── use-service.ts
  │   ├── user/
  │   │   ├── index.ts
  │   │   ├── types.ts
  │   │   ├── user.ts
  │   │   └── use-service.ts
  │
  └── types/
      └── query-types-generated.ts
```

---

## 💡 Why This Structure?

* **Domain-based modules** → easier scaling
* **Named service files (`auth.ts`)** → clearer ownership vs generic `service.ts`
* **Centralized exports (`index.ts`)** → cleaner imports:

```ts
import { login, useLogin } from '@/services-generated/auth'
```

* **Generated hooks + services together** → better DX and discoverability

---

## ⚠️ Notes

* Relies on properly defined OpenAPI `tags`
* Generated files may be overwritten — avoid manual edits
