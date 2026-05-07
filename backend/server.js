import express from 'express';
import cors from 'cors';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { Server } from 'socket.io';
import { createRequire } from 'module';
import rateLimit from 'express-rate-limit';

const require = createRequire(import.meta.url);
let pty = null;
try {
  pty = require('node-pty');
} catch (e) {
  console.warn('\u26a0\ufe0f node-pty not available \u2014 using regular spawn');
}

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
  return name;
}

const OPTIONAL_ENV = ['RAPID_API_KEY'];
OPTIONAL_ENV.forEach(key => {
  if (!process.env[key]) {
    console.warn(`\u26a0\ufe0f  Optional env var ${key} not set \u2014 falling back to local execution`);
  }
});

const app = express();
const PORT = process.env.PORT || 3001;
const isWin = os.platform() === 'win32';

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

const MAX_CONCURRENT = 3;
let activeCount = 0;
const executionQueue = [];

const processQueue = () => {
  if (executionQueue.length === 0 || activeCount >= MAX_CONCURRENT) return;
  const next = executionQueue.shift();
  next.execute();
  executionQueue.forEach((item, i) => {
    item.socket.emit('queued', { position: i + 1 });
  });
};

const httpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, please slow down.' }
});
app.use('/api/', httpLimiter);

const socketRunCounts = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of socketRunCounts.entries()) {
    if (now - record.windowStart > 120000) socketRunCounts.delete(ip);
  }
}, 120000);

function executeLocal(code, language, stdin = '') {
  return new Promise((resolve) => {
    const rootTmpDir = os.tmpdir();
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
          const pyCmd = findExecutable('python3') || findExecutable('python');
          proc = spawn(pyCmd, [filePath], { shell: isWin });
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
          proc = spawn('node', ['--max-old-space-size=96', filePath], { shell: isWin });
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
          proc = spawn(gpp, [srcPath, '-o', exePath], { shell: isWin });
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
            const runProc = spawn(exePath, [], { shell: isWin });
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
          proc = spawn(gcc, [srcPath, '-o', exePath], { shell: isWin });
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
            const runProc = spawn(exePath, [], { shell: isWin });
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
          const packageMatch = code.match(/^\s*package\s+([\w.]+);/m);
          const packageName = packageMatch ? packageMatch[1] : null;
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
          proc = spawn(javac, [relativeSrcPath], { cwd: userDir, shell: isWin });
          proc.stderr.on('data', (data) => { error += data.toString(); });
          proc.on('error', (err) => { error = `\u274c Compiler Error: ${err.message}`; });
          proc.on('close', (compileCode) => {
            if (compileCode !== 0) {
              clearTimeout(timeout);
              if (error.includes('is not recognized') || error.includes('not found') || error.includes('command not found')) {
                error = `\u274c Java Development Kit (JDK) Required\n\nThe Java compiler ('javac') was not found on the system.\n\nPlease install the JDK and ensure 'javac' is in your system PATH.`;
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
            const runProc = spawn(java, [
              '-Xms16m', '-Xmx96m',
              '-XX:TieredStopAtLevel=1',
              '-XX:+UseSerialGC',
              '-Djava.security.egd=file:/dev/urandom',
              '-cp', '.',
              fullClassName
            ], { cwd: userDir, shell: isWin });
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

io.on('connection', (socket) => {
  const activeProcesses = new Map();

  socket.on('run', ({ code, language }) => {
    if (!code || !language) {
      socket.emit('output', '\n\u26a0\ufe0f Error: Code and language are required.\n');
      socket.emit('exit', { code: 1, time: '0s', message: '\n\n=== Invalid Request ===' });
      return;
    }

    const ip = socket.handshake.address;
    const now = Date.now();
    const record = socketRunCounts.get(ip) || { count: 0, windowStart: now };
    if (now - record.windowStart > 60000) {
      record.count = 0;
      record.windowStart = now;
    }
    record.count++;
    socketRunCounts.set(ip, record);
    if (record.count > 15) {
      socket.emit('output', '\n\u26a0\ufe0f Rate limit exceeded. Max 15 runs/minute.\n');
      socket.emit('exit', { code: 1, time: '0s', message: '=== Rate Limited ===' });
      return;
    }

    const BLOCKED_PATTERNS = [
      'while(true)', 'while (true)',
      'fork(', 'child_process',
      'system(', 'execSync', 'spawnSync'
    ];

    const MAX_OUTPUT_SIZE = 10000;
    let outputSize = 0;

    const isBlocked = BLOCKED_PATTERNS.some(p =>
      code.toLowerCase().includes(p.toLowerCase())
    );

    if (isBlocked) {
      socket.emit('output', '\n\u26a0\ufe0f Execution blocked: Potentially unsafe code detected.\n');
      socket.emit('exit', { code: 1, time: '0s', message: '\n\n=== Execution Blocked ===' });
      return;
    }

    const execute = () => {
      activeCount++;

      const rootTmpDir = os.tmpdir();
      const userDir = fs.mkdtempSync(path.join(rootTmpDir, `gws-socket-${Date.now()}-`));
      const startTime = Date.now();
      let proc = null;
      let processTimeout = null;

      const originalCleanup = () => {
        if (proc) proc.kill();
        activeProcesses.delete(socket.id);
        try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) {}
      };

      const cleanup = () => {
        originalCleanup();
        activeCount--;
        processQueue();
      };

      const startSpawnProcess = (cmd, args, options = {}) => {
        const spawnOptions = { ...options };
        if (isWin) spawnOptions.shell = true;
        proc = spawn(cmd, args, spawnOptions);
        activeProcesses.set(socket.id, proc);

        proc.stdout.on('data', (data) => {
          outputSize += data.length;
          if (outputSize > MAX_OUTPUT_SIZE) {
            socket.emit('output', '\n\n\u26a0\ufe0f Output limit exceeded (10KB)');
            proc.kill();
            return;
          }
          socket.emit('output', data.toString());
        });

        proc.stderr.on('data', (data) => {
          outputSize += data.length;
          if (outputSize > MAX_OUTPUT_SIZE) {
            socket.emit('output', '\n\n\u26a0\ufe0f Output limit exceeded (10KB)');
            proc.kill();
            return;
          }
          socket.emit('stderr', data.toString());
        });

        proc.on('close', (exitCode) => {
          clearTimeout(processTimeout);
          const duration = ((Date.now() - startTime) / 1000).toFixed(3);
          socket.emit('exit', {
            code: exitCode,
            time: `${duration}s`,
            message: `\n\n\u2500\u2500 Exited with code ${exitCode} \u00b7 ${duration}s\u2500\u2500`
          });
          cleanup();
        });

        proc.on('error', (err) => {
          socket.emit('output', `\nError: ${err.message}`);
          cleanup();
        });
      };

      const startPtyProcess = (cmd, args, options = {}) => {
        if (!pty) {
          startSpawnProcess(cmd, args, options);
          return;
        }
        const cwd = options.cwd || userDir;
        const ptyProc = pty.spawn(cmd, args, {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
          cwd,
          env: { ...process.env, TERM: 'xterm-color' }
        });

        activeProcesses.set(socket.id, ptyProc);

        ptyProc.onData((data) => {
          outputSize += data.length;
          if (outputSize > MAX_OUTPUT_SIZE) {
            socket.emit('output', '\n\n\u26a0\ufe0f Output limit exceeded (10KB)');
            ptyProc.kill();
            return;
          }
          socket.emit('output', data);
        });

        ptyProc.onExit(({ exitCode }) => {
          clearTimeout(processTimeout);
          const duration = ((Date.now() - startTime) / 1000).toFixed(3);
          socket.emit('exit', {
            code: exitCode,
            time: `${duration}s`,
            message: `\n\n\u2500\u2500 Exited with code ${exitCode} \u00b7 ${duration}s\u2500\u2500`
          });
          cleanup();
        });

        return ptyProc;
      };

      processTimeout = setTimeout(() => {
        socket.emit('output', '\n\n=== Execution timed out (10s limit) ===');
        cleanup();
      }, 10000);

      try {
        switch (language) {
          case 'python': {
            const filePath = path.join(userDir, 'script.py');
            fs.writeFileSync(filePath, code);
            const pyCmd = findExecutable('python3') || findExecutable('python');
            startPtyProcess(pyCmd, [filePath]);
            break;
          }

          case 'javascript': {
            const filePath = path.join(userDir, 'script.js');
            fs.writeFileSync(filePath, code);
            startPtyProcess('node', ['--max-old-space-size=96', filePath]);
            break;
          }

          case 'cpp': {
            const alreadyHasStdio = code.includes('#include <stdio.h>') ||
                                    code.includes('#include<stdio.h>') ||
                                    code.includes('#include <bits/stdc++.h>') ||
                                    code.includes('#include<bits/stdc++.h>');
            let processedCode = alreadyHasStdio ? code : `#include <stdio.h>\n${code}`;
            const srcPath = path.join(userDir, 'solution.cpp');
            const exePath = isWin ? path.join(userDir, 'solution.exe') : path.join(userDir, 'solution');
            fs.writeFileSync(srcPath, processedCode);
            const gpp = findExecutable('g++');
            const compileProc = spawn(gpp, [srcPath, '-o', exePath], { shell: isWin });

            compileProc.stderr.on('data', (data) => socket.emit('stderr', data.toString()));
            compileProc.on('error', (err) => socket.emit('output', `\nCompilation Error: ${err.message}`));
            compileProc.on('close', (cCode) => {
              if (cCode === 0) startPtyProcess(exePath, []);
              else socket.emit('exit', { code: cCode, time: '0s', message: '\n\n=== Compilation Failed ===' });
            });
            break;
          }

          case 'c': {
            const alreadyHasStdio = code.includes('#include <stdio.h>') ||
                                    code.includes('#include<stdio.h>') ||
                                    code.includes('#include <bits/stdc++.h>') ||
                                    code.includes('#include<bits/stdc++.h>');
            let processedCode = alreadyHasStdio ? code : `#include <stdio.h>\n${code}`;
            const srcPath = path.join(userDir, 'solution.c');
            const exePath = pty ? path.join(userDir, 'solution') : path.join(userDir, 'solution.exe');
            fs.writeFileSync(srcPath, processedCode);
            const gcc = findExecutable('gcc');
            const compileProc = spawn(gcc, [srcPath, '-o', exePath], { shell: isWin });

            compileProc.stderr.on('data', (data) => socket.emit('stderr', data.toString()));
            compileProc.on('error', (err) => socket.emit('output', `\nCompilation Error: ${err.message}`));
            compileProc.on('close', (cCode) => {
              if (cCode === 0) startPtyProcess(exePath, []);
              else socket.emit('exit', { code: cCode, time: '0s', message: '\n\n=== Compilation Failed ===' });
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
              socket.emit('exit', { code: 1, time: '0s', message: '\n\n=== Compilation Failed ===' });
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

            socket.emit('output', `Compiling ${className}.java...\n`);

            const compileProc = spawn(javac, [relativeSrcPath], { cwd: userDir, shell: isWin });

            compileProc.stderr.on('data', (data) => socket.emit('stderr', data.toString()));
            compileProc.on('close', (cCode) => {
              if (cCode === 0) {
                const java = findExecutable('java');
                const fullClassName = packageName ? `${packageName}.${className}` : className;
                socket.emit('output', `Running ${fullClassName}...\n`);
                startPtyProcess(java, [
                  '-Xms16m', '-Xmx96m',
                  '-XX:TieredStopAtLevel=1',
                  '-XX:+UseSerialGC',
                  '-Djava.security.egd=file:/dev/urandom',
                  '-cp', '.',
                  fullClassName
                ], { cwd: userDir });
              } else {
                socket.emit('exit', {
                  code: cCode,
                  time: '0s',
                  message: `\n\n=== Compilation Failed ===\n\nTip: Ensure class name matches file name (Main.java \u2192 public class Main)`
                });
              }
            });
            break;
          }
        }
      } catch (err) {
        socket.emit('output', `\nSystem Error: ${err.message}`);
        cleanup();
      }
    };

    if (activeCount >= MAX_CONCURRENT) {
      const position = executionQueue.length + 1;
      socket.emit('queued', { position });
      executionQueue.push({ execute, socket });
    } else {
      execute();
    }
  });

  socket.on('stdin', (data) => {
    const proc = activeProcesses.get(socket.id);
    if (!proc) return;
    try {
      if (proc.write) {
        proc.write(data);
      } else if (proc.stdin) {
        proc.stdin.write(data);
      }
    } catch (e) {}
  });

  socket.on('stop', () => {
    const proc = activeProcesses.get(socket.id);
    if (proc) proc.kill();
    activeProcesses.delete(socket.id);
  });

  socket.on('disconnect', () => {
    const proc = activeProcesses.get(socket.id);
    if (proc) proc.kill();
    activeProcesses.delete(socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\u2705 GWS Backend starting...`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Mode: ${RAPID_API_KEY ? 'RapidAPI' : 'Local execution'}`);
  console.log(`   Max concurrent: ${MAX_CONCURRENT}`);
  console.log(`   PTY: ${pty ? 'available' : 'not available (using spawn)'}`);
});

export default app;
