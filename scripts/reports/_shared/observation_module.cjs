const path = require('path');

const loadObservationModule = () =>
  require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'simulation',
    'observation',
    'index.js',
  ));

module.exports = {
  loadObservationModule,
};

