/* ==========================================================================
   CAKED BY CAITLIN

   No frameworks, no CDN dependencies. The old site loaded AOS from unpkg and
   called AOS.init() unguarded as the first statement — so a single CDN hiccup
   threw a ReferenceError, aborted the whole script, and (because aos.css sets
   [data-aos]{opacity:0}) left the page permanently blank. That's gone.
   ========================================================================== */

(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ----------------------------------------------------------------------
       THE REVEAL — click a face and it comes to life

       The wall of Caitlin's work is one seamless black-and-white sheet. You click
       someone and THEY turn colour. Click again and they go back.

       It's the before/after she does for a living, handed to the visitor. Which is
       also why it's a click and not a hover: hover would give it away for free on
       desktop, and do nothing at all on the phone where most of this traffic lands.

       Product photos are excluded by design — you cannot shop a colour you can't see.
       ---------------------------------------------------------------------- */
    var revealables = document.querySelectorAll('.reveal');

    revealables.forEach(function (el) {
        el.addEventListener('click', function () {
            el.classList.toggle('is-revealed');
        });
    });
    // .work-item and the headshot wrapper are real <button>s, so Enter/Space
    // already fire this click handler. No extra keyboard plumbing needed.

    /* ----------------------------------------------------------------------
       CATEGORY PILLS
       Filters the already-rendered grid. The products are real static HTML —
       search engines see all of them regardless of which pill is active.
       ---------------------------------------------------------------------- */
    var pills = document.querySelectorAll('.pill');
    var cats = document.querySelectorAll('.cat');

    if (pills.length && cats.length) {
        pills.forEach(function (pill) {
            pill.addEventListener('click', function () {
                var filter = pill.dataset.filter;

                pills.forEach(function (p) { p.classList.toggle('is-active', p === pill); });
                cats.forEach(function (cat) {
                    cat.hidden = filter !== 'all' && cat.dataset.cat !== filter;
                });

                // Keep the chosen pill in view in the scroller.
                pill.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
            });
        });
    }

    /* No lightbox. Clicking a photo colourises it — that IS the interaction, and a
       modal would fight it for the same click. Removed rather than left dangling. */

    /* ----------------------------------------------------------------------
       OUTBOUND CLICK TRACKING

       Client-side only, and it MUST stay that way. Amazon's Operating Agreement
       forbids cloaking or redirecting affiliate links in a way that obscures the
       referring site — so routing clicks through /go/<id> to count them would put
       her Associates account at risk. We observe the click; we never intercept it.
       ---------------------------------------------------------------------- */
    document.querySelectorAll('[data-track]').forEach(function (el) {
        el.addEventListener('click', function () {
            var label = el.dataset.track;

            // Wire to a real analytics tool later (Plausible/Umami — both have free tiers).
            // Deliberately does not preventDefault, does not rewrite href, does not delay navigation.
            if (typeof window.plausible === 'function') {
                window.plausible('Outbound', { props: { link: label } });
            }
        }, { passive: true });
    });

}());
