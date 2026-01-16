# PreBot Backend API

MERN Stack Backend with Express.js, MongoDB, and JWT Authentication.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
- MongoDB URI
- JWT Secret
- Encryption keys

4. Generate encryption keys:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"  # ENCRYPTION_IV
```

5. Start MongoDB:
```bash
mongod
```

6. Run the server:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/validate` - Validate token

### Subscription
- `GET /api/subscription/status` - Get subscription status (requires auth)

### Admin
- `POST /api/admin/clients` - Create client (admin only)
- `GET /api/admin/clients` - Get all clients (admin only)
- `POST /api/admin/extend-subscription` - Extend subscription (admin only)

### Modules
- `GET /api/modules` - Get all modules
- `GET /api/modules/:id` - Get module by ID

## Database Models

- User
- Subscription
- Module

