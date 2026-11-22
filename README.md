# PizzaHub Server — Backend REST API

> **PizzaHub Server** is the backend REST API for the PizzaHub platform, providing secure authentication, order handling, kitchen management, and Stripe subscription processing.

---

## 🌐 Live URL & Repositories

- **Live Server API:** [https://pizzahub-server-pearl.vercel.app](https://pizzahub-server-pearl.vercel.app)
- **Live Client Application:** [https://pizzahub-orcin.vercel.app](https://pizzahub-orcin.vercel.app)
- **Server Repository:** [https://github.com/rabbihossen124/pizzahub-server](https://github.com/rabbihossen124/pizzahub-server)
- **Client Repository:** [https://github.com/rabbihossen124/PizzaHub](https://github.com/rabbihossen124/PizzaHub)

---

## 🍕 Project Overview

PizzaHub Server powers the core business logic and database interactions for the PizzaHub ecosystem:
- **Role-Based Access Control:** Secure JWT middleware verifying Customer, Vendor, and Admin privileges.
- **Menu Management:** Endpoints for listing, filtering, searching, and moderating artisanal pizzas.
- **Order Lifecycle:** Validation guards for pizza orders, duplicate prevention, and kitchen status updates.
- **Subscription Billing:** Stripe webhook integration handling Vendor Premium tier upgrades.

---

## 🚀 Key Features

### 1. Authentication & Security
- Secure JWT-based session token verification.
- Server-side role authorization guarding administrative and vendor operations.
- User account status checks preventing blocked accounts from performing actions.

### 2. Menu & Order Management
- Dynamic menu filtering by category, search keywords, and price sorting.
- Order placement validations preventing duplicate orders and invalid dates.
- Real-time kitchen order status updates (Accept/Reject) with state locking.

### 3. Vendor Subscriptions
- Stripe payment integration for pizzeria vendor tier upgrades.
- Webhook signature verification ensuring reliable activation.

### 4. Admin Governance
- User directory management with account status moderation.
- Menu review system for approving or rejecting vendor submissions.
- Financial transaction auditing.

---

## 🛠️ Technology Stack

- **Runtime & Framework:** Node.js, Express.js
- **Database:** MongoDB Atlas (Native MongoDB Node.js Driver)
- **Authentication:** JSON Web Tokens (JWT)
- **Payment Processing:** Stripe API
- **Deployment:** Vercel
