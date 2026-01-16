# Superadmin Setup Guide

## ✅ Script Executed Successfully!

The script has:
1. ✅ Changed all `admin` roles to `client` (0 users updated)
2. ✅ Created superadmin user

## 📝 Default Superadmin Credentials

- **Email**: `admin@prebot.com`
- **Password**: `admin123`
- **Role**: `superadmin`
- **Company**: `PreBot Admin`

## 🚀 Usage

### Quick Setup (Default Credentials)
```bash
cd backend
npm run create-superadmin
```

This creates superadmin with:
- Email: `admin@prebot.com`
- Password: `admin123`
- Company: `PreBot Admin`

### Custom Credentials
```bash
cd backend
node src/scripts/createSuperAdminSimple.js <email> <password> <companyName>
```

**Example:**
```bash
node src/scripts/createSuperAdminSimple.js myadmin@example.com MySecurePass123 "My Company"
```

### Interactive Mode (Prompts for Input)
```bash
cd backend
npm run create-superadmin:interactive
```

This will ask you to enter:
- Email
- Password
- Company name

### Update Roles Only
```bash
cd backend
npm run update-roles
```

This only updates all `admin` roles to `client` without creating superadmin.

## 📊 What the Script Does

1. **Updates Roles**: Changes all users with `role: 'admin'` to `role: 'client'`
2. **Creates Superadmin**: Creates a new user with `role: 'superadmin'`
3. **Shows Summary**: Displays current role distribution

## 🔐 Security Notes

- Password is automatically hashed using bcrypt (10 salt rounds)
- Superadmin doesn't require a subscription
- Superadmin has full access to all admin endpoints
- Change the default password after first login!

## 🎯 Next Steps

1. **Login as Superadmin**:
   - Go to frontend: `http://localhost:3000`
   - Login with: `admin@prebot.com` / `admin123`

2. **Change Password** (Recommended):
   - After first login, update password in database or add password change feature

3. **Create Clients**:
   - Use Super Admin Dashboard to create client accounts
   - Clients will have `role: 'client'` by default

## 📋 Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Quick Setup | `npm run create-superadmin` | Creates superadmin with defaults |
| Interactive | `npm run create-superadmin:interactive` | Prompts for credentials |
| Update Roles | `npm run update-roles` | Only updates admin→client roles |

## 🔄 Role Hierarchy

```
superadmin (You - Full Access)
    ↓
client (Buyers - Limited Access)
    ↓
user (Default - Basic Access)
```

## ⚠️ Important

- Only one superadmin is recommended
- Superadmin bypasses subscription checks
- Superadmin can create/manage all clients
- Keep superadmin credentials secure!






