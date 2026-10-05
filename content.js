'use strict';
// Page-local details keep the earlier A and B prototypes unchanged.
(() => {
  const dialog = document.querySelector('#detail');
  const content = document.querySelector('#detail-content');
  if (!dialog || !content) return;
  let previousFocus;
  document.querySelectorAll('[data-dialog]').forEach(button => {
    button.addEventListener('click', () => {
      const template = document.getElementById(`detail-${button.dataset.dialog}`);
      if (!(template instanceof HTMLTemplateElement)) return;
      previousFocus = button;
      content.replaceChildren(template.content.cloneNode(true));
      dialog.showModal();
      dialog.scrollTop = 0;
    });
  });
  dialog.querySelector('.close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => previousFocus?.focus({preventScroll:true}));
  document.querySelectorAll('img').forEach(img => {
    const showFallback = () => {
      if (img.hidden) return;
      img.hidden = true;
      const note = document.createElement('p');
      note.className = 'image-notice';
      note.textContent = img.dataset.unavailableMessage || 'Prototype image unavailable. Read the project overview for details.';
      img.after(note);
    };
    img.addEventListener('error', showFallback);
    if (img.complete && img.naturalWidth === 0) showFallback();
  });
})();
