'use strict';

const { pool } = require('../db');

const NOISE_CHARS = /[\s\u00A0\u3000\x00-\x1F\x7F!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?·！￥……（）——【】；‘’：“”、，。《》？~`\s]/g;

class AcNode {
  constructor() {
    this.children = new Map();
    this.fail = null;
    this.lengths = [];
    this.levels = [];
    this.words = [];
  }
}

class SensitiveWordFilter {
  constructor() {
    this.root = new AcNode();
    this.ready = false;
    this.wordMap = new Map();
  }

  removeNoise(text) {
    return text.replace(NOISE_CHARS, '');
  }

  addWord(word, level = 'block') {
    const clean = this.removeNoise(word);
    if (!clean) return;
    let node = this.root;
    for (const ch of clean) {
      if (!node.children.has(ch)) {
        node.children.set(ch, new AcNode());
      }
      node = node.children.get(ch);
    }
    if (!node.words.includes(clean)) {
      node.words.push(clean);
      node.lengths.push(clean.length);
      node.levels.push(level);
    }
    this.wordMap.set(clean, level);
  }

  buildFailLinks() {
    const queue = [];
    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }
    while (queue.length > 0) {
      const current = queue.shift();
      for (const [ch, child] of current.children) {
        let failNode = current.fail;
        while (failNode && !failNode.children.has(ch)) {
          failNode = failNode.fail;
        }
        child.fail = failNode ? failNode.children.get(ch) : this.root;
        if (child.fail.lengths.length > 0) {
          child.lengths.push(...child.fail.lengths);
          child.levels.push(...child.fail.levels);
          child.words.push(...child.fail.words);
        }
        queue.push(child);
      }
    }
    this.ready = true;
  }

  match(text) {
    const cleanText = this.removeNoise(text);
    const hits = [];
    if (!cleanText || !this.ready) return hits;

    let node = this.root;
    for (let i = 0; i < cleanText.length; i++) {
      const ch = cleanText[i];
      while (node !== this.root && !node.children.has(ch)) {
        node = node.fail;
      }
      node = node.children.get(ch) || this.root;

      if (node.lengths.length > 0) {
        for (let j = 0; j < node.lengths.length; j++) {
          const len = node.lengths[j];
          const level = node.levels[j];
          const word = node.words[j];
          const start = i - len + 1;
          hits.push({
            word,
            level,
            start: start < 0 ? 0 : start,
            end: i,
            matched: cleanText.slice(start < 0 ? 0 : start, i + 1),
            original: text,
          });
        }
      }
    }
    return hits;
  }

  hasBlockWord(text) {
    const hits = this.match(text);
    return hits.some((h) => h.level === 'block');
  }

  getAllHits(text) {
    return this.match(text);
  }

  async loadFromDb() {
    this.root = new AcNode();
    this.wordMap.clear();
    this.ready = false;
    const [rows] = await pool.query(
      'SELECT word, level FROM sensitive_words WHERE enabled = 1',
    );
    for (const row of rows) {
      this.addWord(row.word, row.level);
    }
    this.buildFailLinks();
  }

  async reload() {
    await this.loadFromDb();
  }
}

const filter = new SensitiveWordFilter();

async function initSensitiveFilter() {
  await filter.loadFromDb();
  return filter;
}

function getFilter() {
  return filter;
}

module.exports = { initSensitiveFilter, getFilter, SensitiveWordFilter };
