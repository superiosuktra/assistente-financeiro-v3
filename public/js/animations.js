(() => {
  'use strict';

  function animateValue(element, startValue, endValue, duration = 600) {
    if (!element) return;

    let startTimestamp = null;
    let isMoney = element.id.includes('Saldo') || element.id.includes('gasto') || element.id.includes('Dica');

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const value = startValue + (endValue - startValue) * easedProgress;

      if (isMoney) {
        element.textContent = money(value);
      } else if (element.id.includes('Pendentes')) {
        element.textContent = Math.round(value);
      } else {
        element.textContent = value.toFixed(2);
      }

      if (progress === 0) {
        element.classList.add('pulse');
        setTimeout(() => element.classList.remove('pulse'), 400);
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }

  function animateElementIn(element) {
    element.style.animation = 'slideInUp 0.4s ease-out';
  }

  function animateElementOut(element, callback) {
    element.style.animation = 'slideOutDown 0.4s ease-in';
    setTimeout(() => {
      element.remove();
      if (callback) callback();
    }, 400);
  }

  function shake(element) {
    element.classList.add('shake');
    setTimeout(() => element.classList.remove('shake'), 500);
  }

  function flipBadge(element) {
    element.classList.add('flip');
    setTimeout(() => element.classList.remove('flip'), 600);
  }

  function bounce(element) {
    element.classList.add('bounce');
    setTimeout(() => element.classList.remove('bounce'), 600);
  }

  window.animateValue = animateValue;
  window.animateElementIn = animateElementIn;
  window.animateElementOut = animateElementOut;
  window.shake = shake;
  window.flipBadge = flipBadge;
  window.bounce = bounce;
})();