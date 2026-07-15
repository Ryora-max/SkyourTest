# SkyourTest — QC Automation Testing Platform

Automated website quality testing platform with 10 test modules, 100+ test cases, live browser streaming, and professional Excel/PDF reports.

## Features

- **10 Test Modules**: Login & Auth, Dashboard Layout, Navigation & Menu, Structure & Layout, Security & Hack, Form & Input, Responsive & Mobile, Performance & Network, CRUD & Interaction, API & Data
- **100+ Test Cases** with Senior QC/QA standards
- **Live Browser Streaming** via WebSocket — watch tests execute in real-time
- **HD Quality** — Retina display (deviceScaleFactor: 2), adaptive screencast matching viewport
- **iPhone 14/15 Pro** mobile testing (393x852), iPad Pro 11" tablet (834x1194), Full HD desktop (1920x1080)
- **Excel & PDF Reports** with detailed test results
- **2 Test Modes**: Login Dashboard (login then test) or Direct Dashboard (test directly)
- **Dark Mode** support
- **CI/CD Webhook** integration for automated pipelines
- **Rate Limiting** and **WebSocket ping/pong** for production robustness

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Express.js, Node.js |
| Browser Automation | Playwright |
| Live Streaming | WebSocket |
| Reports | ExcelJS, PDFKit |

## Quick Start

### Prerequisites

- Node.js 18+
- Playwright browsers: `npx playwright install chromium`

### Installation

```bash
npm install
npx playwright install chromium
npm run build
npm start
```

### Development

```bash
# Terminal 1: Client dev server (port 5173)
npm run dev:client

# Terminal 2: Server (port 3001)
npm run dev:server
```

### Environment Variables

Copy `.env.example` to `.env`:

```env
PORT=3001
SKYOURTEST_API_KEY=your-api-key-here
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/info` | API information |
| GET | `/api/runs` | List all test runs |
| POST | `/api/runs` | Start a new test run |
| GET | `/api/runs/:id` | Get run details |
| GET | `/api/runs/:id/status` | Poll run status |
| POST | `/api/runs/:id/cancel` | Cancel a running test |
| DELETE | `/api/runs/:id` | Delete a run |
| GET | `/api/runs/:id/report` | Download Excel report |
| GET | `/api/runs/:id/report/pdf` | Download PDF report |
| GET | `/api/active-run` | Get active running test |
| POST | `/api/webhook/trigger` | Trigger test via webhook (requires API key) |

## Architecture

```
SkyourTest/
├── client/              # React frontend (Vite + Tailwind)
│   └── src/components/  # UI components
├── server/              # Express backend
│   ├── index.js         # API server + WebSocket
│   ├── test-runner.js   # Playwright test runner
│   ├── report-generator.js  # Excel report
│   └── pdf-generator.js     # PDF report
├── data/                # Persisted test runs
├── reports/             # Generated report files
└── package.json
```

## License

© 2026 SkyourTest. All rights reserved.
