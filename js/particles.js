/**
 * WASEET (وسيط) - Subtle 3D Ambient Background & Tilt Engine
 * Gentle floating motion (a few centimeters drift), dark orange & gold embers, and 3D card physics.
 */

class WaseetBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        
        this.particles = [];
        this.numParticles = 45;
        this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
        this.time = 0;
        
        this.resize();
        this.initParticles();
        this.bindEvents();
        this.animate();
    }

    resize() {
        this.width = this.canvas.width = window.innerWidth;
        this.height = this.canvas.height = window.innerHeight;
    }

    initParticles() {
        this.particles = [];
        for (let i = 0; i < this.numParticles; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: Math.random() * 2.5 + 1,
                speedY: Math.random() * 0.4 + 0.15,
                speedX: (Math.random() - 0.5) * 0.3,
                baseAlpha: Math.random() * 0.5 + 0.2,
                colorType: Math.random() > 0.4 ? 'gold' : 'orange',
                floatOffset: Math.random() * Math.PI * 2,
                depth: Math.random() * 0.8 + 0.2 // depth for 3D parallax
            });
        }
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.resize();
            this.initParticles();
        });

        // Mouse move with subtle dampening (moves only a few pixels/centimeters)
        window.addEventListener('mousemove', (e) => {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            // Maximum shift: ~30-40px (about 1-2 cm on typical screens)
            this.mouse.targetX = ((e.clientX - centerX) / centerX) * 35;
            this.mouse.targetY = ((e.clientY - centerY) / centerY) * 35;
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.time += 0.015;

        // Smooth easing towards target mouse position
        this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
        this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;

        // Clear canvas (keep pure #000000 background untouched)
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw and update particles
        for (let p of this.particles) {
            // Gentle floating wave motion
            p.y -= p.speedY;
            p.x += Math.sin(this.time + p.floatOffset) * 0.4 + p.speedX;

            // Screen wrap
            if (p.y < -10) {
                p.y = this.height + 10;
                p.x = Math.random() * this.width;
            }
            if (p.x < -10) p.x = this.width + 10;
            if (p.x > this.width + 10) p.x = -10;

            // 3D Parallax offset based on depth
            const renderX = p.x + this.mouse.x * p.depth;
            const renderY = p.y + this.mouse.y * p.depth;

            // Draw glowing particle
            const alpha = p.baseAlpha * (0.6 + 0.4 * Math.sin(this.time * 2 + p.floatOffset));
            this.ctx.beginPath();
            this.ctx.arc(renderX, renderY, p.size, 0, Math.PI * 2);
            
            if (p.colorType === 'orange') {
                this.ctx.fillStyle = `rgba(234, 88, 12, ${alpha})`;
                this.ctx.shadowColor = 'rgba(234, 88, 12, 0.8)';
            } else {
                this.ctx.fillStyle = `rgba(212, 175, 55, ${alpha})`;
                this.ctx.shadowColor = 'rgba(212, 175, 55, 0.8)';
            }
            this.ctx.shadowBlur = 8;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
    }

    drawSubtleGrid() {
        const gridOffset = (this.time * 8) % 60;
        this.ctx.strokeStyle = 'rgba(197, 160, 89, 0.025)';
        this.ctx.lineWidth = 1;

        // Very faint subtle vertical lines with parallax
        const step = 80;
        for (let x = 0; x < this.width; x += step) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + this.mouse.x * 0.2, 0);
            this.ctx.lineTo(x + this.mouse.x * 0.4, this.height);
            this.ctx.stroke();
        }
    }
}

/**
 * 3D Interactive Tilt on Hover for Cards & Elements
 */
function init3DTilt() {
    // إيقاف تأثيرات الميلان تماماً في الهاتف (شاشات <= 768px) وأجهزة اللمس
    if (window.innerWidth <= 768 || ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)) {
        const cards = document.querySelectorAll('.card-3d, .account-card-3d');
        cards.forEach(card => {
            card.style.transform = 'none';
        });
        return;
    }

    const cards = document.querySelectorAll('.card-3d');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            if (window.innerWidth <= 768) {
                card.style.transform = 'none';
                return;
            }
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((y - centerY) / centerY) * -10; // max 10 deg
            const rotateY = ((x - centerX) / centerX) * 10;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = (window.innerWidth <= 768) ? 'none' : 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    new WaseetBackground('ambient-canvas');
    init3DTilt();
});
