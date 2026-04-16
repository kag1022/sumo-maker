const fs = require('fs');
const os = require('os');
const { execFileSync, spawn } = require('child_process');
const { ensureSimTestsBuild } = require('../shared/ensure_simtests_build.cjs');
const rawArgs = process.argv.slice(2);

const readArgValue = (args, index) => {
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
};

const extractRunnerArgs = (args) => {
  let workersArg;
  let listScopesOnly = false;
  const passthroughArgs = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--workers' || arg === '--jobs') {
      const value = readArgValue(args, i);
      if (value === undefined) {
        throw new Error(`Missing value for ${arg}`);
      }
      workersArg = Number(value);
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
  return { workersArg, listScopesOnly, passthroughArgs };
};

const { workersArg, listScopesOnly, passthroughArgs } = extractRunnerArgs(rawArgs);

const build = ensureSimTestsBuild();
fs.mkdirSync('.tmp/sim-tests', { recursive: true });
fs.writeFileSync('.tmp/sim-tests/package.json', JSON.stringify({ type: 'commonjs' }));
const testEntry = build.entryPath;

const cpuCount = typeof os.availableParallelism === 'function' ? os.availableParallelism() : (os.cpus()?.length ?? 1);
const autoJobs = Math.max(1, Math.min(6, cpuCount - 1));
const envWorkers = Number(process.env.TEST_WORKERS ?? process.env.TEST_JOBS);
const requestedJobs = Number.isFinite(workersArg) ? workersArg : (Number.isFinite(envWorkers) ? envWorkers : autoJobs);
const jobs = Math.max(1, Math.floor(requestedJobs));

const runSingle = () => {
  execFileSync(process.execPath, [testEntry, '--cli', ...passthroughArgs], { stdio: 'inherit' });
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
  const scopeOutput = execFileSync(process.execPath, [testEntry, '--cli', ...passthroughArgs, '--list-scopes'], {
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
    const child = spawn(process.execPath, [testEntry, '--cli', ...passthroughArgs, '--scope', scope], {
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
