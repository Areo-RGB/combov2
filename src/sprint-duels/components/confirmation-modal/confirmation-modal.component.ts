import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirmation-modal',
  templateUrl: './confirmation-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationModalComponent {
  isOpen = input.required<boolean>();
  title = input<string>('Confirm Action');
  message = input<string>('Are you sure you want to proceed?');
  confirmText = input<string>('Confirm');
  cancelText = input<string>('Cancel');
  
  confirm = output<void>();
  cancel = output<void>();
}
