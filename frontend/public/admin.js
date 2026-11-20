(() => {
  const $ = id => document.getElementById(id);
  const form = $('source-form');
  const message = $('form-message');
  const table = $('sources');
  let offset = 0;
  const limit = 100;
  let editing = null;
  let groups = new Map([['feeds', '普通订阅']]);
  let busy = false;

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
    if (response.status === 404 && path.startsWith('/api/admin/')) {
      location.assign('/admin/login');
      throw new Error('管理员登录已失效，请重新登录');
    }
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) throw Error(data.error || '请求失败：HTTP ' + response.status);
    return data;
  }

  const actionButton = (label, callback, minor = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (minor) button.className = 'secondary';
    button.addEventListener('click', callback);
    return button;
  };
  const cell = (row, content) => {
    const td = document.createElement('td');
    if (typeof content === 'string') td.textContent = content;
    else td.append(content);
    row.append(td);
    return td;
  };

  function clearForm() {
    editing = null;
    form.reset();
    $('editing').value = '';
    $('form-title').textContent = '新增订阅源';
    $('save').textContent = '保存来源';
    $('cancel').hidden = true;
  }

  function edit(row) {
    editing = row.num;
    $('editing').value = row.num;
    $('feed-name').value = row.name;
    $('site-url').value = row.url;
    $('feed-url').value = row.feed ?? '';
    $('group-id').value = row.source_group || 'feeds';
    $('form-title').textContent = '编辑来源 #' + row.num;
    $('save').textContent = '保存修改';
    $('cancel').hidden = false;
    message.textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function mutate(row, mode) {
    const isDelete = mode === 'delete';
    if (isDelete && !confirm('删除「' + row.name + '」？记录会被停用并从前台隐藏，可通过此后台恢复。')) return;
    try {
      const endpoint = '/api/admin/feedspace/sources/' + row.num;
      await request(endpoint, isDelete
        ? { method: 'DELETE', headers: { Origin: location.origin } }
        : { method: 'PATCH', headers: { Origin: location.origin },
            body: JSON.stringify({ enabled: !!row.removed }) });
      await loadSources(true);
    } catch (error) { message.textContent = error.message; }
  }

  function renderRow(row) {
    const tr = document.createElement('tr');
    const name = document.createElement('div');
    name.textContent = row.name;
    name.className = 'row-name';
    const url = document.createElement('a');
    url.href = row.url;
    url.target = '_blank';
    url.rel = 'noopener noreferrer';
    url.textContent = row.url;
    url.className = 'row-url';
    const identity = document.createElement('div');
    identity.append(name, url);
    cell(tr, identity);
    cell(tr, groups.get(row.source_group) || row.source_group);
    cell(tr, row.removed ? '已停用' : (row.status || '等待抓取'));
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.append(actionButton('编辑', () => edit(row), true));
    actions.append(actionButton(row.removed ? '启用' : '停用', () => mutate(row, 'toggle'), true));
    if (!row.removed) actions.append(actionButton('删除', () => mutate(row, 'delete'), true));
    cell(tr, actions);
    table.append(tr);
  }

  async function loadSources(reset = false) {
    if (busy) return;
    busy = true;
    $('refresh').disabled = true;
    if (reset) { offset = 0; table.replaceChildren(); }
    try {
      const data = await request('/api/admin/feedspace/sources?limit=' + limit + '&offset=' + offset);
      for (const row of data.sources) renderRow(row);
      offset += data.sources.length;
      if (!offset) {
        const tr = document.createElement('tr');
        const td = cell(tr, '还没有订阅源，请通过上方表单添加。');
        td.colSpan = 4; table.append(tr);
      }
      $('more').hidden = data.sources.length < limit;
    } catch (error) { message.textContent = error.message; }
    finally { busy = false; $('refresh').disabled = false; }
  }

  async function loadGroups() {
    const data = await request('/api/admin/feedspace/groups');
    const select = $('group-id');
    select.replaceChildren();
    for (const group of data.groups) {
      groups.set(group.id, group.name);
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      select.append(option);
    }
    if (groups.has('feeds')) select.value = 'feeds';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const save = $('save');
    save.disabled = true;
    message.textContent = '保存中…';
    const data = {
      name: $('feed-name').value.trim(),
      url: $('site-url').value.trim(),
      feed: $('feed-url').value.trim(),
      groupId: $('group-id').value,
    };
    try {
      await request(editing ? '/api/admin/feedspace/sources/' + editing : '/api/admin/feedspace/sources', {
        method: editing ? 'PATCH' : 'POST',
        headers: { Origin: location.origin },
        body: JSON.stringify(data),
      });
      clearForm();
      message.textContent = '已保存。点击「抓取到期 RSS」后，最新文章会出现在首页。';
      await loadSources(true);
    } catch (error) { message.textContent = error.message; }
    finally { save.disabled = false; }
  });
  $('cancel').addEventListener('click', clearForm);
  $('refresh').addEventListener('click', () => loadSources(true));
  $('more').addEventListener('click', () => loadSources());

  $('crawl').addEventListener('click', async () => {
    const button = $('crawl');
    const output = $('crawl-message');
    button.disabled = true; output.textContent = '抓取中（最多 5 个来源）…';
    try {
      const res = await fetch('/api/admin/crawl?limit=5&favicons=0', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { Origin: location.origin },
        signal: AbortSignal.timeout(160000),
      });
      if (!res.ok) throw Error('请求失败：' + res.status);
      const raw = await res.text();
      const error = raw.split('\n').find(line => line.startsWith('error:'));
      if (error) throw Error(error);
      const results = raw.trim().split('\n').filter(line => line.startsWith('{'));
      const data = results.length ? JSON.parse(results.at(-1)) : null;
      if (!data?.feeds) throw Error('抓取未返回有效统计');
      output.textContent = '完成：检查 ' + data.feeds.checked + ' 个来源；失败 ' + data.feeds.failed + ' 个。';
      await loadSources(true);
    } catch (error) { output.textContent = '抓取失败：' + error.message; }
    finally { button.disabled = false; }
  });

  (async () => {
    try { await loadGroups(); await loadSources(true); }
    catch (error) { message.textContent = error.message; }
  })();
})();
