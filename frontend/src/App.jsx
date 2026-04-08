import { useState, useEffect, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { Play, Trash2, ChevronLeft, ChevronRight, Code2, Loader2, Terminal, Zap, RotateCcw } from 'lucide-react'


const executeCodeLocally = async (code, language) => {
  const startTime = performance.now();

  if (language === 'javascript') {
    try {
      let output = '';
      const logs = [];
      const mockConsole = {
        log: (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        error: (...args) => logs.push('Error: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        warn: (...args) => logs.push('Warning: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        info: (...args) => logs.push('Info: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        debug: (...args) => logs.push('Debug: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        table: (data) => logs.push(JSON.stringify(data, null, 2)),
        clear: () => logs.length = 0,
        time: () => {},
        timeEnd: () => {},
        assert: (cond, ...args) => { if (!cond) logs.push('Assertion failed: ' + args.join(' ')); }
      };

      const fn = new Function('console', code);
      fn(mockConsole);

      output = logs.join('\n');
      const time = ((performance.now() - startTime) / 1000).toFixed(3) + 's';

      return { output: output || '(No output)', error: null, time, status: 'Success' };
    } catch (err) {
      const time = ((performance.now() - startTime) / 1000).toFixed(3) + 's';
      return { output: '', error: err.message, time, status: 'Runtime Error' };
    }
  }

  // All other languages use the backend
  try {
    const response = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language }),
      signal: AbortSignal.timeout(30000) // Increased timeout for compilation
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to execute code');
    }
    
    const result = await response.json();
    return result;
  } catch (err) {
    let errorMessage = err.message;
    let status = 'Error';
    
    if (err.name === 'TimeoutError') {
      errorMessage = 'Execution timed out. The backend might be busy or the code is taking too long.';
      status = 'Timeout';
    } else if (errorMessage.includes('Failed to fetch')) {
      errorMessage = 'Backend server not running.\n\nTo start the backend:\n1. Open a new terminal\n2. Run: cd backend && npm run dev\n3. Ensure port 3001 is open';
      status = 'Backend Offline';
    }
    
    return {
      output: '',
      error: errorMessage,
      time: '0s',
      status: status
    };
  }
};

const LANGUAGES = [
  { id: 'python', name: 'Python', icon: '🐍', compiler: 'Interpreter', color: '#3776ab' },
  { id: 'cpp', name: 'C++', icon: '⚙️', compiler: 'Compiler', color: '#00599c' },
  { id: 'javascript', name: 'JavaScript', icon: 'JS', compiler: 'Interpreter', color: '#f7df1e' },
  { id: 'java', name: 'Java', icon: '☕', compiler: 'Compiler', color: '#007396' },
  { id: 'c', name: 'C', icon: '🔧', compiler: 'Compiler', color: '#a8b9cc' }
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
  const [isRunning, setIsRunning] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [executionTime, setExecutionTime] = useState(null)
  const [backendStatus, setBackendStatus] = useState('connecting')
  const editorRef = useRef(null)

  const currentLanguage = LANGUAGES.find(l => l.id === currentLang)

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('/api/health', { 
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'ok') {
            setBackendStatus('connected');
            return;
          }
        }
        setBackendStatus('disconnected');
      } catch (err) {
        setBackendStatus('disconnected');
      }
    };
    
    // Initial check
    checkBackend();
    
    const interval = setInterval(checkBackend, 10000);
    return () => clearInterval(interval);
  }, []);


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

  const runCode = useCallback(async () => {
    setIsRunning(true)
    setOutput('')
    setExecutionTime(null)

    const result = await executeCodeLocally(code, currentLang)

    if (result.error) {
      setOutput(`❌ ${result.status}:\n${result.error}`)
    } else {
      const outputText = result.output || '(No output)'
      setOutput(`✅ ${result.status}:\n${outputText}`)
    }

    if (result.time) {
      setExecutionTime(result.time)
    }

    setIsRunning(false)
  }, [code, currentLang])

  const clearOutput = () => {
    setOutput('')
    setExecutionTime(null)
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault()
        runCode()
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [runCode])

  return (
    <div className="h-screen w-screen flex flex-col bg-primary overflow-hidden">
      {/* Header */}
      <header className="relative flex-shrink-0 h-32 flex items-center justify-center bg-gradient-to-b from-secondary to-primary border-b border-white/5">
        {/* Sidebar Toggle Button - Left Corner */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`
            absolute left-4 top-1/2 -translate-y-1/2 z-20
            glow-button flex items-center gap-2 px-5 py-3 rounded-lg
            bg-secondary/95 backdrop-blur-sm border border-white/20
            text-textPrimary font-medium text-sm
            transition-all duration-300
            hover:bg-accentCyan/20 hover:border-accentCyan/50
          `}
        >
          {sidebarOpen ? (
            <>
              <ChevronLeft className="w-5 h-5 text-accentCyan" />
              <span>Close</span>
            </>
          ) : (
            <>
              <ChevronRight className="w-5 h-5 text-accentCyan" />
              <span>Other Languages</span>
            </>
          )}
        </button>

        {/* GWS Branding */}
        <div className="flex flex-col items-center">
          <h1 className="font-orbitron text-6xl font-black gws-gradient-text tracking-wider animate-glow">
            GWS
          </h1>
          <p className="mt-2 font-inter text-textSecondary text-lg tracking-wide">
            Online <span className="text-accentCyan font-semibold">{currentLanguage?.name}</span> {currentLanguage?.compiler}
          </p>
        </div>

        {/* Backend Status */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel border border-white/10">
          <div className={`w-2 h-2 rounded-full ${
            backendStatus === 'connected' ? 'bg-green-500 animate-pulse' :
            backendStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
          }`} />
          <span className="text-xs text-textSecondary">
            {backendStatus === 'connected' ? 'Backend Connected' :
             backendStatus === 'connecting' ? 'Connecting...' : 'Backend Offline'}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Language Sidebar */}
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
                >
                  <span 
                    className="text-xl w-8 h-8 flex items-center justify-center rounded"
                    style={{ backgroundColor: lang.color + '30' }}
                  >
                    {lang.icon === 'JS' ? (
                      <span className="font-bold text-sm" style={{ color: lang.color }}>JS</span>
                    ) : lang.icon === '☕' ? (
                      <span className="text-lg">☕</span>
                    ) : (
                      <span className="text-lg">🔧</span>
                    )}
                  </span>
                  <div className="flex-1 text-left">
                    <p className={`font-medium ${currentLang === lang.id ? 'text-accentCyan' : 'text-textPrimary'}`}>
                      {lang.name}
                    </p>
                    <p className="text-xs text-textSecondary">{lang.compiler}</p>
                  </div>
                  {currentLang === lang.id && (
                    <div className="w-2 h-2 rounded-full bg-accentCyan animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Code Editor Panel */}
        <section className="flex-1 flex flex-col min-w-0">
          {/* Run Button */}
          <div className="flex-shrink-0 p-3 bg-secondary/50 border-b border-white/5">
            <div className="flex items-center gap-3">
              <button
                onClick={runCode}
                disabled={isRunning}
                className="
                  glow-button flex items-center gap-2 px-6 py-3 rounded-lg
                  bg-gradient-to-r from-green-500 to-emerald-600
                  text-white font-semibold text-sm uppercase tracking-wide
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {isRunning ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
                {isRunning ? 'Running...' : 'Run Code'}
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

              <div className="flex items-center gap-2 text-xs text-textSecondary">
                <Zap className="w-4 h-4" />
                <span>Ctrl + Enter</span>
              </div>
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

        {/* Output Panel */}
        <aside className="w-96 flex-shrink-0 flex flex-col glass-panel border-l border-white/10">
          {/* Output Header */}
          <div className="flex-shrink-0 flex items-center justify-between p-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-accentCyan" />
              <h2 className="font-semibold text-sm uppercase tracking-wide">Output</h2>
              {executionTime && (
                <span className="text-xs text-textSecondary bg-white/10 px-2 py-0.5 rounded">
                  {executionTime}
                </span>
              )}
            </div>
            <button
              onClick={clearOutput}
              className="
                p-2 rounded-lg transition-all duration-200
                hover:bg-white/10 hover:text-accentCyan
                text-textSecondary
              "
              title="Clear Output"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Output Content */}
          <div className="flex-1 overflow-auto p-4 bg-primary/50">
            {output ? (
              <pre className={`
                font-mono text-sm whitespace-pre-wrap break-words
                ${output.includes('Error') ? 'text-error' : 'text-success'}
              `}>
                {output}
              </pre>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-textSecondary">
                <Code2 className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Run your code to see output</p>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
