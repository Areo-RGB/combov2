import { ChangeDetectionStrategy, Component, input, output, signal, viewChild, ElementRef, inject, Renderer2, OnInit, OnDestroy } from '@angular/core';
import { DetectorComponent } from '../detector/detector.component';
import { CommonModule, DOCUMENT } from '@angular/common';

type FlyingParticle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
};

@Component({
  selector: 'app-flymotion',
  templateUrl: './flymotion.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DetectorComponent],
})
export class FlymotionComponent implements OnInit, OnDestroy {
  sessionId = input.required<string>();
  goBack = output<void>();

  // Flymotion-specific settings
  particleCount = signal(10);
  particleSpeed = signal(5);
  particleSize = signal(30);
  motionSensitivity = signal(5);

  // Particle state
  particles = signal<FlyingParticle[]>([]);
  isAnimating = signal(false);

  private readonly colors = ['#fb923c', '#f97316', '#ea580c', '#fdba74', '#ffedd5', '#fed7aa'];
  private animationFrameId: number | null = null;
  private nextParticleId = 0;

  detectorComponent = viewChild.required(DetectorComponent);
  private displayContainer = viewChild.required<ElementRef>('displayContainer');
  private document: Document = inject(DOCUMENT);
  private renderer = inject(Renderer2);
  private fullscreenChangeListener!: () => void;

  ngOnInit(): void {
    this.fullscreenChangeListener = this.renderer.listen('document', 'fullscreenchange', () => {});
    this.initializeParticles();
  }

  ngOnDestroy(): void {
    if (this.fullscreenChangeListener) {
      this.fullscreenChangeListener();
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  onGoBack() {
    if (this.document.fullscreenElement) {
      this.document.exitFullscreen();
    }
    this.goBack.emit();
  }

  private initializeParticles() {
    const count = this.particleCount();
    const newParticles: FlyingParticle[] = [];

    for (let i = 0; i < count; i++) {
      newParticles.push(this.createParticle());
    }

    this.particles.set(newParticles);
  }

  private createParticle(): FlyingParticle {
    const speed = this.particleSpeed();
    return {
      id: this.nextParticleId++,
      x: Math.random() * 100,
      y: Math.random() * 100,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      size: this.particleSize(),
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      opacity: 0.3,
    };
  }

  handleMotion(intensity: number) {
    // Scale intensity (0-100) to particle behavior
    const scaledIntensity = intensity / 100;

    // Update all particles with motion boost
    const updatedParticles = this.particles().map(particle => ({
      ...particle,
      vx: particle.vx * (1 + scaledIntensity * 0.5),
      vy: particle.vy * (1 + scaledIntensity * 0.5),
      opacity: Math.min(1, 0.3 + scaledIntensity * 0.7),
    }));

    this.particles.set(updatedParticles);

    // Start animation if not already running
    if (!this.isAnimating()) {
      this.isAnimating.set(true);
      this.animate();
    }
  }

  private animate() {
    if (!this.isAnimating()) return;

    const currentParticles = this.particles();
    const updatedParticles = currentParticles.map(particle => {
      let newX = particle.x + particle.vx * 0.1;
      let newY = particle.y + particle.vy * 0.1;
      let newVx = particle.vx;
      let newVy = particle.vy;

      // Bounce off walls
      if (newX <= 0 || newX >= 100) {
        newVx = -particle.vx * 0.9;
        newX = Math.max(0, Math.min(100, newX));
      }
      if (newY <= 0 || newY >= 100) {
        newVy = -particle.vy * 0.9;
        newY = Math.max(0, Math.min(100, newY));
      }

      // Apply friction
      newVx *= 0.99;
      newVy *= 0.99;

      // Fade opacity back to baseline
      const newOpacity = Math.max(0.3, particle.opacity * 0.98);

      return {
        ...particle,
        x: newX,
        y: newY,
        vx: newVx,
        vy: newVy,
        opacity: newOpacity,
      };
    });

    this.particles.set(updatedParticles);

    // Continue animation
    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }

  onParticleCountChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.particleCount.set(Number(value));
    this.initializeParticles();
  }

  onParticleSpeedChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.particleSpeed.set(Number(value));
  }

  onParticleSizeChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.particleSize.set(Number(value));
    // Update existing particles
    const updatedParticles = this.particles().map(p => ({ ...p, size: Number(value) }));
    this.particles.set(updatedParticles);
  }

  toggleFullscreen(): void {
    const elem = this.displayContainer().nativeElement;
    if (!this.document.fullscreenElement) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      }
    } else {
      if (this.document.exitFullscreen) {
        this.document.exitFullscreen();
      }
    }
  }

  resetParticles(): void {
    this.initializeParticles();
  }
}
