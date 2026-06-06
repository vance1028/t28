-- 容器首次初始化脚本（docker-entrypoint-initdb.d）
-- 内容 = schema.sql + seed.sql 合并，保证 `docker compose up` 后即有表和种子数据。

SET NAMES utf8mb4;

/* ======================================================================== */
/*  核心业务表（含软删除字段）                                               */
/* ======================================================================== */

CREATE TABLE IF NOT EXISTS categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  is_deleted  TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at  DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_categories_name (name, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS articles (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title        VARCHAR(200) NOT NULL,
  summary      VARCHAR(500) NOT NULL DEFAULT '',
  content      MEDIUMTEXT NOT NULL,
  category_id  INT UNSIGNED NOT NULL,
  author       VARCHAR(100) NOT NULL DEFAULT '',
  status       ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  tags         JSON NULL,
  views        INT UNSIGNED NOT NULL DEFAULT 0,
  published_at DATETIME(3) NULL,
  is_deleted   TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at   DATETIME(3) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_articles_category (category_id),
  KEY idx_articles_status (status),
  KEY idx_articles_is_deleted (is_deleted),
  CONSTRAINT fk_articles_category FOREIGN KEY (category_id)
    REFERENCES categories (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activities (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(200) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  location    VARCHAR(200) NOT NULL DEFAULT '',
  start_time  DATETIME(3) NOT NULL,
  end_time    DATETIME(3) NOT NULL,
  capacity    INT UNSIGNED NOT NULL DEFAULT 0,
  is_deleted  TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at  DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_activities_is_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registrations (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  activity_id INT UNSIGNED NOT NULL,
  name        VARCHAR(100) NOT NULL,
  department  VARCHAR(100) NOT NULL DEFAULT '',
  is_deleted  TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at  DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_reg_activity_name (activity_id, name, is_deleted),
  KEY idx_reg_activity (activity_id),
  CONSTRAINT fk_reg_activity FOREIGN KEY (activity_id)
    REFERENCES activities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ======================================================================== */
/*  审计日志表（只追加，不可篡改/删除，应用层保证）                            */
/* ======================================================================== */

CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  operator_id   VARCHAR(64) NULL COMMENT '操作人ID，未登录则为系统/匿名',
  operator_name VARCHAR(100) NULL COMMENT '操作人姓名/标识',
  action        VARCHAR(50) NOT NULL COMMENT '动作类型：create/update/delete/login/logout/status_change/permission/publish等',
  target_type   VARCHAR(50) NOT NULL COMMENT '目标对象类型：article/category/activity/registration/user等',
  target_id     VARCHAR(64) NULL COMMENT '目标对象ID',
  ip_address    VARCHAR(45) NULL COMMENT '请求来源IP（支持IPv6）',
  user_agent    VARCHAR(500) NULL COMMENT '请求UA',
  before_value  JSON NULL COMMENT '变更前关键内容快照',
  after_value   JSON NULL COMMENT '变更后关键内容快照',
  extra         JSON NULL COMMENT '扩展信息',
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_operator (operator_id),
  KEY idx_audit_action (action),
  KEY idx_audit_target (target_type, target_id),
  KEY idx_audit_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='审计日志表 - 只允许INSERT，禁止UPDATE/DELETE';

/* ======================================================================== */
/*  敏感词库                                                                 */
/* ======================================================================== */

CREATE TABLE IF NOT EXISTS sensitive_words (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  word        VARCHAR(200) NOT NULL COMMENT '敏感词',
  level       ENUM('block','warn') NOT NULL DEFAULT 'block' COMMENT 'block=禁用直接拦截，warn=提示待人工复核',
  category    VARCHAR(50) NULL COMMENT '分类：政治/色情/暴力等',
  enabled     TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_sensitive_word (word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sensitive_word_hits (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  target_type     VARCHAR(50) NOT NULL COMMENT '目标类型：article/activity等',
  target_id       VARCHAR(64) NOT NULL COMMENT '目标ID',
  field_name      VARCHAR(50) NULL COMMENT '命中字段：title/content等',
  matched_word    VARCHAR(200) NOT NULL COMMENT '匹配到的敏感词',
  level           ENUM('block','warn') NOT NULL COMMENT '敏感词级别',
  original_text   VARCHAR(500) NULL COMMENT '命中的原文片段',
  operator_id     VARCHAR(64) NULL,
  operator_name   VARCHAR(100) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_hit_target (target_type, target_id),
  KEY idx_hit_word (matched_word),
  KEY idx_hit_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='敏感词命中记录表';

/* ======================================================================== */
/*  种子数据                                                                 */
/* ======================================================================== */

INSERT INTO categories (id, name, description) VALUES
  (1, '红色历史', '党史、新中国史、改革开放史、社会主义发展史宣传'),
  (2, '时政要闻', '重要会议精神与时政热点解读'),
  (3, '英模人物', '时代楷模、道德模范、革命先烈事迹');

INSERT INTO articles (id, title, summary, content, category_id, author, status, tags, published_at) VALUES
  (1, '从一大到二十大：百年初心', '回顾党的重要历史节点', '中国共产党的百年历程是一部不懈奋斗史……', 1, '宣传部', 'published', JSON_ARRAY('党史', '初心使命'), CURRENT_TIMESTAMP(3)),
  (2, '学习贯彻最新会议精神', '深入解读会议核心要义', '会议强调，要坚定不移……', 2, '理论学习中心组', 'published', JSON_ARRAY('时政'), CURRENT_TIMESTAMP(3)),
  (3, '草稿：英雄事迹征集启事', '面向全单位征集身边的英模故事', '现面向全体职工征集……', 3, '编辑部', 'draft', JSON_ARRAY('征集'), NULL);

INSERT INTO activities (id, title, description, location, start_time, end_time, capacity) VALUES
  (1, '红色教育基地参观学习', '组织参观本地革命纪念馆，重温入党誓词', '市革命纪念馆', '2026-07-01 09:00:00.000', '2026-07-01 12:00:00.000', 50),
  (2, '爱国主义主题宣讲会', '邀请专家开展专题宣讲', '单位多功能厅', '2026-07-15 14:00:00.000', '2026-07-15 16:00:00.000', 2);

INSERT INTO sensitive_words (word, level, category) VALUES
  ('法轮功', 'block', '政治'),
  ('台独', 'block', '政治'),
  ('港独', 'block', '政治'),
  ('藏独', 'block', '政治'),
  ('邪教', 'block', '政治');
