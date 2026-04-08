# GWS Online Compiler/Interpreter - Specification

## 1. Project Overview
- **Project Name**: GWS Online Compiler/Interpreter
- **Type**: Full-stack web application (React frontend + Express backend)
- **Core Functionality**: Multi-language online code editor with real-time execution via Judge0 API
- **Target Users**: Developers, students, and learners who need quick code execution

## 2. Technology Stack

### Frontend
- React 18 with Vite
- Tailwind CSS for styling
- Monaco Editor for code editing
- Lucide React for icons

### Backend
- Node.js with Express
- Judge0 Rapid API for code execution
- CORS enabled

## 3. Visual & UI Specification

### Theme
- Dark mode inspired by VS Code
- Background: Deep charcoal (#0d1117, #161b22)
- Accent colors: Cyan neon (#00d4ff), Purple neon (#a855f7)
- Glassmorphism effects on panels

### Layout Structure
```
┌──────────────────────────────────────────────────────┐
│                    GWS LOGO                          │
│           Online <Language> Compiler                 │
├────────┬─────────────────────────┬───────────────────┤
│        │                         │                   │
│ Lang   │    Monaco Editor        │   Output Console  │
│ Select │                         │                   │
│ Panel  │   [Run Button]          │   [Clear Button]  │
│        │                         │                   │
└────────┴─────────────────────────┴───────────────────┘
```

### Colors
- Primary Background: #0d1117
- Secondary Background: #161b22
- Panel Background: rgba(22, 27, 34, 0.8) with blur
- Text Primary: #e6edf3
- Text Secondary: #8b949e
- Accent Cyan: #00d4ff
- Accent Purple: #a855f7
- Success Green: #3fb950
- Error Red: #f85149

### Typography
- Logo: "Orbitron" (Google Fonts) - futuristic monospace
- UI Text: "Inter" (Google Fonts) - clean sans-serif
- Code: Monaco Editor default monospace

## 4. Component Specification

### Header Component
- Centered "GWS" logo with gradient text (cyan to purple)
- Subtitle: "Online <Language> <Compiler/Interpreter>" dynamically updated
- Subtle glow animation on logo

### Language Selector (Left Panel)
- Collapsible sidebar (width: 280px)
- Toggle button: "Other Programming Languages"
- Language list with icons:
  - Python (snake icon)
  - C++ (gear icon)
  - JavaScript (JS icon)
  - Java (coffee icon)
  - HTML (code icon)
- Active language highlighted with cyan border
- Smooth slide-in/out animation (300ms ease-in-out)

### Code Editor (Center Panel)
- Monaco Editor instance
- Language-specific syntax highlighting
- Line numbers enabled
- Minimap disabled (cleaner look)
- Theme: VS Code Dark+ (built-in)
- Sticky Run button positioned above editor

### Run Button
- Position: Above editor, centered
- Style: Rounded, gradient background (cyan to purple)
- Hover: Glow effect (box-shadow with accent color)
- Loading state: Spinner icon
- Keyboard shortcut: Ctrl + Enter

### Output Console (Right Panel)
- Terminal-style display
- Dark background (#0d1117)
- Monospace font
- Scrollable container
- Top: Clear button
- Shows execution time
- Error messages in red
- Success output in green/white

### Clear Button
- Subtle style, top-right of output panel
- Hover: Cyan glow effect

## 5. Backend Specification

### API Endpoints
```
POST /api/execute
Body: { code: string, language: string }
Response: { output: string, time: number, error: string | null }
```

### Language Support (Judge0 IDs)
- Python 3: 71
- C++ (GCC): 54
- JavaScript (Node.js): 63
- Java (OpenJDK): 62
- HTML: null (run in iframe)

### Error Handling
- Timeout: 10 seconds
- Memory limit: 128MB
- Return compilation errors and runtime errors

## 6. Interaction Specification

### Keyboard Shortcuts
- `Ctrl + Enter`: Run code
- `Ctrl + S`: Save to localStorage (prevent default)

### localStorage
- Key: `gws_code_<language>`
- Auto-save on language change
- Auto-load on page load

### Animations
- Sidebar slide: transform translateX, 300ms ease-in-out
- Button hover: box-shadow transition 200ms
- Logo glow: keyframe animation 2s infinite

## 7. Acceptance Criteria

1. ✅ GWS logo displays with gradient styling
2. ✅ Dynamic language name in subtitle
3. ✅ Language selector slides in/out smoothly
4. ✅ Monaco editor loads with syntax highlighting
5. ✅ Run button executes code via backend
6. ✅ Output displays in console panel
7. ✅ Clear button clears output
8. ✅ Ctrl+Enter triggers code execution
9. ✅ Code persists in localStorage
10. ✅ Responsive layout (min-width: 1024px)
11. ✅ Loading indicator during execution
12. ✅ Error messages displayed correctly
