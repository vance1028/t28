'use strict';

const { pool } = require('../db');

/* ----------------------------- 行映射 ----------------------------- */

function mapCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isDeleted: !!row.is_deleted,
    deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    categoryId: row.category_id,
    author: row.author,
    status: row.status,
    tags: parseTags(row.tags),
    views: row.views,
    isDeleted: !!row.is_deleted,
    deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
    publishedAt: toIso(row.published_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startTime: toIso(row.start_time),
    endTime: toIso(row.end_time),
    capacity: row.capacity,
    isDeleted: !!row.is_deleted,
    deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapRegistration(row) {
  if (!row) return null;
  return {
    id: row.id,
    activityId: row.activity_id,
    name: row.name,
    department: row.department,
    isDeleted: !!row.is_deleted,
    deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
    createdAt: toIso(row.created_at),
  };
}

function mapSensitiveWord(row) {
  if (!row) return null;
  return {
    id: row.id,
    word: row.word,
    level: row.level,
    category: row.category,
    enabled: !!row.enabled,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapSensitiveHit(row) {
  if (!row) return null;
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    fieldName: row.field_name,
    matchedWord: row.matched_word,
    level: row.level,
    originalText: row.original_text,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    createdAt: toIso(row.created_at),
  };
}

function toIso(v) {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function parseTags(v) {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toMysqlDatetime(v) {
  const d = new Date(v);
  return d.toISOString().slice(0, 23).replace('T', ' ');
}

/* --------------------------- 测试/初始化 --------------------------- */

async function seed() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE sensitive_word_hits');
    await conn.query('TRUNCATE TABLE sensitive_words');
    await conn.query('TRUNCATE TABLE audit_logs');
    await conn.query('TRUNCATE TABLE registrations');
    await conn.query('TRUNCATE TABLE articles');
    await conn.query('TRUNCATE TABLE activities');
    await conn.query('TRUNCATE TABLE categories');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    await conn.query(
      `INSERT INTO categories (id, name, description) VALUES
        (1, '红色历史', '党史、新中国史、改革开放史、社会主义发展史宣传'),
        (2, '时政要闻', '重要会议精神与时政热点解读'),
        (3, '英模人物', '时代楷模、道德模范、革命先烈事迹')`,
    );
    await conn.query(
      `INSERT INTO articles (id, title, summary, content, category_id, author, status, tags, published_at) VALUES
        (1, '从一大到二十大：百年初心', '回顾党的重要历史节点', '中国共产党的百年历程是一部不懈奋斗史……', 1, '宣传部', 'published', JSON_ARRAY('党史','初心使命'), CURRENT_TIMESTAMP(3)),
        (2, '学习贯彻最新会议精神', '深入解读会议核心要义', '会议强调，要坚定不移……', 2, '理论学习中心组', 'published', JSON_ARRAY('时政'), CURRENT_TIMESTAMP(3)),
        (3, '草稿：英雄事迹征集启事', '面向全单位征集身边的英模故事', '现面向全体职工征集……', 3, '编辑部', 'draft', JSON_ARRAY('征集'), NULL)`,
    );
    await conn.query(
      `INSERT INTO activities (id, title, description, location, start_time, end_time, capacity) VALUES
        (1, '红色教育基地参观学习', '组织参观本地革命纪念馆，重温入党誓词', '市革命纪念馆', '2026-07-01 09:00:00.000', '2026-07-01 12:00:00.000', 50),
        (2, '爱国主义主题宣讲会', '邀请专家开展专题宣讲', '单位多功能厅', '2026-07-15 14:00:00.000', '2026-07-15 16:00:00.000', 2)`,
    );
    await conn.query(
      `INSERT INTO sensitive_words (word, level, category) VALUES
        ('法轮功', 'block', '政治'),
        ('台独', 'block', '政治'),
        ('港独', 'block', '政治'),
        ('藏独', 'block', '政治'),
        ('邪教', 'block', '政治')`,
    );
  } finally {
    conn.release();
  }
}

/* ----------------------------- 分类 ----------------------------- */

async function listCategories({ includeDeleted = false } = {}) {
  const where = includeDeleted ? '' : 'WHERE is_deleted = 0';
  const [rows] = await pool.query(`SELECT * FROM categories ${where} ORDER BY id`);
  return rows.map(mapCategory);
}

async function getCategory(id, { includeDeleted = false } = {}) {
  const where = includeDeleted ? 'WHERE id = ?' : 'WHERE id = ? AND is_deleted = 0';
  const [rows] = await pool.query(`SELECT * FROM categories ${where}`, [id]);
  return mapCategory(rows[0]);
}

async function findCategoryByName(name, { includeDeleted = false } = {}) {
  const where = includeDeleted
    ? 'WHERE name = ?'
    : 'WHERE name = ? AND is_deleted = 0';
  const [rows] = await pool.query(`SELECT * FROM categories ${where}`, [name]);
  return mapCategory(rows[0]);
}

async function createCategory({ name, description = '' }) {
  const [result] = await pool.query(
    'INSERT INTO categories (name, description) VALUES (?, ?)',
    [name, description],
  );
  return getCategory(result.insertId);
}

async function updateCategory(id, patch) {
  const sets = [];
  const params = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    params.push(patch.name);
  }
  if (patch.description !== undefined) {
    sets.push('description = ?');
    params.push(patch.description);
  }
  if (sets.length > 0) {
    params.push(id);
    await pool.query(`UPDATE categories SET ${sets.join(', ')} WHERE id = ? AND is_deleted = 0`, params);
  }
  return getCategory(id);
}

async function softDeleteCategory(id) {
  const [result] = await pool.query(
    'UPDATE categories SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND is_deleted = 0',
    [id],
  );
  return result.affectedRows > 0;
}

async function restoreCategory(id) {
  const [result] = await pool.query(
    'UPDATE categories SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND is_deleted = 1',
    [id],
  );
  return result.affectedRows > 0;
}

async function purgeCategory(id) {
  const [result] = await pool.query('DELETE FROM categories WHERE id = ? AND is_deleted = 1', [id]);
  return result.affectedRows > 0;
}

async function countArticlesByCategory(categoryId, { includeDeleted = false } = {}) {
  const where = includeDeleted
    ? 'WHERE category_id = ?'
    : 'WHERE category_id = ? AND is_deleted = 0';
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM articles ${where}`,
    [categoryId],
  );
  return rows[0].cnt;
}

/* ----------------------------- 文章 ----------------------------- */

async function listArticles({ categoryId, status, keyword, includeDeleted = false } = {}) {
  const where = [];
  const params = [];
  if (!includeDeleted) where.push('is_deleted = 0');
  if (categoryId !== undefined) {
    where.push('category_id = ?');
    params.push(categoryId);
  }
  if (status !== undefined) {
    where.push('status = ?');
    params.push(status);
  }
  if (keyword !== undefined && keyword !== '') {
    where.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT * FROM articles ${clause} ORDER BY id`,
    params,
  );
  return rows.map(mapArticle);
}

async function getArticle(id, { includeDeleted = false } = {}) {
  const where = includeDeleted ? 'WHERE id = ?' : 'WHERE id = ? AND is_deleted = 0';
  const [rows] = await pool.query(`SELECT * FROM articles ${where}`, [id]);
  return mapArticle(rows[0]);
}

async function createArticle({
  title,
  summary = '',
  content = '',
  categoryId,
  author = '',
  status = 'draft',
  tags = [],
}) {
  const publishedAt = status === 'published' ? new Date() : null;
  const [result] = await pool.query(
    `INSERT INTO articles (title, summary, content, category_id, author, status, tags, published_at)
     VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
    [
      title,
      summary,
      content,
      categoryId,
      author,
      status,
      JSON.stringify(Array.isArray(tags) ? tags : []),
      publishedAt,
    ],
  );
  return getArticle(result.insertId);
}

async function updateArticle(id, patch) {
  const current = await getArticle(id);
  if (!current) return null;

  const sets = [];
  const params = [];
  const colMap = {
    title: 'title',
    summary: 'summary',
    content: 'content',
    categoryId: 'category_id',
    author: 'author',
  };
  for (const [key, col] of Object.entries(colMap)) {
    if (patch[key] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(patch[key]);
    }
  }
  if (patch.tags !== undefined) {
    sets.push('tags = CAST(? AS JSON)');
    params.push(JSON.stringify(Array.isArray(patch.tags) ? patch.tags : []));
  }
  if (patch.status !== undefined && patch.status !== current.status) {
    sets.push('status = ?');
    params.push(patch.status);
    if (patch.status === 'published' && !current.publishedAt) {
      sets.push('published_at = ?');
      params.push(new Date());
    }
  }
  if (sets.length > 0) {
    params.push(id);
    await pool.query(`UPDATE articles SET ${sets.join(', ')} WHERE id = ? AND is_deleted = 0`, params);
  }
  return getArticle(id);
}

async function softDeleteArticle(id) {
  const [result] = await pool.query(
    'UPDATE articles SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND is_deleted = 0',
    [id],
  );
  return result.affectedRows > 0;
}

async function restoreArticle(id) {
  const [result] = await pool.query(
    'UPDATE articles SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND is_deleted = 1',
    [id],
  );
  return result.affectedRows > 0;
}

async function purgeArticle(id) {
  const [result] = await pool.query('DELETE FROM articles WHERE id = ? AND is_deleted = 1', [id]);
  return result.affectedRows > 0;
}

async function incrementArticleViews(id) {
  await pool.query('UPDATE articles SET views = views + 1 WHERE id = ? AND is_deleted = 0', [id]);
  return getArticle(id);
}

/* ----------------------------- 活动 ----------------------------- */

async function listActivities({ includeDeleted = false } = {}) {
  const where = includeDeleted ? '' : 'WHERE is_deleted = 0';
  const [rows] = await pool.query(`SELECT * FROM activities ${where} ORDER BY id`);
  return rows.map(mapActivity);
}

async function getActivity(id, { includeDeleted = false } = {}) {
  const where = includeDeleted ? 'WHERE id = ?' : 'WHERE id = ? AND is_deleted = 0';
  const [rows] = await pool.query(`SELECT * FROM activities ${where}`, [id]);
  return mapActivity(rows[0]);
}

async function createActivity({
  title,
  description = '',
  location = '',
  startTime,
  endTime,
  capacity = 0,
}) {
  const [result] = await pool.query(
    `INSERT INTO activities (title, description, location, start_time, end_time, capacity)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, description, location, toMysqlDatetime(startTime), toMysqlDatetime(endTime), capacity],
  );
  return getActivity(result.insertId);
}

async function updateActivity(id, patch) {
  const sets = [];
  const params = [];
  const colMap = {
    title: 'title',
    description: 'description',
    location: 'location',
    capacity: 'capacity',
  };
  for (const [key, col] of Object.entries(colMap)) {
    if (patch[key] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(patch[key]);
    }
  }
  if (patch.startTime !== undefined) {
    sets.push('start_time = ?');
    params.push(toMysqlDatetime(patch.startTime));
  }
  if (patch.endTime !== undefined) {
    sets.push('end_time = ?');
    params.push(toMysqlDatetime(patch.endTime));
  }
  if (sets.length > 0) {
    params.push(id);
    await pool.query(`UPDATE activities SET ${sets.join(', ')} WHERE id = ? AND is_deleted = 0`, params);
  }
  return getActivity(id);
}

async function softDeleteActivity(id) {
  const [result] = await pool.query(
    'UPDATE activities SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND is_deleted = 0',
    [id],
  );
  return result.affectedRows > 0;
}

async function restoreActivity(id) {
  const [result] = await pool.query(
    'UPDATE activities SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND is_deleted = 1',
    [id],
  );
  return result.affectedRows > 0;
}

async function purgeActivity(id) {
  const [result] = await pool.query('DELETE FROM activities WHERE id = ? AND is_deleted = 1', [id]);
  return result.affectedRows > 0;
}

/* --------------------------- 活动报名 --------------------------- */

async function listRegistrations(activityId, { includeDeleted = false } = {}) {
  const where = ['activity_id = ?'];
  const params = [activityId];
  if (!includeDeleted) where.push('is_deleted = 0');
  const [rows] = await pool.query(
    `SELECT * FROM registrations WHERE ${where.join(' AND ')} ORDER BY id`,
    params,
  );
  return rows.map(mapRegistration);
}

async function countRegistrations(activityId, { includeDeleted = false } = {}) {
  const where = ['activity_id = ?'];
  const params = [activityId];
  if (!includeDeleted) where.push('is_deleted = 0');
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM registrations WHERE ${where.join(' AND ')}`,
    params,
  );
  return rows[0].cnt;
}

async function findRegistration(activityId, name, { includeDeleted = false } = {}) {
  const where = ['activity_id = ?', 'name = ?'];
  const params = [activityId, name];
  if (!includeDeleted) where.push('is_deleted = 0');
  const [rows] = await pool.query(
    `SELECT * FROM registrations WHERE ${where.join(' AND ')}`,
    params,
  );
  return mapRegistration(rows[0]);
}

async function createRegistration({ activityId, name, department = '' }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [actRows] = await conn.query(
      'SELECT capacity FROM activities WHERE id = ? AND is_deleted = 0 FOR UPDATE',
      [activityId],
    );
    if (!actRows.length) {
      await conn.rollback();
      return { ok: false, reason: 'activity_not_found' };
    }
    const capacity = actRows[0].capacity;

    const [dup] = await conn.query(
      'SELECT id FROM registrations WHERE activity_id = ? AND name = ? AND is_deleted = 0',
      [activityId, name],
    );
    if (dup.length > 0) {
      await conn.rollback();
      return { ok: false, reason: 'duplicate' };
    }

    const [cntRows] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM registrations WHERE activity_id = ? AND is_deleted = 0',
      [activityId],
    );
    if (capacity > 0 && cntRows[0].cnt >= capacity) {
      await conn.rollback();
      return { ok: false, reason: 'full' };
    }

    const [result] = await conn.query(
      'INSERT INTO registrations (activity_id, name, department) VALUES (?, ?, ?)',
      [activityId, name, department],
    );
    await conn.commit();

    const [rows] = await pool.query('SELECT * FROM registrations WHERE id = ?', [result.insertId]);
    return { ok: true, registration: mapRegistration(rows[0]) };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function softDeleteRegistration(id) {
  const [result] = await pool.query(
    'UPDATE registrations SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND is_deleted = 0',
    [id],
  );
  return result.affectedRows > 0;
}

/* --------------------------- 回收站 --------------------------- */

const RETENTION_DAYS = 90;

async function listRecycleBin({ targetType, page = 1, pageSize = 50 } = {}) {
  const results = {};
  const types = targetType ? [targetType] : ['article', 'category', 'activity'];

  for (const type of types) {
    let table, mapper;
    if (type === 'article') {
      table = 'articles';
      mapper = mapArticle;
    } else if (type === 'category') {
      table = 'categories';
      mapper = mapCategory;
    } else if (type === 'activity') {
      table = 'activities';
      mapper = mapActivity;
    } else {
      continue;
    }
    const [rows] = await pool.query(
      `SELECT * FROM ${table} WHERE is_deleted = 1 ORDER BY deleted_at DESC LIMIT ? OFFSET ?`,
      [Number(pageSize), (page - 1) * pageSize],
    );
    results[type] = rows.map((row) => ({
      ...mapper(row),
      targetType: type,
    }));
  }
  return results;
}

async function restoreFromRecycleBin(targetType, id) {
  if (targetType === 'article') return restoreArticle(id);
  if (targetType === 'category') return restoreCategory(id);
  if (targetType === 'activity') return restoreActivity(id);
  return false;
}

async function purgeFromRecycleBin(targetType, id) {
  if (targetType === 'article') return purgeArticle(id);
  if (targetType === 'category') return purgeCategory(id);
  if (targetType === 'activity') return purgeActivity(id);
  return false;
}

async function purgeExpired() {
  const tables = ['articles', 'categories', 'activities', 'registrations'];
  let total = 0;
  for (const table of tables) {
    const [result] = await pool.query(
      `DELETE FROM ${table} WHERE is_deleted = 1 AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [RETENTION_DAYS],
    );
    total += result.affectedRows;
  }
  return total;
}

/* --------------------------- 敏感词 --------------------------- */

async function listSensitiveWords({ keyword, level, enabled, page = 1, pageSize = 50 } = {}) {
  const where = [];
  const params = [];
  if (keyword) {
    where.push('word LIKE ?');
    params.push(`%${keyword}%`);
  }
  if (level) {
    where.push('level = ?');
    params.push(level);
  }
  if (enabled !== undefined) {
    where.push('enabled = ?');
    params.push(enabled ? 1 : 0);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM sensitive_words ${clause}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT * FROM sensitive_words ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), offset],
  );
  return {
    data: rows.map(mapSensitiveWord),
    total: countRows[0].total,
    page,
    pageSize,
  };
}

async function getSensitiveWord(id) {
  const [rows] = await pool.query('SELECT * FROM sensitive_words WHERE id = ?', [id]);
  return mapSensitiveWord(rows[0]);
}

async function findSensitiveWordByWord(word) {
  const [rows] = await pool.query('SELECT * FROM sensitive_words WHERE word = ?', [word]);
  return mapSensitiveWord(rows[0]);
}

async function createSensitiveWord({ word, level = 'block', category = null }) {
  const [result] = await pool.query(
    'INSERT INTO sensitive_words (word, level, category) VALUES (?, ?, ?)',
    [word, level, category],
  );
  return getSensitiveWord(result.insertId);
}

async function updateSensitiveWord(id, patch) {
  const sets = [];
  const params = [];
  if (patch.word !== undefined) {
    sets.push('word = ?');
    params.push(patch.word);
  }
  if (patch.level !== undefined) {
    sets.push('level = ?');
    params.push(patch.level);
  }
  if (patch.category !== undefined) {
    sets.push('category = ?');
    params.push(patch.category);
  }
  if (patch.enabled !== undefined) {
    sets.push('enabled = ?');
    params.push(patch.enabled ? 1 : 0);
  }
  if (sets.length > 0) {
    params.push(id);
    await pool.query(`UPDATE sensitive_words SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  return getSensitiveWord(id);
}

async function deleteSensitiveWord(id) {
  const [result] = await pool.query('DELETE FROM sensitive_words WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function recordSensitiveHit({
  targetType,
  targetId,
  fieldName,
  matchedWord,
  level,
  originalText,
  operatorId,
  operatorName,
}) {
  const [result] = await pool.query(
    `INSERT INTO sensitive_word_hits
     (target_type, target_id, field_name, matched_word, level, original_text, operator_id, operator_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [targetType, targetId, fieldName, matchedWord, level, originalText, operatorId, operatorName],
  );
  return result.insertId;
}

async function listSensitiveHits({
  targetType,
  targetId,
  matchedWord,
  level,
  startTime,
  endTime,
  page = 1,
  pageSize = 50,
} = {}) {
  const where = [];
  const params = [];
  if (targetType) {
    where.push('target_type = ?');
    params.push(targetType);
  }
  if (targetId) {
    where.push('target_id = ?');
    params.push(targetId);
  }
  if (matchedWord) {
    where.push('matched_word LIKE ?');
    params.push(`%${matchedWord}%`);
  }
  if (level) {
    where.push('level = ?');
    params.push(level);
  }
  if (startTime) {
    where.push('created_at >= ?');
    params.push(startTime);
  }
  if (endTime) {
    where.push('created_at <= ?');
    params.push(endTime);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM sensitive_word_hits ${clause}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT * FROM sensitive_word_hits ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), offset],
  );
  return {
    data: rows.map(mapSensitiveHit),
    total: countRows[0].total,
    page,
    pageSize,
  };
}

module.exports = {
  seed,
  // 分类
  listCategories,
  getCategory,
  findCategoryByName,
  createCategory,
  updateCategory,
  deleteCategory: softDeleteCategory,
  softDeleteCategory,
  restoreCategory,
  purgeCategory,
  countArticlesByCategory,
  // 文章
  listArticles,
  getArticle,
  createArticle,
  updateArticle,
  deleteArticle: softDeleteArticle,
  softDeleteArticle,
  restoreArticle,
  purgeArticle,
  incrementArticleViews,
  // 活动
  listActivities,
  getActivity,
  createActivity,
  updateActivity,
  deleteActivity: softDeleteActivity,
  softDeleteActivity,
  restoreActivity,
  purgeActivity,
  // 报名
  listRegistrations,
  countRegistrations,
  findRegistration,
  createRegistration,
  softDeleteRegistration,
  // 回收站
  listRecycleBin,
  restoreFromRecycleBin,
  purgeFromRecycleBin,
  purgeExpired,
  RETENTION_DAYS,
  // 敏感词
  listSensitiveWords,
  getSensitiveWord,
  findSensitiveWordByWord,
  createSensitiveWord,
  updateSensitiveWord,
  deleteSensitiveWord,
  recordSensitiveHit,
  listSensitiveHits,
};
