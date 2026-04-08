import { useState, useEffect, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { Play, Trash2, ChevronLeft, ChevronRight, Code2, Loader2, Terminal, Zap, RotateCcw, AlertTriangle, FileOutput, FileInput } from 'lucide-react'
import { io } from 'socket.io-client'

// API and Socket Base URL - empty string uses the current host (proxy in dev)
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const socket = io(BASE_URL || window.location.origin, {
  autoConnect: false,
  reconnection: true
});

const LANGUAGES = [
  { id: 'python', name: 'Python', icon: '🐍', compiler: 'Interpreter', color: '#3776ab', glow: '#3776ab' },
  { id: 'cpp', name: 'C++', icon: '⚙️', compiler: 'Compiler', color: '#00599c', glow: '#00d4ff' },
  { id: 'javascript', name: 'JavaScript', icon: 'JS', compiler: 'Interpreter', color: '#f7df1e', glow: '#f7df1e' },
  { id: 'java', name: 'Java', icon: '☕', compiler: 'Compiler', color: '#007396', glow: '#007396' },
  { id: 'c', name: 'C', icon: '🔧', compiler: 'Compiler', color: '#a8b9cc', glow: '#00d4ff' }
]

const DEFAULT_CODE = {
  python: `# Welcome to GWS Online Python Interpreter\nprint("Hello, World!")\n\n# Try some Python code:\nfor i in range(5):\n    print(f"Count: {i}")`,
  cpp: `// Welcome to GWS Online C++ Compiler\n#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    \n    for (int i = 0; i < 5; i++) {\n        std::cout << "Count: " << i << std::endl;\n    }\n    return 0;\n}`,
  javascript: `// Welcome to GWS Online JavaScript Interpreter\nconsole.log("Hello, World!");\n\n// Try some JavaScript code:\nfor (let i = 0; i < 5; i++) {\n    console.log(\`Count: \${i}\`);\n}`,
  java: `// Welcome to GWS Online Java Compiler\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n        \n        for (int i = 0; i < 5; i++) {\n            System.out.println("Count: " + i);\n        }\n    }\n}`,
  c: `// Welcome to GWS Online C Compiler\n#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    \n    for (int i = 0; i < 5; i++) {\n        printf("Count: %d\\n", i);\n    }\n    return 0;\n}`
}

const MONACO_LANGUAGE = {
  python: 'python',
  cpp: 'cpp',
  javascript: 'javascript',
  java: 'java',
  c: 'c'
}

function App() {
  const [currentLang, setCurrentLang] = useState('python')
  const [code, setCode] = useState(DEFAULT_CODE.python)
  const [output, setOutput] = useState('')
  const [userInput, setUserInput] = useState('') // Current line being typed
  const [isRunning, setIsRunning] = useState(false)
  const [isConsoleFocused, setIsConsoleFocused] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [executionTime, setExecutionTime] = useState(null)
  const [backendStatus, setBackendStatus] = useState('connecting')
  const [mobileView, setMobileView] = useState('code')
  const editorRef = useRef(null)
  const outputEndRef = useRef(null)
  const consoleRef = useRef(null)

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => setBackendStatus('online'));
    socket.on('connect_error', () => setBackendStatus('offline'));
    socket.on('disconnect', () => setBackendStatus('offline'));

    socket.on('output', (data) => {
      setOutput(prev => prev + data);
    });

    socket.on('exit', ({ time, message }) => {
      setExecutionTime(time);
      setOutput(prev => prev + message);
      setIsRunning(false);
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('disconnect');
      socket.off('output');
      socket.off('exit');
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [output, userInput]);

  useEffect(() => {
    const savedCode = localStorage.getItem(`gws_code_${currentLang}`)
    if (savedCode) {
      setCode(savedCode)
    } else {
      setCode(DEFAULT_CODE[currentLang])
    }
  }, [currentLang])

  useEffect(() => {
    localStorage.setItem(`gws_code_${currentLang}`, code)
  }, [code, currentLang])

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor
  }

  const runCode = () => {
    if (isRunning) {
      socket.emit('stop');
      setIsRunning(false);
      return;
    }

    setIsRunning(true);
    setOutput('');
    setExecutionTime(null);
    setUserInput('');
    setMobileView('terminal');
    socket.emit('run', { code, language: currentLang });
    if (consoleRef.current) consoleRef.current.focus();
  }

  const handleConsoleKeyDown = (e) => {
    if (!isRunning) return;

    if (e.key === 'Enter') {
      const input = userInput + '\n';
      setOutput(prev => prev + userInput + '\n');
      socket.emit('stdin', input);
      setUserInput('');
    } else if (e.key === 'Backspace') {
      setUserInput(prev => prev.slice(0, -1));
    } else if (e.key.length === 1) {
      setUserInput(prev => prev + e.key);
    }
  }

  const clearOutput = () => {
    setOutput('')
    setExecutionTime(null)
    setUserInput('')
  }

  const resetCode = () => {
    localStorage.removeItem(`gws_code_${currentLang}`)
    setCode(DEFAULT_CODE[currentLang])
    setOutput('')
    setExecutionTime(null)
  }

  const handleLanguageChange = (langId) => {
    setCurrentLang(langId)
    setSidebarOpen(false)
    setOutput('')
    setExecutionTime(null)
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-primary overflow-hidden">
      {/* Header */}
      <header className="relative flex-shrink-0 h-32 flex items-center justify-center bg-gradient-to-b from-secondary to-primary border-b border-white/5 px-16 md:px-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`
            absolute left-1.5 top-1/2 -translate-y-1/2 z-20
            glow-button flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-lg
            bg-secondary/95 backdrop-blur-sm border border-white/20
            text-textPrimary font-medium text-[8px]
            transition-all duration-300
            hover:bg-accentCyan/20 hover:border-accentCyan/50
            md:absolute md:left-0 md:flex-row md:px-5 md:py-3 md:text-sm md:translate-y-0 md:ml-0 md:gap-2
            ${!sidebarOpen ? 'md:translate-x-0' : ''}
          `}
        >
          {sidebarOpen ? (
            <>
              <ChevronLeft className="w-3 h-3 text-accentCyan md:w-5 md:h-5" />
              <span className="hidden md:inline">Close</span>
            </>
          ) : (
            <>
              <ChevronRight className="w-3 h-3 text-accentCyan md:w-5 md:h-5" />
              <span className="md:hidden text-[8px] leading-tight">Other<br/>Languages</span>
              <span className="hidden md:inline">Other Languages</span>
            </>
          )}
        </button>

        <div className="flex flex-col items-center">
          <h1 className="font-orbitron text-5xl md:text-6xl font-black gws-gradient-text tracking-wider animate-glow">
            GWS
          </h1>
          <p className={`mt-1 md:mt-2 font-inter text-white/80 text-base md:text-lg tracking-wide ${(currentLang === 'cpp' || currentLang === 'c') ? 'drop-shadow-[0_0_12px_rgba(0,212,255,0.7)]' : 'drop-shadow-[0_0_8px_rgba(0,212,255,0.5)]'}`}>
            Online <span className={`text-accentCyan font-semibold ${(currentLang === 'cpp' || currentLang === 'c') ? 'drop-shadow-[0_0_15px_rgba(0,212,255,1)]' : 'drop-shadow-[0_0_10px_rgba(0,212,255,0.8)]'}`}>{LANGUAGES.find(l => l.id === currentLang)?.name}</span> {LANGUAGES.find(l => l.id === currentLang)?.compiler}
          </p>
        </div>

        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 rounded-full glass-panel border border-white/10">
          <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${
            backendStatus === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          }`} />
          <span className="text-[10px] md:text-xs text-textSecondary">
            {backendStatus === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside
          className={`
            absolute left-0 top-32 h-[calc(100%-8rem)] w-72 z-10
            glass-panel border-r border-white/10
            transform transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="p-4">
            <h2 className="font-orbitron text-sm text-textSecondary uppercase tracking-widest mb-4">
              Programming Languages
            </h2>
            <div className="space-y-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => handleLanguageChange(lang.id)}
                  className={`
                    w-full flex items-center gap-3 p-3 rounded-lg
                    transition-all duration-200 group
                    ${currentLang === lang.id
                      ? 'bg-accentCyan/20 border border-accentCyan/50'
                      : 'bg-white/5 border border-transparent hover:bg-white/10'
                    }
                  `}
                  style={currentLang === lang.id && (lang.id === 'cpp' || lang.id === 'c') ? { boxShadow: `0 0 20px ${lang.glow}40` } : {}}
                >
                  <span 
                    className="text-xl w-8 h-8 flex items-center justify-center rounded"
                    style={{ backgroundColor: lang.color + '30' }}
                  >
                    {lang.icon === 'JS' ? (
                      <span className="font-bold text-sm" style={{ color: lang.color }}>JS</span>
                    ) : (
                      <span className="text-lg">{lang.icon}</span>
                    )}
                  </span>
                  <div className="flex-1 text-left">
                    <p className={`font-medium ${currentLang === lang.id ? 'text-accentCyan' : 'text-textPrimary'}`}>
                      {lang.name}
                    </p>
                    <p className="text-xs text-textSecondary">{lang.compiler}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className={`flex-1 flex-col min-w-0 ${mobileView === 'code' ? 'flex' : 'hidden md:flex'}`}>
          <div className="flex-shrink-0 p-3 bg-secondary/50 border-b border-white/5">
            <div className="flex items-center gap-3">
              <button 
                onClick={runCode}
                disabled={backendStatus === 'offline'}
                className={`
                  flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all duration-300 transform active:scale-95 shadow-lg
                  ${isRunning 
                    ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                    : 'bg-green-600 hover:bg-green-500 hover:shadow-[0_0_25px_rgba(74,222,128,0.6)] text-white'
                  }
                  ${backendStatus === 'offline' ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {isRunning ? (
                  <>
                    <RotateCcw className="w-5 h-5 animate-spin-reverse" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    <span>Run Code</span>
                  </>
                )}
              </button>
              
              <button
                onClick={resetCode}
                className="
                  flex items-center gap-2 px-4 py-3 rounded-lg
                  bg-white/5 border border-white/10 text-textSecondary text-sm font-medium
                  transition-all duration-200 hover:bg-white/10 hover:text-textPrimary
                "
                title="Reset to Default"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset</span>
              </button>

              <div className="hidden md:flex items-center gap-2 text-xs text-textSecondary">
                <Zap className="w-4 h-4" />
                <span>Ctrl + Enter</span>
              </div>
              <button
                onClick={() => setMobileView('terminal')}
                className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-textSecondary text-sm font-medium hover:bg-white/10 hover:text-white transition-all ml-auto"
              >
                <span>Terminal</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>


          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language={MONACO_LANGUAGE[currentLang]}
              value={code}
              onChange={(value) => setCode(value || '')}
              onMount={handleEditorDidMount}
              theme="vs-dark"
              options={{
                fontSize: 14,
                fontFamily: "'Fira Code', 'Consolas', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                lineNumbers: 'on',
                roundedSelection: true,
                automaticLayout: true,
                tabSize: 4,
                wordWrap: 'on'
              }}
            />
          </div>
        </section>

        {/* Unified Terminal Panel */}
        <aside className={`w-full md:w-96 flex-shrink-0 flex-col glass-panel md:border-l border-white/10 ${mobileView === 'terminal' ? 'flex' : 'hidden md:flex'}`}>
          {/* Terminal Header */}
          <div className="flex-shrink-0 flex items-center justify-between p-3 border-b border-white/5 bg-white/5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileView('code')}
                className={`md:hidden flex items-center p-1.5 rounded transition-colors ${
                  !isRunning && output 
                    ? 'bg-accentCyan/20 text-accentCyan shadow-[0_0_10px_rgba(0,212,255,0.5)]' 
                    : 'hover:bg-white/10 text-textSecondary hover:text-white'
                }`}
                title="Back to Code"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <Terminal className="w-5 h-5 text-accentCyan hidden md:block" />
              <h2 className="font-semibold text-sm uppercase tracking-wide hidden md:block">Terminal</h2>
              <h2 className="md:hidden font-semibold text-sm uppercase tracking-wide text-cyan-400 drop-shadow-[0_0_8px_rgba(0,212,255,0.8)]">Output Terminal</h2>
            </div>
            <div className="flex items-center gap-2">
              {executionTime && (
                <span className="text-xs text-textSecondary bg-white/10 px-2 py-0.5 rounded">
                  {executionTime}
                </span>
              )}
              {isRunning && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-accentCyan/10 text-accentCyan text-[10px] uppercase font-bold rounded animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-accentCyan"></div>
                  Running
                </span>
              )}
              <button
                onClick={clearOutput}
                className="p-1.5 rounded hover:bg-white/10 text-textSecondary hover:text-accentCyan transition-colors"
                title="Clear Terminal"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Console */}
          <div 
            ref={consoleRef}
            tabIndex={0}
            onKeyDown={handleConsoleKeyDown}
            onFocus={() => setIsConsoleFocused(true)}
            onBlur={() => setIsConsoleFocused(false)}
            className="flex-1 overflow-auto p-4 bg-primary/80 font-mono text-sm outline-none cursor-text custom-scrollbar group"
          >
            <div className="whitespace-pre-wrap break-words">
              {output}
              {isRunning && (
                <span className="inline-block">
                  <span className="text-accentCyan">{userInput}</span>
                  {isConsoleFocused && (
                    <span className="inline-block w-2 h-4 ml-0.5 bg-accentCyan animate-pulse align-middle"></span>
                  )}
                </span>
              )}
              {!output && !isRunning && (
                <div className="h-full flex flex-col items-center justify-center text-textSecondary/30 mt-20 select-none">
                  <Code2 className="w-16 h-16 mb-4 opacity-10" />
                  <p className="text-sm font-sans tracking-widest uppercase">Select Run Code to start</p>
                </div>
              )}
              <div ref={outputEndRef} />
            </div>
          </div>
          <div className="p-2 border-t border-white/5 bg-black/20">
            <p className="text-[10px] text-textSecondary/50 text-center uppercase tracking-tighter">
              Interactive terminal - type and press Enter
            </p>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
