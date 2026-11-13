import { reactive } from 'vue';
import type { UiState } from './commands';

/** Состояние интерфейса вне документа и раскладки (не сохраняется): сейчас только открыта ли палитра команд. */
export const ui: UiState = reactive({ paletteOpen: false });
