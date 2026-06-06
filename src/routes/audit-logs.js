'use strict';

const express = require('express');
const { listAuditLogs } = require('../middleware/audit');
const { sendError, toPositiveInt } = require('../utils/http');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// 查询审计日志（多维检索）
router.get(
  '/',
  wrap(async (req, res) => {
    const {
      operatorId,
      action,
      targetType,
      targetId,
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

    const result = await listAuditLogs({
      operatorId,
      action,
      targetType,
      targetId,
      startTime,
      endTime,
      page: p,
      pageSize: ps,
    });
    res.json(result);
  }),
);

module.exports = router;
