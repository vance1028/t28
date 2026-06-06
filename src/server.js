'use strict';

const { createApp } = require('./app');
const { waitForDb } = require('./db');
const store = require('./data/store');
const { initSensitiveFilter } = require('./utils/sensitive-word');

const PORT = process.env.PORT || 4790;

async function main() {
  await waitForDb();

  // 当库为空时（例如本地非 docker 首次连库），自动写入种子数据。
  if (process.env.SEED_ON_START !== 'false') {
    const categories = await store.listCategories();
    if (categories.length === 0) {
      await store.seed();
      // eslint-disable-next-line no-console
      console.log('已写入种子数据');
    }
  }

  // 初始化敏感词过滤器
  await initSensitiveFilter();
  // eslint-disable-next-line no-console
  console.log('敏感词过滤器已初始化');

  const app = createApp();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`爱国主义教育宣传管理平台 API 已启动: http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('启动失败：', err);
  process.exit(1);
});
