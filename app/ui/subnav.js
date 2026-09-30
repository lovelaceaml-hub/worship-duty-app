/* On phones, a screen's section menu (Manage sections, Presider sections)
   also appears as one scrolling row right under the header. Each copy button
   presses its original, so labels, order and permissions always match. */

let row = null;

function source() {
  const view = document.getElementById('view');
  return view && view.querySelector('[data-subnav]');
}

export function syncSubnav() {
  const original = source();
  const anchor = document.getElementById('banners');
  if (!original || !anchor) {
    if (row) row.hidden = true;
    delete document.documentElement.dataset.subnav;
    return;
  }
  if (!row) {
    row = document.createElement('nav');
    row.className = 'subnav-top scroll-x';
    row.addEventListener('click', event => {
      const copy = event.target.closest('button[data-index]');
      const live = copy && source();
      const button = live && live.querySelectorAll('button')[Number(copy.dataset.index)];
      if (button) button.click();
    });
  }
  if (row.nextElementSibling !== anchor) anchor.parentNode.insertBefore(row, anchor);
  row.hidden = false;
  row.setAttribute('aria-label', original.getAttribute('aria-label') || 'Sections');
  document.documentElement.dataset.subnav = 'on';
  const buttons = Array.from(original.querySelectorAll('button'));
  const signature = buttons.map(button => button.textContent.trim() + (button.classList.contains('is-active') ? '*' : '')).join('|');
  if (row.dataset.signature === signature) return;
  row.dataset.signature = signature;
  const keep = row.scrollLeft;
  row.textContent = '';
  let active = null;
  buttons.forEach((button, index) => {
    const copy = document.createElement('button');
    copy.type = 'button';
    button.childNodes.forEach(node => copy.appendChild(node.cloneNode(true)));
    copy.dataset.index = String(index);
    if (button.classList.contains('is-active')) {
      copy.classList.add('is-active');
      copy.setAttribute('aria-current', 'page');
      active = copy;
    }
    row.appendChild(copy);
  });
  row.scrollLeft = keep;
  if (active) {
    const box = row.getBoundingClientRect(), item = active.getBoundingClientRect();
    if (item.left < box.left || item.right > box.right) row.scrollLeft += item.left - box.left - (box.width - item.width) / 2;
  }
}
