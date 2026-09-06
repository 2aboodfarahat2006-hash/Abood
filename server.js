// سيرفر شات بين شخصين فقط — Express + Socket.io + تخزين دائم بملفات JSON
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const NAMES_FILE = path.join(DATA_DIR, 'names.json');
const MAX_UPLOAD_MB = 20;

// تأكد من وجود المجلدات والملفات الأساسية
for (const dir of [DATA_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]');
if (!fs.existsSync(NAMES_FILE)) fs.writeFileSync(NAMES_FILE, JSON.stringify({ user1: '', user2: '' }));

// ---------- طبقة تخزين بسيطة وآمنة من تضارب الكتابة ----------
let writeQueue = Promise.resolve();
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return null; }
}
function writeJSON(file, data) {
  writeQueue = writeQueue.then(() => new Promise((resolve, reject) => {
    fs.writeFile(file, JSON.stringify(data, null, 2), (err) => err ? reject(err) : resolve());
  }));
  return writeQueue;
}

function loadMessages() { return readJSON(MESSAGES_FILE) || []; }
function loadNames() { return readJSON(NAMES_FILE) || { user1: '', user2: '' }; }

async function appendMessage(msg) {
  const messages = loadMessages();
  messages.push(msg);
  // نحد الأرشيف المخزن لآخر 5000 رسالة تفاديًا لتضخم الملف بلا حدود
  const trimmed = messages.length > 5000 ? messages.slice(messages.length - 5000) : messages;
  await writeJSON(MESSAGES_FILE, trimmed);
  return msg;
}

async function saveName(role, name) {
  const names = loadNames();
  names[role] = name;
  await writeJSON(NAMES_FILE, names);
  return names;
}

// ---------- تطبيق Express ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// رفع الصور والملفات
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    const unique = crypto.randomBytes(10).toString('hex');
    cb(null, `${Date.now()}-${unique}${safeExt}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  res.json({
    url: `/uploads/${req.file.filename}`,
    filename: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size
  });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'file_too_large', maxMb: MAX_UPLOAD_MB });
  }
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

app.get('/api/history', (req, res) => {
  res.json({ messages: loadMessages(), names: loadNames() });
});

// ---------- الاتصال اللحظي ----------
io.on('connection', (socket) => {
  socket.on('set-name', async ({ role, name }) => {
    if (role !== 'user1' && role !== 'user2') return;
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) return;
    const names = await saveName(role, clean);
    io.emit('names-updated', names);
  });

  socket.on('message', async (payload) => {
    const { sender, type, content, filename, mime, size, caption } = payload || {};
    if (sender !== 'user1' && sender !== 'user2') return;
    if (!['text', 'image', 'file'].includes(type)) return;
    if (type === 'text' && !String(content || '').trim()) return;

    const msg = {
      id: 'm' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
      sender,
      type,
      content: type === 'text' ? String(content).slice(0, 5000) : content,
      filename: filename ? String(filename).slice(0, 200) : undefined,
      mime: mime || undefined,
      size: size || undefined,
      caption: caption ? String(caption).slice(0, 1000) : undefined,
      timestamp: Date.now()
    };

    await appendMessage(msg);
    io.emit('message', msg);
  });

  socket.on('typing', (payload) => {
    socket.broadcast.emit('typing', payload);
  });
});

server.listen(PORT, () => {
  console.log(`✅ سيرفر الشات يعمل على http://localhost:${PORT}`);
});
