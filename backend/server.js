import express from 'express';
import cors from 'cors';
import { spawn as _spawn, spawnSync } from 'child_process';

const spawn = (command, args, options = {}) => {
  const isWin = os.platform() === 'win32';
  if (!isWin && options && options.shell) {
    const limits = 'ulimit -t 10 2>/dev/null; ulimit -v 262144 2>/dev/null; ';
    command = `${limits} ${command}`;
  }
  return _spawn(command, args, options);
};
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { Server } from 'socket.io';

// Cache for compiler paths
const COMPILER_PATHS = {
  javac: null,
  java: null,
  gpp: 'g++',
  gcc: 'gcc'
};

function findExecutable(name) {
  if (COMPILER_PATHS[name]) return COMPILER_PATHS[name];

  try {
    const isWin = os.platform() === 'win32';
    const cmd = isWin ? 'where' : 'which';
    const result = spawnSync(cmd, [name], { encoding: 'utf8' });
    
    if (result.status === 0) {
      const p = result.stdout.split(isWin ? '\r\n' : '\n')[0].trim();
      COMPILER_PATHS[name] = p;
      return p;
    }

    // Common Windows locations if not in PATH
    if (isWin && (name === 'javac' || name === 'java')) {
      const javaBase = 'C:\\Program Files\\Java';
      if (fs.existsSync(javaBase)) {
        const dirs = fs.readdirSync(javaBase);
        const jdkDir = dirs.find(d => d.startsWith('jdk') || d.startsWith('jre'));
        if (jdkDir) {
          const p = path.join(javaBase, jdkDir, 'bin', `${name}.exe`);
          if (fs.existsSync(p)) {
            COMPILER_PATHS[name] = p;
            return p;
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error searching for ${name}:`, err.message);
  }

  return name; // Fallback to raw name
}

const app = express();
const PORT = process.env.PORT || 3001;

console.log('Node version:', process.version);
console.log('Fetch available:', typeof fetch !== 'undefined');


app.use(cors());
app.use(express.json());

const LANGUAGE_IDS = {
  python: 71,
  cpp: 54,
  javascript: 63,
  java: 62,
  c: 50
};

const RAPID_API_KEY = process.env.RAPID_API_KEY || '';

function executeLocal(code, language, stdin = '') {
  return new Promise((resolve) => {
    const rootTmpDir = os.tmpdir();
    // Create a unique subdirectory for this execution to avoid collisions
    const userDir = fs.mkdtempSync(path.join(rootTmpDir, `gws-exec-${Date.now()}-`));
    const startTime = Date.now();
    let output = '';
    let error = '';
    let proc = null;

    const handleStdin = (targetProc) => {
      if (stdin && targetProc && targetProc.stdin) {
        targetProc.stdin.write(stdin);
        targetProc.stdin.end();
      } else if (targetProc && targetProc.stdin) {
        targetProc.stdin.end();
      }
    };

    const cleanup = () => {
      if (proc) proc.kill();
      try {
        // Recursively remove the temp directory and all its contents
        fs.rmSync(userDir, { recursive: true, force: true });
      } catch (err) {
        console.error('Cleanup error:', err.message);
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({ output: '', error: `Execution timed out (10s limit)`, time: '10s', status: 'Time Limit Exceeded' });
    }, 10000);

    try {
      switch (language) {
        case 'python': {
          const filePath = path.join(userDir, `script.py`);
          fs.writeFileSync(filePath, code);
          const isWin = os.platform() === 'win32';
          const pyCmd = findExecutable('python3') || findExecutable('python');
          proc = spawn(isWin ? pyCmd : `"${pyCmd}"`, [`"${filePath}"`], { shell: true });
          handleStdin(proc);
          proc.stdout.on('data', (data) => { output += data.toString(); });
          proc.stderr.on('data', (data) => { error += data.toString(); });
          proc.on('error', (err) => { error = `Failed to start Python: ${err.message}`; });
          proc.on('close', (code) => {
            clearTimeout(timeout);
            const duration = ((Date.now() - startTime) / 1000).toFixed(3);
            cleanup();
            resolve({
              output: output.trim(),
              error: error ? error.trim() : (code !== 0 ? `Exit code: ${code}` : null),
              time: `${duration}s`,
              status: code === 0 ? 'Accepted' : 'Runtime Error'
            });
          });
          break;
        }

        case 'javascript': {
          const filePath = path.join(userDir, `script.js`);
          fs.writeFileSync(filePath, code);
          proc = spawn('node', ['--max-old-space-size=64', `"${filePath}"`], { shell: true });
          handleStdin(proc);
          proc.stdout.on('data', (data) => { output += data.toString(); });
          proc.stderr.on('data', (data) => { error += data.toString(); });
          proc.on('error', (err) => { error = `Failed to start Node.js: ${err.message}`; });
          proc.on('close', (code) => {
            clearTimeout(timeout);
            const duration = ((Date.now() - startTime) / 1000).toFixed(3);
            cleanup();
            resolve({
              output: output.trim(),
              error: error ? error.trim() : (code !== 0 ? `Exit code: ${code}` : null),
              time: `${duration}s`,
              status: code === 0 ? 'Accepted' : 'Runtime Error'
            });
          });
          break;
        }

        case 'cpp': {
          let processedCode = "#include <stdio.h>\n" + code;
          processedCode = processedCode.replace(/(int\s+main\s*\([^)]*\)\s*\{)/, "$1\n    setvbuf(stdout, NULL, _IONBF, 0);\n    setvbuf(stderr, NULL, _IONBF, 0);\n");
          const srcPath = path.join(userDir, `solution.cpp`);
          const exePath = path.join(userDir, `solution.exe`);
          fs.writeFileSync(srcPath, processedCode);
          
          const gpp = findExecutable('g++');
          proc = spawn(`"${gpp}"`, [`"${srcPath}"`, '-o', `"${exePath}"`], { shell: true });
          
          proc.stderr.on('data', (data) => { error += data.toString(); });
          proc.on('error', (err) => { error = `Failed to start g++: ${err.message}`; });
          proc.on('close', (compileCode) => {
            if (compileCode !== 0) {
              clearTimeout(timeout);
              const duration = ((Date.now() - startTime) / 1000).toFixed(3);
              const compileError = error;
              cleanup();
              resolve({
                output: '',
                error: compileError || 'Compilation Error',
                time: `${duration}s`,
                status: 'Compilation Error'
              });
              return;
            }
            
            const runProc = spawn(`"${exePath}"`, [], { shell: true });
            handleStdin(runProc);
            runProc.stdout.on('data', (data) => { output += data.toString(); });
            runProc.stderr.on('data', (data) => { error += data.toString(); });
            runProc.on('close', (runCode) => {
              clearTimeout(timeout);
              const duration = ((Date.now() - startTime) / 1000).toFixed(3);
              cleanup();
              resolve({
                output: output.trim(),
                error: error ? error.trim() : (runCode !== 0 ? `Exit code: ${runCode}` : null),
                time: `${duration}s`,
                status: runCode === 0 ? 'Accepted' : 'Runtime Error'
              });
            });
          });
          break;
        }

        case 'c': {
          let processedCode = "#include <stdio.h>\n" + code;
          processedCode = processedCode.replace(/(int\s+main\s*\([^)]*\)\s*\{)/, "$1\n    setvbuf(stdout, NULL, _IONBF, 0);\n    setvbuf(stderr, NULL, _IONBF, 0);\n");
          const srcPath = path.join(userDir, `solution.c`);
          const exePath = path.join(userDir, `solution.exe`);
          fs.writeFileSync(srcPath, processedCode);
          
          const gcc = findExecutable('gcc');
          proc = spawn(`"${gcc}"`, [`"${srcPath}"`, '-o', `"${exePath}"`], { shell: true });
          
          proc.stderr.on('data', (data) => { error += data.toString(); });
          proc.on('error', (err) => { error = `Failed to start gcc: ${err.message}`; });
          proc.on('close', (compileCode) => {
            if (compileCode !== 0) {
              clearTimeout(timeout);
              const duration = ((Date.now() - startTime) / 1000).toFixed(3);
              const compileError = error;
              cleanup();
              resolve({
                output: '',
                error: compileError || 'Compilation Error',
                time: `${duration}s`,
                status: 'Compilation Error'
              });
              return;
            }
            
            const runProc = spawn(`"${exePath}"`, [], { shell: true });
            handleStdin(runProc);
            runProc.stdout.on('data', (data) => { output += data.toString(); });
            runProc.stderr.on('data', (data) => { error += data.toString(); });
            runProc.on('close', (runCode) => {
              clearTimeout(timeout);
              const duration = ((Date.now() - startTime) / 1000).toFixed(3);
              cleanup();
              resolve({
                output: output.trim(),
                error: error ? error.trim() : (runCode !== 0 ? `Exit code: ${runCode}` : null),
                time: `${duration}s`,
                status: runCode === 0 ? 'Accepted' : 'Runtime Error'
              });
            });
          });
          break;
        }

        case 'java': {
          // Detect package declaration (ignoring comments)
          const packageMatch = code.match(/^\s*package\s+([\w.]+);/m);
          const packageName = packageMatch ? packageMatch[1] : null;
          
          // Improved class name detection: look for public class first, then any class
          // Handles optional modifiers like final/abstract
          const publicClassMatch = code.match(/public\s+(?:final\s+|abstract\s+)?(?:class|interface|enum|record)\s+(\w+)/);
          const anyClassMatch = code.match(/(?:public\s+)?(?:class|interface|enum|record)\s+(\w+)/);
          const className = (publicClassMatch && publicClassMatch[1]) || (anyClassMatch && anyClassMatch[1]);

          if (!className) {
            clearTimeout(timeout);
            cleanup();
            resolve({ 
              output: '', 
              error: 'Java compilation failed.\n\nTip: Ensure class name matches file name and avoid heavy memory usage.', 
              time: '0s', 
              status: 'Compilation Error' 
            });
            return;
          }
          
          let relativeSrcPath = `${className}.java`;
          if (packageName) {
            const packagePath = packageName.replace(/\./g, path.sep);
            const fullPackagePath = path.join(userDir, packagePath);
            fs.mkdirSync(fullPackagePath, { recursive: true });
            relativeSrcPath = path.join(packagePath, `${className}.java`);
          }
          
          const srcPath = path.join(userDir, relativeSrcPath);
          fs.writeFileSync(srcPath, code);
          
          const javac = findExecutable('javac');
          // Compile from userDir root to ensure package paths are handled correctly
          proc = spawn(`"${javac}"`, [relativeSrcPath], { cwd: userDir, shell: true });
          
          proc.stderr.on('data', (data) => { error += data.toString(); });
          proc.on('error', (err) => { 
            error = `❌ Compiler Error: ${err.message}`; 
          });
          
          proc.on('close', (compileCode) => {
            if (compileCode !== 0) {
              clearTimeout(timeout);
              
              if (error.includes('is not recognized') || error.includes('not found') || error.includes('command not found')) {
                error = `❌ Java Development Kit (JDK) Required\n\nThe Java compiler ('javac') was not found on the system.\n\nPlease install the JDK and ensure 'javac' is in your system PATH.`;
              }
              
              const duration = ((Date.now() - startTime) / 1000).toFixed(3);
              const compileError = error;
              cleanup();
              resolve({
                output: '',
                error: compileError || 'Compilation Error',
                time: `${duration}s`,
                status: 'Compilation Error'
              });
              return;
            }
            
            const java = findExecutable('java');
            const fullClassName = packageName ? `${packageName}.${className}` : className;
            // Use -cp . to specify the root of the class files, -Xmx64m limits memory to 64MB
            const runProc = spawn(`"${java}"`, ['-Xmx64m', '-cp', '.', fullClassName], { cwd: userDir, shell: true });
            handleStdin(runProc);
            
            runProc.stdout.on('data', (data) => { output += data.toString(); });
            runProc.stderr.on('data', (data) => { error += data.toString(); });
            runProc.on('close', (runCode) => {
              clearTimeout(timeout);
              const duration = ((Date.now() - startTime) / 1000).toFixed(3);
              cleanup();
              resolve({
                output: output.trim(),
                error: error ? error.trim() : (runCode !== 0 ? `Exit code: ${runCode}` : null),
                time: `${duration}s`,
                status: runCode === 0 ? 'Accepted' : 'Runtime Error'
              });
            });
          });
          break;
        }


        default:
          clearTimeout(timeout);
          resolve({ output: '', error: 'Unsupported language', time: '0s', status: 'Error' });
      }
    } catch (err) {
      clearTimeout(timeout);
      resolve({ output: '', error: err.message, time: '0s', status: 'Error' });
    }
  });
}

async function executeCode(code, language, stdin = '') {
  if (RAPID_API_KEY) {
    try {
      const languageId = LANGUAGE_IDS[language];
      if (!languageId) {
        return await executeLocal(code, language, stdin);
      }

      console.log(`Executing via RapidAPI for ${language}...`);
      const response = await fetch('https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': RAPID_API_KEY,
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
        },
        body: JSON.stringify({
          language_id: languageId,
          source_code: code,
          stdin: stdin,
          cpu_time_limit: 10,
          memory_limit: 128000
        })
      });

      const result = await response.json();

      return {
        output: result.stdout || '',
        error: result.stderr || result.compile_output || null,
        time: result.time ? `${result.time}s` : 'N/A',
        status: result.status?.description || 'Unknown'
      };
    } catch (error) {
      console.error('RapidAPI Error, falling back to local:', error.message);
      return await executeLocal(code, language, stdin);
    }
  }

  return await executeLocal(code, language, stdin);
}

app.post('/api/execute', async (req, res) => {
  try {
    const { code, language, stdin = '' } = req.body;
    console.log(`Received request to execute ${language}`);
    
    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }
  
    const result = await executeCode(code, language);
    console.log(`Execution complete for ${language}`);
    res.json(result);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: RAPID_API_KEY ? 'rapidapi' : 'local' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store active processes per socket
const activeProcesses = new Map();

io.on('connection', (socket) => {
  console.log('Client connected for interactive terminal');

  const BLOCKED_PATTERNS = [
      'while(true)', 'while (true)',
      'fork(', 'child_process',
      'system(', 'execSync',
      'spawnSync', 'spawn\''
    ];

    const MAX_OUTPUT_SIZE = 5000;
    let outputSize = 0;
    socket.emit('output', '\n');

    const isCodeBlocked = BLOCKED_PATTERNS.some(pattern => 
      code.toLowerCase().includes(pattern.toLowerCase())
    );
    if (isCodeBlocked) {
      socket.emit('output', '\n⚠️ Execution blocked: Potentially unsafe code detected.\n');
      socket.emit('exit', { code: 1, message: '\n\n=== Execution Blocked ===' });
      return;
    }

    const rootTmpDir = os.tmpdir();
    const userDir = fs.mkdtempSync(path.join(rootTmpDir, `gws-socket-${Date.now()}-`));
    const startTime = Date.now();
    let proc = null;
    let processTimeout = null;

    const cleanup = () => {
      if (proc) proc.kill();
      activeProcesses.delete(socket.id);
      try {
        fs.rmSync(userDir, { recursive: true, force: true });
      } catch (err) {}
    };

    socket.on('disconnect', cleanup);
    socket.on('stop', cleanup);

    const processTimeout = setTimeout(() => {
      socket.emit('output', '\n\n=== Execution timed out (10s limit) ===');
      cleanup();
    }, 10000);

    try {
      const isWin = os.platform() === 'win32';
      
      const startProcess = (cmd, args, options = {}) => {
        proc = spawn(cmd, args, { ...options, shell: true });
        activeProcesses.set(socket.id, proc);

        proc.stdout.on('data', (data) => {
          outputSize += data.length;
          if (outputSize > MAX_OUTPUT_SIZE) {
            socket.emit('output', '\n\n⚠️ Output limit exceeded (5KB)');
            proc.kill();
            return;
          }
          socket.emit('output', data.toString());
        });

        proc.stderr.on('data', (data) => {
          outputSize += data.length;
          if (outputSize > MAX_OUTPUT_SIZE) {
            socket.emit('output', '\n\n⚠️ Output limit exceeded (5KB)');
            proc.kill();
            return;
          }
          socket.emit('output', data.toString());
        });

        proc.on('close', (exitCode) => {
          clearTimeout(processTimeout);
          const duration = ((Date.now() - startTime) / 1000).toFixed(3);
          socket.emit('exit', {
            code: exitCode,
            time: `${duration}s`,
            message: `\n\n=== Code Execution ${exitCode === 0 ? 'Successful' : 'Failed'} ===`
          });
          cleanup();
        });

        proc.on('error', (err) => {
          socket.emit('output', `\nError: ${err.message}`);
          cleanup();
        });
      };

      switch (language) {
        case 'python': {
          const filePath = path.join(userDir, `script.py`);
          fs.writeFileSync(filePath, code);
          const pyCmd = findExecutable('python3') || findExecutable('python');
          startProcess(isWin ? pyCmd : `"${pyCmd}"`, [`"${filePath}"`]);
          break;
        }
case 'javascript': {
           const filePath = path.join(userDir, `script.js`);
           fs.writeFileSync(filePath, code);
           startProcess('node', ['--max-old-space-size=64', `"${filePath}"`]);
          break;
        }
        case 'cpp': {
          let processedCode = "#include <stdio.h>\n" + code;
          processedCode = processedCode.replace(/(int\s+main\s*\([^)]*\)\s*\{)/, "$1\n    setvbuf(stdout, NULL, _IONBF, 0);\n    setvbuf(stderr, NULL, _IONBF, 0);\n");
          const srcPath = path.join(userDir, `solution.cpp`);
          const exePath = path.join(userDir, `solution.exe`);
          fs.writeFileSync(srcPath, processedCode);
          const gpp = findExecutable('g++');
          const compileProc = spawn(`"${gpp}"`, [`"${srcPath}"`, '-o', `"${exePath}"`], { shell: true });
          
          compileProc.stderr.on('data', (data) => socket.emit('output', data.toString()));
          compileProc.on('close', (cCode) => {
            if (cCode === 0) startProcess(`"${exePath}"`, []);
            else socket.emit('exit', { code: cCode, message: '\n\n=== Compilation Failed ===' });
          });
          break;
        }
        case 'c': {
          let processedCode = "#include <stdio.h>\n" + code;
          processedCode = processedCode.replace(/(int\s+main\s*\([^)]*\)\s*\{)/, "$1\n    setvbuf(stdout, NULL, _IONBF, 0);\n    setvbuf(stderr, NULL, _IONBF, 0);\n");
          const srcPath = path.join(userDir, `solution.c`);
          const exePath = path.join(userDir, `solution.exe`);
          fs.writeFileSync(srcPath, processedCode);
          const gcc = findExecutable('gcc');
          const compileProc = spawn(`"${gcc}"`, [`"${srcPath}"`, '-o', `"${exePath}"`], { shell: true });
          
          compileProc.stderr.on('data', (data) => socket.emit('output', data.toString()));
          compileProc.on('close', (cCode) => {
            if (cCode === 0) startProcess(`"${exePath}"`, []);
            else socket.emit('exit', { code: cCode, message: '\n\n=== Compilation Failed ===' });
          });
          break;
        }
        case 'java': {
          const packageMatch = code.match(/^\s*package\s+([\w.]+);/m);
          const packageName = packageMatch ? packageMatch[1] : null;
          const publicClassMatch = code.match(/public\s+(?:final\s+|abstract\s+)?(?:class|interface|enum|record)\s+(\w+)/);
          const anyClassMatch = code.match(/(?:public\s+)?(?:class|interface|enum|record)\s+(\w+)/);
          const className = (publicClassMatch && publicClassMatch[1]) || (anyClassMatch && anyClassMatch[1]);

          if (!className) {
            socket.emit('output', 'Java compilation failed.\n\nTip: Ensure class name matches file name and avoid heavy memory usage.');
            return;
          }

          let relativeSrcPath = `${className}.java`;
          if (packageName) {
            const packagePath = packageName.replace(/\./g, path.sep);
            fs.mkdirSync(path.join(userDir, packagePath), { recursive: true });
            relativeSrcPath = path.join(packagePath, `${className}.java`);
          }
          
          fs.writeFileSync(path.join(userDir, relativeSrcPath), code);
          const javac = findExecutable('javac');
          const compileProc = spawn(`"${javac}"`, [relativeSrcPath], { cwd: userDir, shell: true });
          
          let compileError = '';
          compileProc.stderr.on('data', (data) => { 
            compileError += data.toString(); 
            socket.emit('output', data.toString());
          });
          compileProc.on('close', (cCode) => {
            if (cCode === 0) {
              const java = findExecutable('java');
              const fullClassName = packageName ? `${packageName}.${className}` : className;
              startProcess(`"${java}"`, ['-Xmx64m', '-cp', '.', fullClassName], { cwd: userDir });
            } else {
              socket.emit('exit', { 
                code: cCode, 
                message: `\n\n=== Compilation Failed ===\n\nTip: Ensure class name matches file name (Main.java → public class Main)` 
              });
            }
          });
          break;
        }
      }
    } catch (err) {
      socket.emit('output', `System Error: ${err.message}`);
    }
  });

  socket.on('stdin', (data) => {
    const proc = activeProcesses.get(socket.id);
    if (proc && proc.stdin) {
      try {
        proc.stdin.write(data);
      } catch (err) {
        socket.emit('output', `\nWarning: Could not write input - ${err.message}`);
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`GWS Compiler Backend running on port ${PORT}`);
  console.log(`Execution mode: ${RAPID_API_KEY ? 'RapidAPI' : 'Local'}`);
  console.log(`WebSockets enabled`);
});

export default app;
