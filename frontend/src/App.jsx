import { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { Play, Square, RotateCcw, Share2, Copy, Terminal, Code2, ChevronDown, Layers } from 'lucide-react'
import LZString from 'lz-string'
import CommandPalette from './components/CommandPalette'
import HelpOverlay from './components/HelpOverlay'
import { useTerminal } from './hooks/useTerminal'

const LANGUAGES = [
  { id: 'python', name: 'Python', icon: '\u{1f40d}', compiler: 'Interpreter', color: '#3776ab', glow: '#3776ab' },
  { id: 'cpp', name: 'C++', icon: '\u2699\ufe0f', compiler: 'Compiler', color: '#00599c', glow: '#00d4ff' },
  { id: 'javascript', name: 'JavaScript', icon: 'JS', compiler: 'Interpreter', color: '#f7df1e', glow: '#f7df1e' },
  { id: 'java', name: 'Java', icon: '\u2615', compiler: 'Compiler', color: '#007396', glow: '#007396' },
  { id: 'c', name: 'C', icon: '\u{1f527}', compiler: 'Compiler', color: '#a8b9cc', glow: '#00d4ff' }
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
  const {
    output, isRunning, backendStatus, executionTime, executionPhase,
    isReconnecting, showColdStart, showRerunToast, setShowRerunToast,
    queuePosition, setOutput, runCode, stopCode, sendStdin, clearOutput, getLastRunPayload
  } = useTerminal()

  const [currentLang, setCurrentLang] = useState('python')
  const [code, setCode] = useState(DEFAULT_CODE.python)
  const [userInput, setUserInput] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [mobileView, setMobileView] = useState('code')
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [shareToast, setShareToast] = useState(false)
  const [copyToast, setCopyToast] = useState(false)
  const [shareWarning, setShareWarning] = useState(false)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [stdinValue, setStdinValue] = useState('')

  const editorRef = useRef(null)
  const mobileStdinRef = useRef(null)
  const outputEndRef = useRef(null)
  const consoleRef = useRef(null)
  const hiddenInputRef = useRef(null)
  const codeRef = useRef(code)
  const currentLangRef = useRef(currentLang)
  codeRef.current = code
  currentLangRef.current = currentLang

  const currentLangData = LANGUAGES.find(l => l.id === currentLang)

  const addToHistory = (entry) => {
    setHistory(prev => [
      { ...entry, snippet: entry.code.slice(0, 60), id: Date.now() },
      ...prev
    ].slice(0, 10))
  }

  useEffect(() => {
    if (outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [output, userInput])

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const compressed = params.get('s')
    const legacyCode = params.get('code')
    const legacyLang = params.get('lang')

    if (compressed) {
      try {
        const payload = JSON.parse(LZString.decompressFromEncodedURIComponent(compressed))
        if (payload.codes) {
          Object.entries(payload.codes).forEach(([lang, c]) => {
            localStorage.setItem(`gws_code_${lang}`, c)
          })
        }
        if (payload.lang && LANGUAGES.find(l => l.id === payload.lang)) {
          setCurrentLang(payload.lang)
        }
      } catch (e) {
        console.error('Failed to decode share URL')
      }
    } else if (legacyCode) {
      try {
        const decoded = atob(legacyCode)
        setCode(decoded)
        if (legacyLang && LANGUAGES.find(l => l.id === legacyLang)) {
          setCurrentLang(legacyLang)
        }
      } catch (e) {}
    }
  }, [])

  useEffect(() => {
    if (isRunning && mobileView === 'terminal') {
      setTimeout(() => hiddenInputRef.current?.focus(), 100)
    }
  }, [isRunning, mobileView])

  useEffect(() => {
    if (!window.visualViewport) return
    const handler = () => {
      const kbHeight = window.innerHeight - window.visualViewport.height
      setKeyboardHeight(Math.max(0, kbHeight))
    }
    window.visualViewport.addEventListener('resize', handler)
    return () => window.visualViewport.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault()
        clearOutput()
        setUserInput('')
        return
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false)
        setHelpOpen(false)
        return
      }
      const tag = document.activeElement?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      if (e.key === '?') setHelpOpen(prev => !prev)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [clearOutput])

  useEffect(() => {
    const el = document.getElementById('mobile-main')
    if (!el) return
    let startX = 0
    let startY = 0

    const onTouchStart = (e) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }

    const onTouchEnd = (e) => {
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return
      if (dx < 0) setMobileView('terminal')
      else        setMobileView('code')
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [])

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => runCode(codeRef.current, currentLangRef.current, (result) => {
        addToHistory({ exitCode: result.exitCode, time: result.time, code: codeRef.current, language: currentLangRef.current })
      })
    )
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column })
    })
  }

  const handleLanguageChange = (langId) => {
    setCurrentLang(langId)
    setPaletteOpen(false)
    clearOutput()
    setUserInput('')
  }

  const handleRun = () => {
    const c = codeRef.current
    const lang = currentLangRef.current
    if (consoleRef.current) consoleRef.current.scrollTop = 0
    runCode(c, lang, (result) => {
      addToHistory({ exitCode: result.exitCode, time: result.time, code: c, language: lang })
    })
    setMobileView('terminal')
  }

  const handleFabClick = () => {
    if (isRunning) {
      stopCode()
    } else {
      const c = codeRef.current
      const lang = currentLangRef.current
      if (consoleRef.current) consoleRef.current.scrollTop = 0
      runCode(c, lang, (result) => {
        addToHistory({ exitCode: result.exitCode, time: result.time, code: c, language: lang })
      })
      setMobileView('terminal')
    }
  }

  const resetCode = () => {
    localStorage.removeItem(`gws_code_${currentLang}`)
    setCode(DEFAULT_CODE[currentLang])
    clearOutput()
    setUserInput('')
  }

  const shareCode = () => {
    const allCodes = {}
    LANGUAGES.forEach(lang => {
      allCodes[lang.id] = lang.id === currentLang
        ? code
        : (localStorage.getItem(`gws_code_${lang.id}`) || DEFAULT_CODE[lang.id])
    })
    const payload = JSON.stringify({ codes: allCodes, lang: currentLang })
    const compressed = LZString.compressToEncodedURIComponent(payload)
    const url = `${window.location.origin}${window.location.pathname}?s=${compressed}`

    if (url.length > 1800) {
      setShareWarning(true)
      setTimeout(() => setShareWarning(false), 5000)
    }

    navigator.clipboard.writeText(url).then(() => {
      setShareToast(true)
      setTimeout(() => setShareToast(false), 2500)
    })
  }

  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopyToast(true)
      setTimeout(() => setCopyToast(false), 2000)
    })
  }

  const handleInputKeyDown = (e) => {
    if (!isRunning) return
    if (e.key === 'Enter') {
      e.preventDefault()
      const input = userInput + '\n'
      setOutput(prev => prev + `\u276f ${userInput}\n`)
      sendStdin(input)
      setUserInput('')
    }
  }

  const handleMobileStdinSubmit = () => {
    if (!isRunning || !stdinValue) return
    const line = stdinValue + '\n'
    setOutput(prev => prev + `\u276f ${stdinValue}\n`)
    sendStdin(line)
    setStdinValue('')
    mobileStdinRef.current?.focus()
  }

  const getLangStripeClass = () => `lang-stripe-${currentLang}`
  const lineCount = code.split('\n').length
  const charCount = code.length

  const renderOutputLine = (line, i) => {
    if (line.startsWith('[STDERR]')) {
      return <div key={i} className="text-[#f85149]">{line.slice(8)}</div>
    }
    if (line.includes('Error:') || line.includes('Failed') || line.includes('blocked') || line.includes('timed out')) {
      return <div key={i} className="text-[#f85149]">{line}</div>
    }
    if (line.startsWith('\u276f')) {
      return <div key={i} className="text-[#f59e0b]">{line}</div>
    }
    if (line.startsWith('\u2500') || line.startsWith('--')) {
      return <div key={i} className="text-[#30363d]">{line}</div>
    }
    return <div key={i}>{line}</div>
  }

  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-[#0a0e17] overflow-hidden mobile-pb md:pb-0">
      {showColdStart && backendStatus !== 'online' && (
        <div className="cold-start-toast">
          {'\u23f3'} Server waking up
          <span className="opacity-60 hidden sm:inline">
            {' '}— first run may take ~30s
          </span>
        </div>
      )}

      <header className="relative flex-shrink-0 h-20 md:h-24 flex items-center justify-center bg-gradient-to-b from-secondary to-[#0a0e17] border-b border-white/5 px-4 md:px-8">
        <button
          onClick={() => setPaletteOpen(true)}
          className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-textSecondary hover:bg-accentCyan/10 hover:border-accentCyan/30 hover:text-accentCyan transition-all duration-200"
          title="Select Language"
        >
          <Layers className="w-4 h-4" strokeWidth={1.75} />
          <span className="text-[10px] font-medium leading-none">Language</span>
        </button>

        <div className="flex flex-col items-center">
          <h1 className="font-orbitron text-4xl md:text-5xl font-black gws-gradient-text tracking-wider">
            GWS
          </h1>
          <p className="text-[10px] md:text-xs font-mono text-textSecondary/80 mt-0.5 tracking-wide">
            <span style={{ color: currentLangData?.color }}>{'\u25cf'}</span>
            {' '}{currentLangData?.name} <span className="opacity-50">{'\u00b7'}</span> {currentLangData?.compiler}
          </p>
        </div>

        <div
          className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 rounded-full bg-white/5 border border-white/10"
          title="Execution server"
        >
          {isReconnecting ? (
            <span className="text-[10px] md:text-xs text-yellow-500 font-mono animate-pulse">Reconnecting...</span>
          ) : (
            <>
              <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${
                backendStatus === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`} />
              <span className="text-[10px] md:text-xs text-textSecondary font-mono">
                {backendStatus === 'online' ? 'Online' : 'Offline'}
              </span>
            </>
          )}
        </div>
      </header>

      {showRerunToast && (
        <div className="rerun-toast">
          <span>Reconnected {'\u2014'} re-run last code?</span>
          <button onClick={() => {
            const last = getLastRunPayload()
            if (last) runCode(last.code, last.language)
            setShowRerunToast(false)
          }}>Re-run</button>
          <button onClick={() => setShowRerunToast(false)}>Dismiss</button>
        </div>
      )}

      <main id="mobile-main" className="flex-1 min-h-0 flex overflow-hidden">
        <section className={`flex-1 flex-col min-w-0 ${mobileView === 'code' ? 'flex' : 'hidden md:flex'}`}>
          <div className={`flex-shrink-0 p-2 md:p-3 bg-secondary/50 border-b border-white/5 ${getLangStripeClass()}`}>
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={handleRun}
                disabled={backendStatus === 'offline'}
                className={`
                  flex items-center justify-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold transition-all duration-300 active:scale-95 shadow-lg text-sm md:text-base
                  ${isRunning
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-green-600 hover:bg-green-500 hover:shadow-[0_0_25px_rgba(74,222,128,0.6)] text-white'
                  }
                  ${backendStatus === 'offline' ? 'opacity-50 cursor-not-allowed' : ''}
                  w-full md:w-auto
                `}
              >
                {isRunning ? (
                  <><Square className="w-4 h-4" /><span>Stop</span></>
                ) : (
                  <><Play className="w-4 h-4" /><span>Run</span></>
                )}
              </button>

              <button onClick={resetCode}
                className="hidden md:flex items-center justify-center p-2.5 rounded-lg bg-white/5 border border-white/10 text-textSecondary hover:bg-white/10 hover:text-textPrimary transition-all"
                title="Reset to Default"
              ><RotateCcw className="w-4 h-4" /></button>
              <button onClick={resetCode}
                className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-textSecondary text-xs font-medium hover:bg-white/10 hover:text-textPrimary transition-all"
              ><RotateCcw className="w-3.5 h-3.5" /><span>Reset</span></button>

              <button onClick={shareCode}
                className="hidden md:flex items-center justify-center p-2.5 rounded-lg bg-white/5 border border-white/10 text-textSecondary hover:bg-white/10 hover:text-accentCyan transition-all"
                title="Share Code"
              ><Share2 className="w-4 h-4" /></button>
              <button onClick={shareCode}
                className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-textSecondary text-xs font-medium hover:bg-white/10 hover:text-accentCyan transition-all"
              ><Share2 className="w-3.5 h-3.5" /><span>Share</span></button>

              <button onClick={copyCode}
                className="hidden md:flex items-center justify-center p-2.5 rounded-lg bg-white/5 border border-white/10 text-textSecondary hover:bg-white/10 hover:text-accentCyan transition-all"
                title="Copy Code"
              ><Copy className="w-4 h-4" /></button>
              <button onClick={copyCode}
                className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-textSecondary text-xs font-medium hover:bg-white/10 hover:text-accentCyan transition-all"
              ><Copy className="w-3.5 h-3.5" /><span>Copy</span></button>
            </div>
          </div>

          <div className={`flex-1 overflow-hidden flex flex-col ${getLangStripeClass()}`}>
            <div className="flex-1 overflow-hidden">
              <Editor
                height="100%"
                language={MONACO_LANGUAGE[currentLang]}
                value={code}
                onChange={(value) => setCode(value || '')}
                onMount={handleEditorDidMount}
                theme="vs-dark"
                options={{
                  fontSize: typeof window !== 'undefined' && window.innerWidth < 768 ? 13 : 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                  fontLigatures: false,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 16, bottom: 16 },
                  lineNumbers: typeof window !== 'undefined' && window.innerWidth < 768 ? 'off' : 'on',
                  roundedSelection: true,
                  automaticLayout: true,
                  tabSize: 4,
                  wordWrap: 'on',
                  smoothScrolling: true,
                  cursorSmoothCaretAnimation: 'on',
                  renderLineHighlight: 'line',
                  occurrencesHighlight: 'off',
                  selectionHighlight: false
                }}
              />
            </div>

            <div className="editor-status-bar">
              <div className="flex items-center">
                <span className={`lang-dot lang-dot-${currentLang}`} />
                <span>{currentLangData?.name}</span>
                <span className="status-sep">{'\u00b7'}</span>
                <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
              </div>
              <div className="flex items-center">
                <span>UTF-8</span>
                <span className="status-sep">{'\u00b7'}</span>
                <span>{lineCount} lines</span>
                <span className="status-sep">{'\u00b7'}</span>
                <span>{charCount} chars</span>
              </div>
            </div>
          </div>
        </section>

        <aside
          className={`w-full md:w-96 flex-shrink-0 flex-col border-t md:border-t-0 md:border-l border-white/5 bg-[#0a0e17] ${mobileView === 'terminal' ? 'flex' : 'hidden md:flex'}`}
          style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : (typeof window !== 'undefined' && window.innerWidth < 768 ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab-bar-height')) || 56 : 0) }}
        >
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-secondary/30 border-b border-white/5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-accentCyan font-bold">{'>_'}</span>
              <span className="font-mono text-xs text-textSecondary">Terminal</span>
              {queuePosition && (
                <span className="queue-badge">{'\u23f3'} #{queuePosition}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isRunning && (
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-[#30363d] rounded-full overflow-hidden">
                    <div className="h-full bg-accentCyan rounded-full animate-progress" />
                  </div>
                  <span className="text-[10px] text-accentCyan font-mono">Running</span>
                </div>
              )}
              {executionTime && !isRunning && (
                <span className="text-[10px] font-mono text-textSecondary/60 bg-white/5 px-1.5 py-0.5 rounded">
                  {executionTime}
                </span>
              )}
              {executionPhase && isRunning && (
                <span className="text-xs font-mono font-semibold text-accentCyan animate-pulse px-2.5 py-1 rounded-lg bg-accentCyan/10 border border-accentCyan/25 tracking-wide">
                  {executionPhase}
                </span>
              )}
              <button
                onClick={() => { clearOutput(); setUserInput('') }}
                className="p-1 rounded hover:bg-white/10 text-textSecondary/60 hover:text-accentCyan transition-colors"
                title="Clear Terminal"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>

          <div
            ref={consoleRef}
            onClick={() => hiddenInputRef.current?.focus()}
            className="flex-1 min-h-0 relative overflow-auto p-3 font-mono text-[13px] leading-relaxed outline-none cursor-text terminal-body"
          >
            <textarea
              ref={hiddenInputRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              style={{ position: 'absolute', top: 0, left: 0, opacity: 0, width: 1, height: 1, pointerEvents: 'none', zIndex: -1 }}
            />
            <div className="whitespace-pre-wrap break-words text-[#c9d1d9] min-h-full">
              {output && (
                <div>{output.split('\n').map(renderOutputLine)}</div>
              )}
              {isRunning && (
                <span className="inline-block align-middle">
                  {userInput && <span className="text-accentCyan">{userInput}</span>}
                  <span className="terminal-cursor" />
                </span>
              )}
              {!output && !isRunning && (
                <div className="text-textSecondary/40 font-mono text-xs leading-relaxed select-none mt-4">
                  <div>GWS Terminal v1.0</div>
                  <div>{'─'.repeat(18)}</div>
                  <div className="mt-2 md:hidden">
                    Ready. Tap <span className="text-accentCyan/60">▶</span> to run your code.
                  </div>
                  <div className="mt-2 hidden md:block">
                    Ready. Press <span className="text-accentCyan/60">Ctrl+Enter</span> to execute.
                  </div>
                </div>
              )}
              <div ref={outputEndRef} />
            </div>
          </div>

          <div className="flex-shrink-0 h-6 bg-[#060a10] border-t border-white/5 flex items-center justify-between px-3">
            <span className="text-[10px] font-mono text-textSecondary/30">JetBrains Mono {'\u00b7'} 13px</span>
            <span className="text-[10px] font-mono text-textSecondary/30 hidden md:inline">{'\u2191\u2193'} scroll</span>
            <span className="text-[10px] font-mono text-textSecondary/30 md:hidden">Tap terminal {'\u00b7'} type {'\u00b7'} Enter to send</span>
          </div>

          {history.length > 0 && (
            <div className="history-panel">
              <button className="history-toggle" onClick={() => setShowHistory(p => !p)}>
                Recent Runs ({history.length})
                <ChevronDown className={`w-3 h-3 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
              </button>
              {showHistory && (
                <div className="history-list">
                  {history.map(entry => (
                    <button
                      key={entry.id}
                      className="history-item"
                      onClick={() => {
                        setCurrentLang(entry.language)
                        setCode(entry.code)
                      }}
                    >
                      <span className={`lang-dot lang-dot-${entry.language}`} />
                      <span className="history-snippet">{entry.snippet}...</span>
                      <span className="history-meta">{entry.time}</span>
                      <span className={entry.exitCode === 0 ? 'text-green-500' : 'text-red-500'}>
                        {entry.exitCode === 0 ? '\u2713' : '\u2717'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {isRunning && (
            <div
              className="md:hidden flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-[#0d1117] border-t border-accentCyan/20"
              style={{ paddingBottom: keyboardHeight > 0 ? 8 : undefined }}
            >
              <span className="font-mono text-xs text-accentCyan select-none">{'\u276f'}</span>
              <input
                ref={mobileStdinRef}
                type="text"
                value={stdinValue}
                onChange={e => setStdinValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleMobileStdinSubmit() } }}
                placeholder="stdin — type here, tap Send"
                className="flex-1 bg-transparent font-mono text-sm text-[#c9d1d9] placeholder:text-textSecondary/30 outline-none"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button
                onClick={handleMobileStdinSubmit}
                className="px-3 py-1 rounded-lg bg-accentCyan/10 border border-accentCyan/30 text-accentCyan text-xs font-mono font-medium active:bg-accentCyan/20 transition-colors"
              >
                Send
              </button>
            </div>
          )}
        </aside>
      </main>

      {paletteOpen && (
        <CommandPalette
          languages={LANGUAGES}
          currentLang={currentLang}
          onSelect={handleLanguageChange}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {helpOpen && (
        <HelpOverlay onClose={() => setHelpOpen(false)} />
      )}

      {copyToast && (
        <div className="share-toast">{'\u2713'} Code copied to clipboard</div>
      )}

      {shareToast && (
        <div className="share-toast">{'\u2713'} Share URL copied to clipboard</div>
      )}

      {shareWarning && (
        <div className="rerun-toast" style={{ bottom: 120 }}>
          {'\u26a0'} Share URL exceeds 1800 chars — may not work in some browsers
        </div>
      )}

      <div className="bottom-tab-bar">
        {[
          { view: 'code',     Icon: Code2,    label: 'Code'     },
          { view: 'lang',     Icon: Layers,   label: 'Language' },
          { view: 'terminal', Icon: Terminal, label: 'Terminal' },
        ].map(({ view, Icon, label }) => {
          const isActive = view === 'lang'
            ? paletteOpen
            : mobileView === view
          return (
            <button
              key={view}
              onClick={() => {
                if (view === 'lang') { setPaletteOpen(true); return }
                setMobileView(view)
              }}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2"
            >
              <div className={`
                flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl
                transition-all duration-200
                ${isActive
                  ? 'bg-accentCyan/10 text-accentCyan'
                  : 'text-textSecondary hover:text-textPrimary'}
              `}>
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.75} />
                <span className={`text-[10px] font-medium leading-none
                                  ${isActive ? 'font-semibold' : ''}`}>
                  {label}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div
        className="md:hidden fixed right-4 z-50 transition-all duration-200"
        style={{
          display: mobileView === 'code' || isRunning ? 'block' : 'none',
          bottom: keyboardHeight > 0
            ? keyboardHeight + 16
            : 'calc(var(--tab-bar-height) + 16px)'
        }}
      >
        <button
          onClick={handleFabClick}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95 ${
            isRunning
              ? 'bg-red-600 shadow-[0_0_25px_rgba(220,38,38,0.5)]'
              : 'bg-accentCyan shadow-[0_0_25px_rgba(0,212,255,0.5)]'
          }`}
        >
          {isRunning ? (
            <Square className="w-5 h-5 text-white" />
          ) : (
            <Play className="w-6 h-6 text-white ml-0.5" />
          )}
        </button>
      </div>
    </div>
  )
}

export default App
