'use strict';

const express = require('express');
const store = require('../data/store');
const { sendError, toPositiveInt, isNonEmptyString } = require('../utils/http');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_TYPES = ['article', 'category', 'activity'];

// 查看回收站内容
router.get(
  '/',
  wrap(async (req, res) => {
    const { targetType, page = 1, pageSize = 50 } = req.query;
    const p = toPositiveInt(page);
    const ps = toPositiveInt(pageSize);
    if (p === null || ps === null) {
      return sendError(res, 400, '分页参数无效');
    }
    if (targetType && !VALID_TYPES.includes(targetType)) {
      return sendError(res, 400, `targetType 只能是 ${VALID_TYPES.join(' / ')}`);
    }
    const data = await store.listRecycleBin({
      targetType,
      page: p,
      pageSize: ps,
    });
    res.json({ data, retentionDays: store.RETENTION_DAYS });
  }),
);

// 恢复数据
router.post(
  '/:targetType/:id/restore',
  wrap(async (req, res) => {
    const { targetType, id } = req.params;
    const targetId = toPositiveInt(id);
    if (targetId === null) return sendError(res, 400, '无效的 ID');
    if (!VALID_TYPES.includes(targetType)) {
      return sendError(res, 400, `targetType 只能是 ${VALID_TYPES.join(' / ')}`);
    }
    const restored = await store.restoreFromRecycleBin(targetType, targetId);
    if (!restored) {
      return sendError(res, 404, '数据不存在或未处于回收站中');
    }
    res.json({ ok: true });
  }),
);

// 彻底清除（只允许清除已在回收站中的数据）
router.delete(
  '/:targetType/:id/purge',
  wrap(async (req, res) => {
    const { targetType, id } = req.params;
    const targetId = toPositiveInt(id);
    if (targetId === null) return sendError(res, 400, '无效的 ID');
    if (!VALID_TYPES.includes(targetType)) {
      return sendError(res, 400, `targetType 只能是 ${VALID_TYPES.join(' / ')}`);
    }
    const purged = await store.purgeFromRecycleBin(targetType, targetId);
    if (!purged) {
      return sendError(res, 404, '数据不存在或未处于回收站中，无法彻底清除');
    }
    res.status(204).end();
  }),
);

// 清除所有超过留存期的数据
router.post(
  '/purge-expired',
  wrap(async (req, res) => {
    const count = await store.purgeExpired();
    res.json({ data: { purgedCount: count, retentionDays: store.RETENTION_DAYS } });
  }),
);

module.exports = router;
