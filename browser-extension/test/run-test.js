const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  const mockUrl = 'file://' + path.join(__dirname, 'mock-uidai.html');
  const corePath = path.join(__dirname, '..', 'core-logic.js');
  const coreCode = fs.readFileSync(corePath, 'utf8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(mockUrl);
  await page.waitForTimeout(300);

  const result = await page.evaluate(async (code) => {
    eval(code);
    AstikHelperCore.applyMode(true);
    await new Promise((r) => setTimeout(r, 900));

    return {
      dobVisible: AstikHelperCore.isDobStillVisible(),
      emailVisible: AstikHelperCore.isEmailVisible(),
      logPanel: !!document.getElementById('rebel-adhar-log-panel'),
      bodyHasEmailMode: document.body.classList.contains('email-mode'),
    };
  }, coreCode);

  console.log(JSON.stringify(result, null, 2));
  const pass = !result.dobVisible && result.logPanel;
  console.log(pass ? 'PASS' : 'FAIL');

  await browser.close();
  process.exit(pass ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
