const state = {
  open: false,
  sending: false,
  messages: [],
  configured: false,
  model: 'DeepSeek',
};

const topbar = document.querySelector('.topbar');
if (topbar) initAssistant();

function initAssistant() {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'wb-ai-toggle';
  toggle.setAttribute('aria-label', '打开 DeepSeek 助理');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<span class="wb-ai-spark">✦</span><span class="wb-ai-label">DeepSeek 助理</span>';
  topbar.appendChild(toggle);

  const shade = document.createElement('div');
  shade.className = 'wb-ai-shade';
  shade.setAttribute('aria-hidden', 'true');

  const drawer = document.createElement('aside');
  drawer.className = 'wb-ai-drawer';
  drawer.setAttribute('aria-label', 'DeepSeek 结构设计助理');
  drawer.innerHTML = `
    <header class="wb-ai-head">
      <div>
        <span class="wb-ai-kicker">STRUCTURAL AI</span>
        <h2>DeepSeek 结构设计助理</h2>
      </div>
      <button type="button" class="wb-ai-close" aria-label="关闭 DeepSeek 助理">×</button>
    </header>
    <div class="wb-ai-status"><i></i><span>正在检查本机配置…</span></div>
    <div class="wb-ai-notice">只有点击“发送”后，问题及勾选的当前页面上下文才会发送至 DeepSeek。正式项目资料请遵守公司的数据安全要求。</div>
    <div class="wb-ai-quick" aria-label="快捷任务">
      <button type="button" data-prompt="请根据当前页面内容，整理一份项目关键参数清单。按“已知事实、待确认项、AI建议”三部分输出。">提取关键参数</button>
      <button type="button" data-prompt="请检查当前页面中可能存在的参数冲突、缺项和需要人工确认的内容，并按风险高低排序。">检查冲突缺项</button>
      <button type="button" data-prompt="请根据当前项目上下文，列出应进一步核对的规范类别和条文方向。不要编造具体条文编号。">规范核对建议</button>
      <button type="button" id="wb-ai-region-research">地区重难点研判</button>
    </div>
    <div class="wb-ai-messages" aria-live="polite"></div>
    <form class="wb-ai-compose">
      <label class="wb-ai-context"><input type="checkbox" checked> 附带当前页面上下文</label>
      <textarea rows="4" maxlength="12000" placeholder="例如：帮我整理当前项目需要领导确认的关键参数……"></textarea>
      <div class="wb-ai-compose-foot">
        <span>Enter 发送 · Shift+Enter 换行</span>
        <button type="submit">发送</button>
      </div>
    </form>`;

  document.body.append(shade, drawer);
  const closeButton = drawer.querySelector('.wb-ai-close');
  const form = drawer.querySelector('.wb-ai-compose');
  const textarea = form.querySelector('textarea');

  toggle.addEventListener('click', () => setOpen(!state.open));
  closeButton.addEventListener('click', () => setOpen(false));
  shade.addEventListener('click', () => setOpen(false));
  drawer.querySelector('#wb-ai-region-research').onclick=()=>{if(!window.WorkbenchModules?.openResearch){appendMessage('assistant','请在一体化工作台载入项目后使用地区研判。');return;}setOpen(false);window.WorkbenchModules.openResearch();};
  drawer.querySelectorAll('[data-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      textarea.value = button.dataset.prompt;
      textarea.focus();
    });
  });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = textarea.value.trim();
    if (!text || state.sending) return;
    textarea.value = '';
    await sendMessage(text, form.querySelector('input[type="checkbox"]').checked);
  });

  renderWelcome();
  checkStatus();
}

function setOpen(next) {
  state.open = next;
  document.body.classList.toggle('wb-ai-open', next);
  const toggle = document.querySelector('.wb-ai-toggle');
  toggle?.setAttribute('aria-expanded', String(next));
  toggle?.setAttribute('aria-label', next ? '关闭 DeepSeek 助理' : '打开 DeepSeek 助理');
  if (next) setTimeout(() => document.querySelector('.wb-ai-compose textarea')?.focus(), 180);
}

async function checkStatus() {
  const status = document.querySelector('.wb-ai-status');
  try {
    const response = await fetch('/api/deepseek/status', { cache: 'no-store' });
    const data = await response.json();
    state.configured = Boolean(data.configured);
    state.model = data.model || 'DeepSeek';
    status.classList.toggle('ready', state.configured);
    status.classList.toggle('missing', !state.configured);
    status.querySelector('span').textContent = state.configured
      ? `已连接 · ${state.model}`
      : '尚未配置 API Key · 请查看面板内说明';
    if (!state.configured) renderSetupHint();
  } catch {
    status.classList.add('missing');
    status.querySelector('span').textContent = '本地 AI 接口未启动';
  }
}

function renderWelcome() {
  appendMessage('assistant', '我是工作台内的结构设计助理。你可以让我整理当前页面参数、检查冲突缺项，或给出规范核对方向。关键技术结论仍需由设计人员和专业负责人复核。');
}

function renderSetupHint() {
  if (document.querySelector('.wb-ai-setup')) return;
  const box = document.createElement('div');
  box.className = 'wb-ai-setup';
  box.innerHTML = '<b>首次配置</b><ol><li>复制 <code>web-demo/.env.example</code> 为 <code>.env.local</code></li><li>填入 <code>DEEPSEEK_API_KEY</code></li><li>关闭并重新启动 Demo</li></ol>';
  document.querySelector('.wb-ai-messages')?.appendChild(box);
}

function collectContext() {
  const activeTab = document.querySelector('.tabs button.on')?.textContent?.trim() || '未知页面';
  const role = document.querySelector('#role-sel')?.selectedOptions?.[0]?.textContent?.trim() || '';
  const stage = document.querySelector('#pstage-sel')?.selectedOptions?.[0]?.textContent?.trim() || '';
  const visibleFields = [];
  document.querySelectorAll('.main input, .main select, .main textarea').forEach((field) => {
    if (visibleFields.length >= 60 || field.type === 'file' || field.type === 'password') return;
    const rect = field.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const label = field.closest('.fld')?.querySelector('label')?.textContent?.trim()
      || field.getAttribute('aria-label')
      || field.name
      || field.id;
    const value = field.tagName === 'SELECT'
      ? field.selectedOptions?.[0]?.textContent?.trim()
      : field.value?.trim();
    if (label && value) visibleFields.push({ label, value });
  });
  const mainText = document.querySelector('.main')?.innerText?.replace(/\n{3,}/g, '\n\n').slice(0, 12000) || '';
  return {
    page: activeTab,
    role,
    projectStage: stage,
    visibleFields,
    visiblePageText: mainText,
    capturedAt: new Date().toISOString(),
  };
}

async function sendMessage(text, includeContext) {
  state.sending = true;
  state.messages.push({ role: 'user', content: text });
  appendMessage('user', text);
  const pending = appendMessage('assistant', '正在分析当前项目上下文…', true);
  setComposeDisabled(true);

  try {
    const response = await fetch('/api/deepseek/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.messages,
        context: includeContext ? collectContext() : null,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
    state.messages.push({ role: 'assistant', content: data.content });
    pending.querySelector('.wb-ai-bubble').textContent = data.content;
    pending.classList.remove('pending');
    const tokenCount = data.usage?.total_tokens;
    pending.querySelector('.wb-ai-meta').textContent = `${data.model || state.model}${tokenCount ? ` · ${tokenCount} tokens` : ''}`;
  } catch (error) {
    pending.classList.remove('pending');
    pending.classList.add('error');
    pending.querySelector('.wb-ai-bubble').textContent = error.message;
    pending.querySelector('.wb-ai-meta').textContent = '未完成';
  } finally {
    state.sending = false;
    setComposeDisabled(false);
  }
}

function appendMessage(role, text, pending = false) {
  const item = document.createElement('article');
  item.className = `wb-ai-message ${role}${pending ? ' pending' : ''}`;
  const bubble = document.createElement('div');
  bubble.className = 'wb-ai-bubble';
  bubble.textContent = text;
  const meta = document.createElement('small');
  meta.className = 'wb-ai-meta';
  meta.textContent = role === 'user' ? '你' : pending ? 'DeepSeek' : 'AI 助理';
  item.append(bubble, meta);
  const messages = document.querySelector('.wb-ai-messages');
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
  return item;
}

function setComposeDisabled(disabled) {
  const form = document.querySelector('.wb-ai-compose');
  form?.querySelectorAll('textarea, button').forEach((control) => { control.disabled = disabled; });
}
