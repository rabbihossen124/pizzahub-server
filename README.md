# PizzaHub Server — Backend API

PizzaHub is a full-featured, role-based food ordering and restaurant delivery platform. This repository contains the scalable backend REST API built with Node.js, Express, MongoDB Atlas, JWT authentication, and Stripe payments.

---

## 🍕 Project Overview

- **Project Name:** PizzaHub — Pizza Ordering & Delivery Platform (Server)
- **Live Server API:** [https://pizzahub-server-pearl.vercel.app](https://pizzahub-server-pearl.vercel.app)
- **Live Client Web App:** [https://pizzahub-orcin.vercel.app](https://pizzahub-orcin.vercel.app)
- **Server Repository:** [https://github.com/rabbihossen124/pizzahub-server](https://github.com/rabbihossen124/pizzahub-server)
- **Client Repository:** [https://github.com/rabbihossen124/PizzaHub](https://github.com/rabbihossen124/PizzaHub)
- **Architecture:** Modular MVC REST API with Express.js & MongoDB Native Driver
- **Authentication:** JWT Token Verification Middleware & Role-Based Access Control (Admin, Vendor, Customer)
- **Payment Processing:** Stripe Checkout Session & Webhook Integration for Vendor Premium Subscriptions

---

## 🚀 Key Features

1. **Role-Based Access Control (RBAC):**
   - **Customer:** Browse approved menus, submit delivery orders, track order history, cancel pending orders.
   - **Vendor:** Manage restaurant profile, add/edit/delete menu items, accept/reject incoming customer orders, upgrade to Premium subscription.
   - **Admin:** Platform overview analytics, search and block/unblock users, review and approve/reject menu submissions, read-only transaction auditing.
2. **Menu Item Management & Approval Workflow:**
   - Vendor submissions are assigned `pending` status by default until reviewed by an administrator.
   - Free tier vendors are strictly limited to a maximum of 3 active/pending items.
   - Premium tier vendors enjoy unlimited menu listings and featured placement.
3. **Order Lifecycle & Validation Guards:**
   - Server-side validations prevent vendors from ordering their own food items.
   - Prevents duplicate active orders for the same item and delivery date.
   - Past delivery dates are rejected.
   - Once accepted or rejected by a vendor, orders cannot be modified again.
4. **Stripe Payment & Webhook Security:**
   - Vendors upgrade to Premium via Stripe Checkout.
   - Premium access is activated only upon receiving a cryptographically verified Stripe webhook event (`checkout.session.completed`).
   - Idempotent transaction logging prevents duplicate records.
5. **Security & Data Protection:**
   - Protected endpoints require valid `Bearer <token>` authorization headers.
   - Blocked users (`isBlocked: true`) are rejected by middleware with `403 Forbidden`.
   - Never exposes sensitive credentials; `.env` is strictly excluded from version control.

---

## 🛠️ Technology Stack

| Technology | Purpose | Package / Version |
| :--- | :--- | :--- |
| **Node.js & Express.js** | Backend application server | `express ^5.3.0` |
| **MongoDB Atlas** | NoSQL database | `mongodb ^7.9.0` |
| **Authentication & Tokens** | Cryptographic token signing & validation | `jsonwebtoken ^9.0.3` |
| **Payment Gateway** | Subscription checkout & webhooks | `stripe ^20.x` |
| **CORS Middleware** | Cross-Origin Resource Sharing | `cors ^2.8.6` |
| **Environment Configuration** | Secure environment variables loading | `dotenv ^18.0.10` |

---

## ⚙️ Environment Variables Guide

Create a `.env` file in the root of the server directory:

```env
# Server Port
PORT=5000

# MongoDB Database Connection
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=PizzaHub

# Client URL (CORS allowed origins)
CLIENT_URL=http://localhost:3000

# Authentication & JWT Secret Key
BETTER_AUTH_SECRET=your_super_secret_better_auth_key
JWT_SECRET=your_jwt_signing_secret_key
BETTER_AUTH_URL=http://localhost:3000

# Stripe Payment Keys (Vendor Subscriptions)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ImgBB API Key (Image hosting)
IMGBB_API_KEY=your_imgbb_api_key
```

> [!CAUTION]
> Never commit `.env` or sensitive API keys to GitHub. The `.gitignore` file is pre-configured to keep credentials private.

---

## 💻 Installation & Running Locally

### 1. Clone the repository
```bash
git clone https://github.com/your-username/PizzaHub-Server.git
cd PizzaHub-Server
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run in Development Mode
```bash
npm run dev
```

### 4. Run in Production Mode
```bash
npm start
```
The server will start listening at `http://localhost:5000`.

---

## 🏆 Challenge Requirements Implementation

### Challenge 1: Advanced Search and Price Sorting
- **Endpoint:** `GET /api/menu`
- **Query Parameters:**
  - `search`: Case-insensitive regex matching across `itemName`, `description`, and `location`.
  - `category`: Filters items matching exact category or `All`.
  - `location`: Area / city regex filter.
  - `minPrice` & `maxPrice`: Custom budget range filtering.
  - `sort`: 
    - `price_asc`: Sorts by price ascending (low to high).
    - `price_desc`: Sorts by price descending (high to low).
    - `name_asc`: Alphabetical A to Z.
    - `newest`: Latest submissions first (default).
  - `page` & `limit`: Server-side pagination returning total items, total pages, current page, and navigation indicators.
- **Filter Metadata:** `GET /api/menu/meta` dynamically aggregates available cities, category lists, and minimum/maximum prices from the database for instant frontend dropdown population.

### Challenge 2: Robust JWT Verification Middleware Flow
- **Middleware:** `middlewares/auth.js` -> `verifyJWT` & `requireRole(...roles)`
- **Execution Flow:**
  1. Requests to private endpoints send an `Authorization: Bearer <token>` header.
  2. `verifyJWT` checks for token presence. If missing or malformed -> **401 Unauthorized**.
  3. Token is verified against `JWT_SECRET` with expiration checks. If expired or invalid -> **401 Unauthorized**.
  4. The middleware queries `usersCollection` to verify the user is not suspended or blocked. If `isBlocked: true` -> **403 Forbidden**.
  5. The decoded user payload (`userId`, `email`, `role`) is attached to `req.user`.
  6. `requireRole('admin' | 'vendor' | 'customer')` verifies role authorization on the server side. Unauthorized roles are rejected with **403 Forbidden**.

---

## 📡 API Reference Overview

### Public & Authentication Endpoints
- `GET /` — Server health check
- `POST /api/auth/token` — Issues JWT token for authenticated session
- `GET /api/auth/me` — Retrieves authenticated user profile

### Menu Endpoints (`/api/menu`)
- `GET /api/menu` — Public browse with search, filters, and price sorting
- `GET /api/menu/categories` — Official pizza categories
- `GET /api/menu/featured` — Featured items for homepage
- `GET /api/menu/meta` — Filter metadata (price ranges, locations)
- `GET /api/menu/:id` — Single item details
- `POST /api/menu` — Vendor adds item (Enforces 3-item limit for free tier)
- `PUT /api/menu/:id` — Vendor/Admin updates own item
- `DELETE /api/menu/:id` — Vendor/Admin deletes own item
- `GET /api/menu/vendor/my-items` — Vendor's complete menu catalog

### Vendor Endpoints (`/api/vendor`)
- `GET /api/vendor/stats` — Overview metrics for Vendor Dashboard
- `GET /api/vendor/limit-check` — Real-time 3-item limit and slot availability check

### Order Endpoints (`/api/orders`)
- `POST /api/orders` — Customer places an order (Validates dates & duplicates)
- `GET /api/orders/my-orders` — Customer order history with status filters
- `GET /api/orders/customer/stats` — Customer Dashboard overview metrics
- `PATCH /api/orders/:id/cancel` — Customer cancels pending order
- `GET /api/orders/vendor` — Vendor incoming orders list & summary counts
- `PATCH /api/orders/:id/status` — Vendor accepts or rejects pending order
- `GET /api/orders/:id` — Single order details view

### Payment & Webhook Endpoints (`/api/payment` & `/api/webhook`)
- `POST /api/payment/create-checkout-session` — Creates Stripe session for Premium upgrade
- `GET /api/payment/session/:sessionId` — Retrieves session payment status
- `POST /api/payment/confirm-session` — Direct Stripe API confirmation fallback
- `GET /api/payment/transactions` — Vendor & Admin transaction history
- `POST /api/webhook/stripe` — Cryptographically verified webhook for auto-activation

### Admin Endpoints (`/api/admin`)
- `GET /api/admin/stats` — High-level platform analytics & revenue summary
- `GET /api/admin/users` — User management directory with search & role filter
- `PATCH /api/admin/users/:id/block` — Block / Unblock user accounts
- `GET /api/admin/menu` — All menu submissions across platform
- `PATCH /api/admin/menu/:id/status` — Approve or reject menu items
- `DELETE /api/admin/menu/:id` — Delete inappropriate menu items
- `GET /api/admin/transactions` — Read-only platform transactions record

---

## 🔒 Security Best Practices
- Strict server-side role validation on all protected routes.
- Webhook signature verification prevents spoofed payment events.
- Express raw buffer handling for Stripe webhooks.
- MongoDB injection prevention using parameterized queries and strict ObjectIDs.
- Idempotent database operations prevent race conditions.
