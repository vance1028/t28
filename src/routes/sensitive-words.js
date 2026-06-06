'use strict';

const express = require('express');
const store = require('../data/store');
const { getFilter } = require('../utils/sensitive-word');
const { sendError, isNonEmptyString, toPositiveInt } = require('../utils/http');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_LEVELS = ['block', 'warn'];

// 列出敏感词
router.get(
  '/',
  wrap(async (req, res) => {
    const { keyword, level, enabled, page = 1, pageSize = 50 } = req.query;
    const p = toPositiveInt(page);
    const ps = toPositiveInt(pageSize);
    if (p === null || ps === null) {
      return sendError(res, 400, '分页参数无效');
    }
    const result = await store.listSensitiveWords({
      keyword,
      level,
      enabled: enabled !== undefined ? enabled === '1' || enabled === 'true' : undefined,
      page: p,
      pageSize: ps,
    });
    res.json(result);
  }),
);

// 新增敏感词
router.post(
  '/',
  wrap(async (req, res) => {
    const { word, level = 'block', category } = req.body || {};
    if (!isNonEmptyString(word)) {
      return sendError(res, 400, '敏感词不能为空');
    }
    if (!VALID_LEVELS.includes(level)) {
      return sendError(res, 400, `级别只能是 ${VALID_LEVELS.join(' / ')}`);
    }
    const cleanWord = word.trim();
    if (await store.findSensitiveWordByWord(cleanWord)) {
      return sendError(res, 409, '该敏感词已存在');
    }
    const created = await store.createSensitiveWord({
      word: cleanWord,
      level,
      category: category || null,
    });
    await getFilter().reload();
    res.status(201).json({ data: created });
  }),
);

// 更新敏感词
router.put(
  '/:id',
  wrap(async (req, res) => {
    const id = toPositiveInt(req.params.id);
    if (id === null) return sendError(res, 400, '无效的 ID');
    if (!(await store.getSensitiveWord(id))) {
      return sendError(res, 404, '敏感词不存在');
    }
    const { word, level, category, enabled } = req.body || {};
    const patch = {};
    if (word !== undefined) {
      if (!isNonEmptyString(word)) return sendError(res, 400, '敏感词不能为空');
      const clean = word.trim();
      const existing = await store.findSensitiveWordByWord(clean);
      if (existing && existing.id !== id) {
        return sendError(res, 409, '该敏感词已存在');
      }
      patch.word = clean;
    }
    if (level !== undefined) {
      if (!VALID_LEVELS.includes(level)) {
        return sendError(res, 400, `级别只能是 ${VALID_LEVELS.join(' / ')}`);
      }
      patch.level = level;
    }
    if (category !== undefined) patch.category = category;
    if (enabled !== undefined) patch.enabled = !!enabled;

    const updated = await store.updateSensitiveWord(id, patch);
    await getFilter().reload();
    res.json({ data: updated });
  }),
);

// 删除敏感词
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = toPositiveInt(req.params.id);
    if (id === null) return sendError(res, 400, '无效的 ID');
    if (!(await store.getSensitiveWord(id))) {
      return sendError(res, 404, '敏感词不存在');
    }
    await store.deleteSensitiveWord(id);
    await getFilter().reload();
    res.status(204).end();
  }),
);

// 重新加载词库
router.post(
  '/reload',
  wrap(async (req, res) => {
    await getFilter().reload();
    res.json({ ok: true });
  }),
);

// 测试文本（只返回命中结果，不拦截）
router.post(
  '/test',
  wrap(async (req, res) => {
    const { text } = req.body || {};
    if (typeof text !== 'string') {
      return sendError(res, 400, 'text 必须是字符串');
    }
    const hits = getFilter().getAllHits(text);
    res.json({
      data: {
        hasBlock: hits.some((h) => h.level === 'block'),
        hasWarn: hits.some((h) => h.level === 'warn'),
        hits,
      },
    });
  }),
);

// 查询敏感词命中记录
router.get(
  '/hits',
  wrap(async (req, res) => {
    const {
      targetType,
      targetId,
      matchedWord,
      level,
      startTime,
      endTime,
      page = 1,
      pageSize = 50,
    } = req.query;
    const p = toPositiveInt(page);
    const ps = toPositiveInt(pageSize);
    if (p === null || ps === null) {
      return sendError(res, 400, '分页参数无效');
    }
    const result = await store.listSensitiveHits({
      targetType,
      targetId,
      matchedWord,
      level,
      startTime,
      endTime,
      page: p,
      pageSize: ps,
    });
    res.json(result);
  }),
);

module.exports = router;
