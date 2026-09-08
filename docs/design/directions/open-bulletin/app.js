(function () {
  const dutyButton = document.querySelector('[data-action="duty"]');
  const dutyNote = document.querySelector('#duty-note');

  if (dutyButton && dutyNote) {
    dutyButton.addEventListener('click', function () {
      const isHidden = dutyNote.hasAttribute('hidden');
      dutyNote.toggleAttribute('hidden', !isHidden);
      dutyButton.setAttribute('aria-expanded', String(isHidden));
      dutyButton.textContent = isHidden ? 'Hide duty note' : 'Show duty note';
    });
  }
}());
