'use strict';

const { pool } = require('../db');

const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

const TARGET_TYPE_MAP = {
  'api/categories': 'category',
  'api/articles': 'article',
  'api/activities': 'activity',
  'api/registrations': 'registration',
  'api/recycle-bin': 'recycle_bin',
};

function parseTarget(req) {
  const parts = req.path.split('/').filter(Boolean);
  if (parts.length < 2) return { targetType: 'unknown', targetId: null };
  const base = parts.slice(0, 2).join('/');
  const targetType = TARGET_TYPE_MAP[base] || 'unknown';
  let targetId = null;
  if (parts.length >= 3 && /^\d+$/.test(parts[2])) {
    targetId = parts[2];
  }
  return { targetType, targetId };
}

function determineAction(req, targetType) {
  const method = req.method;
  const path = req.path;
  if (method === 'POST') {
    if (path.includes('/registrations')) return 'create_registration';
    if (path.includes('/recycle-bin/restore')) return 'restore';
    if (path.includes('/recycle-bin/purge')) return 'purge';
    if (path.includes('/recycle-bin')) return 'recycle_bin_operation';
    return 'create';
  }
  if (method === 'PUT') return 'update';
  if (method === 'DELETE') return 'delete';
  if (method === 'PATCH') return 'partial_update';
  return 'unknown';
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

function getOperatorInfo(req) {
  return {
    operatorId: req.headers['x-operator-id'] || null,
    operatorName: req.headers['x-operator-name'] || null,
  };
}

function snapshotKeyFields(targetType, data) {
  if (!data) return null;
  const keys = {
    article: ['id', 'title', 'status', 'categoryId', 'author'],
    category: ['id', 'name', 'description'],
    activity: ['id', 'title', 'location', 'startTime', 'endTime', 'capacity'],
    registration: ['id', 'activityId', 'name', 'department'],
  };
  const fields = keys[targetType] || ['id'];
  const snap = {};
  for (const f of fields) {
    if (data[f] !== undefined) snap[f] = data[f];
  }
  return Object.keys(snap).length > 0 ? snap : null;
}

async function writeAuditLog(entry) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
       (operator_id, operator_name, action, target_type, target_id, ip_address, user_agent, before_value, after_value, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.operatorId,
        entry.operatorName,
        entry.action,
        entry.targetType,
        entry.targetId,
        entry.ipAddress,
        entry.userAgent,
        entry.beforeValue ? JSON.stringify(entry.beforeValue) : null,
        entry.afterValue ? JSON.stringify(entry.afterValue) : null,
        entry.extra ? JSON.stringify(entry.extra) : null,
      ],
    );
  } catch (err) {
    console.error('写入审计日志失败:', err);
  }
}

function createAuditMiddleware(getBeforeValue) {
  return async (req, res, next) => {
    if (!WRITE_METHODS.has(req.method)) return next();

    const { targetType, targetId: initialTargetId } = parseTarget(req);
    const action = determineAction(req, targetType);
    const { operatorId, operatorName } = getOperatorInfo(req);
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;

    let beforeValue = null;
    try {
      if (getBeforeValue) {
        beforeValue = await getBeforeValue(req, targetType);
      }
    } catch (e) {
      console.error('获取 beforeValue 失败:', e);
    }

    const originalJson = res.json.bind(res);
    let afterValue = null;
    let finalTargetId = initialTargetId;
    let finalAction = action;

    res.json = function (body) {
      try {
        if (body && body.data) {
          afterValue = snapshotKeyFields(targetType, body.data);
          if (body.data.id && !finalTargetId) {
            finalTargetId = String(body.data.id);
          }
        }
        if (body && body.error) {
          finalAction = `${action}_failed`;
        }
      } catch (e) {
        // ignore
      }
      return originalJson(body);
    };

    const originalEnd = res.end.bind(res);
    res.end = function (...args) {
      setImmediate(async () => {
        try {
          await writeAuditLog({
            operatorId,
            operatorName,
            action: finalAction,
            targetType,
            targetId: finalTargetId,
            ipAddress,
            userAgent,
            beforeValue,
            afterValue,
            extra: {
              method: req.method,
              path: req.path,
              statusCode: res.statusCode,
              query: req.query,
            },
          });
        } catch (e) {
          console.error('审计日志写入失败:', e);
        }
      });
      return originalEnd(...args);
    };

    next();
  };
}

async function listAuditLogs({
  operatorId,
  action,
  targetType,
  targetId,
  startTime,
  endTime,
  page = 1,
  pageSize = 50,
} = {}) {
  const where = [];
  const params = [];
  if (operatorId) {
    where.push('operator_id = ?');
    params.push(operatorId);
  }
  if (action) {
    where.push('action = ?');
    params.push(action);
  }
  if (targetType) {
    where.push('target_type = ?');
    params.push(targetType);
  }
  if (targetId) {
    where.push('target_id = ?');
    params.push(targetId);
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
    `SELECT COUNT(*) AS total FROM audit_logs ${clause}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT * FROM audit_logs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), offset],
  );
  return {
    data: rows.map((row) => ({
      id: row.id,
      operatorId: row.operator_id,
      operatorName: row.operator_name,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      ipAddress: row.ip_address,
      beforeValue: row.before_value ? JSON.parse(row.before_value) : null,
      afterValue: row.after_value ? JSON.parse(row.after_value) : null,
      extra: row.extra ? JSON.parse(row.extra) : null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    })),
    total: countRows[0].total,
    page,
    pageSize,
  };
}

module.exports = { createAuditMiddleware, listAuditLogs, writeAuditLog };
