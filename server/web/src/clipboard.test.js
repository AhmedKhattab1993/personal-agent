import assert from 'node:assert/strict';
import test from 'node:test';

import { copyTextToClipboard } from './clipboard.js';

function makeLegacyDocument({ copied = true } = {}) {
  const appended = [];
  const created = [];
  const body = {
    appendChild(element) {
      appended.push(element);
    },
    removeChild(element) {
      const index = appended.indexOf(element);
      if (index >= 0) appended.splice(index, 1);
    },
  };
  return {
    body,
    appended,
    created,
    createElement() {
      const element = {
        style: {},
        setAttribute() {},
        focus() {},
        select() {},
      };
      created.push(element);
      return element;
    },
    execCommand(command) {
      assert.equal(command, 'copy');
      return copied;
    },
  };
}

test('uses the Clipboard API when available', async () => {
  let copiedText = null;
  await copyTextToClipboard('proposal text', {
    clipboard: { writeText: async (text) => { copiedText = text; } },
  });
  assert.equal(copiedText, 'proposal text');
});

test('falls back to a user-gesture-compatible document copy', async () => {
  const documentObject = makeLegacyDocument();
  await copyTextToClipboard('proposal text', { clipboard: undefined, documentObject });
  assert.equal(documentObject.created[0].value, 'proposal text');
  assert.equal(documentObject.appended.length, 0);
});

test('falls back when the Clipboard API rejects', async () => {
  const documentObject = makeLegacyDocument();
  await copyTextToClipboard('proposal text', {
    clipboard: { writeText: async () => { throw new Error('Not allowed'); } },
    documentObject,
  });
  assert.equal(documentObject.created[0].value, 'proposal text');
  assert.equal(documentObject.appended.length, 0);
});

test('reports when neither clipboard path is available', async () => {
  await assert.rejects(
    copyTextToClipboard('proposal text', { clipboard: undefined, documentObject: undefined }),
    /Clipboard access is unavailable/
  );
});
