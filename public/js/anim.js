/* BDCraft animations - loaded on every page. */
(function () {
  "use strict";

  // Respect users who asked for reduced motion.
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    revealAll();
    return;
  }

  // 1) Floating particles rising through the hero.
  var host = document.getElementById("hero-particles");
  if (host) {
    var colors = ["#3fd66f", "#f5c542", "#5ab2ff", "#e05b70", "#9dfe8b", "#c792ea"];
    var count = 14;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var s = document.createElement("span");
      s.className = "particle";
      var size = (4 + Math.random() * 8).toFixed(1);
      s.style.width = size + "px";
      s.style.height = size + "px";
      s.style.left = (Math.random() * 100).toFixed(1) + "%";
      s.style.background = colors[i % colors.length];
      s.style.opacity = (0.35 + Math.random() * 0.35).toFixed(2);
      s.style.animationDuration = (9 + Math.random() * 9).toFixed(1) + "s";
      s.style.animationDelay = (-Math.random() * 14).toFixed(1) + "s"; // negative = mid-flight start
      frag.appendChild(s);
    }
    host.appendChild(frag);
  }

  // 2) Reveal-on-scroll with stagger.
  revealAll();

  function revealAll() {
    var els = [].slice.call(document.querySelectorAll("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (e) { e.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var delay = parseInt(en.target.getAttribute("data-delay") || "0", 10);
          if (delay > 0) en.target.style.transitionDelay = delay * 0.08 + "s";
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (e) { io.observe(e); });
  }
})();