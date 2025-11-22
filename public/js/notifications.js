import { elements } from './elements.js';
import { STATUS_VARIANTS } from './config.js';

let hideTimeout = /** @type {ReturnType<typeof setTimeout>|null} */ (null);

export function showMessage(message, type = 'info', { autoHide = false } = {}) {
  const statusEl = elements.status;
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove(...Object.values(STATUS_VARIANTS).map((variant) => variant.className));
  const variant = STATUS_VARIANTS[type] || STATUS_VARIANTS.info;
  statusEl.classList.add(variant.className);
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (autoHide) {
    hideTimeout = setTimeout(() => {
      statusEl.classList.remove(variant.className);
      statusEl.textContent = '';
      hideTimeout = null;
    }, 4000);
  }
}

export function showError(message, error) {
  if (error) {
    console.error(error);
  }
  showMessage(message, 'error');
}
