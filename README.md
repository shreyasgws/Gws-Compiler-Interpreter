# GWS Online Compiler/Interpreter

A modern, full-stack web application for online code execution with support for multiple programming languages.

## Features

- **Multi-Language Support**: Python, C++, JavaScript, Java, C
- **Monaco Editor**: VS Code-quality code editing with syntax highlighting
- **Real-time Execution**: Run code and see output instantly
- **Keyboard Shortcuts**: Ctrl+Enter to run code
- **Local Storage**: Code persistence across sessions
- **Modern UI**: Dark theme with neon accents and glassmorphism effects
- **Responsive Design**: Works on laptops and tablets

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + Monaco Editor
- **Backend**: Node.js + Express
- **Execution**: Judge0 Rapid API

## Setup Instructions

### Prerequisites

- Node.js 18+
- RapidAPI account (for Judge0 API key)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Set your RapidAPI key (optional, for actual code execution):
```bash
# Windows (PowerShell)
$env:RAPID_API_KEY="your-api-key"

# Or create a .env file with:
RAPID_API_KEY=your-api-key
```

4. Start the server:
```bash
npm run dev
```

The backend will run on http://localhost:3001

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on http://localhost:5173

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl + Enter | Run code |
| Ctrl + S | Save code (auto-saved to localStorage) |

## API Endpoints

### POST /api/execute

Execute code in a supported language.

**Request Body:**
```json
{
  "code": "print('Hello, World!')",
  "language": "python"
}
```

**Response:**
```json
{
  "output": "Hello, World!",
  "error": null,
  "time": "0.023s",
  "status": "Accepted"
}
```

### GET /api/health

Health check endpoint.

## Supported Languages

| Language | Judge0 ID | Type |
|----------|-----------|------|
| Python | 71 | Interpreter |
| C++ | 54 | Compiler |
| JavaScript | 63 | Interpreter |
| Java | 62 | Compiler |
| C | 50 | Compiler |

## License

MIT
