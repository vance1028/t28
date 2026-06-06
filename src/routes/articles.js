'use strict';

const express = require('express');
const store = require('../data/store');
const { getFilter } = require('../utils/sensitive-word');
const { sendError, isNonEmptyString, toPositiveInt } = require('../utils/http');

const router = express.Router();

const VALID_STATUS = ['draft', 'published', 'archived'];

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function reviewContent({ title, content, summary }, targetId, req) {
  const filter = getFilter();
  const allHits = [];
  const fields = { title, content, summary };
  for (const [fieldName, text] of Object.entries(fields)) {
    if (typeof text !== 'string' || !text) continue;
    const hits = filter.getAllHits(text);
    for (const hit of hits) {
      allHits.push({ ...hit, fieldName });
    }
  }
  if (allHits.length === 0) return { passed: true, hits: [] };

  const operatorId = req.headers['x-operator-id'] || null;
  const operatorName = req.headers['x-operator-name'] || null;
  for (const hit of allHits) {
    await store.recordSensitiveHit({
      targetType: 'article',
      targetId: targetId || 'new',
      fieldName: hit.fieldName,
      matchedWord: hit.word,
      level: hit.level,
      originalText: hit.matched,
      operatorId,
      operatorName,
    });
  }

  const blockHits = allHits.filter((h) => h.level === 'block');
  if (blockHits.length > 0) {
    return {
      passed: false,
      reason: '内容包含禁用敏感词',
      blockWords: blockHits.map((h) => h.word),
      warnWords: allHits.filter((h) => h.level === 'warn').map((h) => h.word),
      hits: allHits,
    };
  }
  return {
    passed: true,
    warnWords: allHits.filter((h) => h.level === 'warn').map((h) => h.word),
    hits: allHits,
  };
}

// 列出宣传文章，支持按分类、状态、关键词筛选
router.get(
  '/',
  wrap(async (req, res) => {
    const { categoryId, status, keyword } = req.query;
    const filters = {};

    if (categoryId !== undefined) {
      const cid = toPositiveInt(categoryId);
      if (cid === null) return sendError(res, 400, '无效的分类 ID');
      filters.categoryId = cid;
    }
    if (status !== undefined) {
      if (!VALID_STATUS.includes(status)) {
        return sendError(res, 400, `状态只能是 ${VALID_STATUS.join(' / ')}`);
      }
      filters.status = status;
    }
    if (isNonEmptyString(keyword)) {
      filters.keyword = keyword.trim();
    }

    const list = await store.listArticles(filters);
    res.json({ data: list, total: list.length });
  }),
);

// 获取单篇文章（同时累加浏览量）
router.get(
  '/:id',
  wrap(async (req, res) => {
    const id = toPositiveInt(req.params.id);
    if (id === null) return sendError(res, 400, '无效的文章 ID');
    const article = await store.getArticle(id);
    if (!article) return sendError(res, 404, '文章不存在');
    const updated = await store.incrementArticleViews(id);
    res.json({ data: updated });
  }),
);

// 新建宣传文章
router.post(
  '/',
  wrap(async (req, res) => {
    const { title, summary, content, categoryId, author, status, tags } = req.body || {};

    if (!isNonEmptyString(title)) {
      return sendError(res, 400, '文章标题不能为空');
    }
    const cid = toPositiveInt(categoryId);
    if (cid === null) {
      return sendError(res, 400, '必须指定有效的分类 ID');
    }
    if (!(await store.getCategory(cid))) {
      return sendError(res, 400, '指定的分类不存在');
    }
    if (status !== undefined && !VALID_STATUS.includes(status)) {
      return sendError(res, 400, `状态只能是 ${VALID_STATUS.join(' / ')}`);
    }
    if (tags !== undefined && !Array.isArray(tags)) {
      return sendError(res, 400, 'tags 必须是数组');
    }

    const reviewResult = await reviewContent(
      {
        title: title.trim(),
        summary: typeof summary === 'string' ? summary : '',
        content: typeof content === 'string' ? content : '',
      },
      null,
      req,
    );
    if (!reviewResult.passed) {
      return sendError(res, 403, reviewResult.reason, {
        blockWords: reviewResult.blockWords,
        warnWords: reviewResult.warnWords,
      });
    }

    const article = await store.createArticle({
      title: title.trim(),
      summary: typeof summary === 'string' ? summary : '',
      content: typeof content === 'string' ? content : '',
      categoryId: cid,
      author: typeof author === 'string' ? author : '',
      status: status || 'draft',
      tags: tags || [],
    });
    res.status(201).json({
      data: article,
      review: reviewResult.warnWords && reviewResult.warnWords.length > 0
        ? { warnWords: reviewResult.warnWords }
        : undefined,
    });
  }),
);

// 更新文章
router.put(
  '/:id',
  wrap(async (req, res) => {
    const id = toPositiveInt(req.params.id);
    if (id === null) return sendError(res, 400, '无效的文章 ID');
    const existing = await store.getArticle(id);
    if (!existing) return sendError(res, 404, '文章不存在');

    const { title, summary, content, categoryId, author, status, tags } = req.body || {};
    const patch = {};

    if (title !== undefined) {
      if (!isNonEmptyString(title)) return sendError(res, 400, '文章标题不能为空');
      patch.title = title.trim();
    }
    if (summary !== undefined) patch.summary = summary;
    if (content !== undefined) patch.content = content;
    if (author !== undefined) patch.author = author;
    if (categoryId !== undefined) {
      const cid = toPositiveInt(categoryId);
      if (cid === null || !(await store.getCategory(cid))) {
        return sendError(res, 400, '指定的分类不存在');
      }
      patch.categoryId = cid;
    }
    if (status !== undefined) {
      if (!VALID_STATUS.includes(status)) {
        return sendError(res, 400, `状态只能是 ${VALID_STATUS.join(' / ')}`);
      }
      patch.status = status;
    }
    if (tags !== undefined) {
      if (!Array.isArray(tags)) return sendError(res, 400, 'tags 必须是数组');
      patch.tags = tags;
    }

    const reviewTitle = patch.title !== undefined ? patch.title : existing.title;
    const reviewSummary = patch.summary !== undefined ? patch.summary : existing.summary;
    const reviewContent = patch.content !== undefined ? patch.content : existing.content;

    const reviewResult = await reviewContent(
      { title: reviewTitle, summary: reviewSummary, content: reviewContent },
      String(id),
      req,
    );
    if (!reviewResult.passed) {
      return sendError(res, 403, reviewResult.reason, {
        blockWords: reviewResult.blockWords,
        warnWords: reviewResult.warnWords,
      });
    }

    const updated = await store.updateArticle(id, patch);
    res.json({
      data: updated,
      review: reviewResult.warnWords && reviewResult.warnWords.length > 0
        ? { warnWords: reviewResult.warnWords }
        : undefined,
    });
  }),
);

// 删除文章
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = toPositiveInt(req.params.id);
    if (id === null) return sendError(res, 400, '无效的文章 ID');
    if (!(await store.getArticle(id))) return sendError(res, 404, '文章不存在');
    await store.deleteArticle(id);
    res.status(204).end();
  }),
);

module.exports = router;
