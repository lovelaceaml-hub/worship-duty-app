(function () {
  const dutyButton = document.querySelector('[data-action="duty"]');
  const dutyNote = document.querySelector('#duty-note');
  const dateButtons = Array.from(document.querySelectorAll('.date-button'));
  const dateStatus = document.querySelector('[data-date-status]');

  if (dutyButton && dutyNote) {
    dutyButton.addEventListener('click', function () {
      const isHidden = dutyNote.hasAttribute('hidden');
      dutyNote.toggleAttribute('hidden', !isHidden);
      dutyButton.setAttribute('aria-expanded', String(isHidden));
      dutyButton.textContent = isHidden ? 'Hide duty note' : 'Show duty note';
    });
  }

  dateButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      dateButtons.forEach(function (item) {
        const isSelected = item === button;
        item.classList.toggle('selected', isSelected);
        item.setAttribute('aria-pressed', String(isSelected));
      });
      if (dateStatus) dateStatus.textContent = 'Showing ' + button.dataset.date;
    });
  });
}());
