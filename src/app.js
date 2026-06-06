'use strict';

const express = require('express');
const cors = require('cors');

const categoriesRouter = require('./routes/categories');
const articlesRouter = require('./routes/articles');
const activitiesRouter = require('./routes/activities');
const auditLogsRouter = require('./routes/audit-logs');
const sensitiveWordsRouter = require('./routes/sensitive-words');
const recycleBinRouter = require('./routes/recycle-bin');
const { createAuditMiddleware } = require('./middleware/audit');
const store = require('./data/store');
const { sendError } = require('./utils/http');

async function getBeforeValue(req, targetType) {
  const id = req.params.id;
  if (!id) return null;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return null;
  try {
    if (targetType === 'article') {
      const row = await store.getArticle(numId, { includeDeleted: true });
      return row ? { id: row.id, title: row.title, status: row.status, categoryId: row.categoryId, author: row.author } : null;
    }
    if (targetType === 'category') {
      const row = await store.getCategory(numId, { includeDeleted: true });
      return row ? { id: row.id, name: row.name, description: row.description } : null;
    }
    if (targetType === 'activity') {
      const row = await store.getActivity(numId, { includeDeleted: true });
      return row ? { id: row.id, title: row.title, location: row.location } : null;
    }
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * 创建 Express 应用实例。
 *
 * 注意：数据库连接与种子数据由调用方（server.js / 测试）负责准备，
 * 本函数只负责组装中间件与路由。
 *
 * @returns {import('express').Express}
 */
function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // 审计中间件（横切所有写操作，必须放在路由之前）
  app.use('/api', createAuditMiddleware(getBeforeValue));

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: '爱国主义教育宣传管理平台',
      time: new Date().toISOString(),
    });
  });

  app.use('/api/categories', categoriesRouter);
  app.use('/api/articles', articlesRouter);
  app.use('/api/activities', activitiesRouter);
  app.use('/api/audit-logs', auditLogsRouter);
  app.use('/api/sensitive-words', sensitiveWordsRouter);
  app.use('/api/recycle-bin', recycleBinRouter);

  // 404
  app.use((req, res) => {
    sendError(res, 404, '接口不存在');
  });

  // 统一错误处理（含 JSON 解析错误）
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return sendError(res, 400, '请求体不是合法的 JSON');
    }
    // eslint-disable-next-line no-console
    console.error(err);
    return sendError(res, 500, '服务器内部错误');
  });

  return app;
}

module.exports = { createApp };
