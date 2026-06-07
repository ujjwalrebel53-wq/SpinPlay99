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

  const result = await page.evaluate((code) => {
    eval(code);

    const before = {
      dobVisible: AstikHelperCore.isDobStillVisible(),
      nameRequired: document.querySelector('[formcontrolname="fullName"]')?.required,
    };

    AstikHelperCore.applyMode(true, { nameOptional: true, fallbackName: 'Mr' });

    const nameInput = document.querySelector('[formcontrolname="fullName"]');
    nameInput.value = '';
    AstikHelperCore.fillNameIfEmpty(nameInput, 'Mr');

    const after = {
      dobVisible: AstikHelperCore.isDobStillVisible(),
      nameRequired: nameInput?.required,
      nameValue: nameInput?.value,
      nameInputs: AstikHelperCore.getNameInputs().length,
    };

    return { before, after, pass: !after.dobVisible && after.nameValue === 'Mr' };
  }, coreCode);

  console.log(JSON.stringify(result, null, 2));
  console.log(result.pass ? 'PASS' : 'FAIL');

  await browser.close();
  process.exit(result.pass ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
