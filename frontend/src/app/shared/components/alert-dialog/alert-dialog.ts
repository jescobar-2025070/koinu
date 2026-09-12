import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ConfirmOptions,
  DialogConfig,
  DialogService,
  PromptOptions,
} from '../../../core/services/dialog.service';

@Component({
  selector: 'app-alert-dialog',
  imports: [FormsModule],
  templateUrl: './alert-dialog.html',
  styleUrl: './alert-dialog.css',
})
export class AlertDialog {
  private readonly dialogService = inject(DialogService);
  readonly dialog = this.dialogService.dialog;
  readonly promptValue = signal('');

  constructor() {
    effect(() => {
      const config = this.dialog();
      if (config?.kind === 'prompt') {
        this.promptValue.set((config.options as PromptOptions).value ?? '');
      }
    });
  }

  isConfirm(): boolean {
    return this.dialog()?.kind === 'confirm';
  }

  title(): string {
    const config = this.dialog();
    const options = config?.options as ConfirmOptions & PromptOptions | undefined;
    return options?.title ?? (config?.kind === 'prompt' ? 'INGRESAR DATO' : '¿ESTÁS SEGURO?');
  }

  message(): string {
    const options = this.dialog()?.options as ConfirmOptions & PromptOptions | undefined;
    return options?.message ?? '';
  }

  promptLabel(): string {
    const options = this.dialog()?.options as PromptOptions | undefined;
    return options?.label ?? '';
  }

  confirmLabel(): string {
    const config = this.dialog();
    const options = config?.options as ConfirmOptions & PromptOptions | undefined;
    return options?.confirmLabel ?? (config?.kind === 'prompt' ? 'Aceptar' : 'Confirmar');
  }

  cancelLabel(): string {
    const options = this.dialog()?.options as ConfirmOptions & PromptOptions | undefined;
    return options?.cancelLabel ?? 'Cancelar';
  }

  dangerous(): boolean {
    const options = this.dialog()?.options as ConfirmOptions | undefined;
    return options?.danger === true;
  }

  confirm(): void {
    this.dialogService.resolve(true);
  }

  cancel(): void {
    const config = this.dialog();
    this.dialogService.resolve(config?.kind === 'prompt' ? null : false);
  }

  submitPrompt(): void {
    this.dialogService.resolve(this.promptValue().trim());
  }

  onOverlayClick(): void {
    this.cancel();
  }
}