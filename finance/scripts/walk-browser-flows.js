import fs from 'node:fs';

const ARTIFACT_DIR = 'C:\\Users\\jonke\\.gemini\\antigravity-ide\\brain\\dd5a5e02-ec47-4958-94f4-0ee85d7ff36f';
const BASE_URL = 'http://127.0.0.1:8787/finance/';
const TASK_LOG_PATH = 'C:\\Users\\jonke\\.gemini\\antigravity-ide\\brain\\dd5a5e02-ec47-4958-94f4-0ee85d7ff36f\\.system_generated\\tasks\\task-914.log';

const testEmail = `jose.nunez.${Date.now()}@testflow.com`;
console.log(`Starting E2E browser flows with test user: José Ñuñez <${testEmail}>`);

async function run() {
  console.log('Connecting to Chrome CDP...');
  const versionRes = await fetch('http://127.0.0.1:9222/json/version');
  const versionData = await versionRes.json();
  const wsUrl = versionData.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  await new Promise(r => ws.onopen = r);

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  const target = await send('Target.createTarget', { url: 'about:blank' });
  const targetId = target.targetId;
  const session = await send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = session.sessionId;

  function sendSession(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, sessionId, method, params }));
    });
  }

  await sendSession('Page.enable');
  await sendSession('Runtime.enable');
  await sendSession('Network.enable');
  await sendSession('Network.clearBrowserCookies');
  await sendSession('Network.clearBrowserCache');
  await sendSession('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });

  async function evaluate(expression) {
    const res = await sendSession('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    return res.result?.value;
  }

  async function screenshot(filename) {
    const res = await sendSession('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    fs.writeFileSync(`${ARTIFACT_DIR}\\${filename}`, buffer);
    console.log(`Saved screenshot: ${filename} (${buffer.length} bytes)`);
  }

  console.log(`Navigating to ${BASE_URL}...`);
  await sendSession('Page.navigate', { url: BASE_URL });
  await new Promise(r => setTimeout(r, 2000));

  // Ensure clean auth state in localStorage
  await evaluate(`(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
  })()`);

  // Step 1: Switch to "Create Account"
  console.log('Step 1: Switching to Create Account tab...');
  await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const createBtn = buttons.find(b => b.textContent.includes('Create Account'));
    if (createBtn) createBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 800));

  // Fill in Registration form
  console.log('Filling in registration form for José Ñuñez...');
  await evaluate(`(() => {
    function setInput(selector, val) {
      const input = document.querySelector(selector);
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    setInput('input[placeholder="Alex Morgan"]', 'José Ñuñez');
    setInput('input[type="email"]', '${testEmail}');
    setInput('input[type="password"]', 'ValidPassword123!');
    setInput('input[placeholder="Your secret answer"]', 'Fluffy');
  })()`);
  await new Promise(r => setTimeout(r, 500));
  await screenshot('flow_01_register_form.png');

  // Submit Registration
  console.log('Submitting registration form...');
  await evaluate(`(() => {
    const form = document.querySelector('form');
    if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
  })()`);
  await new Promise(r => setTimeout(r, 3500));
  await screenshot('flow_02_dashboard_registered.png');

  // Step 2: Make Authenticated Action (open settings, security tab, update profile)
  console.log('Step 2: Navigating to Settings for authenticated POST...');
  await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const settingsBtn = buttons.find(b => b.textContent.includes('Settings') || b.querySelector('svg.lucide-settings') || b.getAttribute('title')?.includes('Settings'));
    if (settingsBtn) settingsBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 1200));

  console.log('Selecting Security tab in Settings...');
  await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const secBtn = buttons.find(b => b.textContent.includes('Security'));
    if (secBtn) secBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 800));

  console.log('Updating profile with authenticated POST...');
  await evaluate(`(() => {
    function setInput(selector, val) {
      const input = document.querySelector(selector);
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    const pwdInputs = document.querySelectorAll('input[type="password"]');
    if (pwdInputs[0]) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(pwdInputs[0], 'ValidPassword123!');
      pwdInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      pwdInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
    setInput('input[placeholder="Enter secret answer"]', 'Fluffy Updated');
    const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Save Profile Changes'));
    if (saveBtn) saveBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 2000));
  await screenshot('flow_03_settings_authenticated.png');

  // Step 3: Log Out
  console.log('Step 3: Logging out...');
  await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const logoutBtn = buttons.find(b => b.textContent.includes('Sign Out') || b.textContent.includes('Log Out') || b.getAttribute('title') === 'Sign Out');
    if (logoutBtn) logoutBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 2000));
  await screenshot('flow_04_logged_out.png');

  // Step 4: Log Back In
  console.log('Step 4: Logging back in...');
  await evaluate(`(() => {
    function setInput(selector, val) {
      const input = document.querySelector(selector);
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    setInput('input[type="email"]', '${testEmail}');
    setInput('input[type="password"]', 'ValidPassword123!');
  })()`);
  await new Promise(r => setTimeout(r, 500));
  await evaluate(`(() => {
    const form = document.querySelector('form');
    if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
  })()`);
  await new Promise(r => setTimeout(r, 3000));
  await screenshot('flow_05_logged_in_again.png');

  // Log out again to test forgot-password
  console.log('Logging out before password recovery...');
  await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const logoutBtn = buttons.find(b => b.textContent.includes('Sign Out') || b.textContent.includes('Log Out') || b.getAttribute('title') === 'Sign Out');
    if (logoutBtn) logoutBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 2000));

  // Step 5: Click "Forgot Password?"
  console.log('Step 5: Clicking Forgot Password?...');
  await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const forgotBtn = buttons.find(b => b.textContent.includes('Forgot Password'));
    if (forgotBtn) forgotBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 1000));

  // Enter email and request reset code
  console.log('Requesting reset code...');
  await evaluate(`(() => {
    function setInput(selector, val) {
      const input = document.querySelector(selector);
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    setInput('input[type="email"]', '${testEmail}');
    const form = document.querySelector('form');
    if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
  })()`);
  await new Promise(r => setTimeout(r, 2500));
  await screenshot('flow_06_forgot_code_requested.png');

  // Step 6: Read code from task log and complete password reset
  console.log('Step 6: Reading 8-digit dev reset code from task log...');
  const regex = new RegExp(`dev reset code for ${testEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([0-9]{8})`);
  let match = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(r => setTimeout(r, 200));
    const logContent = fs.readFileSync(TASK_LOG_PATH, 'utf8');
    match = logContent.match(regex);
    if (match) break;
  }

  if (match) {
    const resetCode = match[1];
    console.log(`Found reset code in log: ${resetCode}`);

    // Fill reset form
    console.log('Submitting reset code, security answer, and new password in UI...');
    await evaluate(`(() => {
      function setInput(selector, val) {
        const input = document.querySelector(selector);
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      setInput('input[placeholder="e.g. 12345678"]', '${resetCode}');
      setInput('input[placeholder="Enter your security answer"]', 'Fluffy Updated');
      setInput('input[placeholder="Min 8 chars, 1 upper, 1 number"]', 'NewSecurePassword456!');
    })()`);
    await new Promise(r => setTimeout(r, 600));
    await evaluate(`(() => {
      const form = document.querySelector('form');
      if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
    })()`);
    await new Promise(r => setTimeout(r, 3000));
    await screenshot('flow_07_reset_completed.png');

    // Step 7: Log in with new password
    console.log('Step 7: Logging in with new password...');
    await evaluate(`(() => {
      function setInput(selector, val) {
        const input = document.querySelector(selector);
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      setInput('input[type="email"]', '${testEmail}');
      setInput('input[type="password"]', 'NewSecurePassword456!');
    })()`);
    await new Promise(r => setTimeout(r, 600));
    await evaluate(`(() => {
      const form = document.querySelector('form');
      if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
    })()`);
    await new Promise(r => setTimeout(r, 3500));
    await screenshot('flow_08_new_password_login.png');
  } else {
    console.warn('Could not find reset code in task log in time');
  }

  // Cleanup CDP target
  await send('Target.closeTarget', { targetId });
  ws.close();
  console.log('Browser flow complete! All screenshots saved to artifact directory.');
}

run().catch(err => {
  console.error('Error during browser flow execution:', err);
  process.exit(1);
});
