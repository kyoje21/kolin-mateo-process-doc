/* ══════════════════════════════════════════════════
   script.js — Kolin & Mateo Process Document
   Gallery scroll logic + Lightbox system
   ══════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", function () {

  /* ────────────────────────────────────────────────
     1. SCROLL-DRIVEN CIRCULAR GALLERY
     ──────────────────────────────────────────────── */

  const runway    = document.querySelector(".gallery-scroll-runway");
  const circles   = Array.from(document.querySelectorAll(".gallery-circle"));
  const details   = Array.from(document.querySelectorAll(".gallery-detail"));
  const counterEl = document.querySelector(".gallery-counter-current");
  const prevBtn   = document.querySelector(".gallery-prev");
  const nextBtn   = document.querySelector(".gallery-next");

  // Only initialise gallery logic if the gallery exists on this page
  if (runway && circles.length) {
    const ITEM_COUNT = circles.length;

    // ── State ──
    let activeIndex   = 0;   // Currently highlighted circle
    let scrollLocked  = false; // True when a manual click overrides scroll
    let lockTimeout   = null;
    let cumulativeRotation = 0; // Running rotation angle for circles
    let lastScrollY   = window.scrollY;

    // Read the spin speed from CSS custom property (default 0.15 deg/px)
    const rootStyles = getComputedStyle(document.documentElement);
    const SPIN_SPEED = parseFloat(rootStyles.getPropertyValue("--spin-speed")) || 0.15;

    /* ── setActive ──
       Updates the active circle, info panel, and counter.
       Called by both scroll handler and click/button handlers. */
    function setActive(index) {
      // Clamp to valid range
      index = Math.max(0, Math.min(ITEM_COUNT - 1, index));
      if (index === activeIndex) return;
      activeIndex = index;

      // Update circle classes
      circles.forEach(function (circle, i) {
        circle.classList.toggle("is-active", i === activeIndex);
      });

      // Update detail panels
      details.forEach(function (detail, i) {
        detail.classList.toggle("is-visible", i === activeIndex);
      });

      // Update counter "01 / 05"
      if (counterEl) {
        counterEl.textContent = String(activeIndex + 1).padStart(2, "0");
      }
    }

    /* ── Scroll-based index calculation ──
       Divides the runway scroll range into equal segments,
       one per item, and picks the active index from scroll progress. */
    function getScrollIndex() {
      var rect = runway.getBoundingClientRect();
      // How far the top of the runway has scrolled past the viewport top
      var scrolled = -rect.top;
      // Total scrollable distance within the runway
      var total = runway.offsetHeight - window.innerHeight;
      // Progress 0 → 1
      var progress = Math.max(0, Math.min(1, scrolled / total));
      // Map to item index
      return Math.min(ITEM_COUNT - 1, Math.floor(progress * ITEM_COUNT));
    }

    /* ── Rotation handler ──
       Applies a subtle CSS rotation to every circle image based on
       cumulative scroll distance.  The direction reverses automatically
       because deltaY can be positive or negative. */
    function updateRotation() {
      var deltaY = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      cumulativeRotation += deltaY * SPIN_SPEED;

      circles.forEach(function (circle, i) {
        var img = circle.querySelector("img");
        if (!img) return;
        // Alternate direction for visual variety
        var dir = i % 2 === 0 ? 1 : -1;
        img.style.transform = "rotate(" + (cumulativeRotation * dir) + "deg)";
      });
    }

    /* ── Scroll listener (passive + rAF-throttled) ──
       Calculates the active index from runway scroll position
       and applies rotation to circle images. */
    var ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(function () {
        // Only update from scroll if not temporarily locked by a click
        if (!scrollLocked) {
          var idx = getScrollIndex();
          setActive(idx);
        }
        updateRotation();
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });

    /* ── Click on a circle ──
       If the circle is already active, navigate to its artifact page.
       Otherwise, make it active and lock scroll updates briefly. */
    circles.forEach(function (circle) {
      circle.addEventListener("click", function () {
        var idx = parseInt(circle.dataset.index, 10);

        if (idx === activeIndex) {
          // Already active — follow the link from the matching detail panel
          var detail = details[idx];
          if (detail) {
            var link = detail.querySelector("a[href]");
            if (link) {
              window.location.href = link.href;
              return;
            }
          }
        }

        setActive(idx);

        // Lock scroll-based updates briefly so the click doesn't get overridden
        scrollLocked = true;
        clearTimeout(lockTimeout);
        lockTimeout = setTimeout(function () {
          scrollLocked = false;
        }, 800);
      });
    });

    /* ── Prev / Next buttons ── */
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        var newIdx = (activeIndex - 1 + ITEM_COUNT) % ITEM_COUNT;
        setActive(newIdx);
        scrollLocked = true;
        clearTimeout(lockTimeout);
        lockTimeout = setTimeout(function () { scrollLocked = false; }, 800);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        var newIdx = (activeIndex + 1) % ITEM_COUNT;
        setActive(newIdx);
        scrollLocked = true;
        clearTimeout(lockTimeout);
        lockTimeout = setTimeout(function () { scrollLocked = false; }, 800);
      });
    }

    /* ── Keyboard arrow support when gallery is in view ── */
    document.addEventListener("keydown", function (e) {
      // Only respond if the gallery section is roughly in view
      var rect = runway.getBoundingClientRect();
      var inView = rect.top < window.innerHeight && rect.bottom > 0;
      if (!inView) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextBtn && nextBtn.click();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        prevBtn && prevBtn.click();
      }
    });

    // Fire once on load so the correct initial state is set
    onScroll();
  }


  /* ────────────────────────────────────────────────
     2. IMAGE MODAL / LIGHTBOX WITH ZOOM & PAN
     ──────────────────────────────────────────────── */

  var modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML =
    '<button class="modal-close" aria-label="Close modal">&times;</button>' +
    '<div class="modal-image-wrapper">' +
      '<img src="" alt="" />' +
    '</div>' +
    '<p class="modal-caption"></p>';
  document.body.appendChild(modal);

  var modalImg     = modal.querySelector(".modal-image-wrapper img");
  var modalCaption = modal.querySelector(".modal-caption");
  var modalWrapper = modal.querySelector(".modal-image-wrapper");
  var closeBtn     = modal.querySelector(".modal-close");

  // ── Zoom & Pan State ──
  var zoomScale  = 1;
  var panX       = 0;
  var panY       = 0;
  var isDragging = false;
  var dragStartX = 0;
  var dragStartY = 0;
  var panStartX  = 0;
  var panStartY  = 0;
  var MIN_ZOOM   = 1;
  var MAX_ZOOM   = 5;

  function applyTransform() {
    modalImg.style.transform =
      "translate(" + panX + "px, " + panY + "px) scale(" + zoomScale + ")";
  }

  function resetZoomPan() {
    zoomScale = 1;
    panX = 0;
    panY = 0;
    isDragging = false;
    modalImg.classList.remove("is-zoomed", "is-dragging");
    applyTransform();
  }

  // ── Open modal on clickable-image click ──
  document.addEventListener("click", function (e) {
    var img = e.target.closest(".clickable-image");
    if (!img) return;
    // Ignore clicks on the modal image itself
    if (modal.contains(img)) return;

    var caption = img.getAttribute("data-caption") || img.alt || "";
    modalImg.src = img.src;
    modalImg.alt = img.alt || "";
    modalCaption.textContent = caption;
    resetZoomPan();
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  });

  // ── Close helpers ──
  function closeModal() {
    modal.classList.remove("active");
    document.body.style.overflow = "";
    resetZoomPan();
  }

  closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", function (e) {
    // Close when clicking the overlay background or the wrapper around the image
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      closeModal();
    }
  });

  // ── Zoom via scroll wheel ──
  modalWrapper.addEventListener("wheel", function (e) {
    e.preventDefault();
    var zoomDelta = e.deltaY > 0 ? -0.15 : 0.15;
    var newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomScale + zoomDelta));

    // Reset pan when zooming back to 1×
    if (newScale <= MIN_ZOOM) {
      newScale = MIN_ZOOM;
      panX = 0;
      panY = 0;
    }

    zoomScale = newScale;
    modalImg.classList.toggle("is-zoomed", zoomScale > 1);
    applyTransform();
  }, { passive: false });

  // ── Pan via click + drag (only when zoomed) ──
  modalImg.addEventListener("mousedown", function (e) {
    if (zoomScale <= 1) return;
    e.preventDefault();
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
    modalImg.classList.add("is-dragging");
  });

  window.addEventListener("mousemove", function (e) {
    if (!isDragging) return;
    panX = panStartX + (e.clientX - dragStartX);
    panY = panStartY + (e.clientY - dragStartY);
    applyTransform();
  });

  window.addEventListener("mouseup", function () {
    if (!isDragging) return;
    isDragging = false;
    modalImg.classList.remove("is-dragging");
  });

  // ── Touch support for mobile zoom & pan ──
  var lastTouchDist = 0;
  var touchStartX   = 0;
  var touchStartY   = 0;
  var touchPanStartX = 0;
  var touchPanStartY = 0;

  modalWrapper.addEventListener("touchstart", function (e) {
    if (e.touches.length === 2) {
      // Pinch start
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    } else if (e.touches.length === 1 && zoomScale > 1) {
      // Single-finger pan start
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchPanStartX = panX;
      touchPanStartY = panY;
    }
  }, { passive: true });

  modalWrapper.addEventListener("touchmove", function (e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      var dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      var delta = (dist - lastTouchDist) * 0.01;
      zoomScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomScale + delta));
      if (zoomScale <= MIN_ZOOM) { panX = 0; panY = 0; }
      lastTouchDist = dist;
      modalImg.classList.toggle("is-zoomed", zoomScale > 1);
      applyTransform();
    } else if (e.touches.length === 1 && zoomScale > 1) {
      e.preventDefault();
      panX = touchPanStartX + (e.touches[0].clientX - touchStartX);
      panY = touchPanStartY + (e.touches[0].clientY - touchStartY);
      applyTransform();
    }
  }, { passive: false });


  /* ────────────────────────────────────────────────
     3. SIDEBAR SCROLL-SPY
     ──────────────────────────────────────────────── */

  var sidebarLinks = document.querySelectorAll(".sidebar-nav a[href^='#']");

  if (sidebarLinks.length) {
    var sections = [];

    sidebarLinks.forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      var el = document.getElementById(id);
      if (el) sections.push({ id: id, el: el, link: link });
    });

    function updateActiveLink() {
      var scrollY = window.scrollY + 120; // offset for comfortable trigger
      var current = null;

      for (var i = sections.length - 1; i >= 0; i--) {
        if (sections[i].el.offsetTop <= scrollY) {
          current = sections[i];
          break;
        }
      }

      sidebarLinks.forEach(function (l) { l.classList.remove("active"); });
      if (current) current.link.classList.add("active");
    }

    window.addEventListener("scroll", updateActiveLink, { passive: true });
    updateActiveLink();
  }


  /* ────────────────────────────────────────────────
     4. TOP NAV SCROLL-SPY (homepage)
     ──────────────────────────────────────────────── */

  var topNavLinks = document.querySelectorAll(".site-nav a[href^='#']");

  if (topNavLinks.length) {
    var topSections = [];

    topNavLinks.forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      var el = document.getElementById(id);
      if (el) topSections.push({ id: id, el: el, link: link });
    });

    function updateTopNavActive() {
      var scrollY = window.scrollY + 150;
      var current = null;

      for (var i = topSections.length - 1; i >= 0; i--) {
        if (topSections[i].el.offsetTop <= scrollY) {
          current = topSections[i];
          break;
        }
      }

      topNavLinks.forEach(function (l) { l.classList.remove("active"); });
      if (current) current.link.classList.add("active");
    }

    window.addEventListener("scroll", updateTopNavActive, { passive: true });
    updateTopNavActive();
  }

});
