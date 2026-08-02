const CLIPBOARD_UNAVAILABLE_MESSAGE = 'Clipboard access is unavailable. Select the proposal text and copy it manually.';

function removeTemporaryElement(documentObject, element) {
  if (typeof element.remove === 'function') {
    element.remove();
  } else {
    documentObject.body.removeChild(element);
  }
}

export async function copyTextToClipboard(text, {
  clipboard = globalThis.navigator?.clipboard,
  documentObject = globalThis.document,
} = {}) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Nothing to copy.');
  }

  if (typeof clipboard?.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // The Clipboard API requires a secure context in many browsers. Try the
      // user-gesture-compatible legacy path before reporting a failure.
    }
  }

  if (
    !documentObject?.body
    || typeof documentObject.createElement !== 'function'
    || typeof documentObject.execCommand !== 'function'
  ) {
    throw new Error(CLIPBOARD_UNAVAILABLE_MESSAGE);
  }

  const textarea = documentObject.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  documentObject.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    if (!documentObject.execCommand('copy')) {
      throw new Error(CLIPBOARD_UNAVAILABLE_MESSAGE);
    }
  } finally {
    removeTemporaryElement(documentObject, textarea);
  }
}
