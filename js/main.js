/* ==========================================================================
   CAKED BY CAITLIN - Main JavaScript
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {

    // ---------- AOS INIT ----------
    AOS.init({
        duration: 800,
        easing: 'ease-out-cubic',
        once: true,
        offset: 80
    });

    // ---------- NAVBAR SCROLL ----------
    const navbar = document.getElementById('navbar');

    function handleNavScroll() {
        if (window.scrollY > 60) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }

    window.addEventListener('scroll', handleNavScroll, { passive: true });
    handleNavScroll();

    // ---------- MOBILE MENU ----------
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    navToggle.addEventListener('click', function () {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });

    // Close menu on link click
    document.querySelectorAll('.nav-link').forEach(function (link) {
        link.addEventListener('click', function () {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    });

    // ---------- SMOOTH SCROLL ----------
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            var target = document.querySelector(this.getAttribute('href'));
            if (target) {
                var offset = navbar.offsetHeight;
                var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
                window.scrollTo({ top: top, behavior: 'smooth' });
            }
        });
    });

    // ---------- ACTIVE NAV LINK ON SCROLL ----------
    var sections = document.querySelectorAll('section[id]');

    function highlightNav() {
        var scrollPos = window.scrollY + 120;
        sections.forEach(function (section) {
            var top = section.offsetTop;
            var height = section.offsetHeight;
            var id = section.getAttribute('id');
            var link = document.querySelector('.nav-link[href="#' + id + '"]');
            if (link) {
                if (scrollPos >= top && scrollPos < top + height) {
                    link.style.color = '#D4AF37';
                } else {
                    link.style.color = '';
                }
            }
        });
    }

    window.addEventListener('scroll', highlightNav, { passive: true });

    // ---------- TESTIMONIALS CAROUSEL ----------
    var slides = document.querySelectorAll('.testimonial-slide');
    var dotsContainer = document.getElementById('testimonialDots');
    var prevBtn = document.getElementById('testimonialPrev');
    var nextBtn = document.getElementById('testimonialNext');
    var currentSlide = 0;
    var autoplayInterval;

    // Create dots
    slides.forEach(function (_, i) {
        var dot = document.createElement('div');
        dot.classList.add('testimonial-dot');
        if (i === 0) dot.classList.add('active');
        dot.addEventListener('click', function () { goToSlide(i); });
        dotsContainer.appendChild(dot);
    });

    function goToSlide(index) {
        slides[currentSlide].classList.remove('active');
        dotsContainer.children[currentSlide].classList.remove('active');
        currentSlide = index;
        slides[currentSlide].classList.add('active');
        dotsContainer.children[currentSlide].classList.add('active');
        resetAutoplay();
    }

    function nextSlide() {
        goToSlide((currentSlide + 1) % slides.length);
    }

    function prevSlide() {
        goToSlide((currentSlide - 1 + slides.length) % slides.length);
    }

    nextBtn.addEventListener('click', nextSlide);
    prevBtn.addEventListener('click', prevSlide);

    function resetAutoplay() {
        clearInterval(autoplayInterval);
        autoplayInterval = setInterval(nextSlide, 5000);
    }

    resetAutoplay();

    // ---------- PORTFOLIO LIGHTBOX ----------
    var lightbox = document.getElementById('lightbox');
    var lightboxContent = document.getElementById('lightboxContent');
    var lightboxClose = document.getElementById('lightboxClose');

    document.querySelectorAll('.portfolio-item').forEach(function (item) {
        item.addEventListener('click', function () {
            var svgOrImg = item.querySelector('svg, img');
            if (svgOrImg) {
                lightboxContent.innerHTML = '';
                lightboxContent.appendChild(svgOrImg.cloneNode(true));
                lightbox.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
    });

    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (e) {
        if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeLightbox();
    });

    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
    }

    // ---------- BOOKING FORM ----------
    var bookingForm = document.getElementById('bookingForm');

    bookingForm.addEventListener('submit', function (e) {
        e.preventDefault();

        var formData = new FormData(bookingForm);
        var data = {};
        formData.forEach(function (value, key) { data[key] = value; });

        // Show success message (replace with actual form handler later)
        var btn = bookingForm.querySelector('button[type="submit"]');
        var originalText = btn.textContent;
        btn.textContent = 'Sent! I\'ll be in touch soon ✨';
        btn.disabled = true;
        btn.style.background = '#6B3FA0';
        btn.style.borderColor = '#6B3FA0';
        btn.style.color = '#FAF7FF';

        setTimeout(function () {
            btn.textContent = originalText;
            btn.disabled = false;
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
            bookingForm.reset();
        }, 3000);
    });

    // ---------- PARALLAX EFFECT ON HERO ----------
    window.addEventListener('scroll', function () {
        var scrolled = window.scrollY;
        var hero = document.querySelector('.hero-content');
        if (hero && scrolled < window.innerHeight) {
            hero.style.transform = 'translateY(' + (scrolled * 0.3) + 'px)';
            hero.style.opacity = 1 - (scrolled / window.innerHeight);
        }
    }, { passive: true });

});
