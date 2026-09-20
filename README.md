# Atino Booking Webapp

An enterprise delivery booking and warehouse intake management web platform built for Atino distribution logistics. The application coordinates suppliers (NCC), warehouse reviewers, on-site receivers, and operations management in real time.

---

## Key Features

### 1. Supplier Portal (Nhà Cung Cấp)
- **Account Registration & Approval**: Self-service registration with automated admin verification and role assignment.
- **Dynamic Delivery Booking**: Schedule delivery dates adhering to business capacity limits (minimum lead times, daily quantity ceilings).
- **PO & Product Line Item Entry**: Direct itemized booking with process codes, sizes, colors, and quantity counts.
- **Document & Proof Upload**: Secure upload of delivery slips (Phiếu giao hàng) and VAT invoices (Hóa đơn VAT) directly to Google Cloud Storage.
- **Booking Confirmation & QR Pass**: System-generated booking token and QR code pass for driver check-in on delivery day.

### 2. Warehouse Reviewer Portal
- **Real-Time Intake Review**: Live queue of upcoming delivery bookings.
- **Line-Item Verification**: Approve, reject, or request quantity amendments on individual PO lines.
- **Status Workflows**: Transition bookings seamlessly across statuses (`PENDING`, `APPROVED`, `PARTIAL_APPROVED`, `CANCELLED`).

### 3. Warehouse Receiver Portal
- **Camera QR Scanner & Manual Lookup**: High-speed QR scanner for incoming trucks and delivery drivers at the gate.
- **Physical Count Reconciliation**: Compare physical carton/unit counts against approved PO numbers.
- **Instant Intake Recording**: Mark bookings as received with timestamped staff signatures.

### 4. Admin & Operations Management
- **Role-Based Access Control**: Granular routes and capability access for Admin, Manager, Reviewer, Receiver, and Supplier.
- **Master Data Management**: Manage active warehouse facilities, suppliers, and staff permissions.
- **Operational Reports & Exports**: Aggregated volume charts, date range filtering, and one-click Microsoft Excel (`.xlsx`) reporting.

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
