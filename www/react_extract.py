"""Minimal in-page JS — captchaTxnID + OTP fetch (no extension bundle)."""

from __future__ import annotations

EXTRACT_CAPTCHA_TXN_JS = """() => {
  function fiberKey(el) {
    return Object.keys(el || {}).find((k) => k.startsWith('__reactFiber'));
  }
  function txnFromFiber(f) {
    for (let j = 0; j < 40 && f; j++, f = f.return) {
      const st = f.pendingProps?.state || f.memoizedState;
      const id = st?.captchaTxnID || st?.captchaTxnId || st?.captchaTxn;
      if (id && String(id).trim()) return String(id).trim();
      if (st && typeof st === 'object' && st.memoizedState) {
        const inner = st.memoizedState;
        const id2 = inner?.captchaTxnID || inner?.captchaTxnId || inner?.captchaTxn;
        if (id2 && String(id2).trim()) return String(id2).trim();
      }
    }
    return null;
  }
  const otpBtn = [...document.querySelectorAll('button')].find((b) => {
    const t = (b.textContent || b.getAttribute('aria-label') || '').trim();
    return /send\\s*otp|get\\s*otp|generate\\s*otp|download|proceed|submit/i.test(t);
  });
  if (otpBtn) {
    const fk = fiberKey(otpBtn);
    if (fk) {
      const id = txnFromFiber(otpBtn[fk]);
      if (id) return id;
    }
  }
  const roots = document.querySelectorAll('#root button, main button, app-root button');
  for (const el of roots) {
    const fk = fiberKey(el);
    if (!fk) continue;
    const id = txnFromFiber(el[fk]);
    if (id) return id;
  }
  const img = document.querySelector('img[alt*="CAPTCHA" i]');
  if (img) {
    const fk = fiberKey(img);
    if (fk) {
      const id = txnFromFiber(img[fk]);
      if (id) return id;
    }
    let p = img.parentElement;
    for (let i = 0; i < 10 && p; i++, p = p.parentElement) {
      const fk2 = fiberKey(p);
      if (!fk2) continue;
      const id = txnFromFiber(p[fk2]);
      if (id) return id;
    }
  }
  return null;
}"""

GET_OPTION_JS = """() => {
  const uid = document.querySelector('input[name="pvc"][value="uid"]:checked, #uid:checked');
  return uid ? 'UID' : 'EID';
}"""

EXTRACT_CAPTCHA_BUNDLE_JS = """() => {
  function fiberKey(el) {
    return Object.keys(el || {}).find((k) => k.startsWith('__reactFiber'));
  }
  function fromState(st) {
    if (!st) return null;
    const txn = st.captchaTxnID || st.captchaTxnId || st.captchaTxn;
    const img = st.captchaImage || st.captchaImg || st.imageBase64 || st.captcha;
    if (!txn && !img) return null;
    return {
      txn: txn ? String(txn).trim() : '',
      image: img ? String(img).trim() : '',
    };
  }
  function scanFiber(f) {
    for (let j = 0; j < 28 && f; j++, f = f.return) {
      const hit = fromState(f.pendingProps?.state) || fromState(f.memoizedState);
      if (hit) return hit;
    }
    return null;
  }
  const otpBtn = [...document.querySelectorAll('button')].find((b) => {
    const t = (b.textContent || b.getAttribute('aria-label') || '').trim();
    return /send\\s*otp|get\\s*otp|generate\\s*otp|download|proceed|submit/i.test(t);
  });
  if (otpBtn) {
    const fk = fiberKey(otpBtn);
    if (fk) {
      const hit = scanFiber(otpBtn[fk]);
      if (hit) return hit;
    }
  }
  for (const el of document.querySelectorAll('#root button, main button, app-root *')) {
    const fk = fiberKey(el);
    if (!fk) continue;
    const hit = scanFiber(el[fk]);
    if (hit) return hit;
  }
  const img = document.querySelector('img[alt*="CAPTCHA" i]');
  if (img) {
    const src = img.src || '';
    if (src.startsWith('data:image')) {
      const m = src.match(/^data:image\\/[^;]+;base64,(.+)$/);
      if (m) return { txn: '', image: m[1] };
    }
    if (img.naturalWidth > 10) {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return { txn: '', image: c.toDataURL('image/png').split(',')[1] };
      } catch (e) {}
    }
  }
  return null;
}"""

CLEAR_RETRIEVE_FORM_JS = """() => {
  for (const name of ['name', 'mobile']) {
    const el = document.querySelector('input[name="' + name + '"]');
    if (!el) continue;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (proto?.set) proto.set.call(el, '');
    else el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}"""

SET_OPTION_JS = """(opt) => {
  const want = String(opt || 'UID').toUpperCase();
  const val = want === 'EID' ? 'eid' : 'uid';
  const sel = document.querySelector(
    'input[name="pvc"][value="' + val + '"], #' + val + ', input[value="' + val + '"]'
  );
  if (!sel) return null;
  sel.click();
  sel.checked = true;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return want;
}"""

SELECT_DOWNLOAD_EID_JS = """() => {
  const radios = [...document.querySelectorAll('input[type="radio"]')];
  for (const r of radios) {
    const v = (r.value || '').toLowerCase();
    const label = (r.labels?.[0]?.textContent || r.parentElement?.textContent || '').toLowerCase();
    if (v === 'eid' || /enrol/.test(label)) {
      r.click();
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  const eid = document.querySelector(
    '#eid, input[name="pvc"][value="eid"], input[value="eid"], input[value="EID"]'
  );
  if (eid) {
    eid.click();
    eid.checked = true;
    eid.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}"""

FILL_DOWNLOAD_EID_JS = """(eid) => {
  const val = String(eid || '').replace(/\\D/g, '');
  if (!val) return false;
  const sels = [
    'input[name="eid"]',
    'input[name="eidNumber"]',
    'input[name="enrolmentId"]',
    'input[name="enrolmentNumber"]',
    'input[placeholder*="enrol" i]',
    'input[placeholder*="eid" i]',
    'input[maxlength="28"]',
  ];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (!el || el.type === 'radio' || el.type === 'checkbox') continue;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (proto?.set) proto.set.call(el, val);
    else el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }
  return false;
}"""

CLICK_REFRESH_CAPTCHA_JS = """() => {
  const img = document.querySelector('img[alt*="CAPTCHA" i]');
  if (!img) return { ok: false, err: 'no captcha img' };
  let el = img.parentElement;
  for (let depth = 0; depth < 8 && el; depth++, el = el.parentElement) {
    const buttons = [...el.querySelectorAll('button')];
    for (const b of buttons) {
      const label = (b.getAttribute('aria-label') || b.title || b.textContent || '').toLowerCase();
      if (/refresh|reload|new captcha|renew/.test(label) || b.querySelector('svg')) {
        b.click();
        return { ok: true, how: 'button', label: label.slice(0, 40) };
      }
    }
  }
  const near = img.parentElement?.querySelector('button');
  if (near) {
    near.click();
    return { ok: true, how: 'parent-button' };
  }
  img.click();
  return { ok: true, how: 'img-click' };
}"""

SEND_OTP_FETCH_JS = """async (payload) => {
  const url = 'https://tathya.uidai.gov.in/retrieveEidUid/ext/v1/generic/retrieveuideid';
  const rid = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : ('rebel-' + Date.now());
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        appid: 'MYAADHAAR',
        'accept-language': 'en_IN',
        'x-request-id': rid,
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    return { ok: true, via: 'fetch', status: res.status, text, requestId: rid };
  } catch (e) {
    return { ok: false, via: 'fetch', err: String(e).slice(0, 160), requestId: rid };
  }
}"""

SEND_OTP_XHR_JS = """async (payload) => {
  const url = 'https://tathya.uidai.gov.in/retrieveEidUid/ext/v1/generic/retrieveuideid';
  const rid = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : ('rebel-' + Date.now());
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open('POST', url, true);
    x.withCredentials = true;
    x.setRequestHeader('Accept', 'application/json, text/plain, */*');
    x.setRequestHeader('Content-Type', 'application/json');
    x.setRequestHeader('appid', 'MYAADHAAR');
    x.setRequestHeader('accept-language', 'en_IN');
    x.setRequestHeader('x-request-id', rid);
    x.onload = () => resolve({
      ok: true, via: 'xhr', status: x.status,
      text: x.responseText || '', requestId: rid,
    });
    x.onerror = () => resolve({
      ok: false, via: 'xhr', err: 'xhr.onerror', requestId: rid,
    });
    x.ontimeout = () => resolve({
      ok: false, via: 'xhr', err: 'xhr.timeout', requestId: rid,
    });
    try {
      x.timeout = 35000;
      x.send(JSON.stringify(payload));
    } catch (e) {
      resolve({ ok: false, via: 'xhr', err: String(e).slice(0, 120), requestId: rid });
    }
  });
}"""
