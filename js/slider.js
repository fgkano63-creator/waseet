/**
 * WASEET (وسيط) - Modern Luxury Hero Auto-Slider
 * Automatically rotates every 3000ms (3 seconds) using GPU-accelerated opacity layers
 */
class WaseetHeroSlider {
    constructor() {
        this.track = document.getElementById('hero-slider-track');
        this.wrap = document.getElementById('waseet-hero-slider');
        this.dotsContainer = document.getElementById('hero-slider-dots');
        this.slides = [];
        this.currentSlide = 0;
        this.totalSlides = 4;
        this.intervalMs = 3000; // 3 seconds (3000ms)
        this.timer = null;
        this.startX = 0;
        this.currentX = 0;
        this.isSwiping = false;

        this.init();
    }

    init() {
        if (!this.track || !this.wrap) return;
        this.slides = Array.from(this.track.querySelectorAll('.waseet-slide'));
        this.totalSlides = this.slides.length || this.track.children.length || 4;
        this.updateView();
        this.startAutoPlay();

        // Pause on mouse hover / touch hold
        this.wrap.addEventListener('mouseenter', () => this.stopAutoPlay());
        this.wrap.addEventListener('mouseleave', () => this.startAutoPlay());

        // Setup dot indicators click handlers
        if (this.dotsContainer) {
            const dots = this.dotsContainer.querySelectorAll('.waseet-slider-dot');
            dots.forEach((dot, idx) => {
                dot.addEventListener('click', () => {
                    this.goToSlide(idx);
                    this.startAutoPlay();
                });
            });
        }

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
        const isRtl = document.documentElement.dir === 'rtl';
        const rtlDir = isRtl ? 1 : -1;
        this.track.setAttribute('data-active-slide', String(this.currentSlide));
        this.track.setAttribute('data-rtl-dir', String(rtlDir));

        // GPU-accelerated opacity layer transition (0 -> 1) without repainting background-image
        if (!this.slides || !this.slides.length) {
            this.slides = Array.from(this.track.querySelectorAll('.waseet-slide'));
        }
        this.slides.forEach((slide, idx) => {
            const isActive = idx === this.currentSlide;
            slide.classList.toggle('active', isActive);
            slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });

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
