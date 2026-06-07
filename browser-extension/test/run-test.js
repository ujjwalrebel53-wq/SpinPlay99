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
  await page.waitForTimeout(500);

  const before = await page.evaluate(() => ({
    dobVisible: !!document.querySelector('.dob-field') && getComputedStyle(document.querySelector('.dob-field')).display !== 'none',
    body: document.body.innerText,
  }));

  const after = await page.evaluate((code) => {
    eval(code);
    const result = AstikHelperCore.applyMode(true);
    return {
      result,
      dobVisible: AstikHelperCore.isDobStillVisible(),
      dobDisplay: document.querySelector('.dob-field')?.style.display || getComputedStyle(document.querySelector('.dob-field')).display,
      body: document.body.innerText,
    };
  }, coreCode);

  console.log('BEFORE:', before);
  console.log('AFTER:', after);
  console.log(after.dobVisible ? 'FAIL: DOB still visible' : 'PASS: DOB hidden');

  await browser.close();
  process.exit(after.dobVisible ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
