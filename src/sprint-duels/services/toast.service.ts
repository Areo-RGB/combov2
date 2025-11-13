import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  messages = signal<ToastMessage[]>([]);
  private nextId = 0;

  show(
    message: string,
    type: 'success' | 'error' | 'info' = 'info',
    duration: number = 3000
  ): void {
    const id = this.nextId++;
    const newMessage: ToastMessage = { id, message, type };
    this.messages.update((currentMessages) => [...currentMessages, newMessage]);

    setTimeout(() => {
      this.remove(id);
    }, duration);
  }

  remove(id: number): void {
    this.messages.update((currentMessages) => currentMessages.filter((m) => m.id !== id));
  }
}
