const preStart = require('./preStart');

(async () => {
  await preStart();
  const challenge = require('./challenge');
  await challenge();
})();
