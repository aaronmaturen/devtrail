/**
 * DevTrail Marketing Site
 * Minimal JavaScript for smooth interactions
 */

(function() {
    'use strict';

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            var targetId = this.getAttribute('href');
            if (targetId === '#') return;

            var target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Intersection Observer for scroll-triggered animations
    var observerOptions = {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    };

    var animationObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                // Unobserve after animation triggers (one-time animation)
                animationObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe feature cards and steps for animation
    document.querySelectorAll('.feature-card, .step').forEach(function(el) {
        animationObserver.observe(el);
    });

    // Add loaded class to body for any page-load animations
    window.addEventListener('load', function() {
        document.body.classList.add('loaded');
    });

})();
