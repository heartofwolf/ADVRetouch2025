document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.before-after-wrapper').forEach(function(imageWrapper) {
    const handle = imageWrapper.querySelector('.handle');
    const beforeWrapper = imageWrapper.querySelector('.before-image-wrapper');
    if (!handle || !beforeWrapper) return;

    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    function getCoords(e) {
      let x;
      if (isTouch && e.touches && e.touches.length) {
        x = e.touches[0].clientX;
      } else {
        x = e.clientX;
      }
      return x;
    }

    function dragInit(e) {
      e.preventDefault();
      document.body.style.userSelect = "none";
      moveAt(e);

      if (isTouch) {
        document.ontouchmove = moveAt;
        document.ontouchend = stopDrag;
      } else {
        document.onmousemove = moveAt;
        document.onmouseup = stopDrag;
      }
    }

    function moveAt(e) {
      const x = getCoords(e);
      const rect = imageWrapper.getBoundingClientRect();
      let offset = x - rect.left;
      offset = Math.max(0, Math.min(offset, rect.width));
      beforeWrapper.style.width = offset + "px";
      handle.style.left = offset + "px";
    }

    function stopDrag() {
      document.body.style.userSelect = "";
      document.onmousemove = null;
      document.onmouseup = null;
      document.ontouchmove = null;
      document.ontouchend = null;
    }

    // Set initial position
    const rect = imageWrapper.getBoundingClientRect();
    const initial = rect.width / 2;
    beforeWrapper.style.width = initial + "px";
    handle.style.left = initial + "px";

    if (isTouch) {
      handle.ontouchstart = dragInit;
    } else {
      handle.onmousedown = dragInit;
    }
  });
});