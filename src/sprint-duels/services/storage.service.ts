import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly PREFIX = 'sprintDuels_';

  get<T>(key: string): T | null {
    const item = localStorage.getItem(`${this.PREFIX}${key}`);
    return item ? JSON.parse(item) as T : null;
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`${this.PREFIX}${key}`, JSON.stringify(value));
    } catch (e) {
      console.error('Error saving to localStorage', e);
    }
  }

  remove(key: string): void {
    localStorage.removeItem(`${this.PREFIX}${key}`);
  }

  clearAll(): void {
    Object.keys(localStorage)
      .filter(key => key.startsWith(this.PREFIX))
      .forEach(key => localStorage.removeItem(key));
  }
}
