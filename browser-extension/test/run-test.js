const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  const mockUrl = 'file://' + path.join(__dirname, 'mock-uidai-real.html');
  const engineCode = fs.readFileSync(path.join(__dirname, '..', 'uidai-engine.js'), 'utf8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(mockUrl);
  await page.waitForTimeout(300);

  const result = await page.evaluate(async (code) => {
    eval(code);
    const UI_SEL = '#x';
    const logs = [];
    const log = (level, msg, data) => logs.push({ level, msg, data });

    await UidaiRetrieveEngine.waitForForm(5000);
    const apply = await UidaiRetrieveEngine.apply(UI_SEL, log);

    document.querySelector('#name-field input').value = 'Javed';
    document.querySelector('#mobile-field input').value = '7651892956';
    document.querySelector('#captcha-field input').value = 'abc123';

    const prep = await UidaiRetrieveEngine.prepareSubmitAsync(UI_SEL, log);
    document.getElementById('send-otp').click();

    return {
      dobBypassed: UidaiRetrieveEngine.isDobBypassed(),
      dobInForm: document.querySelectorAll('#dob-input').length,
      dobVisible: UidaiRetrieveEngine.dobFieldVisible(UI_SEL),
      prep,
      otpSent: !!window.__otpSent,
      otpBlocked: window.__otpBlocked,
      apply,
      logs,
    };
  }, engineCode);

  console.log(JSON.stringify(result, null, 2));
  const pass =
    result.otpSent &&
    !result.otpBlocked &&
    result.dobBypassed &&
    result.dobInForm === 0 &&
    result.prep?.formOk === true;
  console.log(pass ? 'PASS' : 'FAIL');

  await browser.close();
  process.exit(pass ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
