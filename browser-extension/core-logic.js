/**
 * Rebel Adhar / Astik Helper — shared core logic
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.AstikHelperCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const HIDDEN_CLASS = 'astik-helper-hidden';
  const ACTIVE_CLASS = 'astik-helper-active';
  const FAB_ID = 'astik-helper-fab';
  const LOG_PANEL_ID = 'rebel-adhar-log-panel';
  const LOG_BODY_ID = 'rebel-adhar-log-body';

  const DOB_PATTERNS = [
    'date of birth',
    'enter date of birth',
    'dateofbirth',
    'dob',
    'birth date',
    'birthdate',
    'जन्म तिथि',
  ];

  const NAME_PATTERNS = [
    'name as per aadhaar',
    'enter name as per',
    'enter name',
    'full name',
    'aadhaar name',
    'resident name',
  ];

  const DOB_API_KEYS = [
    'dob',
    'dateOfBirth',
    'date_of_birth',
    'birthDate',
    'birthDt',
    'dobStr',
    'userDob',
    'applicantDob',
  ];

  const DEFAULT_FALLBACK_NAME = 'Mr';
  const MAX_LOG_LINES = 120;

  const logLines = [];
  let hooksInstalled = false;
  let originalFetch = null;
  let originalXhrOpen = null;
  let originalXhrSend = null;

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function textMatches(text, patterns) {
    const value = normalize(text);
    return patterns.some((pattern) => value.includes(pattern));
  }

  function isUiElement(el) {
    if (!el) return true;
    return !!(el.closest(`#${FAB_ID}, #${LOG_PANEL_ID}, #astik-helper-name-btn, #astik-helper-logs-btn`));
  }

  function log(level, message, data) {
    const time = new Date().toLocaleTimeString();
    let extra = '';
    if (data !== undefined) {
      try {
        extra = typeof data === 'string' ? data : JSON.stringify(data);
      } catch (_error) {
        extra = String(data);
      }
    }
    const line = { time, level, message, extra };
    logLines.push(line);
    if (logLines.length > MAX_LOG_LINES) logLines.shift();
    updateLogPanel();
    console.log(`[Rebel Adhar ${level}]`, message, data !== undefined ? data : '');
  }

  function ensureLogPanel() {
    if (document.getElementById(LOG_PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = LOG_PANEL_ID;
    panel.innerHTML =
      '<div id="rebel-adhar-log-header">' +
      '<strong>Rebel Adhar Logs</strong>' +
      '<span id="rebel-adhar-log-actions">' +
      '<button type="button" id="rebel-adhar-log-clear">Clear</button>' +
      '<button type="button" id="rebel-adhar-log-min">Hide</button>' +
      '</span></div>' +
      '<pre id="' +
      LOG_BODY_ID +
      '"></pre>';

    document.documentElement.appendChild(panel);

    document.getElementById('rebel-adhar-log-clear').addEventListener('click', () => {
      logLines.length = 0;
      updateLogPanel();
    });

    document.getElementById('rebel-adhar-log-min').addEventListener('click', () => {
      const body = document.getElementById(LOG_BODY_ID);
      const btn = document.getElementById('rebel-adhar-log-min');
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      btn.textContent = hidden ? 'Hide' : 'Show';
    });
  }

  function updateLogPanel() {
    ensureLogPanel();
    const body = document.getElementById(LOG_BODY_ID);
    if (!body) return;

    body.textContent = logLines
      .map((line) => {
        const suffix = line.extra ? ` | ${line.extra}` : '';
        return `[${line.time}] ${line.level.toUpperCase()} ${line.message}${suffix}`;
      })
      .join('\n');

    body.scrollTop = body.scrollHeight;
  }

  function getLabelText(el) {
    if (!el) return '';
    const id = el.id;
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) return label.textContent;
    }
    const matLabel = el.closest('mat-form-field, .mat-mdc-form-field')?.querySelector('mat-label, label');
    return matLabel?.textContent || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '';
  }

  function findFieldContainer(el) {
    return (
      el?.closest(
        'mat-form-field, .mat-mdc-form-field, .form-group, .form-floating, .mb-3, .mb-4, div'
      ) || el?.parentElement
    );
  }

  function hardHide(el) {
    if (!el || isUiElement(el)) return;
    el.classList.add(HIDDEN_CLASS);
    el.setAttribute('data-astik-hidden', '1');
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('padding', '0', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  }

  function showElement(el) {
    if (!el) return;
    el.classList.remove(HIDDEN_CLASS);
    el.removeAttribute('data-astik-hidden');
    ['display', 'visibility', 'height', 'margin', 'padding', 'overflow', 'pointer-events'].forEach((prop) => {
      el.style.removeProperty(prop);
    });
  }

  function getAllInputs() {
    return Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, select'
      )
    );
  }

  function classifyField(input) {
    const combined = normalize(
      [
        input.name,
        input.id,
        input.type,
        input.placeholder,
        input.getAttribute('formcontrolname'),
        getLabelText(input),
      ].join(' ')
    );

    if (
      textMatches(combined, DOB_PATTERNS) ||
      input.type === 'date' ||
      /dob|birth/i.test(input.getAttribute('formcontrolname') || '')
    ) {
      return 'dob';
    }
    if (textMatches(combined, NAME_PATTERNS) || /fullname|residentname/i.test(input.getAttribute('formcontrolname') || '')) {
      return 'name';
    }
    if (textMatches(combined, ['mobile', 'phone', 'mobileno', 'mobile number'])) return 'mobile';
    if (textMatches(combined, ['email', 'e-mail', 'mail id'])) return 'email';
    if (textMatches(combined, ['captcha', 'security code'])) return 'captcha';
    return 'other';
  }

  function getNameInputs() {
    return getAllInputs().filter((input) => classifyField(input) === 'name');
  }

  function dispatchInputEvents(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function patchRequestBody(body, enabled) {
    if (!enabled || body == null) return { body, changed: false, removed: [] };

    if (typeof body === 'string') {
      const trimmed = body.trim();
      if (!trimmed) return { body, changed: false, removed: [] };

      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const json = JSON.parse(trimmed);
          const removed = stripDobFromObject(json);
          if (!removed.length) return { body, changed: false, removed: [] };
          return { body: JSON.stringify(json), changed: true, removed };
        } catch (_error) {
          return { body, changed: false, removed: [] };
        }
      }

      if (trimmed.includes('=')) {
        const params = new URLSearchParams(trimmed);
        const removed = [];
        DOB_API_KEYS.forEach((key) => {
          if (params.has(key)) {
            removed.push(key);
            params.delete(key);
          }
        });
        if (!removed.length) return { body, changed: false, removed: [] };
        return { body: params.toString(), changed: true, removed };
      }
    }

    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const removed = [];
      DOB_API_KEYS.forEach((key) => {
        if (body.has(key)) {
          removed.push(key);
          body.delete(key);
        }
      });
      return { body, changed: removed.length > 0, removed };
    }

    return { body, changed: false, removed: [] };
  }

  function stripDobFromObject(obj) {
    const removed = [];
    if (!obj || typeof obj !== 'object') return removed;

    DOB_API_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && obj[key] !== '') {
        removed.push(key);
        delete obj[key];
      }
    });

    Object.keys(obj).forEach((key) => {
      if (/dob|birth/i.test(key) && obj[key] != null && obj[key] !== '') {
        removed.push(key);
        delete obj[key];
      }
    });

    return removed;
  }

  function installNetworkHooks(enabledProvider) {
    if (hooksInstalled) return;
    hooksInstalled = true;

    originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      const method = init?.method || 'GET';
      let requestInit = init ? { ...init } : {};

      if (enabledProvider() && requestInit.body) {
        const patched = patchRequestBody(requestInit.body, true);
        if (patched.changed) {
          requestInit.body = patched.body;
          log('patch', 'Removed DOB from fetch body', patched.removed);
        }
        log('req', `${method} ${url}`, String(requestInit.body).slice(0, 500));
      } else if (/uidai|otp|retrieve|aadhaar/i.test(url)) {
        log('req', `${method} ${url}`);
      }

      try {
        const response = await originalFetch(input, requestInit);
        if (/uidai|otp|retrieve|aadhaar/i.test(url)) {
          const text = await response.clone().text().catch(() => '');
          log(response.ok ? 'ok' : 'error', `Response ${response.status} ${url}`, text.slice(0, 400));
        }
        return response;
      } catch (error) {
        log('error', `Fetch failed ${url}`, error.message || String(error));
        throw error;
      }
    };

    originalXhrOpen = XMLHttpRequest.prototype.open;
    originalXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__rebelMethod = method;
      this.__rebelUrl = String(url || '');
      return originalXhrOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const url = this.__rebelUrl || '';
      let finalBody = body;

      if (enabledProvider() && body != null) {
        const patched = patchRequestBody(body, true);
        if (patched.changed) {
          finalBody = patched.body;
          log('patch', 'Removed DOB from XHR body', patched.removed);
        }
        log('req', `${this.__rebelMethod || 'POST'} ${url}`, String(finalBody).slice(0, 500));
      } else if (/uidai|otp|retrieve|aadhaar/i.test(url)) {
        log('req', `${this.__rebelMethod || 'POST'} ${url}`);
      }

      this.addEventListener('load', () => {
        if (!/uidai|otp|retrieve|aadhaar/i.test(url)) return;
        log(this.status >= 200 && this.status < 300 ? 'ok' : 'error', `XHR ${this.status} ${url}`, (this.responseText || '').slice(0, 400));
      });

      this.addEventListener('error', () => {
        log('error', `XHR failed ${url}`);
      });

      return originalXhrSend.call(this, finalBody);
    };

    log('info', 'Network hooks installed');
  }

  function hideDobVisualOnly() {
    getAllInputs().forEach((input) => {
      if (classifyField(input) !== 'dob') return;

      hardHide(findFieldContainer(input));
      input.removeAttribute('required');
      input.setAttribute('aria-required', 'false');
      input.setCustomValidity('');
      input.disabled = false;
      log('info', 'DOB hidden (visual only)', { value: input.value || '(empty)' });
    });

    document.querySelectorAll('mat-form-field, .mat-mdc-form-field, label, mat-label').forEach((node) => {
      const text = normalize(node.textContent || '');
      if (!textMatches(text, DOB_PATTERNS) || text.length > 100) return;
      if (textMatches(text, ['mobile', 'captcha', 'name as per'])) return;
      hardHide(findFieldContainer(node) || node);
    });
  }

  function relaxNameField(nameOptional, fallbackName) {
    getNameInputs().forEach((input) => {
      if (!nameOptional) return;

      input.removeAttribute('required');
      input.setAttribute('aria-required', 'false');
      input.removeAttribute('minlength');
      input.setCustomValidity('');
      input.setAttribute('placeholder', 'Mr ya apna naam likho');
      showElement(findFieldContainer(input));
      showElement(input);

      findFieldContainer(input)?.querySelectorAll('mat-error, .mat-mdc-form-field-error').forEach(hardHide);
    });

    document.querySelectorAll('button, input[type="submit"], [role="button"]').forEach((btn) => {
      if (btn.dataset.rebelOtpHooked) return;
      const text = normalize(btn.textContent || btn.value || '');
      if (!text.includes('send otp') && !text.includes('request otp')) return;

      btn.dataset.rebelOtpHooked = '1';
      btn.addEventListener(
        'click',
        () => {
          log('info', 'Send OTP clicked');

          if (nameOptional) {
            getNameInputs().forEach((input) => {
              if (!(input.value || '').trim()) {
                input.value = fallbackName;
                dispatchInputEvents(input);
                log('warn', 'Empty name filled with fallback', fallbackName);
              } else {
                log('info', 'Name kept as entered', input.value);
              }
            });
          }

          getAllInputs().forEach((input) => {
            if (classifyField(input) === 'dob') {
              input.removeAttribute('required');
              input.setCustomValidity('');
            }
          });

          logFormSnapshot('Before submit');
        },
        true
      );
    });
  }

  function logFormSnapshot(label) {
    const snapshot = getAllInputs().map((input) => ({
      type: classifyField(input),
      value: (input.value || '').slice(0, 80),
      required: input.required,
      disabled: input.disabled,
      hidden: input.closest('[data-astik-hidden]') != null,
    }));
    log('info', label, snapshot);
  }

  function restoreForm() {
    document.querySelectorAll('[data-astik-hidden]').forEach(showElement);
    getAllInputs().forEach((input) => {
      input.disabled = false;
    });
    log('info', 'Extension OFF — form restored');
  }

  function isDobStillVisible() {
    return getAllInputs().some((input) => {
      if (classifyField(input) !== 'dob') return false;
      const container = findFieldContainer(input);
      if (!container) return false;
      const style = window.getComputedStyle(container);
      return style.display !== 'none' && !container.classList.contains(HIDDEN_CLASS);
    });
  }

  let enabledState = false;

  function applyMode(enabled, options) {
    const opts = options || {};
    const nameOptional = opts.nameOptional !== false;
    const fallbackName = (opts.fallbackName || DEFAULT_FALLBACK_NAME).trim() || DEFAULT_FALLBACK_NAME;

    enabledState = Boolean(enabled);
    ensureLogPanel();

    if (enabledState) {
      document.documentElement.classList.add(ACTIVE_CLASS);
      installNetworkHooks(() => enabledState);
      hideDobVisualOnly();
      relaxNameField(nameOptional, fallbackName);
      log('info', 'Extension ON', { nameOptional, fallbackName });
      logFormSnapshot('After ON');
    } else {
      document.documentElement.classList.remove(ACTIVE_CLASS);
      restoreForm();
    }

    return {
      enabled: enabledState,
      nameOptional,
      fallbackName,
      dobVisible: isDobStillVisible(),
      nameInputs: getNameInputs().length,
    };
  }

  return {
    HIDDEN_CLASS,
    ACTIVE_CLASS,
    FAB_ID,
    LOG_PANEL_ID,
    DEFAULT_FALLBACK_NAME,
    applyMode,
    isDobStillVisible,
    getNameInputs,
    log,
    logFormSnapshot,
  };
});
