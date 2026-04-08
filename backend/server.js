import express from 'express';
import cors from 'cors';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

function executeLocal(code, language) {
  return new Promise((resolve) => {
    const rootTmpDir = os.tmpdir();
    // Create a unique subdirectory for this execution to avoid collisions
    const userDir = fs.mkdtempSync(path.join(rootTmpDir, `gws-exec-${Date.now()}-`));
    const startTime = Date.now();
    let output = '';
    let error = '';
    let proc = null;

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
          proc = spawn('node', [`"${filePath}"`], { shell: true });
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
          const srcPath = path.join(userDir, `solution.cpp`);
          const exePath = path.join(userDir, `solution.exe`);
          fs.writeFileSync(srcPath, code);
          
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
          const srcPath = path.join(userDir, `solution.c`);
          const exePath = path.join(userDir, `solution.exe`);
          fs.writeFileSync(srcPath, code);
          
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
              error: 'No class, interface, enum, or record definition found in Java code.', 
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
          proc = spawn(javac, [relativeSrcPath], { cwd: userDir });
          
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
            // Use -cp . to specify the root of the class files
            const runProc = spawn(java, ['-cp', '.', fullClassName], { cwd: userDir });
            
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

async function executeCode(code, language) {
  if (RAPID_API_KEY) {
    try {
      const languageId = LANGUAGE_IDS[language];
      if (!languageId) {
        return await executeLocal(code, language);
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
          stdin: '',
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
      return await executeLocal(code, language);
    }
  }

  return await executeLocal(code, language);
}

app.post('/api/execute', async (req, res) => {
  try {
    const { code, language } = req.body;
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GWS Compiler Backend running on port ${PORT}`);
  console.log(`Execution mode: ${RAPID_API_KEY ? 'RapidAPI' : 'Local'}`);
});

export default app;
