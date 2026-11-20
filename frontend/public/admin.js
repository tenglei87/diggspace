(() => {
  const $ = id => document.getElementById(id);
  const form = $('source-form');
  const message = $('form-message');
  const table = $('sources');
  let offset = 0;
  const limit = 100;
  let editing = null;
  let editingSource = null;
  let groups = new Map([['feeds', '普通订阅']]);
  let busy = false;
  let pendingReset = false;

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
    editingSource = null;
    form.reset();
    $('editing').value = '';
    $('form-title').textContent = '新增订阅源';
    $('form-mode').textContent = '新增模式：保存会创建独立订阅源，不会修改现有记录。';
    $('save').textContent = '新增订阅源';
    $('cancel').hidden = true;
  }

  function edit(row) {
    editing = row.num;
    editingSource = { id: row.id, name: row.name, feed: row.feed, url: row.url };
    $('editing').value = row.num;
    $('feed-name').value = row.name;
    $('site-url').value = row.url;
    $('feed-url').value = row.feed ?? '';
    $('group-id').value = row.source_group || 'feeds';
    $('form-title').textContent = '编辑已有来源 #' + row.num;
    $('form-mode').textContent = '编辑模式：你正在修改「' + row.name +
      '」。保存将覆盖这条记录，不会新增来源。如要添加新网站，请点击右上角「＋ 新增另一条订阅源」。';
    $('save').textContent = '确认修改已有来源';
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
    if (busy) {
      if (reset) pendingReset = true;
      return;
    }
    busy = true;
    $('refresh').disabled = true;
    if (reset) { offset = 0; table.replaceChildren(); }
    try {
      const data = await request('/api/admin/feedspace/sources?limit=' + limit + '&offset=' + offset);
      for (const row of data.sources) renderRow(row);
      offset += data.sources.length;
      $('source-count').textContent = '（已显示 ' + offset + ' 条）';
      if (!offset) {
        const tr = document.createElement('tr');
        const td = cell(tr, '还没有订阅源，请通过上方表单添加。');
        td.colSpan = 4; table.append(tr);
      }
      $('more').hidden = data.sources.length < limit;
    } catch (error) { message.textContent = error.message; }
    finally {
      busy = false;
      $('refresh').disabled = false;
      if (pendingReset) {
        pendingReset = false;
        await loadSources(true);
      }
    }
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
      const isEditing = editing !== null;
      if (isEditing) {
        const name = editingSource?.name || String(editing);
        if (!confirm('你正在【编辑已有来源：' + name +
          '】，并非新增。继续会修改原订阅。\\n如需添加另一条，请取消并点击「＋ 新增另一条订阅源」。')) {
          message.textContent = '已取消修改。你可以切换到「新增模式」保存为新条目。';
          return;
        }
        data.expectedId = editingSource.id;
        if (data.feed !== editingSource.feed) {
          if (!confirm('注意：你修改了原有 RSS 地址！\\n这会把「' +
            name + '」的订阅地址替换成新的，而不是新增订阅。确定继续？')) {
            message.textContent = '已取消 RSS 地址替换。';
            return;
          }
          data.allowFeedReplacement = true;
        }
      }
      const response = await request(isEditing
        ? '/api/admin/feedspace/sources/' + editing : '/api/admin/feedspace/sources', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { Origin: location.origin },
        body: JSON.stringify(data),
      });
      clearForm();
      message.textContent = isEditing
        ? '已有来源修改成功，未新增条目。'
        : '新增成功（来源编号 #' + response.num + '）。原有订阅未修改。可以继续添加下一条。';
      await loadSources(true);
    } catch (error) { message.textContent = error.message; }
    finally { save.disabled = false; }
  });
  $('cancel').addEventListener('click', clearForm);
  $('new-source').addEventListener('click', () => {
    clearForm();
    message.textContent = '已切换到新增模式，新订阅不会替换已有来源。';
    $('feed-name').focus();
  });
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
