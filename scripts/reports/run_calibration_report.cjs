const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  SUMMARY_MARKDOWN_PATH,
  buildCalibrationSummaryMarkdown,
  loadCalibrationBundle,
} = require('./_shared/calibrationTargets.cjs');

const ROOT_DIR = process.cwd();
const PYTHON_VENV_PATH = path.join(ROOT_DIR, 'sumo-db', 'sumo', 'Scripts', 'python.exe');
const EXPORT_SCRIPT = path.join(ROOT_DIR, 'sumo-db', 'scripts', 'export_calibration_targets.py');

const resolvePythonCommand = () => (fs.existsSync(PYTHON_VENV_PATH) ? PYTHON_VENV_PATH : 'python');

const writeFile = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const main = () => {
  const pythonCommand = resolvePythonCommand();
  execFileSync(pythonCommand, [EXPORT_SCRIPT], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  const bundle = loadCalibrationBundle({ required: true });
  const markdown = buildCalibrationSummaryMarkdown(bundle);
  writeFile(SUMMARY_MARKDOWN_PATH, markdown);
  console.log(markdown);
  console.log(`summary written: ${SUMMARY_MARKDOWN_PATH}`);
};

main();
