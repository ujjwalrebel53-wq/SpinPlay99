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
  let validityBypassInstalled = false;
  let originalFetch = null;
  let originalXhrOpen = null;
  let originalXhrSend = null;
  let originalInputCheckValidity = null;
  let originalFormReportValidity = null;
  let networkCount = 0;
  let lastOtpClickAt = 0;

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

    const fc = input.getAttribute('formcontrolname') || '';

    if (
      textMatches(combined, DOB_PATTERNS) ||
      input.type === 'date' ||
      /dob|birth/i.test(fc)
    ) {
      return 'dob';
    }
    if (textMatches(combined, NAME_PATTERNS) || /name|full|resident/i.test(fc)) {
      return 'name';
    }
    if (textMatches(combined, ['mobile', 'phone', 'mobileno', 'mobile number']) || /mobile|phone|mob|contact/i.test(fc)) {
      return 'mobile';
    }
    if (textMatches(combined, ['email', 'e-mail', 'mail id']) || /email|mail/i.test(fc)) {
      return 'email';
    }
    if (textMatches(combined, ['captcha', 'security code']) || /captcha|security/i.test(fc)) {
      return 'captcha';
    }
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

  function noteNetworkActivity(source, url, bodyPreview) {
    networkCount += 1;
    log('req', `${source} ${url}`, bodyPreview || '');
  }

  function installValidityBypass() {
    if (validityBypassInstalled) return;
    validityBypassInstalled = true;

    originalInputCheckValidity = HTMLInputElement.prototype.checkValidity;
    HTMLInputElement.prototype.checkValidity = function () {
      if (enabledState && classifyField(this) === 'dob') return true;
      return originalInputCheckValidity.call(this);
    };

    originalFormReportValidity = HTMLFormElement.prototype.reportValidity;
    HTMLFormElement.prototype.reportValidity = function () {
      if (enabledState) {
        getAllInputs().forEach((input) => input.setCustomValidity(''));
        return true;
      }
      return originalFormReportValidity.call(this);
    };

    log('info', 'Validity bypass installed');
  }

  function syncAllInputsToAngular() {
    getAllInputs().forEach((input) => dispatchInputEvents(input));
  }

  function walkNgContext(el, visitor) {
    const ctx = el && el.__ngContext__;
    if (!Array.isArray(ctx)) return;
    ctx.forEach((item) => visitor(item, el));
  }

  function patchAngularFormInternal(aggressive) {
    const stats = { controls: 0, groups: 0, forms: [] };

    document.querySelectorAll('input, textarea, select, form, mat-form-field, .mat-mdc-form-field').forEach((el) => {
      walkNgContext(el, (item) => {
        const control = item?.control;
        if (control && typeof control.setErrors === 'function' && control.constructor?.name?.includes('FormControl')) {
          const hostInput =
            item.valueAccessor?._elementRef?.nativeElement ||
            item.valueAccessor?.element?.nativeElement ||
            (el.matches?.('input, textarea, select') ? el : null);
          const kind = hostInput ? classifyField(hostInput) : '';

          if (aggressive || kind === 'dob') {
            control.clearValidators();
            control.setErrors(null);
            control.markAsUntouched();
            control.updateValueAndValidity({ emitEvent: false });
            stats.controls += 1;
          }
        }

        const form = item?.form;
        if (form && form.controls) {
          const keys = Object.keys(form.controls);
          keys.forEach((key) => {
            const ctrl = form.controls[key];
            if (!ctrl) return;
            if (aggressive || /dob|birth|date/i.test(key)) {
              ctrl.clearValidators();
              ctrl.setErrors(null);
              ctrl.updateValueAndValidity({ emitEvent: false });
              stats.controls += 1;
            }
          });
          form.setErrors(null);
          form.updateValueAndValidity({ emitEvent: true });
          stats.groups += 1;
          stats.forms.push({ valid: form.valid, status: form.status, keys });
        }
      });
    });

    log('info', aggressive ? 'Angular AGGRESSIVE patch' : 'Angular patch', stats);
    return stats;
  }

  function retrySendOtpClick(btn) {
    if (!btn || btn.dataset.rebelRetrying) return;
    btn.dataset.rebelRetrying = '1';
    log('warn', 'Retry Send OTP after Angular patch');
    syncAllInputsToAngular();
    patchAngularFormInternal(true);
    forceAngularFormValid();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    delete btn.dataset.rebelRetrying;
  }

  function forceAngularFormValid() {
    getAllInputs().forEach((input) => {
      const kind = classifyField(input);
      input.setCustomValidity('');
      if (kind === 'dob') {
        input.removeAttribute('required');
        input.setAttribute('aria-required', 'false');
        input.disabled = false;
      }
      if (kind !== 'email' || (input.value || '').trim()) {
        input.disabled = false;
      }
    });

    getAllInputs()
      .filter((input) => classifyField(input) === 'email')
      .forEach((input) => {
        input.disabled = false;
      });

    document
      .querySelectorAll('.ng-invalid, .mat-form-field-invalid, .mat-mdc-form-field-invalid, .ng-pending')
      .forEach((el) => {
        el.classList.remove('ng-invalid', 'mat-form-field-invalid', 'mat-mdc-form-field-invalid', 'ng-pending');
      });

    document.querySelectorAll('button, input[type="submit"], [role="button"]').forEach((btn) => {
      const text = normalize(btn.textContent || btn.value || '');
      if (!text.includes('send otp') && !text.includes('request otp')) return;
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.classList.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'disabled');
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
    });
  }

  function scheduleOtpWatchdog(btn) {
    const clickCount = networkCount;
    const clickedAt = lastOtpClickAt;
    setTimeout(() => {
      if (lastOtpClickAt !== clickedAt) return;
      if (networkCount > clickCount) return;
      log('error', 'NO API CALL after Send OTP — retry with Angular patch');
      log('error', 'ng-invalid count', document.querySelectorAll('.ng-invalid').length);
      retrySendOtpClick(btn);
    }, 600);

    setTimeout(() => {
      if (lastOtpClickAt !== clickedAt) return;
      if (networkCount > clickCount) return;
      log('error', 'STILL NO API CALL — Angular form invalid internally');
      log('error', 'Try: extension OFF + asli naam, ya DOB manually bharo');
    }, 3000);
  }

  function installNetworkHooks(enabledProvider) {
    if (hooksInstalled) return;
    hooksInstalled = true;

    originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      const method = (init?.method || 'GET').toUpperCase();
      let requestInit = init ? { ...init } : {};

      if (enabledProvider()) {
        if (requestInit.body) {
          const patched = patchRequestBody(requestInit.body, true);
          if (patched.changed) {
            requestInit.body = patched.body;
            log('patch', 'Removed DOB from fetch body', patched.removed);
          }
        }
        if (method !== 'GET' || requestInit.body) {
          noteNetworkActivity(`FETCH ${method}`, url, String(requestInit.body || '').slice(0, 500));
        }
      }

      try {
        const response = await originalFetch(input, requestInit);
        if (enabledProvider() && (method !== 'GET' || requestInit.body)) {
          const text = await response.clone().text().catch(() => '');
          log(response.ok ? 'ok' : 'error', `FETCH ${response.status} ${url}`, text.slice(0, 400));
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
      const method = (this.__rebelMethod || 'POST').toUpperCase();
      let finalBody = body;

      if (enabledProvider()) {
        if (body != null) {
          const patched = patchRequestBody(body, true);
          if (patched.changed) {
            finalBody = patched.body;
            log('patch', 'Removed DOB from XHR body', patched.removed);
          }
        }
        noteNetworkActivity(`XHR ${method}`, url, String(finalBody || '').slice(0, 500));
      }

      this.addEventListener('load', () => {
        if (!enabledProvider()) return;
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
          lastOtpClickAt = Date.now();
          log('info', 'Send OTP clicked');
          syncAllInputsToAngular();
          patchAngularFormInternal(false);
          forceAngularFormValid();

          if (nameOptional) {
            getAllInputs().forEach((input) => {
              const kind = classifyField(input);
              if (kind === 'captcha' || kind === 'dob' || kind === 'mobile' || kind === 'email') return;
              if (!(input.value || '').trim()) {
                input.value = fallbackName;
                dispatchInputEvents(input);
                log('warn', 'Empty name filled with fallback', fallbackName);
              }
            });
          }

          syncAllInputsToAngular();
          patchAngularFormInternal(false);
          forceAngularFormValid();
          logFormSnapshot('Before submit');
          scheduleOtpWatchdog(btn);
        },
        true
      );
    });
  }

  function logFormSnapshot(label) {
    const snapshot = getAllInputs().map((input) => ({
      type: classifyField(input),
      fc: input.getAttribute('formcontrolname') || '',
      id: input.id || '',
      value: (input.value || '').slice(0, 80),
      required: input.required,
      disabled: input.disabled,
      valid: input.checkValidity ? input.checkValidity() : null,
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
      installValidityBypass();
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
