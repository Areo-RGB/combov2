import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  OnDestroy,
  signal,
} from '@angular/core';

type DisplaySignal =
  | { type: 'color'; value: string; timestamp: number; intensity?: number }
  | { type: 'math_op'; op: string; sum: number; timestamp: number; intensity?: number }
  | { type: 'math_result'; sum: number; timestamp: number; intensity?: number }
  | { type: 'wechsel_text'; value: 'Rechts' | 'Links'; timestamp: number; intensity?: number }
  | { type: 'counter'; count: number; timestamp: number; intensity?: number }
  | null;

@Component({
  selector: 'app-display',
  templateUrl: './display.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisplayComponent implements OnDestroy {
  signal = input<DisplaySignal>();
  lingerDuration = input<number>(1000);

  displayColor = signal<string>('black');
  displayOp = signal<string | null>(null);
  displaySum = signal<number | null>(null);
  isFinalResult = signal<boolean>(false);
  displayWechselText = signal<string | null>(null);
  displayCount = signal<number | null>(null);

  private activeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const currentSignal = this.signal();

      // Immediately clear any pending timeout from the previous signal to switch display instantly.
      if (this.activeTimeoutId) {
        clearTimeout(this.activeTimeoutId);
        this.activeTimeoutId = null;
      }

      if (currentSignal) {
        switch (currentSignal.type) {
          case 'color':
            this.displayWechselText.set(null);
            this.displayCount.set(null);
            this.resetMathDisplay();

            const baseColor = currentSignal.value; // e.g., '#ef4444'
            // Intensity is expected to be a percentage-like value. The default in app.component is 20.
            const intensityValue = currentSignal.intensity ?? 20;
            // Map intensity (e.g., 0-100) to opacity (e.g., 0.3-1.0)
            const opacity = Math.min(1.0, 0.3 + (intensityValue / 100) * 0.7);

            this.displayColor.set(this.hexToRgba(baseColor, opacity));

            this.activeTimeoutId = setTimeout(() => {
              this.displayColor.set('black');
              this.activeTimeoutId = null;
            }, this.lingerDuration());
            break;

          case 'math_op':
            this.displayColor.set('black');
            this.isFinalResult.set(false);
            this.displayOp.set(currentSignal.op);
            this.displaySum.set(currentSignal.sum);
            this.displayWechselText.set(null);
            this.displayCount.set(null);
            this.activeTimeoutId = setTimeout(() => {
              this.displayOp.set(null);
              this.activeTimeoutId = null;
            }, this.lingerDuration());
            break;

          case 'math_result':
            this.displayColor.set('black');
            this.displayOp.set(null);
            this.isFinalResult.set(true);
            this.displaySum.set(currentSignal.sum);
            this.displayWechselText.set(null);
            this.displayCount.set(null);
            // No timeout for final result, it stays until the next motion.
            break;

          case 'wechsel_text':
            this.displayColor.set('black');
            this.resetMathDisplay();
            this.displayWechselText.set(currentSignal.value);
            this.displayCount.set(null);
            this.activeTimeoutId = setTimeout(() => {
              this.displayWechselText.set(null);
              this.activeTimeoutId = null;
            }, this.lingerDuration());
            break;

          case 'counter':
            this.displayColor.set('black');
            this.resetMathDisplay();
            this.displayWechselText.set(null);
            this.displayCount.set(currentSignal.count);
            // No timeout for counter, it persists.
            break;
        }
      } else {
        this.resetAll();
      }
    });
  }

  private hexToRgba(hex: string, alpha: number): string {
    let r = 0,
      g = 0,
      b = 0;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
      if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
      } else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
      }
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private resetMathDisplay(): void {
    this.displayOp.set(null);
    this.displaySum.set(null);
    this.isFinalResult.set(false);
  }

  private resetAll(): void {
    this.displayColor.set('black');
    this.resetMathDisplay();
    this.displayWechselText.set(null);
    this.displayCount.set(null);
  }

  ngOnDestroy(): void {
    if (this.activeTimeoutId) {
      clearTimeout(this.activeTimeoutId);
    }
  }
}
