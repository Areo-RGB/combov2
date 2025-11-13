import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.html',
})
export class HeaderComponent {
  title = input<string>('');
  subtitle = input<string>('');
  showBackButton = input<boolean>(true);
  overlayMode = input<boolean>(false);
  layout = input<'centered' | 'left' | 'space-between'>('centered');

  goBack = output<void>();

  onGoBack(): void {
    this.goBack.emit();
  }
}
