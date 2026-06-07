const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  const mockUrl = 'file://' + path.join(__dirname, 'mock-uidai-real.html');
  const engineCode = fs.readFileSync(path.join(__dirname, '..', 'uidai-engine.js'), 'utf8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(mockUrl);
  await page.waitForTimeout(400);

  const result = await page.evaluate(async (code) => {
    eval(code);
    const UI_SEL = '#x';
    const logs = [];
    const log = (level, msg, data) => logs.push({ level, msg, data });

    await UidaiRetrieveEngine.waitForForm(5000);
    const link = UidaiRetrieveEngine.findOrEmailLink(UI_SEL);
    const r = await UidaiRetrieveEngine.apply(UI_SEL, log);
    await new Promise((r) => setTimeout(r, 1600));

    document.querySelector('#name-field input').value = 'Javed';
    document.querySelector('#mobile-field input').value = '7651892956';
    document.querySelector('#captcha-field input').value = 'abc123';

    await new Promise((r) => setTimeout(r, 200));
    const prep = UidaiRetrieveEngine.prepareSubmit(UI_SEL, log);
    await new Promise((r) => setTimeout(r, 600));
    document.getElementById('send-otp').click();

    return {
      linkText: link ? link.textContent.trim() : null,
      switched: r.switched,
      dobVisible: UidaiRetrieveEngine.dobFieldVisible(UI_SEL),
      emailVisible: UidaiRetrieveEngine.getMatFields().some(
        (f) => UidaiRetrieveEngine.classifyField(f) === 'email' && UidaiRetrieveEngine.isVisible(f.mff)
      ),
      prep,
      otpSent: !!window.__otpSent,
      otpBlocked: window.__otpBlocked || null,
      logs,
    };
  }, engineCode);

  console.log(JSON.stringify(result, null, 2));
  const pass = result.switched && !result.dobVisible && result.otpSent && result.prep.emptyDob === 0;
  console.log(pass ? 'PASS' : 'FAIL');

  await browser.close();
  process.exit(pass ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
