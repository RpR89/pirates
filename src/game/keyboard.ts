/** Tasti premuti, ignorando ciò che si digita nei campi di testo dell'interfaccia. */
export class Keyboard {
  private down = new Set<string>();
  private handlers = new Map<string, () => void>();

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  private typing(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private onDown = (e: KeyboardEvent) => {
    if (this.typing(e)) return;
    const key = e.key.toLowerCase();
    this.down.add(key);
    const handler = this.handlers.get(key);
    if (handler && !e.repeat) {
      e.preventDefault();
      handler();
    } else if (key.startsWith('arrow')) {
      e.preventDefault();
    }
  };

  private onUp = (e: KeyboardEvent) => {
    this.down.delete(e.key.toLowerCase());
  };

  private onBlur = () => this.down.clear();

  isDown(...keys: string[]): boolean {
    return keys.some((k) => this.down.has(k));
  }

  on(key: string, handler: () => void): void {
    this.handlers.set(key.toLowerCase(), handler);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
