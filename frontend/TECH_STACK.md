# Frontend Tech Stack

## ✅ Current Setup

### Build Tool: **Vite** ⚡
- **Version**: 5.0.8
- **Config**: `vite.config.js`
- **Features**:
  - Fast HMR (Hot Module Replacement)
  - Optimized production builds
  - ES modules support
  - TypeScript support ready

### UI Framework: **React** ⚛️
- **Version**: 18.2.0
- **Entry**: `src/main.jsx`
- **Features**:
  - React 18 with hooks
  - Context API for state management
  - Component-based architecture

### Styling: **Tailwind CSS** 🎨
- **Version**: 3.4.0
- **Config**: `tailwind.config.js`
- **PostCSS**: `postcss.config.js`
- **Features**:
  - Utility-first CSS
  - Custom color palette (primary)
  - Responsive design
  - Custom components via `@apply`

## 📁 Configuration Files

### `vite.config.js`
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
```

### `tailwind.config.js`
- Content paths configured
- Custom primary color palette
- Extended theme

### `postcss.config.js`
- Tailwind CSS plugin
- Autoprefixer for browser compatibility

## 🎯 Usage

### Development
```bash
cd frontend
npm run dev
# Starts Vite dev server on http://localhost:3000
```

### Production Build
```bash
npm run build
# Creates optimized build in `dist/` folder
```

### Preview Production Build
```bash
npm run preview
# Preview the production build locally
```

## 📦 Dependencies

### Production
- `react` & `react-dom` - UI framework
- `axios` - HTTP client
- `crypto-js` - Encryption
- `react-router-dom` - Routing (if needed)

### Development
- `vite` - Build tool
- `@vitejs/plugin-react` - React plugin for Vite
- `tailwindcss` - CSS framework
- `autoprefixer` - CSS vendor prefixes
- `postcss` - CSS processor

## ✨ Tailwind CSS Usage

All components use Tailwind utility classes:

```jsx
// Example from components
<div className="bg-white rounded-lg shadow p-6">
  <h1 className="text-2xl font-bold text-gray-900">Title</h1>
  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
    Click Me
  </button>
</div>
```

## 🚀 Performance

- **Vite**: Lightning-fast dev server
- **Tailwind**: Only includes used CSS in production
- **React**: Optimized with production build
- **Tree-shaking**: Unused code removed automatically

## ✅ Everything is Already Set Up!

No changes needed - the project is using:
- ✅ Vite (not Create React App)
- ✅ React 18
- ✅ Tailwind CSS 3
- ✅ Modern ES modules
- ✅ Fast HMR
- ✅ Optimized builds






