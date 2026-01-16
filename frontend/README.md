# PreBot Frontend

React application built with **Vite** and styled with **Tailwind CSS** for PreBot Offline AI Assistant.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Update `.env` with your backend API URL:
```
VITE_API_URL=http://localhost:5000/api
```

4. Run development server:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
```

## Tech Stack

- **Vite** ⚡ - Lightning-fast build tool and dev server
- **React 18** ⚛️ - Modern UI framework
- **Tailwind CSS** 🎨 - Utility-first CSS framework
- **Axios** - HTTP client for API calls
- **Crypto-JS** - Encryption utilities
- **Context API** - State management

## Features

- Fast HMR (Hot Module Replacement) with Vite
- Utility-first styling with Tailwind CSS
- Responsive design
- Component-based architecture
- Context API for global state

## Project Structure

```
src/
├── components/     # React components
├── context/        # React Context providers
├── services/       # API and utility services
└── App.jsx         # Main app component
```

