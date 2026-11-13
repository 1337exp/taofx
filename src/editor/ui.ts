import { reactive } from 'vue';
import type { UiState } from './commands';

/** Состояние интерфейса вне документа и раскладки (не сохраняется): открыта ли палитра команд, выбранный в дереве ресурс, ресурс в окне переименования. */
export const ui: UiState = reactive({ paletteOpen: false, selectedResource: null, renameId: null });
