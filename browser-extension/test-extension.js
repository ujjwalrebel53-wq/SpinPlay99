const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testExtension() {
  const extensionPath = path.resolve(__dirname);
  const userDataDir = path.join(__dirname, '.pw-profile');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  });

  const page = await context.newPage();
  const url = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid';

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (error) {
    console.log('goto error', error.message);
  }

  await page.waitForTimeout(10000);

  const before = await page.evaluate(() => ({
    body: document.body?.innerText || '',
    dobVisible: Array.from(document.querySelectorAll('input, label, mat-label, mat-form-field, div')).some((el) =>
      /date of birth|enter date of birth|dob/i.test(el.textContent || el.placeholder || '')
    ),
    fab: !!document.getElementById('rebel-adhar-fab'),
  }));

  console.log('Before toggle FAB click:', before);

  const fab = page.locator('#rebel-adhar-fab');
  if (await fab.count()) {
    await fab.click();
    await page.waitForTimeout(3000);
  }

  const after = await page.evaluate(() => {
    const dobNodes = Array.from(document.querySelectorAll('input, label, mat-label, mat-form-field, div'))
      .filter((el) => /date of birth|enter date of birth|dob/i.test(el.textContent || el.placeholder || ''))
      .map((el) => ({
        tag: el.tagName,
        text: (el.textContent || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        hidden: window.getComputedStyle(el).display === 'none' || el.classList.contains('rebel-dob-hidden'),
        dataHidden: el.getAttribute('data-rebel-dob-hidden'),
      }));

    return {
      active: document.documentElement.classList.contains('rebel-adhar-active'),
      fabText: document.getElementById('rebel-adhar-fab')?.textContent || '',
      dobNodes,
      body: document.body?.innerText || '',
    };
  });

  fs.writeFileSync(path.join(__dirname, 'test-result.json'), JSON.stringify({ before, after }, null, 2));
  console.log('After toggle:', JSON.stringify(after, null, 2));

  await page.screenshot({ path: path.join(__dirname, 'test-screenshot.png'), fullPage: true });
  await context.close();
}

testExtension().catch((error) => {
  console.error(error);
  process.exit(1);
});
