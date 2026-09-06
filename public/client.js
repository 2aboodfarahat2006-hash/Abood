(function () {
  const OTHER = { user1: 'user2', user2: 'user1' };
  const MAX_UPLOAD_MB = 20;

  let currentRole = null;
  let pendingRole = null;
  let names = { user1: '', user2: '' };
  let pendingAttachment = null; // {type, url, filename, mime, size}
  let typingTimeout = null;

  const $ = (sel) => document.querySelector(sel);
  const identityScreen = $('#identity-screen');
  const chatScreen = $('#chat-screen');
  const roleStep = $('#role-step');
  const nameStep = $('#name-step');
  const nameInput = $('#name-input');
  const messagesEl = $('#messages');
  const emptyState = $('#empty-state');
  const textInput = $('#text-input');
  const sendBtn = $('#send-btn');
  const attachPreview = $('#attach-preview');
  const attachPreviewImg = $('#attach-preview-img');
  const attachPreviewName = $('#attach-preview-name');
  const currentNameEl = $('#current-name');
  const peerStatus = $('#peer-status');
  const connDot = $('#conn-dot');
  const lightbox = $('#lightbox');
  const lightboxImg = $('#lightbox-img');
  const typingIndicator = $('#typing-indicator');

  const socket = io();

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function linkify(escaped) {
    const urlRegex = /((https?:\/\/|www\.)[^\s<]+)/g;
    return escaped.replace(urlRegex, (match) => {
      const clean = match.replace(/[.,!?;:]+$/, '');
      const trailing = match.slice(clean.length);
      const href = clean.startsWith('http') ? clean : 'https://' + clean;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${clean}</a>${trailing}`;
    });
  }
  function formatTime(ts) { return new Date(ts).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }); }
  function formatDay(ts) { return new Date(ts).toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' بايت';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' ك.ب';
    return (bytes / 1024 / 1024).toFixed(1) + ' م.ب';
  }
  function fileExtLabel(filename) {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toUpperCase().slice(0, 4) : 'FILE';
  }

  // ---------------- الاتصال ----------------
  socket.on('connect', () => connDot.classList.add('online'));
  socket.on('disconnect', () => connDot.classList.remove('online'));

  socket.on('names-updated', (n) => {
    names = n;
    refreshRoleLabels();
    updatePeerStatus();
  });

  socket.on('message', (msg) => {
    renderMessage(msg);
    scrollToBottomIfNear();
  });

  socket.on('typing', ({ role }) => {
    if (!currentRole || role === currentRole) return;
    typingIndicator.textContent = (names[role] || 'الطرف الآخر') + ' يكتب الآن...';
    typingIndicator.style.display = 'block';
    clearTimeout(typingIndicator._hideTimer);
    typingIndicator._hideTimer = setTimeout(() => { typingIndicator.style.display = 'none'; }, 2500);
  });

  // ---------------- تحميل الأسماء والتاريخ ----------------
  async function loadInitial() {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      names = data.names || { user1: '', user2: '' };
      refreshRoleLabels();
      window.__history = data.messages || [];
    } catch (e) {
      console.error('تعذر تحميل السجل', e);
    }
  }

  function refreshRoleLabels() {
    $('#label-user1').textContent = names.user1 || 'الشخص الأول';
    $('#label-user2').textContent = names.user2 || 'الشخص الثاني';
    $('#hint-user1').textContent = names.user1 ? 'دخول باسم ' + names.user1 : 'لم يتم تعيين اسم بعد';
    $('#hint-user2').textContent = names.user2 ? 'دخول باسم ' + names.user2 : 'لم يتم تعيين اسم بعد';
  }

  // ---------------- اختيار الهوية ----------------
  document.querySelectorAll('.role-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingRole = btn.dataset.role;
      roleStep.style.display = 'none';
      nameStep.style.display = 'block';
      nameInput.value = names[pendingRole] || '';
      nameInput.focus();
    });
  });
  $('#back-to-roles').addEventListener('click', () => {
    nameStep.style.display = 'none';
    roleStep.style.display = 'block';
  });
  $('#confirm-name-btn').addEventListener('click', enterChat);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') enterChat(); });

  function enterChat() {
    const val = nameInput.value.trim();
    if (!val) { nameInput.focus(); return; }
    names[pendingRole] = val;
    socket.emit('set-name', { role: pendingRole, name: val });
    currentRole = pendingRole;
    try { localStorage.setItem('twochat_role', currentRole); } catch (e) {}
    currentNameEl.textContent = val;
    identityScreen.style.display = 'none';
    chatScreen.style.display = 'flex';
    renderHistory();
    updatePeerStatus();
    textInput.focus();
  }

  $('#switch-role').addEventListener('click', () => {
    currentRole = null;
    try { localStorage.removeItem('twochat_role'); } catch (e) {}
    chatScreen.style.display = 'none';
    identityScreen.style.display = 'flex';
    nameStep.style.display = 'none';
    roleStep.style.display = 'block';
  });

  function updatePeerStatus() {
    if (!currentRole) return;
    const peer = OTHER[currentRole];
    peerStatus.textContent = names[peer] ? 'محادثتك مع ' + names[peer] : 'بانتظار انضمام الطرف الآخر';
  }

  // ---------------- عرض الرسائل ----------------
  let lastRenderedDay = null;

  function renderHistory() {
    messagesEl.innerHTML = '';
    lastRenderedDay = null;
    const history = window.__history || [];
    if (history.length === 0) {
      messagesEl.appendChild(emptyState);
      return;
    }
    history.forEach(renderMessage);
  }

  function renderMessage(msg) {
    if (emptyState.parentNode) emptyState.remove();

    const day = formatDay(msg.timestamp);
    if (day !== lastRenderedDay) {
      const sep = document.createElement('div');
      sep.className = 'day-sep';
      sep.textContent = day;
      messagesEl.appendChild(sep);
      lastRenderedDay = day;
    }

    const isOwn = msg.sender === currentRole;
    const row = document.createElement('div');
    row.className = 'msg-row ' + (isOwn ? 'own' : 'other');

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = (isOwn ? 'أنت' : (names[msg.sender] || 'الطرف الآخر')) + ' · ' + formatTime(msg.timestamp);
    bubble.appendChild(meta);

    if (msg.type === 'text') {
      const p = document.createElement('div');
      p.innerHTML = linkify(escapeHtml(msg.content));
      bubble.appendChild(p);
    } else if (msg.type === 'image') {
      const img = document.createElement('img');
      img.className = 'msg-img';
      img.src = msg.content;
      img.loading = 'lazy';
      img.addEventListener('click', () => {
        lightboxImg.src = msg.content;
        lightbox.style.display = 'flex';
      });
      bubble.appendChild(img);
      if (msg.caption) {
        const cap = document.createElement('div');
        cap.style.marginTop = '4px';
        cap.innerHTML = linkify(escapeHtml(msg.caption));
        bubble.appendChild(cap);
      }
    } else if (msg.type === 'file') {
      const a = document.createElement('a');
      a.className = 'file-chip';
      a.href = msg.content;
      a.download = msg.filename || 'file';
      a.innerHTML = `
        <span class="file-ico">${escapeHtml(fileExtLabel(msg.filename || 'file'))}</span>
        <span class="file-info">
          <div class="file-name">${escapeHtml(msg.filename || 'ملف')}</div>
          <div class="file-size">${formatSize(msg.size || 0)}</div>
        </span>`;
      bubble.appendChild(a);
      if (msg.caption) {
        const cap = document.createElement('div');
        cap.style.marginTop = '4px';
        cap.innerHTML = linkify(escapeHtml(msg.caption));
        bubble.appendChild(cap);
      }
    }

    row.appendChild(bubble);
    messagesEl.appendChild(row);
  }

  function isNearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
  }
  function scrollToBottomIfNear() {
    if (isNearBottom()) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---------------- الإدخال والإرسال ----------------
  textInput.addEventListener('input', () => {
    textInput.style.height = 'auto';
    textInput.style.height = Math.min(textInput.scrollHeight, 120) + 'px';
    if (currentRole) {
      clearTimeout(typingTimeout);
      socket.emit('typing', { role: currentRole });
      typingTimeout = setTimeout(() => {}, 1200);
    }
  });
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  sendBtn.addEventListener('click', handleSend);

  function handleSend() {
    const text = textInput.value.trim();
    if (!text && !pendingAttachment) return;

    sendBtn.disabled = true;
    const payload = pendingAttachment
      ? { sender: currentRole, type: pendingAttachment.type, content: pendingAttachment.url, filename: pendingAttachment.filename, mime: pendingAttachment.mime, size: pendingAttachment.size, caption: text || undefined }
      : { sender: currentRole, type: 'text', content: text };

    socket.emit('message', payload);
    clearAttachment();
    textInput.value = '';
    textInput.style.height = 'auto';
    sendBtn.disabled = false;
    textInput.focus();
  }

  function clearAttachment() {
    pendingAttachment = null;
    attachPreview.style.display = 'none';
    attachPreviewImg.style.display = 'none';
    $('#image-input').value = '';
    $('#file-input').value = '';
  }
  $('#remove-attach').addEventListener('click', clearAttachment);

  $('#btn-image').addEventListener('click', () => $('#image-input').click());
  $('#btn-file').addEventListener('click', () => $('#file-input').click());

  async function uploadFile(file, type) {
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      alert('الملف كبير جدًا. الحد الأقصى ' + MAX_UPLOAD_MB + ' ميجابايت.');
      return null;
    }
    const formData = new FormData();
    formData.append('file', file);
    sendBtn.disabled = true;
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('upload failed');
      const data = await res.json();
      return { type, url: data.url, filename: data.filename, mime: data.mime, size: data.size };
    } catch (e) {
      alert('تعذر رفع الملف، حاول مرة أخرى.');
      return null;
    } finally {
      sendBtn.disabled = false;
    }
  }

  $('#image-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await uploadFile(file, 'image');
    if (!result) return;
    pendingAttachment = result;
    attachPreview.style.display = 'flex';
    attachPreviewImg.style.display = 'block';
    attachPreviewImg.src = result.url;
    attachPreviewName.textContent = 'صورة: ' + file.name;
    textInput.focus();
  });

  $('#file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await uploadFile(file, 'file');
    if (!result) return;
    pendingAttachment = result;
    attachPreview.style.display = 'flex';
    attachPreviewImg.style.display = 'none';
    attachPreviewName.textContent = 'ملف: ' + file.name + ' (' + formatSize(file.size) + ')';
    textInput.focus();
  });

  lightbox.addEventListener('click', () => { lightbox.style.display = 'none'; });

  // ---------------- بدء التشغيل ----------------
  (async function init() {
    await loadInitial();
    let savedRole = null;
    try { savedRole = localStorage.getItem('twochat_role'); } catch (e) {}
    if (savedRole && names[savedRole]) {
      currentRole = savedRole;
      currentNameEl.textContent = names[savedRole];
      identityScreen.style.display = 'none';
      chatScreen.style.display = 'flex';
      renderHistory();
      updatePeerStatus();
    }
  })();
})();
