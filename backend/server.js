import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import getDb from './db.js';
import { startScheduler, triggerScreenshotNow } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

app.get('/api/urls', async (req, res) => {
  const db = await getDb();
  const urls = db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM screenshots s WHERE s.url_id = u.id) as screenshot_count
    FROM urls u
    ORDER BY u.created_at DESC
  `).all();
  res.json(urls);
});

app.post('/api/urls', async (req, res) => {
  const { url, name, frequency = 'daily' } = req.body;

  if (!url || !name) {
    return res.status(400).json({ error: 'URL和名称必填' });
  }

  const validFrequencies = ['hourly', 'daily', 'weekly', 'monthly'];
  if (!validFrequencies.includes(frequency)) {
    return res.status(400).json({ error: '无效的频率' });
  }

  try {
    const db = await getDb();
    const stmt = db.prepare('INSERT INTO urls (url, name, frequency) VALUES (?, ?, ?)');
    const result = stmt.run(url, name, frequency);

    const newUrl = db.prepare('SELECT * FROM urls WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newUrl);
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique')) {
      res.status(400).json({ error: '该URL已存在' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.delete('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  const screenshots = db.prepare('SELECT file_path FROM screenshots WHERE url_id = ?').all(id);
  screenshots.forEach(s => {
    if (fs.existsSync(s.file_path)) {
      fs.unlinkSync(s.file_path);
      const dir = path.dirname(s.file_path);
      try {
        if (fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
        }
      } catch (e) {}
    }
  });

  db.prepare('DELETE FROM screenshots WHERE url_id = ?').run(id);
  const stmt = db.prepare('DELETE FROM urls WHERE id = ?');
  stmt.run(id);
  res.json({ success: true });
});

app.put('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const { name, frequency, status } = req.body;
  const db = await getDb();

  const existing = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'URL不存在' });
  }

  const finalName = name || existing.name;
  const finalFrequency = frequency || existing.frequency;
  const finalStatus = status || existing.status;

  const stmt = db.prepare('UPDATE urls SET name = ?, frequency = ?, status = ? WHERE id = ?');
  stmt.run(finalName, finalFrequency, finalStatus, id);

  const updated = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  res.json(updated);
});

app.get('/api/urls/:id/screenshots', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshots = db.prepare(`
    SELECT * FROM screenshots
    WHERE url_id = ?
    ORDER BY created_at DESC
  `).all(id);
  res.json(screenshots);
});

app.get('/api/screenshots/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }
  res.json(screenshot);
});

app.delete('/api/screenshots/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }

  if (fs.existsSync(screenshot.file_path)) {
    fs.unlinkSync(screenshot.file_path);
  }

  db.prepare('DELETE FROM screenshots WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/urls/:id/screenshot', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await triggerScreenshotNow(parseInt(id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const url = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  if (!url) {
    return res.status(404).json({ error: 'URL不存在' });
  }
  res.json(url);
});

app.get('/api/screenshots/:id/annotations', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshot = db.prepare('SELECT id FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }
  const annotations = db.prepare(`
    SELECT id, screenshot_id, type, data, created_at, updated_at
    FROM annotations
    WHERE screenshot_id = ?
    ORDER BY created_at ASC
  `).all(id);
  const parsed = annotations.map(a => ({
    ...a,
    data: JSON.parse(a.data)
  }));
  res.json(parsed);
});

app.post('/api/screenshots/:id/annotations', async (req, res) => {
  const { id } = req.params;
  const { type, data } = req.body;
  if (!type || !data) {
    return res.status(400).json({ error: '标注类型和数据必填' });
  }
  const validTypes = ['text', 'arrow', 'rect', 'highlight', 'freehand', 'ellipse'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: '无效的标注类型' });
  }
  const db = await getDb();
  const screenshot = db.prepare('SELECT id FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }
  try {
    const stmt = db.prepare('INSERT INTO annotations (screenshot_id, type, data) VALUES (?, ?, ?)');
    const result = stmt.run(id, type, JSON.stringify(data));
    const annotation = db.prepare('SELECT * FROM annotations WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      ...annotation,
      data: JSON.parse(annotation.data)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/annotations/:id', async (req, res) => {
  const { id } = req.params;
  const { type, data } = req.body;
  const db = await getDb();
  const existing = db.prepare('SELECT * FROM annotations WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '标注不存在' });
  }
  const finalType = type || existing.type;
  const finalData = data ? JSON.stringify(data) : existing.data;
  try {
    db.prepare('UPDATE annotations SET type = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(finalType, finalData, id);
    const updated = db.prepare('SELECT * FROM annotations WHERE id = ?').get(id);
    res.json({
      ...updated,
      data: JSON.parse(updated.data)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/annotations/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const existing = db.prepare('SELECT id FROM annotations WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '标注不存在' });
  }
  db.prepare('DELETE FROM annotations WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/screenshots/:id/annotations/batch', async (req, res) => {
  const { id } = req.params;
  const { annotations } = req.body;
  if (!Array.isArray(annotations)) {
    return res.status(400).json({ error: '标注数据必须是数组' });
  }
  const db = await getDb();
  const screenshot = db.prepare('SELECT id FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }
  const validTypes = ['text', 'arrow', 'rect', 'highlight', 'freehand', 'ellipse'];
  const created = [];
  try {
    for (const ann of annotations) {
      if (!validTypes.includes(ann.type)) continue;
      const result = db.prepare('INSERT INTO annotations (screenshot_id, type, data) VALUES (?, ?, ?)').run(id, ann.type, JSON.stringify(ann.data));
      const annotation = db.prepare('SELECT * FROM annotations WHERE id = ?').get(result.lastInsertRowid);
      created.push({ ...annotation, data: JSON.parse(annotation.data) });
    }
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/screenshots/:id/annotations/export', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }
  const annotations = db.prepare(`
    SELECT type, data, created_at
    FROM annotations
    WHERE screenshot_id = ?
    ORDER BY created_at ASC
  `).all(id);
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    screenshot: {
      id: screenshot.id,
      file_name: screenshot.file_name,
      width: screenshot.width,
      height: screenshot.height,
      created_at: screenshot.created_at
    },
    annotations: annotations.map(a => ({
      type: a.type,
      data: JSON.parse(a.data),
      created_at: a.created_at
    }))
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="annotations-${id}.json"`);
  res.json(exportData);
});

app.listen(PORT, async () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
  await getDb();
  startScheduler();
});
