/**
 * WASEET (وسيط) - Modern Luxury Hero Auto-Slider
 * Automatically rotates every 2000ms (2 seconds)
 */
class WaseetHeroSlider {
    constructor() {
        this.track = document.getElementById('hero-slider-track');
        this.wrap = document.getElementById('waseet-hero-slider');
        this.dotsContainer = document.getElementById('hero-slider-dots');
        this.currentSlide = 0;
        this.totalSlides = 4;
        this.intervalMs = 2000; // exactly 2 seconds
        this.timer = null;
        this.startX = 0;
        this.currentX = 0;
        this.isSwiping = false;

        this.init();
    }

    init() {
        if (!this.track || !this.wrap) return;
        this.totalSlides = this.track.children.length || 4;
        this.startAutoPlay();

        // Pause on mouse hover / touch hold
        this.wrap.addEventListener('mouseenter', () => this.stopAutoPlay());
        this.wrap.addEventListener('mouseleave', () => this.startAutoPlay());

        // Touch swipe support for mobile
        this.wrap.addEventListener('touchstart', (e) => {
            this.stopAutoPlay();
            if (e.touches && e.touches[0]) {
                this.startX = e.touches[0].clientX;
                this.isSwiping = true;
            }
        }, { passive: true });

        this.wrap.addEventListener('touchmove', (e) => {
            if (!this.isSwiping || !e.touches || !e.touches[0]) return;
            this.currentX = e.touches[0].clientX;
        }, { passive: true });

        this.wrap.addEventListener('touchend', () => {
            if (!this.isSwiping) return;
            const diffX = this.currentX - this.startX;
            if (Math.abs(diffX) > 40) {
                // In RTL Arabic, swiping right means previous, swiping left means next
                if (diffX > 0) {
                    this.prevSlide();
                } else {
                    this.nextSlide();
                }
            }
            this.isSwiping = false;
            this.startAutoPlay();
        });
    }

    startAutoPlay() {
        this.stopAutoPlay();
        this.timer = setInterval(() => {
            this.nextSlide();
        }, this.intervalMs);
    }

    stopAutoPlay() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    goToSlide(index) {
        this.currentSlide = (index + this.totalSlides) % this.totalSlides;
        this.updateView();
    }

    nextSlide() {
        this.currentSlide = (this.currentSlide + 1) % this.totalSlides;
        this.updateView();
    }

    prevSlide() {
        this.currentSlide = (this.currentSlide - 1 + this.totalSlides) % this.totalSlides;
        this.updateView();
    }

    updateView() {
        if (!this.track) return;
        // In Arabic RTL, moving to subsequent slides translates by +100% or -100% depending on direction
        const isRtl = document.documentElement.dir === 'rtl';
        const offset = (isRtl ? 1 : -1) * this.currentSlide * 100;
        this.track.style.transform = `translateX(${offset}%)`;

        // Update dots indicator
        if (this.dotsContainer) {
            const dots = this.dotsContainer.querySelectorAll('.waseet-slider-dot');
            dots.forEach((dot, idx) => {
                dot.classList.toggle('active', idx === this.currentSlide);
            });
        }
    }
}

// Auto-instantiate
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.waseetHeroSlider = new WaseetHeroSlider();
    });
} else {
    window.waseetHeroSlider = new WaseetHeroSlider();
}
