(function () {
  const dutyButton = document.querySelector('[data-action="duty"]');
  const dutyNote = document.querySelector('#duty-note');
  const dayButtons = Array.from(document.querySelectorAll('.day-button'));
  const filterButtons = Array.from(document.querySelectorAll('.filter-button'));
  const cards = Array.from(document.querySelectorAll('.desk-card'));
  const dayStatus = document.querySelector('[data-day-status]');

  if (dutyButton && dutyNote) {
    dutyButton.addEventListener('click', function () {
      const isHidden = dutyNote.hasAttribute('hidden');
      dutyNote.toggleAttribute('hidden', !isHidden);
      dutyButton.setAttribute('aria-expanded', String(isHidden));
      dutyButton.textContent = isHidden ? 'Close duty note' : 'Open duty note';
    });
  }

  dayButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      dayButtons.forEach(function (item) {
        const isSelected = item === button;
        item.classList.toggle('selected', isSelected);
        item.setAttribute('aria-pressed', String(isSelected));
      });
      if (dayStatus) dayStatus.textContent = button.dataset.day + ', September ' + button.querySelector('strong').textContent + ' selected';
    });
  });

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      const filter = button.dataset.filter;
      filterButtons.forEach(function (item) {
        const isSelected = item === button;
        item.classList.toggle('selected', isSelected);
        item.setAttribute('aria-pressed', String(isSelected));
      });
      cards.forEach(function (card) {
        card.hidden = filter !== 'all' && card.dataset.shift !== filter;
      });
    });
  });
}());
