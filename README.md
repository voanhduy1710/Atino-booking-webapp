# [Atino Booking Webapp](https://giacong.atino.vn)

An enterprise delivery booking and warehouse intake management web platform built for Atino distribution logistics. The application coordinates suppliers (NCC), warehouse reviewers, on-site receivers, and operations management in real time.

---

## Key Features

- **Smart Booking & Capacity Engine**:
  - **Daily Intake Limit (Max 20,000 items/day)**: Real-time warehouse capacity tracking prevents overload with atomic database locking (`0 / 20.000` live capacity indicator).
  - **17:30 ICT Cutoff Logic**: Bookings submitted before 17:30 (GMT+7) qualify for N+1 delivery; submissions after 17:30 automatically advance the earliest delivery window to N+2.
  - **Scheduled Shift Slots**: Standardized dock arrival windows for balanced throughput: Morning (`08:00 – 11:30`) and Afternoon (`13:30 – 17:00`).
  - **Line Item & Size Matrix**: Multi-size breakdown (S/28 through 4XL/34) with strict sum validation against total quantities.
  - **Phased Rounds & Document Rules**: Multi-round delivery tracking (Lần 1–10) with mandatory VAT invoice upload on Round 1 and delivery slips on all bookings.
- **Fast-Track Gate Intake**: Instant QR driver passes and camera-based QR scanner for physical count verification and timestamped intake receipts.
- **Warehouse Review & Item Verification**: Granular line-item approvals (`Đã xác nhận`, `Trả hàng`, `Đang chờ xác nhận`) and live intake status tracking.
- **Operations & Master Data**: Multi-role RBAC (Supplier, Reviewer, Receiver, Admin), warehouse configuration, and one-click Excel (`.xlsx`) reporting.

---

## Preview

### 1. Landing Portal & Access Gateway
Central hub for delivery registration, operational guidelines, and account authentication.

![Landing Portal](public/Preview_1.png)

### 2. Delivery Registration & Daily Capacity Checker
Live capacity tracker (20,000 daily ceiling), shift slot selector, size breakdown, and document upload.

![Delivery Registration](public/Preview_2.png)

### 3. Supplier Step-by-Step Delivery Guide
Guided standard operating procedure (SOP) for suppliers from account login to QR pass issuance.

![Supplier Guide](public/Preview_3.png)

### 4. Warehouse Intake Verification & Approval Queue
Operational review board for line-item inspection, quantity reconciliation, and status approval.

![Warehouse Review](public/Preview_4.png)

---

## Architecture & Integrations

```
┌────────────────────────────────────────────────────────┐
│                   React 18 Frontend                    │
│     Vite • Tailwind CSS • TanStack Query • Zod         │
└───────────────────────────▲────────────────────────────┘
                            │ (HTTP / JSON API)
┌───────────────────────────▼────────────────────────────┐
│                  Express 5 API Server                  │
│       TypeScript • Session Auth • Service Layer        │
└───────┬───────────────────┬───────────────────┬────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Supabase   │    │ Google Cloud │    │   Nhanh.vn   │
│  PostgreSQL  │    │   Storage    │    │   Open API   │
│ (RLS + RPCs) │    │  (GCS Media) │    │  (ETL Sync)  │
└──────────────┘    └──────────────┘    └──────────────┘
```

- **Frontend**: Single Page Application powered by React 18, React Router v7, React Hook Form, and Tailwind CSS.
- **Backend API**: Express 5 application serving API endpoints and production static assets from a unified container.
- **Database**: Supabase PostgreSQL with strict Row Level Security (RLS) policies, foreign-key constraints, and atomic RPC functions.
- **Storage**: Google Cloud Storage bucket with private access enforcement and signed media URL generation.
- **ERP Integration**: Synchronizes purchase catalog, drafts, and product attributes from Nhanh.vn.
- **Notifications**: Automated dispatch alerts via Lark / Feishu Open Platform.

---

## Project Structure

```
Atino-booking-webapp/
├── server/                     # Express backend source code
│   ├── config/                 # Capabilities & storage configuration
│   ├── etl/                    # Nhanh product ETL synchronization scripts
│   ├── lib/                    # GCS, JWT, Supabase, and resilient fetch helpers
│   ├── routes/                 # Express API routes (auth, booking, receiver, etc.)
│   └── index.ts                # Server entry point
├── src/                        # React frontend source code
│   ├── app/                    # Routing, providers, and main application entry
│   ├── features/               # Feature-based domain modules
│   │   ├── accounts/           # User management
│   │   ├── admin/              # Admin dashboard & reports
│   │   ├── auth/               # Login, registration, role guards
│   │   ├── booking/            # Supplier booking form & confirmation
│   │   ├── home/               # Public landing & user guides
│   │   ├── notifications/      # Notification panels
│   │   ├── productProcess/     # Product process catalog
│   │   ├── supplier/           # Supplier management views
│   │   └── warehouse/          # Reviewer & receiver workflows
│   └── shared/                 # Shared UI components, hooks, utilities, and types
├── supabase/                   # Supabase migrations and database schema
├── public/                     # Static brand assets and SVGs
├── Dockerfile                  # Production container definition
├── deploy.ps1                  # Production deployment script (Google Cloud Run)
└── clean_restart.ps1           # Local developer environment reset script
```

---

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)
- Supabase project credentials
- Google Cloud Storage service account (for file uploads)

### 1. Clone the Repository
```bash
git clone https://github.com/voanhduy1710/Atino-booking-webapp.git
cd Atino-booking-webapp
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy the provided `.env.example` template:
```bash
cp .env.example .env
```

Fill in the required variables in `.env`:
```env
# Client-Side (Vite)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Server-Side
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
AUTH_JWT_SECRET=your_secure_random_32_character_secret

# Google Cloud Storage (JSON key string)
GCS_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GCS_BUCKET=your-media-bucket-name

# Third-party Integrations
LARK_APP_ID=your_lark_app_id
LARK_APP_SECRET=your_lark_app_secret
NHANH_APP_ID=your_nhanh_app_id
NHANH_BUSINESS_ID=your_nhanh_business_id
NHANH_ACCESS_TOKEN=your_nhanh_access_token
```

---

## Development & Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Vite frontend dev server on `http://localhost:5173` |
| `npm run server:dev` | Start Express backend API with file watching on `http://localhost:3001` |
| `npm run typecheck` | Run TypeScript type checks across frontend and backend |
| `npm run test` | Run Vitest unit and integration test suite |
| `npm run test:watch` | Run tests in interactive watch mode |
| `npm run test:e2e` | Execute Playwright end-to-end tests |
| `npm run build` | Compile TypeScript and build production bundle into `dist/` |

### PowerShell Helper Scripts

For Windows developers, automated PowerShell workflows are provided in the repository root:

- `.\deploy_local.ps1`: Kills conflicting port processes, installs dependencies (if missing), validates environment, and launches both frontend (port 5173) and Express backend (port 3001) in a single terminal.
- `.\clean_restart.ps1`: Forcefully terminates lingering Node processes, clears dev ports (5173, 5174, 3001), clears the Vite cache, and restarts a fresh local development environment.
- `.\deploy.ps1`: Complete production deployment pipeline that runs typechecks, linting, tests, builds the production frontend, builds the Docker image to Google Cloud Artifact Registry, and deploys to Google Cloud Run.

---

## Security & Best Practices

- **Never Commit Secrets**: Live `.env` files, personal MCP configs, and service account keys are strictly excluded via `.gitignore`.
- **Database Isolation**: Browser clients interact with database tables strictly through Row Level Security (RLS) policies and backend API endpoints.
- **Sanitized Uploads**: Media uploads validate MIME types and file size limits before generating private Google Cloud Storage paths.
- **Session Tokens**: Authentication tokens are signed using standard JWT algorithms with role verification middleware.

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.
