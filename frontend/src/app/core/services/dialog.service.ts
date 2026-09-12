import { Injectable, signal } from '@angular/core';

export type DialogKind = 'confirm' | 'prompt';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title?: string;
  message?: string;
  label?: string;
  value?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface DialogConfig {
  kind: DialogKind;
  options: ConfirmOptions | PromptOptions;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly current = signal<DialogConfig | null>(null);
  readonly dialog = this.current.asReadonly();

  private confirmResolver: ((value: boolean) => void) | null = null;
  private promptResolver: ((value: string | null) => void) | null = null;

  confirm(options: ConfirmOptions): Promise<boolean> {
    this.open({ kind: 'confirm', options });
    return new Promise<boolean>((resolve) => {
      this.confirmResolver = resolve;
    });
  }

  prompt(options: PromptOptions): Promise<string | null> {
    this.open({ kind: 'prompt', options });
    return new Promise<string | null>((resolve) => {
      this.promptResolver = resolve;
    });
  }

  private open(config: DialogConfig): void {
    this.current.set(config);
  }

  resolve(value: boolean | string | null): void {
    const config = this.current();
    if (config?.kind === 'confirm') {
      this.confirmResolver?.(value === true);
      this.confirmResolver = null;
    } else {
      this.promptResolver?.(typeof value === 'string' ? value : null);
      this.promptResolver = null;
    }
    this.current.set(null);
  }
}