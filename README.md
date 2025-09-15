# Dental Frontend Monorepo

A monorepo containing two React applications for a dental clinic management system.

## Quick Start

```bash
# Install dependencies
npm i

# Set API base URLs
echo "VITE_API_BASE=http://localhost:5000" > patient/.env.local
echo "VITE_API_BASE=http://localhost:5001" > staff/.env.local

# Run both apps together
npm run dev

# Or run individually
npm run dev:patient
npm run dev:staff
```

## Apps

- **patient/**: Patient-facing app for booking and tracking appointments (connects to http://localhost:5000)
- **staff/**: Staff dashboard for managing appointments and system (connects to http://localhost:5001 with cookies)

## Scripts

- `npm run dev` - Run both apps concurrently
- `npm run dev:patient` - Run patient app only
- `npm run dev:staff` - Run staff app only
- `npm run build` - Build both apps
- `npm run lint` - Lint both apps
