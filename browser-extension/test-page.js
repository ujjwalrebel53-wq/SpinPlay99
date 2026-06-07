const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function inspectPage() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  });

  const url = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid';
  console.log('Loading', url);

  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('Status:', response?.status());
  } catch (error) {
    console.log('Navigation issue:', error.message);
  }

  await page.waitForTimeout(8000);

  const info = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, textarea, select, mat-form-field, label, mat-label'));
    return {
      title: document.title,
      url: location.href,
      bodyText: (document.body?.innerText || '').slice(0, 4000),
      fields: inputs.slice(0, 80).map((el) => ({
        tag: el.tagName,
        type: el.type || '',
        id: el.id || '',
        name: el.name || '',
        placeholder: el.placeholder || '',
        formcontrolname: el.getAttribute('formcontrolname') || '',
        className: (el.className || '').toString().slice(0, 120),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      })),
      htmlSnippet: document.body?.innerHTML?.slice(0, 12000) || '',
    };
  });

  fs.writeFileSync(path.join(__dirname, 'page-inspect.json'), JSON.stringify(info, null, 2));
  console.log('Saved page-inspect.json');
  console.log('Title:', info.title);
  console.log('Body preview:\n', info.bodyText.slice(0, 1500));
  console.log('\nFields found:', info.fields.length);
  info.fields.forEach((f, i) => console.log(i + 1, JSON.stringify(f)));

  await browser.close();
}

inspectPage().catch((error) => {
  console.error(error);
  process.exit(1);
});
