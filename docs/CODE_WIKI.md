# Julmin Taxis Code Wiki

## 1. Repository Overview

This repository is a mixed-stack transportation platform centered on a Django application, with additional PHP and Node.js side services plus several standalone HTML/PWA pages.

At a high level, the repository contains:

- A Django backend and web delivery layer in `julmin_taxis_django/`
- Legacy or supporting PHP integrations in `phpscript/`
- A small Node/Express WhatsApp webhook service in `whatsapp-webhook/`
- Root-level HTML, JavaScript, and PWA assets used as customer, driver, admin, and enterprise interfaces

The Django project is the main orchestration layer. It exposes REST APIs, websocket endpoints, server-rendered and HTMX-style endpoints, static/media delivery, and wrapper views that serve the root HTML pages.

## 2. Top-Level Structure

```text
Julmin Taxis (2)/
|- julmin_taxis_django/      Main Django project and domain apps
|- phpscript/                PHP chatbot, email, and Firebase watcher utilities
|- whatsapp-webhook/         Node/Express webhook service for WhatsApp callbacks
|- Daxi/                     Static landing/demo frontend assets
|- assets/                   Shared static assets
|- *.html                    Standalone app pages served directly or via Django wrappers
|- manifest.json             PWA manifest
|- sw.js                     Service worker
|- firebase-messaging-sw.js  Firebase messaging service worker
|- various patch/test files  Maintenance, experiments, and migration helpers
```

## 3. Architecture Summary

### Primary Runtime

The primary runtime is Django 4.2 with:

- Django REST Framework for API endpoints
- Simple JWT for authentication
- Channels and Daphne for websocket support
- django-environ and python-dotenv for environment-driven settings
- django-cors-headers for CORS management
- django-filter for filtered API views
- Shapely and custom geometry logic for pricing and zone checks

### Secondary Runtimes

- PHP scripts provide supporting chatbot/email flows and Firebase-related automation
- Node.js provides a lightweight WhatsApp webhook endpoint

### Delivery Model

The repository does not use a single frontend build system. Instead, it mixes:

- Django APIs and HTMX endpoints
- Root-level static HTML pages for rider, driver, admin, and enterprise views
- PWA support via `manifest.json` and service workers
- Firebase-compatible JSON endpoints to keep older frontend flows working
## 4. System Architecture

```text
Client Pages / PWA / Root HTML
        |
        v
Django URL Layer
|- REST API routes
|- HTMX/action routes
|- Wrapper views for legacy HTML pages
|- Firebase-compatible routes
|- WhatsApp webhook endpoint
        |
        v
Domain Apps
|- accounts
|- orders
|- drivers
|- pricing
|- enterprises
|- chat
|- chatbot
|- notifications
|- forum
|- admin_panel
|- firebase_db
        |
        +--> SQLite by default
        +--> Redis optional for Channels
        +--> SMTP for outbound email
        +--> Groq/Gemini style AI integrations
        +--> External WhatsApp/Firebase ecosystems

Side Services
|- phpscript/ Firebase watcher + email automation
|- whatsapp-webhook/ Meta webhook validation and message intake
```

## 5. Main Django Project

### Core Files

- `julmin_taxis_django/manage.py`
  - Standard Django CLI entry point
- `julmin_taxis_django/julmin_taxis/settings.py`
  - Global configuration, installed apps, auth model, channels, static/media, JWT, email, and environment loading
- `julmin_taxis_django/julmin_taxis/urls.py`
  - Main URL router for APIs, webhook endpoints, legacy page serving, and static root-page wrappers
- `julmin_taxis_django/julmin_taxis/asgi.py`
  - ASGI entry point combining websocket routes from multiple apps
- `julmin_taxis_django/julmin_taxis/htmx_urls.py`
  - Secondary routing map for interactive action endpoints
- `julmin_taxis_django/julmin_taxis/htmx_views.py`
  - Large operational controller for customer, driver, admin, payment, tracking, and enterprise flows

### Architectural Role

The Django project is both the API server and the integration shell for the rest of the platform. It handles:

- User identity and role management
- Order lifecycle orchestration
- Driver assignment and tracking
- Dynamic price calculation
- Notification dispatch
- Enterprise account workflows
- Chat and chatbot workflows
- Admin dashboard aggregation
- Firebase-compatible bridging for older clients
- Websocket-based realtime updates

## 6. Major Modules and Responsibilities

### 6.1 `accounts`

Purpose: authentication, user identity, profile management, OTP flows, and device token storage.

Key classes and functions:

- `CustomUser`
  - Custom auth model configured as `AUTH_USER_MODEL`
  - Stores role-related and profile-related information used across the platform
- `generate_otp()`
  - Generates one-time passcodes for verification/reset flows
- `verify_otp()`
  - Validates OTP expiration and correctness
- `RegisterView`
  - Creates new users
- `LoginView`
  - Authenticates users and supports JWT-based access
- `ProfileView`
  - Returns or manages authenticated profile data

Dependencies:

- Referenced by `orders`, `drivers`, `chat`, `forum`, `notifications`, and other apps
- Works with `notifications.EmailService` for OTP and reset messaging

### 6.2 `orders`

Purpose: central domain model for ride/trip creation, status management, pricing proposal, driver assignment, and order messaging.

Key classes and functions:

- `Order`
  - Core business entity for a taxi request/trip
  - Stores user, driver, status, route, pricing, and payment-state information
- `OrderMessage`
  - Order-scoped communication stream
- `LostObject`
  - Tracks lost-and-found items linked to trips
- `SystemConfig`
  - Stores system-level operational settings used by order flows
- `notify_websocket(group_name, event_type, data)`
  - Pushes realtime order-related updates to websocket subscribers
- `OrderCreateView`
  - Creates a new order
- `OrderStatusUpdateView`
  - Moves an order through status transitions and triggers downstream effects
- `ProposePrice`
  - Stores or exposes price proposals
- `ConfirmPrice`
  - Confirms client-side acceptance of a proposed fare
- `AssignDriverView`
  - Links a driver to an order
- `OrderMessagesView`
  - Reads and writes order chat messages
- `OrderAcceptView`
  - Driver acceptance flow
- `OrderSyncAllView`
  - Sync-oriented endpoint for pushing or refreshing state
- `OrderTabView`
  - Groups order retrieval by UI tab state
- `OrderCreateCardView`
  - Creates a payment card or payment-related association for an order
- `OrderDeleteCardView`
  - Removes that card association
- `OrderConsumer`, `AdminOrderConsumer`, `DriverConsumer`
  - Websocket consumers for order, admin, and driver realtime channels

Dependencies:

- Depends on `accounts.CustomUser`
- Depends on `drivers.Driver`
- Integrates with `enterprises.Enterprise`
- Sends notifications through `notifications.EmailService`
- Uses websockets through Django Channels
- Feeds Firebase-compatible output through `firebase_db`

### 6.3 `drivers`

Purpose: driver profile management, availability, location reporting, reviews, and wallet/accounting records.

Key classes and functions:

- `Driver`
  - Main driver identity and operational profile
- `DriverReview`
  - Customer feedback about a driver
- `DriverWalletTransaction`
  - Financial/accounting ledger associated with driver activity
- `DriverListView`
  - Lists drivers
- `DriverDetailView`
  - Returns one driver
- `DriverCreateView`
  - Creates a driver profile
- `DriverUpdateView`
  - Patches driver data
- `DriverStatusUpdateView`
  - Toggles availability or operating status
- `DriverLocationUpdateView`
  - Persists live location updates
- `DriverBlockView`
  - Blocks a driver from operation
- `DriverDeleteView`
  - Removes a driver
- `DriverReviewCreateView`
  - Creates a review attached to a driver
- `DriverReviewListView`
  - Lists reviews
- `MyDriverProfileView`
  - Returns the current authenticated driver's profile

Dependencies:

- Tied to `accounts.CustomUser`
- Used directly by `orders`
- Exported through `firebase_db` for legacy/realtime clients
### 6.4 `pricing`

Purpose: fare configuration, route-zone modeling, and programmatic price calculation.

Key classes and functions:

- `RouteTag`
  - Represents named route classifications
- `PricingZone`
  - Geographical area used for zone-sensitive pricing
- `PricingConfig`
  - Configuration object for pricing rules
- `PriceCalculationLog`
  - Audit trail for price computations
- `_point_in_polygon_ray_casting(...)`
  - Geometry helper for zone membership checks when Shapely is not relied on
- `_build_shapely_polygon(...)`
  - Builds polygon objects from zone geometry
- `_point_in_zone(...)`
  - Checks whether coordinates fall within a configured zone
- `_segment_fraction_in_zone(...)`
  - Measures how much of a route segment falls within a zone
- `calculate_price(...)`
  - Core pricing engine for route-based and zone-aware fare generation
- `_config_snapshot(config)`
  - Serializes pricing configuration for logging or diagnostics

Dependencies:

- Used by order creation and update flows
- Integrated into HTMX flows and likely client price previews
- Uses geometry and route data rather than only flat distance multipliers

### 6.5 `firebase_db`

Purpose: bridge layer that exposes Django-managed data through Firebase-like REST and websocket interfaces.

Key classes and functions:

- `FirebaseNode`
  - Internal storage abstraction for Firebase-like nodes
- `FirebaseIdempotencyKey`
  - Tracks write idempotency
- `_broadcast_change(path, event_type, data)`
  - Emits realtime node changes
- `_order_to_firebase(order)`
  - Converts an `Order` into Firebase-compatible JSON
- `_driver_to_firebase(driver)`
  - Converts a `Driver` into Firebase-compatible JSON
- `_get_django_data_for_path(path)`
  - Resolves dynamic Django-backed data for a Firebase path
- `_merge_firebase_and_django(path, firebase_data, django_data)`
  - Combines persisted node data with computed Django data
- `_get_node_data(path)`
  - Reads a node payload
- `_set_nested(...)`
  - Writes nested object structures
- `_resolve_server_values(data)`
  - Resolves Firebase-style server-side placeholders
- `_query_nodes(...)`
  - Provides query semantics over nodes
- `FirebaseNodeView`
  - Handles GET, PUT, PATCH, DELETE, and POST against node paths
- `_sync_write_to_django(path, data)`
  - Mirrors Firebase writes back into Django domain models where applicable
- `_sync_update_to_django(path, updates)`
  - Syncs node updates into Django models
- `FirebaseTransactionView`
  - Handles transaction-style operations
- `FirebasePushKeyView`
  - Generates Firebase-like push keys
- `_generate_push_key()`
  - Push-key generator

Dependencies:

- Reads from and writes to `orders` and `drivers`
- Serves legacy frontend code that expects Firebase-style access patterns
- Uses websockets for live update distribution

### 6.6 `chat`

Purpose: persistent user/admin support chat.

Key classes and functions:

- `ChatSession`
  - Tracks a support conversation session
- `ChatMessage`
  - Stores individual messages
- `ChatConsumer`
  - Websocket consumer for chat interactions

Dependencies:

- Used by `chatbot` for AI-assisted and escalated support
- Depends on authenticated users and websocket delivery

### 6.7 `chatbot`

Purpose: AI-assisted support workflow, session escalation, admin intervention, and translation support.

Key classes and functions:

- `ChatbotMessageView`
  - Accepts customer messages and returns bot responses
- `ChatHistoryView`
  - Returns historical messages for a session
- `AdminChatSessionsView`
  - Lists sessions for support staff
- `AdminResolveChatView`
  - Marks a chat as resolved
- `AdminReplyChatView`
  - Allows an admin to reply into a session
- `EscalationsView`
  - Lists escalated sessions
- `ResolveEscalationView`
  - Closes or resolves escalations
- `SiteTranslationsView`
  - Provides UI translations
- `GenerateTranslationsView`
  - Generates translation content
- `should_escalate(...)`
  - AI decision helper for human handoff
- `get_ai_response(...)`
  - Generates bot responses using the configured AI provider

Dependencies:

- Reuses models from `chat`
- Integrates with external AI APIs
- Supports multilingual or translated site interactions

### 6.8 `notifications`

Purpose: centralized email and notification handling.

Key classes and functions:

- `Notification`
  - Notification record model
- `_send_html_email(...)`
  - Low-level HTML email sender
- `_base_template(...)`
  - Shared email template wrapper
- `EmailService`
  - Central email service class
- `send_otp(...)`
  - Sends verification email
- `send_reset_code(...)`
  - Sends password reset code
- `send_price_proposed(order)`
  - Notifies a rider about a fare proposal
- `send_driver_assigned(order)`
  - Sends assignment notice
- `send_driver_on_way(order)`
  - Sends en route notice
- `send_driver_arrived(order)`
  - Sends arrival notice
- `send_trip_started(order)`
  - Sends trip-start notice
- `send_trip_completed(order)`
  - Sends trip-complete notice
- `send_trip_reminder(order)`
  - Sends scheduled reminder

Dependencies:

- Called from account, order, and operational flows
- Uses SMTP settings from environment variables
- Supersedes older PHP-based email scripts for many workflows
### 6.9 `enterprises`

Purpose: business account management, affiliate/partner ordering, and enterprise chat/commission workflows.

Key classes and functions:

- `Enterprise`
  - Business customer record
- `EnterpriseChatMessage`
  - Enterprise-specific communication log
- `enterprise_register`
  - Registers an enterprise
- `enterprise_dashboard`
  - Serves or hydrates enterprise dashboard state
- `enterprise_create_order`
  - Creates enterprise-originated trips/orders

Dependencies:

- Tied into `orders` for business-generated rides
- Used by `htmx_views.py` rather than only separate DRF viewsets

### 6.10 `admin_panel`

Purpose: operational reporting, moderation, dashboards, and gateway-style integrations.

Key classes and functions:

- `DashboardStatsView`
  - Aggregates platform counts and operational metrics
- `AdminUserListView`
  - Lists users for administration
- `AdminUserBlockView`
  - Blocks or updates user access
- `AdminPendingOrdersView`
  - Lists pending orders
- `AdminAvailableDriversView`
  - Lists active/available drivers
- `covered_departments_api(request)`
  - Exposes geographic/coverage data
- `whatsapp_proxy(request)`
  - Acts as a proxy helper to WhatsApp-related services
- `whatsapp_discover(request)`
  - Discovery helper for WhatsApp integration

Dependencies:

- Reads across `accounts`, `orders`, `drivers`, and geographic/pricing data
- Acts as a top-level admin aggregator rather than a single isolated domain app

### 6.11 `forum`

Purpose: community/social features and tourism-oriented content.

Key classes and functions:

- `ForumPost`
  - Main community post record
- `ForumComment`
  - Replies on posts
- `TouristAttraction`
  - Additional tourism/community content model
- `ForumPostListCreateView`
  - Lists and creates posts
- `ForumPostLikeView`
  - Toggles or records likes

Dependencies:

- Uses `accounts.CustomUser`
- Separate from core ride flow, but part of the broader platform experience

## 7. URL and Delivery Patterns

The Django URL layer has several distinct responsibilities:

- REST endpoints under paths such as `api/auth/`, `api/orders/`, `api/drivers/`, `api/chat/`, `api/notifications/`, `api/forum/`, `api/chatbot/`, `api/admin/`, `api/firebase/`, and `api/pricing/`
- Root-page wrappers that serve files like `vubez2.html`, `adm.html`, `driver_home.html`, and `entreprise.html`
- A built-in WhatsApp webhook handler in Django
- Static/media serving in development
- HTMX or action-oriented routes for interactive admin and operational workflows

Important implication:

This repository does not cleanly separate "frontend" and "backend." Many frontend pages are delivered through Django wrapper views while still living at the repository root.

## 8. Realtime and Data Flow

### Websockets

Realtime behavior is implemented through Django Channels and an ASGI router that merges:

- `chat.routing`
- `orders.routing`
- `firebase_db.routing`

Typical realtime scenarios:

- Order status changes broadcast to riders, admins, and drivers
- Chat sessions stream messages live
- Firebase-like node changes propagate to subscribed clients

### Legacy/Firebase Compatibility

The `firebase_db` app acts as a compatibility layer that translates Django state into Firebase-like JSON and update semantics. This appears to support older frontend code that still expects Firebase-style APIs and live updates.

## 9. Dependency Relationships

The most important dependency chains are:

### User-Centric Core

- `accounts.CustomUser` is the base identity model
- Most other domain apps reference it directly or indirectly

### Order-Centric Business Flow

- `orders.Order` is the main business hub
- It depends on users, drivers, and sometimes enterprises
- It triggers notifications and realtime broadcasts
- It is surfaced both through direct APIs and Firebase-compatible bridges

### Driver Integration

- `drivers.Driver` extends or maps operational data around user accounts
- `orders` uses it for assignment, status, and tracking
- `firebase_db` exports it for legacy consumers

### Pricing Integration

- `pricing.calculate_price(...)` is consumed by order-entry flows
- Price configurations and zones feed client/driver/enterprise booking logic
- Results are logged for auditability

### Chat and AI Support

- `chat` stores sessions and messages
- `chatbot` layers AI responses and escalation on top of that persistence

### Email and Communication

- `notifications.EmailService` is shared by auth and order workflows
- Some equivalent or older behavior also exists in `phpscript/`
## 10. Non-Django Components

### `whatsapp-webhook/`

Purpose: a compact Node/Express service for WhatsApp webhook verification and inbound payload processing.

Key elements:

- `server.js`
  - Creates an Express app
  - Exposes `GET /webhook` for Meta verification
  - Exposes `POST /webhook` for inbound messages and status events
  - Logs inbound `messages` and `statuses`
- `package.json`
  - `start`: `node server.js`
  - `dev`: `nodemon server.js`

Architectural note:

There is also a WhatsApp webhook implementation inside Django, so webhook handling exists in more than one place.

### `phpscript/`

Purpose: PHP-based support services, email utilities, chatbot endpoints, and Firebase order watcher automation.

Representative files:

- `api.php`
  - PHP API/chatbot-style endpoint
- `firebase_order_watcher.php`
  - Polls Firebase and triggers email notifications
- `README.md`, `README_AUTO_EMAILS.md`, `README_EMAILS.md`, `GUIDE_DEMARRAGE.md`, `ARCHITECTURE.txt`
  - Operational and architectural documentation
- `PHPMailer/`
  - Bundled mail library support

Architectural note:

This folder appears to contain legacy or sidecar infrastructure rather than the main application core.

## 11. Running the Project

### 11.1 Django Application

Working directory:

```bash
cd julmin_taxis_django
```

Windows setup:

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py makemigrations
python manage.py migrate
python manage.py runserver
```

Linux/macOS setup:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py makemigrations
python manage.py migrate
python manage.py runserver
```

Important environment variables in `.env`:

- `SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- SMTP settings for email delivery
- `GOOGLE_MAPS_API_KEY`
- `GEMINI_API_KEY`
- JWT-related settings
- `REDIS_URL`

Default infrastructure behavior:

- Database defaults to SQLite
- Redis is optional; without it, Channels can fall back to in-memory behavior

### 11.2 Node WhatsApp Webhook

Working directory:

```bash
cd whatsapp-webhook
```

Install and run:

```bash
npm install
npm start
```

Development mode:

```bash
npm run dev
```

### 11.3 PHP Scripts

Requirements:

- PHP 7.4+
- cURL extension
- SMTP account for email workflows
- PHPMailer available through the bundled folder or Composer

Typical usage:

- Serve the PHP pages/scripts from a PHP-capable web server
- Run the Firebase watcher manually when needed:

```bash
php firebase_order_watcher.php
```

Optional setup helper:

- `setup_watcher.bat`
- `setup_watcher.sh`

## 12. Development Notes

### Mixed-Mode Repository

This repository mixes active production code, legacy compatibility layers, experiments, and maintenance scripts. During onboarding, focus first on:

1. `julmin_taxis_django/`
2. `whatsapp-webhook/`
3. `phpscript/`
4. Root HTML pages actually referenced by Django URL wrappers

### Best Starting Points for New Developers

Recommended read order:

1. `julmin_taxis_django/julmin_taxis/settings.py`
2. `julmin_taxis_django/julmin_taxis/urls.py`
3. `julmin_taxis_django/orders/models.py`
4. `julmin_taxis_django/orders/views.py`
5. `julmin_taxis_django/drivers/models.py`
6. `julmin_taxis_django/pricing/pricing_engine.py`
7. `julmin_taxis_django/firebase_db/views.py`
8. `julmin_taxis_django/chatbot/views.py`
9. `julmin_taxis_django/notifications/email_service.py`

## 13. Practical Mental Model

If you need a concise way to think about the codebase, use this model:

- `accounts` defines who the platform users are
- `drivers` defines who can fulfill trips
- `orders` defines what trip is being requested and where it is in its lifecycle
- `pricing` determines how much the trip should cost
- `notifications` tells people what changed
- `chat` and `chatbot` handle support conversations
- `firebase_db` keeps older frontend clients compatible
- `admin_panel` provides operations visibility
- `enterprises` supports business customers
- `forum` adds community features outside the core booking flow

## 14. Known Architectural Characteristics

These are important for maintainers:

- The repository is monolithic in storage but polyglot in implementation
- Django is the operational center of gravity
- Frontend assets are partly legacy and partly integrated through server wrappers
- Webhook logic is duplicated across Django and Node
- Firebase compatibility suggests an incremental migration rather than a greenfield design
- `htmx_views.py` is a large, high-responsibility module and likely a future refactor candidate

## 15. Suggested Next Documentation Additions

This code wiki is a solid architectural entry point, but the following documents would improve maintainability further:

- API endpoint catalog by app
- Database model relationship diagram
- Websocket event catalog
- Environment variable reference with examples
- Deployment guide for Django, Redis, SMTP, and webhook hosting
- Legacy-to-current migration notes for Firebase and PHP integrations
