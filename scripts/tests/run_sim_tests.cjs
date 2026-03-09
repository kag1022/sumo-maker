const fs = require('fs');
const os = require('os');
const { execFileSync, spawn } = require('child_process');
const rawArgs = process.argv.slice(2);

const readArgValue = (args, index) => {
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
};

const extractRunnerArgs = (args) => {
  let jobsArg;
  let listScopesOnly = false;
  const passthroughArgs = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--jobs') {
      const value = readArgValue(args, i);
      if (!value) {
        throw new Error('Missing value for --jobs');
      }
      jobsArg = Number(value);
      i += 1;
      continue;
    }
    if (arg === '--list-scopes') {
      listScopesOnly = true;
      passthroughArgs.push(arg);
      continue;
    }
    passthroughArgs.push(arg);
  }
  return { jobsArg, listScopesOnly, passthroughArgs };
};

const { jobsArg, listScopesOnly, passthroughArgs } = extractRunnerArgs(rawArgs);

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.simtests.json'], {
  stdio: 'inherit',
});

fs.mkdirSync('.tmp/sim-tests', { recursive: true });
fs.writeFileSync('.tmp/sim-tests/package.json', JSON.stringify({ type: 'commonjs' }));
const testEntry = '.tmp/sim-tests/scripts/tests/sim_tests.js';

const cpuCount = typeof os.availableParallelism === 'function' ? os.availableParallelism() : (os.cpus()?.length ?? 1);
const autoJobs = Math.max(1, Math.min(6, cpuCount - 1));
const envJobs = Number(process.env.TEST_JOBS);
const requestedJobs = Number.isFinite(jobsArg) ? jobsArg : (Number.isFinite(envJobs) ? envJobs : autoJobs);
const jobs = Math.max(1, Math.floor(requestedJobs));

const runSingle = () => {
  execFileSync(process.execPath, [testEntry, ...passthroughArgs], { stdio: 'inherit' });
};

if (jobs === 1) {
  runSingle();
  process.exit(0);
}

if (listScopesOnly) {
  runSingle();
  process.exit(0);
}

let scopes = [];
try {
  const scopeOutput = execFileSync(process.execPath, [testEntry, ...passthroughArgs, '--list-scopes'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  scopes = scopeOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
} catch {
  scopes = [];
}

if (scopes.length <= 1) {
  runSingle();
  process.exit(0);
}

const runScope = (scope) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [testEntry, ...passthroughArgs, '--scope', scope], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Scope "${scope}" failed with exit code ${String(code)}`));
      }
    });
  });

const runInPool = async () => {
  let next = 0;
  const workers = Array.from({ length: Math.min(jobs, scopes.length) }, async () => {
    while (next < scopes.length) {
      const scope = scopes[next];
      next += 1;
      await runScope(scope);
    }
  });
  await Promise.all(workers);
};

runInPool().catch((error) => {
  console.error(error);
  process.exit(1);
});
