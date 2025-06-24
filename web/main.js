// Mobile navigation toggle
const navToggle = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');

if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => {
    navMenu.classList.toggle('open');
  });

  // Close menu on link click (mobile)
  navMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('open');
    });
  });
}

// Animate elements on scroll
function animateOnScroll() {
  const animated = document.querySelectorAll('.animate-fadein, .animate-slideup, .animate-pop');
  const triggerBottom = window.innerHeight * 0.92;
  animated.forEach(el => {
    const boxTop = el.getBoundingClientRect().top;
    if (boxTop < triggerBottom) {
      el.classList.add('visible');
    }
  });
}
window.addEventListener('scroll', animateOnScroll);
window.addEventListener('DOMContentLoaded', animateOnScroll);

// Optional: Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});


// Offset scroll for #hero anchor
document.addEventListener('DOMContentLoaded', function () {
  const navbarHeight = 96; // Adjust if your navbar height changes
  document.querySelectorAll('a[href="#hero"]').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const hero = document.getElementById('hero');
      if (hero) {
        const top = hero.getBoundingClientRect().top + window.pageYOffset - navbarHeight;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
});
// Offset scroll for #hero anchor
document.addEventListener('DOMContentLoaded', function () {
  const navbarHeight = 96; // Adjust if your navbar height changes
  document.querySelectorAll('a[href="#testimonials"]').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const testimonials = document.getElementById('testimonials');
      if (testimonials) {
        const top = testimonials.getBoundingClientRect().top + window.pageYOffset - navbarHeight;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
});

// Highlight nav link on scroll

document.addEventListener("DOMContentLoaded", function () {
  const sections = [
    { id: "hero", nav: null },
    { id: "features", nav: null },
    { id: "gallery", nav: null },
    { id: "testimonials", nav: null },
    { id: "download", nav: null }
  ];
  // Map nav links to sections
  sections.forEach(section => {
    section.el = document.getElementById(section.id);
    section.nav = document.querySelector(`nav#nav-menu a[href="#${section.id}"]`);
  });

  function onScroll() {
    const scrollPos = window.scrollY || window.pageYOffset;
    let activeSection = sections[0];
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (sec.el) {
        const offset = sec.el.offsetTop - 110; // header height + margin
        if (scrollPos >= offset) {
          activeSection = sec;
        }
      }
    }

    // If at the very bottom, always highlight "Get ADV.Retouch"
    const scrollBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 2;
    if (scrollBottom && sections[sections.length - 1].nav) {
      activeSection = sections[sections.length - 1];
    }

    sections.forEach(sec => {
      if (sec.nav) sec.nav.classList.remove("active-nav");
    });
    if (activeSection.nav) activeSection.nav.classList.add("active-nav");
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});

// Scroll Down Indicator: bounce animation and click-to-scroll
document.addEventListener("DOMContentLoaded", function() {
  var el = document.getElementById("scrollDownCircle");
  if (el) {
    el.classList.remove("bounce-animate");
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add("bounce-animate");
    // Remove animation class after animation ends (2*1.2s)
    setTimeout(function() {
      el.classList.remove("bounce-animate");
    }, 2400);
    // Click to scroll to features
    el.parentElement.addEventListener("click", function(e) {
      document.getElementById("features").scrollIntoView({ behavior: "smooth" });
    });
    el.parentElement.style.cursor = "pointer";
    el.parentElement.style.pointerEvents = "auto";
  }
});

