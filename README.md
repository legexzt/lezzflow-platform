# LezzFlow Platform Backend

Production-grade Node.js REST API for the LezzFlow hyper-local commerce platform. Built with Express, PostgreSQL 15, Firebase Authentication, AWS Bedrock AI Scanner, and OpenFoodFacts barcode recognition.

---

## 🛠 Tech Stack

- **Runtime & Framework**: Node.js 20+, Express 5
- **Database**: PostgreSQL 15 (with relational integrity, migrations, and indexing)
- **Authentication**: Firebase Admin SDK (Google Sign-In / ID Token verification)
- **AI Product Scanner**: AWS Bedrock Converse API using `moonshotai.kimi-k3` in `us-east-1`
- **Barcode Scanner**: OpenFoodFacts v2 REST API integration
- **File Storage**: Modular storage engine (Local disk storage + AWS S3 extensible provider)
- **Security**: Helmet, CORS, Express-Rate-Limit, Role-Based Access Control (RBAC)
- **Containerization**: Docker (Node 20 Alpine) & Docker Compose (API + PostgreSQL 15)
- **Testing**: Jest + Supertest (unit & integration testing with in-memory PostgreSQL engine)

---

## 📁 Project Structure

```text
/home/hatch/workspace/lezzflow-platform/
├── app.js                      # Express application setup, security, and routes
├── server.js                   # Server bootstrap and graceful shutdown handler
├── Dockerfile                  # Production container definition (node:20-alpine)
├── docker-compose.yml          # Multi-container orchestration (api + postgres:15)
├── package.json                # Dependencies and npm lifecycle scripts
├── .env.example                # Template for environment configuration
├── config/
│   ├── aws.js                  # AWS Bedrock Runtime Client configuration
│   ├── db.js                   # PostgreSQL connection parameters
│   └── firebase.js             # Firebase Admin SDK initialization from env vars
├── db/
│   ├── index.js                # Database pool manager (pg & test pg-mem adapter)
│   ├── migrate.js              # Database migration runner
│   └── migrations/
│       └── 001_initial_schema.sql # DDL for users, shops, products, orders, delivery, kyc
├── middleware/
│   ├── auth.js                 # Firebase ID token verification & DB user attachment
│   ├── role.js                 # RBAC authorization middleware (seller, customer, partner, admin)
│   ├── upload.js               # Multer multipart memory storage middleware
│   ├── rateLimiter.js          # API rate limiting
│   └── errorHandler.js         # Centralized global JSON error handler
├── controllers/
│   ├── authController.js       # Firebase token verification & user upsert
│   ├── shopController.js       # Shop management & seller ownership checks
│   ├── productController.js    # Product catalog & seller shop validation
│   ├── discoverController.js   # Haversine distance layering (5km, 10km, 20km)
│   ├── orderController.js      # Order lifecycle & legal status transitions
│   ├── deliveryController.js   # Partner delivery assignment & KYC gating
│   ├── kycController.js        # KYC submission & admin approve/reject flow
│   ├── scanController.js       # Bedrock AI and OpenFoodFacts scanners
│   └── uploadController.js     # Media file uploader (Local / S3)
├── routes/
│   ├── index.js                # Route aggregator & /api/payment
│   ├── authRoutes.js           # /api/auth
│   ├── shopRoutes.js           # /api/shops
│   ├── productRoutes.js        # /api/products
│   ├── discoverRoutes.js       # /api/discover
│   ├── orderRoutes.js          # /api/orders
│   ├── deliveryRoutes.js       # /api/delivery
│   ├── kycRoutes.js            # /api/kyc & /api/admin/kyc
│   ├── scanRoutes.js           # /api/scan
│   └── uploadRoutes.js         # /api/upload
├── services/
│   ├── bedrockService.js       # Bedrock Converse API with image bytes & prompt
│   ├── barcodeService.js       # OpenFoodFacts v2 barcode lookup
│   ├── distanceService.js      # Haversine math & distance bucket layering
│   └── storageService.js       # File storage abstraction (Local / S3)
└── tests/
    ├── helpers/
    │   └── testDb.js           # In-memory DB setup, seeding, and auth mocks
    ├── auth.test.js            # Auth middleware & Firebase token verification tests
    ├── discover.test.js        # Haversine distance math & layering unit/integration
    ├── orderTransitions.test.js# Order state machine & fulfillment rules
    ├── kycFlow.test.js         # Partner KYC verification & delivery flow
    ├── scan.test.js            # Bedrock Converse AI & barcode lookup mocked tests
    └── endpoints.test.js       # CRUD, health, uploads, and 404 tests
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | API server HTTP port | `3000` |
| `NODE_ENV` | Environment mode | `production` / `development` / `test` |
| `AUTO_MIGRATE` | Auto-run SQL migrations on startup | `true` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgrespassword@localhost:5432/lezzflow` |
| `PGHOST` | Database host | `localhost` / `postgres` |
| `PGPORT` | Database port | `5432` |
| `PGUSER` | Database user | `postgres` |
| `PGPASSWORD` | Database password | `postgrespassword` |
| `PGDATABASE` | Database name | `lezzflow` |
| `FIREBASE_PROJECT_ID` | Firebase project identifier | `lezzflow-dev` |
| `FIREBASE_CLIENT_EMAIL`| Firebase service account email | `service-account@lezzflow.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key | `"-----BEGIN PRIVATE KEY-----\n..."` |
| `AWS_REGION` | AWS region for Bedrock | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | AWS access key for Bedrock Converse | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY`| AWS secret key for Bedrock Converse | `...` |
| `BEDROCK_MODEL_ID` | AWS Bedrock model identifier | `moonshotai.kimi-k3` |
| `STORAGE_PROVIDER` | Media storage engine | `local` (default) or `s3` |
| `UPLOAD_DIR` | Local disk upload directory | `./uploads` |
| `AWS_S3_BUCKET` | Optional S3 bucket name when using S3 | `lezzflow-uploads` |

---

## 🚀 Running with Docker Compose

To start both the PostgreSQL 15 container and the LezzFlow API with persistent volumes and health checks:

```bash
# Build and run containers
docker-compose up --build

# Run in detached background mode
docker-compose up -d --build

# Check container status
docker-compose ps

# View live API logs
docker-compose logs -f api
```

The database initializes migrations automatically from `./db/migrations` via `/docker-entrypoint-initdb.d`, and the API waits for PostgreSQL health checks before launching.

---

## 🧪 Running Tests

The test suite runs with Jest and Supertest against an in-memory PostgreSQL engine (`pg-mem`), requiring no external dependencies:

```bash
# Run all test suites
npm test

# Run tests with coverage summary
npx jest --coverage --runInBand --forceExit
```

All 6 test suites cover:
1. `tests/auth.test.js`: Firebase token verification & DB user attachment.
2. `tests/discover.test.js`: Haversine math & distance layering (within5km, within10km, within20km).
3. `tests/orderTransitions.test.js`: Order state machine transitions (`placed` -> `accepted` -> `packed`) & delivery assignment.
4. `tests/kycFlow.test.js`: Partner KYC submission, admin approve/reject, and delivery gating.
5. `tests/scan.test.js`: AWS Bedrock `moonshotai.kimi-k3` Converse API and OpenFoodFacts barcode lookup.
6. `tests/endpoints.test.js`: Shop & product CRUD, health check, payment status, and upload endpoints.

---

## 📡 API Overview

### 1. Authentication (`/api/auth`)
- **`POST /api/auth/verify`**: Verifies Firebase ID token, upserts user in database, returns `{ user, role }`.
- **`GET /api/auth/me`**: Returns currently authenticated user (requires `Authorization: Bearer <token>`).

### 2. Shops (`/api/shops`)
- **`GET /api/shops`**: List all shops (or `?mine=true` for authenticated seller's shops).
- **`POST /api/shops`**: Create shop (`seller` role).
- **`GET /api/shops/:id`**: Get shop details.
- **`PUT /api/shops/:id`**: Update shop (seller must own shop).
- **`DELETE /api/shops/:id`**: Delete shop (seller must own shop).

### 3. Products (`/api/products`)
- **`GET /api/products`**: List products (filter by `shop_id`, `category`, `search`).
- **`POST /api/products`**: Add product (`seller` role, verified against seller's shop).
- **`GET /api/products/:id`**: Get product details.
- **`PUT /api/products/:id`**: Update product (seller must own shop).
- **`DELETE /api/products/:id`**: Delete product (seller must own shop).

### 4. Discovery (`/api/discover`)
- **`GET /api/discover?lat=&lng=`**: Finds open shops, calculates distances using Haversine, and groups into `{ within5km: [], within10km: [], within20km: [] }`.

### 5. Orders (`/api/orders`)
- **`POST /api/orders`**: Create order (`customer` role, `fulfillment`: `'delivery'` or `'pickup'`).
- **`GET /api/orders`**: List orders for user (filtered by customer or seller).
- **`GET /api/orders/:id`**: Get order details.
- **`PATCH /api/orders/:id/status`**: Update order status (`seller` role, enforces legal transitions: `placed` -> `accepted` -> `packed`).
- **`POST /api/orders/:id/assign-delivery`**: Creates a `delivery_request` with status `requested` for `delivery` orders (returns 400 for `pickup`).

### 6. Delivery Requests (`/api/delivery`)
- **`GET /api/delivery/requests`**: Partner lists unassigned requested deliveries or deliveries assigned to them (`partner` role, requires approved KYC).
- **`PATCH /api/delivery/requests/:id`**: Partner updates delivery status (`requested` -> `accepted` -> `picked` -> `delivered`, syncing order status).

### 7. Partner KYC & Admin Review (`/api/kyc`, `/api/admin/kyc`)
- **`POST /api/kyc`**: Partner submits Aadhaar, PAN, and License document URLs (`pending` status).
- **`GET /api/kyc`**: Partner checks KYC verification status.
- **`GET /api/admin/kyc/pending`**: Admin lists pending KYC submissions (`admin` role).
- **`POST /api/admin/kyc/:id/approve`**: Admin approves KYC (`admin` role).
- **`POST /api/admin/kyc/:id/reject`**: Admin rejects KYC (`admin` role).

### 8. Scanners (`/api/scan`)
- **`POST /api/scan/ai`**: Multipart image upload -> AWS Bedrock Converse API with `moonshotai.kimi-k3` -> returns `{ name, category, description }`.
- **`POST /api/scan/barcode`**: Accepts `{ code }` -> queries OpenFoodFacts v2 -> returns `{ found, name, brands, image }` or `{ found: false }`.

### 9. Upload & Utilities
- **`POST /api/upload`**: Multipart file upload (`file` or `image`), saved to `./uploads/` (or S3), returns `{ url, filename, storage }`.
- **`GET /api/payment`**: Returns `{ status: 'coming_soon', message: 'Payment coming soon' }`.
- **`GET /health`**: Health check returning `{ status: 'ok', uptime, timestamp }`.
