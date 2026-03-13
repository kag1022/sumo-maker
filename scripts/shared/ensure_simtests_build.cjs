const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT_DIR, '.tmp', 'sim-tests');
const META_PATH = path.join(OUT_DIR, 'build-meta.json');
const PACKAGE_JSON_PATH = path.join(OUT_DIR, 'package.json');
const TSCONFIG_PATH = path.join(ROOT_DIR, 'tsconfig.simtests.json');
const ENTRY_PATH = path.join(OUT_DIR, 'scripts', 'tests', 'index.js');
const WATCH_PATHS = [
  path.join(ROOT_DIR, 'scripts', 'tests'),
  path.join(ROOT_DIR, 'src', 'logic'),
  path.join(ROOT_DIR, 'src', 'features', 'logicLab'),
];
const WATCH_EXTENSIONS = new Set(['.ts', '.tsx', '.json']);

const walkFiles = (targetPath, files) => {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    files.push({
      path: targetPath,
      mtimeMs: stat.mtimeMs,
    });
    return;
  }

  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const nextPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(nextPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!WATCH_EXTENSIONS.has(path.extname(entry.name))) continue;
    const nextStat = fs.statSync(nextPath);
    files.push({
      path: nextPath,
      mtimeMs: nextStat.mtimeMs,
    });
  }
};

const collectInputs = () => {
  const files = [];
  walkFiles(TSCONFIG_PATH, files);
  for (const watchPath of WATCH_PATHS) {
    walkFiles(watchPath, files);
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const latestSourceMtimeMs = files.reduce(
    (max, file) => Math.max(max, file.mtimeMs),
    0,
  );
  return {
    files,
    latestSourceMtimeMs,
  };
};

const readMeta = () => {
  if (!fs.existsSync(META_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  } catch {
    return null;
  }
};

const ensureOutDir = () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify({ type: 'commonjs' }));
};

const compileSimTests = () => {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.simtests.json'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });
};

const ensureSimTestsBuild = () => {
  const inputs = collectInputs();
  const meta = readMeta();
  const canReuse =
    Boolean(meta) &&
    fs.existsSync(ENTRY_PATH) &&
    meta.latestSourceMtimeMs >= inputs.latestSourceMtimeMs;

  if (!canReuse) {
    compileSimTests();
    ensureOutDir();
    const compiledAt = new Date().toISOString();
    const nextMeta = {
      compiledAt,
      latestSourceMtimeMs: inputs.latestSourceMtimeMs,
      fileCount: inputs.files.length,
    };
    fs.writeFileSync(META_PATH, JSON.stringify(nextMeta, null, 2));
    return {
      ...nextMeta,
      reused: false,
      outDir: OUT_DIR,
      entryPath: ENTRY_PATH,
    };
  }

  ensureOutDir();
  return {
    compiledAt: meta.compiledAt,
    latestSourceMtimeMs: meta.latestSourceMtimeMs,
    fileCount: meta.fileCount,
    reused: true,
    outDir: OUT_DIR,
    entryPath: ENTRY_PATH,
  };
};

module.exports = {
  ensureSimTestsBuild,
};
