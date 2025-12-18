# 🧪 Development Environment Setup

This guide helps you set up a local testing environment for the Unified Server Dashboard without needing the actual orangepi server.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher) ✅ Installed
- npm (comes with Node.js) ✅ Installed

### 1. Install Dependencies
```bash
# Install all dependencies (root, frontend, backend)
npm run install:all
```

### 2. Start Development Environment

#### Option A: Full Development (Frontend + Backend)
```bash
# Starts both frontend dev server and mock backend
npm run dev
```
This will start:
- **Frontend**: http://localhost:5173 (Vite dev server with hot reload)
- **Backend**: http://localhost:3001 (Mock API server)

#### Option B: Mock Backend Only
```bash
# Just the mock backend server
npm run dev:mock
```
This starts the mock backend at http://localhost:3001 with the built frontend.

### 3. Build for Production Testing
```bash
# Build frontend and test with mock backend
npm run build
npm run dev:mock
```

## 📊 Mock Data Features

The development server includes realistic mock data for:

### 🖥️ System Information
- CPU usage: 45.2%
- Memory usage: 62.8%
- Disk usage: 38.5%
- Uptime: 5 days, 12:34
- System services (nginx, docker, ssh, etc.)

### 📥 Torrents
- 4 sample torrents with different states:
  - Downloading: The Matrix (75% complete, 5 MB/s)
  - Seeding: Breaking Bad Complete (100%, 2 MB/s upload)
  - Stalled: The Bear S03E01 (45%, waiting for peers)
  - Paused: Inception (0%, paused)

### 📺 TV Shows
- 3 sample shows:
  - Breaking Bad (completed series)
  - The Bear (ongoing, next episode scheduled)
  - Game of Thrones (paused tracking)

### 🔒 VPN (WireGuard)
- 2 mock interfaces: wg0, wg1
- Realistic status output
- Mock peer connections

### 🐳 Docker Containers
- qBittorrent (running)
- Sonarr (running)
- Radarr (running)
- Prowlarr (stopped)

## 🎯 Interactive Features

All API endpoints are fully functional with mock data:

### ✅ Working Features
- **Add/Remove torrents** - Adds to mock torrent list
- **Pause/Resume torrents** - Updates mock torrent states
- **Bulk torrent operations** - Works with multiple selections
- **Search torrents** - Returns mock search results
- **Add TV shows** - Adds to mock shows list
- **Toggle auto-check** - Updates mock configuration
- **VPN control** - Mock start/stop operations
- **System power control** - Mock reboot/shutdown

### 📱 Mobile Testing
- Perfect for testing mobile UI on your device
- Use your computer's IP address: `http://YOUR_IP:3001`
- Test responsive design and touch interactions

## 🔧 Development Workflow

### Frontend Development
```bash
# Start frontend with hot reload
cd frontend
npm run dev
```
- Frontend runs on http://localhost:5173
- Hot reload for instant UI changes
- Proxy API calls to backend on port 3001

### Backend Development
```bash
# Start mock backend
npm run dev:mock
```
- Backend runs on http://localhost:3001
- Serves built frontend + API endpoints
- Mock data persists during session

### Full Stack Development
```bash
# Start both frontend and backend
npm run dev
```
- Best for testing API integration
- Frontend changes reload instantly
- Backend serves mock API responses

## 📝 Mock Data Customization

Edit `backend/mockData.js` to customize:
- System specifications
- Torrent names and states
- TV show information
- Container configurations
- VPN settings

Edit `backend/server-dev.js` to modify:
- API response behavior
- Mock business logic
- Simulated delays
- Error scenarios

## 🌐 Network Testing

### Local Network Access
1. Find your computer's IP address:
   ```bash
   # macOS/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   
   # Or use
   hostname -I
   ```

2. Access from mobile device:
   ```
   http://YOUR_IP_ADDRESS:3001
   ```

### Testing on Different Devices
- **iPhone/iPad**: Use Safari or Chrome
- **Android**: Use Chrome or Firefox
- **Desktop**: Any modern browser
- **Tablet**: Test both portrait and landscape

## 🚀 Production Simulation

To test the production build locally:

```bash
# Build frontend
npm run build

# Start production-like server
npm run dev:mock
```

This serves the optimized, built frontend with the mock backend, simulating the production environment.

## 🔍 Debugging

### Console Logs
The mock server logs all API calls:
```
📊 GET /api/omv/system
📥 GET /api/qbittorrent/torrents
➕ POST /api/qbittorrent/torrents/add
```

### Browser DevTools
- **Network tab**: See API requests/responses
- **Console**: Check for JavaScript errors
- **Application tab**: Test PWA features
- **Device toolbar**: Test different screen sizes

## 📱 Mobile-Specific Testing

### iPhone 12 Simulation
1. Open Chrome DevTools
2. Click device toolbar (📱 icon)
3. Select "iPhone 12 Pro" or custom 390x844
4. Test touch interactions and responsive design

### Real Device Testing
1. Connect device to same WiFi network
2. Visit `http://YOUR_COMPUTER_IP:3001`
3. Test actual touch interactions
4. Add to home screen (PWA feature)

## 🎉 Ready to Develop!

Your local testing environment is now ready. You can:
- ✅ Test all UI components with realistic data
- ✅ Develop new features without server dependencies
- ✅ Test mobile responsiveness on real devices
- ✅ Simulate API interactions and error states
- ✅ Build and test production optimizations

Happy coding! 🚀